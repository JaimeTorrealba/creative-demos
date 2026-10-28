// Three.js replica of Cem Yuksel's "Hair Mesh Rendering Demo".
// Pass structure ported from the original RenderScene():
//   1. head -> depth map (light view, sampled as sampler2DShadow)
//   2. hair -> depth map (light view, sampled as sampler2D for the
//      density-based hair shadow model)
//   3. main pass: head, instanced hair (one draw per bundle), optional
//      hair-mesh wireframe and light-direction overlays
// Camera input is OrbitControls; the light direction is set from the UI.
//
// The hairmesh source is selectable at runtime: the original hand-authored
// head data, or a hairmesh generated from a primitive geometry
// (see hairMeshBuilder.js). Everything derived from it (textures, per-bundle
// draw objects, overlays, clump pass, editor) lives in buildHairScene() /
// disposeHairScene() so it can be torn down and rebuilt on preset switches.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { buildSceneData } from './hairMeshData.js';
import {
	buildHairMeshFromGeometry,
	createPresetGeometry,
	extractHeadArrays,
	loadLeePerrySmithHeadArrays,
} from './hairMeshBuilder.js';
import {
	buildHairInstanceGeometry,
	buildHairmeshCurveGeometry,
	buildHairmeshLineGeometry,
	buildLightGeometry,
} from './hairGeometry.js';
import { matrixLight, matrixMVPLight, lightWorldDir } from './lightRig.js';
import { createHairLUTUniforms, loadHairMaterial, createHeadTextureUniform, loadHeadTexture } from './materialTextures.js';
import { ClumpPass } from './clumpPass.js';
import { createHairMeshEditor } from './hairMeshEditor.js';
import { vsHairLine, vsHairTri, fsHair, fsHairShadow } from './shaders/hair.glsl.js';
import { vsObj, fsObj, fsShadow } from './shaders/obj.glsl.js';
import { vsHairmeshC, vsHairmeshL, fsHairmesh, vsLight, fsLight } from './shaders/misc.glsl.js';
import { setupUI } from './ui.js';

const resolution = 1024; // hair width reference + shadow map size
const depthTextureSize = resolution;
const numHairMeshCurveVerts = 32;

// Mounts the demo into `container` and returns { dispose } so the Vue view can
// tear it down on unmount (the standalone app ran once for the page lifetime).
export function createHairMeshDemo(container) {
	let disposed = false;

	///////////////////////////////////////////////////////////////////////
	// Parameters (defaults match the original InitParam)

	const params = {
		meshPreset: 'head',
		showModel: true,
		showHair: true,
		showHairMesh: false,
		showLightDir: false,
		hairColor: 'std_blond',
		shadowsExp: 0, // hairDensity = 10^shadowsExp * 10000
		lengthVar: 0.1,
		fuzz: { enabled: true, amount: 0.10, distribution: 0.80, exp: 0 },
		frizz: { enabled: true, amount: 0.02, freq: 1.0, exp: 0 },
		kink: { enabled: true, amount: 0.02, freqUV: 2.0, freqW: 1.0, stretch: 0.5, exp: 0 },
		clump: { enabled: true, percent: 0.90, res: 32, size: 0.0, noise: 1.0, freq: 1.0, variation: 0.10, exp: 0 },
		curl: { enabled: true, amount: 0.02, freq: 1.0, twists: 10.0, twistExp: 0.3, exp: 0 },
		// original defaults were objRot=2.5, lightRot=-0.5; with a static object the
		// world-space light rotation is lightRot+objRot
		light: { rotation: 2.0, tilt: -0.9, autoRotate: false },
		advanced: { renderMode: 0, hairCount: 10000, hairSegs: 32, hairWidth: 1.5 },
		edit: { enabled: false },
	};

	// original AddParamExp slider mapping
	const expMap = (v) => 2.0002 / (1.0001 - v) - 1;

	///////////////////////////////////////////////////////////////////////
	// Renderer, camera, controls

	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setClearColor(0x000000, 0);
	container.appendChild(renderer.domElement);

	const stats = new Stats();
	container.appendChild(stats.dom);

	const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
	{
		// matches the original initial view: objRot=2.5, camTilt=-0.1, camDist=2.5
		// (camera world rotation = Ry(objRot)·Rx(camTilt), see original MatrixMV)
		const objRot = 2.5, camTilt = -0.1, camDist = 2.5;
		camera.position.set(
			Math.sin(objRot) * Math.cos(camTilt) * camDist,
			-Math.sin(camTilt) * camDist,
			Math.cos(objRot) * Math.cos(camTilt) * camDist,
		);
	}

	const controls = new OrbitControls(camera, renderer.domElement);
	controls.target.set(0, 0, 0);
	controls.update();
	controls.addEventListener('change', requestRender);

	const dummyCamera = new THREE.Camera(); // shadow/offscreen passes use custom mvp uniforms

	///////////////////////////////////////////////////////////////////////
	// Shadow map render targets

	function makeDepthRenderTarget({ compare }) {
		const depthTexture = new THREE.DepthTexture(depthTextureSize, depthTextureSize);
		depthTexture.format = THREE.DepthFormat;
		depthTexture.type = THREE.UnsignedIntType;
		if (compare) {
			// sampled as sampler2DShadow (original: COMPARE_REF_TO_TEXTURE)
			depthTexture.compareFunction = THREE.LessEqualCompare;
			depthTexture.magFilter = THREE.LinearFilter;
		}
		return new THREE.WebGLRenderTarget(depthTextureSize, depthTextureSize, { depthTexture });
	}

	const objShadowRT = makeDepthRenderTarget({ compare: true });
	const hairShadowRT = makeDepthRenderTarget({ compare: false });

	///////////////////////////////////////////////////////////////////////
	// Shared uniforms

	const mainMVP = { value: new THREE.Matrix4() };
	const mainMV = { value: new THREE.Matrix4() };
	const lightMVP = { value: new THREE.Matrix4() }; // shadow-pass mvp AND mv
	const mLight = { value: new THREE.Matrix3() };
	const lightDir = { value: new THREE.Vector3() }; // view space
	const hairDensity = { value: 10000 };

	const shadowSamplerUniforms = {
		objShadMap: { value: objShadowRT.depthTexture },
		hairShadMap: { value: hairShadowRT.depthTexture },
	};

	// texture values are (re)assigned by buildHairScene; the uniform objects
	// themselves stay stable so materials can share them across rebuilds
	const hairTexUniforms = {
		tex_hairmesh: { value: null },
		tex_uv: { value: null },
		tex_uw: { value: null },
		tex_v: { value: null },
		tex_noise: { value: null },
		tex_clump: { value: null },
	};

	const styleUniforms = {
		lengthVar: { value: 0 },
		clumpSize: { value: 0 },
		clumpExp: { value: 0 },
		clumpVar: { value: 0 },
		clumpPercent: { value: 0 },
		clumpNoise: { value: 0 },
		clumpFreq: { value: 0 },
		curlAmount: { value: 0 },
		curlFreq: { value: 0 },
		curlTwists: { value: 0 },
		curlTwistExp: { value: 0 },
		curlExp: { value: 0 },
		frizzAmount: { value: 0 },
		frizzFreq: { value: 0 },
		frizzExp: { value: 0 },
		kinkAmount: { value: 0 },
		kinkFreqUV: { value: 0 },
		kinkFreqW: { value: 0 },
		kinkWScale: { value: 0 },
		kinkExp: { value: 0 },
		fuzzAmount: { value: 0 },
		fuzzDistrib: { value: 0 },
		fuzzExp: { value: 0 },
	};

	const lutUniforms = createHairLUTUniforms();
	loadHairMaterial(params.hairColor, lutUniforms, requestRender);
	const headTexUniform = createHeadTextureUniform(requestRender);

	///////////////////////////////////////////////////////////////////////
	// Head (materials and meshes are static; geometry is swapped per preset)

	const headMaterial = new THREE.RawShaderMaterial({
		glslVersion: THREE.GLSL3,
		vertexShader: vsObj,
		fragmentShader: fsObj,
		uniforms: {
			mvp: mainMVP,
			mv: mainMV,
			mLight,
			lightDir,
			tex_obj: headTexUniform,
			hairDensity,
			...shadowSamplerUniforms,
		},
		side: THREE.DoubleSide,
	});

	const headShadowMaterial = new THREE.RawShaderMaterial({
		glslVersion: THREE.GLSL3,
		vertexShader: vsObj,
		fragmentShader: fsShadow,
		uniforms: { mvp: lightMVP, mv: lightMVP, mLight },
		side: THREE.DoubleSide,
	});

	const headMesh = new THREE.Mesh(new THREE.BufferGeometry(), headMaterial);
	headMesh.frustumCulled = false;
	const headShadowMesh = new THREE.Mesh(headMesh.geometry, headShadowMaterial);
	headShadowMesh.frustumCulled = false;

	///////////////////////////////////////////////////////////////////////
	// Scenes (static roots; hairmesh-derived objects are added by buildHairScene)

	const mainScene = new THREE.Scene();
	mainScene.add(headMesh);

	// ground reference; model is normalized to a 2-unit box shifted down 0.2
	const grid = new THREE.GridHelper(4, 20, 0x888888, 0x444444);
	grid.position.y = -1.2;
	mainScene.add(grid);

	const lightLines = new THREE.LineSegments(
		buildLightGeometry(),
		new THREE.RawShaderMaterial({
			glslVersion: THREE.GLSL3,
			vertexShader: vsLight,
			fragmentShader: fsLight,
			uniforms: { mvp: mainMVP, mLight },
			transparent: true,
		}),
	);
	lightLines.frustumCulled = false;
	mainScene.add(lightLines);

	const objShadowScene = new THREE.Scene();
	objShadowScene.add(headShadowMesh);

	const hairShadowScene = new THREE.Scene();

	///////////////////////////////////////////////////////////////////////
	// Hair scene state, rebuilt whenever the hairmesh source changes

	let sceneData = null;
	let clumpPass = null;
	let hairGeometries = null;
	let hairObjects = null;
	let numBundles = 0;
	let bundleST = null;
	let hairmeshCurves = null;
	let hairmeshLines = null;
	let hairMeshEditor = null;

	function makeHairMaterial(vertexShader, fragmentShader, st, shadowPass) {
		return new THREE.RawShaderMaterial({
			glslVersion: THREE.GLSL3,
			vertexShader,
			fragmentShader,
			uniforms: shadowPass
				? { ...hairTexUniforms, ...styleUniforms, mvp: lightMVP, mv: lightMVP, mLight, st }
				: {
					...hairTexUniforms, ...styleUniforms, ...lutUniforms, ...shadowSamplerUniforms,
					hairDensity, mvp: mainMVP, mv: mainMV, mLight, lightDir, st,
				},
			side: THREE.DoubleSide,
		});
	}

	function buildGeometries() {
		const common = {
			numHairVerts: params.advanced.hairSegs,
			resolution,
			w2t: sceneData.w2t,
			maxLevel: sceneData.maxLevel,
		};
		const line = buildHairInstanceGeometry({ ...common, renderMode: 0 });
		const tri = buildHairInstanceGeometry({ ...common, renderMode: 1, hairWidth: params.advanced.hairWidth });
		const instances = Math.floor(params.advanced.hairCount / numBundles);
		line.instanceCount = instances;
		tri.instanceCount = instances;
		return { line, tri };
	}

	function buildHairScene(data) {
		sceneData = data;

		clumpPass = new ClumpPass({
			renderer,
			texUV: data.texUV,
			texNoise: data.texNoise,
			bundleLayout: data.bundleLayout,
		});
		clumpPass.resize(Math.round(params.clump.res));

		hairTexUniforms.tex_hairmesh.value = data.texHairmesh;
		hairTexUniforms.tex_uv.value = data.texUV;
		hairTexUniforms.tex_uw.value = data.texUW;
		hairTexUniforms.tex_v.value = data.texV;
		hairTexUniforms.tex_noise.value = data.texNoise;
		hairTexUniforms.tex_clump.value = clumpPass.texture;

		headMesh.geometry = data.headGeometry;
		headShadowMesh.geometry = data.headGeometry;

		// hair: one object per bundle, like the original per-bundle draw loop
		numBundles = data.bundleLayout.length;
		bundleST = data.bundleLayout.map((l) => ({ value: new THREE.Vector2(l[0] + 0.5, l[1] + 0.5) }));
		hairGeometries = buildGeometries();

		hairObjects = { lineMain: [], lineShadow: [], triMain: [], triShadow: [] };
		for (let b = 0; b < numBundles; ++b) {
			const st = bundleST[b];
			const lineMain = new THREE.Line(hairGeometries.line, makeHairMaterial(vsHairLine, fsHair, st, false));
			const lineShadow = new THREE.Line(hairGeometries.line, makeHairMaterial(vsHairLine, fsHairShadow, st, true));
			const triMain = new THREE.Mesh(hairGeometries.tri, makeHairMaterial(vsHairTri, fsHair, st, false));
			const triShadow = new THREE.Mesh(hairGeometries.tri, makeHairMaterial(vsHairTri, fsHairShadow, st, true));
			for (const obj of [lineMain, lineShadow, triMain, triShadow]) obj.frustumCulled = false;
			hairObjects.lineMain.push(lineMain);
			hairObjects.lineShadow.push(lineShadow);
			hairObjects.triMain.push(triMain);
			hairObjects.triShadow.push(triShadow);
		}
		mainScene.add(...hairObjects.lineMain, ...hairObjects.triMain);
		hairShadowScene.add(...hairObjects.lineShadow, ...hairObjects.triShadow);

		// overlays: hair-mesh wireframe curves and level lines
		const hairmeshCurveGeometry = buildHairmeshCurveGeometry({ numCurveVerts: numHairMeshCurveVerts, w2t: data.w2t });
		hairmeshCurveGeometry.instanceCount = data.texWidth * data.texHeight;
		hairmeshCurves = new THREE.Line(
			hairmeshCurveGeometry,
			new THREE.RawShaderMaterial({
				glslVersion: THREE.GLSL3,
				vertexShader: vsHairmeshC,
				fragmentShader: fsHairmesh,
				uniforms: { mvp: mainMVP, tex_hairmesh: hairTexUniforms.tex_hairmesh },
			}),
		);
		hairmeshCurves.frustumCulled = false;

		const hairmeshLineGeometry = buildHairmeshLineGeometry({
			bundleLayout: data.bundleLayout,
			texWidth: data.texWidth,
			texHeight: data.texHeight,
		});
		hairmeshLineGeometry.instanceCount = Math.floor((data.texDepth - 1) / 3) + 1;
		hairmeshLines = new THREE.LineSegments(
			hairmeshLineGeometry,
			new THREE.RawShaderMaterial({
				glslVersion: THREE.GLSL3,
				vertexShader: vsHairmeshL,
				fragmentShader: fsHairmesh,
				uniforms: { mvp: mainMVP, tex_hairmesh: hairTexUniforms.tex_hairmesh },
			}),
		);
		hairmeshLines.frustumCulled = false;
		mainScene.add(hairmeshCurves, hairmeshLines);

		// drag-to-edit overlay for the hair-mesh guide cage (enabled from the UI)
		hairMeshEditor = createHairMeshEditor({
			sceneData: data,
			camera,
			domElement: renderer.domElement,
			requestRender,
			onEdit: () => sceneData.rebake(), // live rebake while dragging
		});
		mainScene.add(hairMeshEditor.object);
		hairMeshEditor.setEnabled(params.edit.enabled);
	}

	function disposeHairScene() {
		mainScene.remove(...hairObjects.lineMain, ...hairObjects.triMain, hairmeshCurves, hairmeshLines, hairMeshEditor.object);
		hairShadowScene.remove(...hairObjects.lineShadow, ...hairObjects.triShadow);

		for (const list of Object.values(hairObjects)) {
			for (const obj of list) obj.material.dispose();
		}
		hairGeometries.line.dispose();
		hairGeometries.tri.dispose();

		hairmeshCurves.geometry.dispose();
		hairmeshCurves.material.dispose();
		hairmeshLines.geometry.dispose();
		hairmeshLines.material.dispose();

		hairMeshEditor.dispose();
		clumpPass.dispose();

		sceneData.texHairmesh.dispose();
		sceneData.texUV.dispose();
		sceneData.texUW.dispose();
		sceneData.texV.dispose();
		sceneData.texNoise.dispose(); // recreated by every buildSceneData call
		sceneData.headGeometry.dispose();
	}

	///////////////////////////////////////////////////////////////////////
	// Visibility + parameter -> uniform sync

	function updateVisibility() {
		const lines = params.advanced.renderMode === 0;
		headMesh.visible = params.showModel;
		headShadowMesh.visible = params.showModel;
		for (const o of hairObjects.lineMain) o.visible = params.showHair && lines;
		for (const o of hairObjects.lineShadow) o.visible = params.showHair && lines;
		for (const o of hairObjects.triMain) o.visible = params.showHair && !lines;
		for (const o of hairObjects.triShadow) o.visible = params.showHair && !lines;
		hairmeshCurves.visible = params.showHairMesh;
		hairmeshLines.visible = params.showHairMesh;
		lightLines.visible = params.showLightDir;
		requestRender();
	}

	// port of the per-slider SetProgUniform calls
	function applyParams() {
		const p = params;
		hairDensity.value = 10 ** p.shadowsExp * 10000;
		styleUniforms.lengthVar.value = p.lengthVar;

		styleUniforms.fuzzAmount.value = p.fuzz.enabled ? p.fuzz.amount : 0;
		styleUniforms.fuzzDistrib.value = expMap(p.fuzz.distribution);
		styleUniforms.fuzzExp.value = expMap(p.fuzz.exp);

		styleUniforms.frizzAmount.value = p.frizz.enabled ? p.frizz.amount : 0;
		styleUniforms.frizzFreq.value = p.frizz.freq;
		styleUniforms.frizzExp.value = expMap(p.frizz.exp);

		styleUniforms.kinkAmount.value = p.kink.enabled ? p.kink.amount : 0;
		styleUniforms.kinkFreqUV.value = p.kink.freqUV;
		styleUniforms.kinkFreqW.value = p.kink.freqW;
		styleUniforms.kinkWScale.value = p.kink.stretch;
		styleUniforms.kinkExp.value = expMap(p.kink.exp);

		styleUniforms.clumpPercent.value = p.clump.enabled ? p.clump.percent : 0;
		styleUniforms.clumpSize.value = p.clump.size;
		styleUniforms.clumpNoise.value = p.clump.noise;
		styleUniforms.clumpFreq.value = p.clump.freq;
		styleUniforms.clumpVar.value = p.clump.variation;
		styleUniforms.clumpExp.value = expMap(p.clump.exp);

		styleUniforms.curlAmount.value = p.curl.enabled ? p.curl.amount : 0;
		styleUniforms.curlFreq.value = p.curl.freq;
		styleUniforms.curlTwists.value = p.curl.twists * 2 * Math.PI;
		styleUniforms.curlTwistExp.value = expMap(p.curl.twistExp);
		styleUniforms.curlExp.value = expMap(p.curl.exp);
	}

	function redrawClump() {
		clumpPass.render({ clumpNoise: params.clump.noise, clumpFreq: params.clump.freq });
	}

	///////////////////////////////////////////////////////////////////////
	// Render loop (on demand, like the original)

	const worldLightDir = new THREE.Vector3();

	function render() {
		stats.update();

		matrixMVPLight(params.light.rotation, params.light.tilt, lightMVP.value);
		matrixLight(params.light.rotation, params.light.tilt, mLight.value);
		lightWorldDir(params.light.rotation, params.light.tilt, worldLightDir);

		camera.updateMatrixWorld();
		camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
		mainMV.value.copy(camera.matrixWorldInverse);
		mainMVP.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		lightDir.value.copy(worldLightDir).transformDirection(camera.matrixWorldInverse);

		renderer.setRenderTarget(objShadowRT);
		renderer.render(objShadowScene, dummyCamera);

		renderer.setRenderTarget(hairShadowRT);
		renderer.render(hairShadowScene, dummyCamera);

		renderer.setRenderTarget(null);
		renderer.render(mainScene, camera);
	}

	let renderRequested = false;
	function requestRender() {
		if (renderRequested || disposed) return;
		renderRequested = true;
		requestAnimationFrame(() => {
			renderRequested = false;
			render();
		});
	}

	// slow light orbit around the model; runs its own rAF loop while enabled,
	// leaving the on-demand render path untouched when disabled
	const lightSpinSpeed = 0.25; // rad/s, ~25s per revolution
	let lightSpinActive = false;
	let lightSpinPrev = 0;

	function lightSpinTick(now) {
		if (!params.light.autoRotate || disposed) {
			lightSpinActive = false;
			lightSpinPrev = 0;
			return;
		}
		if (lightSpinPrev) {
			let r = params.light.rotation + lightSpinSpeed * ((now - lightSpinPrev) / 1000);
			if (r > Math.PI) r -= 2 * Math.PI; // wrap to the slider's -PI..PI range
			params.light.rotation = r;
			pane.refresh();
			requestRender();
		}
		lightSpinPrev = now;
		requestAnimationFrame(lightSpinTick);
	}

	function startLightSpin() {
		if (lightSpinActive || !params.light.autoRotate) return;
		lightSpinActive = true;
		lightSpinPrev = 0;
		requestAnimationFrame(lightSpinTick);
	}

	function onResize() {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight);
		requestRender();
	}
	window.addEventListener('resize', onResize);

	///////////////////////////////////////////////////////////////////////
	// UI

	const handlers = {
		refresh() {
			applyParams();
			requestRender();
		},
		updateVisibility,
		clumpResize() {
			clumpPass.resize(Math.round(params.clump.res));
			redrawClump();
			requestRender();
		},
		clumpRedraw() {
			applyParams();
			redrawClump();
			requestRender();
		},
		setHairColor(name) {
			loadHairMaterial(name, lutUniforms, requestRender);
		},
		setHairCount() {
			const instances = Math.floor(params.advanced.hairCount / numBundles);
			hairGeometries.line.instanceCount = instances;
			hairGeometries.tri.instanceCount = instances;
			requestRender();
		},
		toggleLightSpin() {
			startLightSpin();
		},
		toggleEdit() {
			hairMeshEditor.setEnabled(params.edit.enabled);
		},
		rebuildHair() {
			const old = hairGeometries;
			hairGeometries = buildGeometries();
			for (let b = 0; b < numBundles; ++b) {
				hairObjects.lineMain[b].geometry = hairGeometries.line;
				hairObjects.lineShadow[b].geometry = hairGeometries.line;
				hairObjects.triMain[b].geometry = hairGeometries.tri;
				hairObjects.triShadow[b].geometry = hairGeometries.tri;
			}
			old.line.dispose();
			old.tri.dispose();
			requestRender();
		},
		// full pipeline rebuild for a new hairmesh source (bundle count, atlas
		// layout and all hairmesh-derived textures change, unlike rebuildHair)
		async rebuildScene(presetName) {
			let overrides;
			if (presetName === 'leePerrySmith') {
				// only the head display mesh changes; the hairmesh_* options are
				// left at their defaults, so the original guide cage is reused as-is
				overrides = await loadLeePerrySmithHeadArrays();
				if (disposed) return; // view unmounted while the model was loading
			} else {
				const geometry = createPresetGeometry(presetName);
				if (geometry) {
					overrides = { ...buildHairMeshFromGeometry(geometry), ...extractHeadArrays(geometry) };
					geometry.dispose(); // only its CPU-side arrays are used
				}
			}
			disposeHairScene();
			buildHairScene(buildSceneData(overrides));
			// the head diffuse texture is UV-mapped for a specific mesh, so it has
			// to be swapped alongside the geometry it was authored for
			loadHeadTexture(
				presetName === 'leePerrySmith' ? '/hair-mesh/models/LeePerrySmith/color.jpg' : '/hair-mesh/models/july.jpg',
				headTexUniform,
				requestRender,
			);
			// the head photo texture only makes sense on an actual head model
			params.showModel = presetName === 'head' || presetName === 'leePerrySmith';
			pane.refresh();
			applyParams();
			updateVisibility();
			redrawClump();
			requestRender();
		},
	};

	const pane = setupUI(params, handlers);

	// scripted access for testing/debugging
	window.hairDemo = {
		params, handlers, camera, controls, requestRender,
		get sceneData() { return sceneData; },
		get hairMeshEditor() { return hairMeshEditor; },
	};

	///////////////////////////////////////////////////////////////////////
	// Start

	buildHairScene(buildSceneData());
	applyParams();
	updateVisibility();
	redrawClump();
	requestRender();
	startLightSpin();

	///////////////////////////////////////////////////////////////////////
	// Teardown (stops the rAF loops via `disposed`, then frees GPU + DOM)

	function dispose() {
		disposed = true;
		window.removeEventListener('resize', onResize);
		delete window.hairDemo;

		pane.dispose();
		controls.dispose();
		disposeHairScene();

		headMaterial.dispose();
		headShadowMaterial.dispose();
		lightLines.geometry.dispose();
		lightLines.material.dispose();
		grid.geometry.dispose();
		grid.material.dispose();
		objShadowRT.dispose();
		hairShadowRT.dispose();
		for (const uniform of Object.values(lutUniforms)) uniform.value.dispose();
		headTexUniform.value.dispose();

		renderer.dispose();
		renderer.domElement.remove();
		stats.dom.remove();
	}

	return { dispose };
}
