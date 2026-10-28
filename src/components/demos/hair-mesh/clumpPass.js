// Clump-center texture generation, ported from the original demo's
// ResizeClumpTexture / UpdateClumpTexture / RenderClumpTexture.
// Pass 1 rasterizes each bundle's scalp patch into scalp-UV space, writing the
// encoded hair-mesh st coordinates of the "clump center" strands. Pass 2
// extends (dilates) the result into empty texels.

import * as THREE from 'three';
import { vsClump, fsClump, vsTex, fsClumpExt } from './shaders/clump.glsl.js';
import { buildGridGeometry, buildFullscreenQuadGeometry } from './hairGeometry.js';

export class ClumpPass {
	constructor({ renderer, texUV, texNoise, bundleLayout }) {
		this.renderer = renderer;
		this.res = 32;

		const rtOptions = {
			format: THREE.RGBAFormat,
			type: THREE.UnsignedByteType,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			wrapS: THREE.ClampToEdgeWrapping,
			wrapT: THREE.ClampToEdgeWrapping,
			depthBuffer: false,
			generateMipmaps: false,
		};
		this.clumpRT = new THREE.WebGLRenderTarget(this.res, this.res, rtOptions);
		this.clumpExtRT = new THREE.WebGLRenderTarget(this.res, this.res, rtOptions);

		this.camera = new THREE.Camera();

		// shared uniforms across all bundle patches
		this.clumpFreq = { value: 1 };
		this.noiseScale = { value: 1 / this.res };

		this.clumpScene = new THREE.Scene();
		const grid = buildGridGeometry(32);
		this.gridGeometry = grid;
		for (const l of bundleLayout) {
			const material = new THREE.RawShaderMaterial({
				glslVersion: THREE.GLSL3,
				vertexShader: vsClump,
				fragmentShader: fsClump,
				uniforms: {
					tex_uv: { value: texUV },
					tex_noise: { value: texNoise },
					st: { value: new THREE.Vector2(l[0] + 0.5, l[1] + 0.5) },
					clumpFreq: this.clumpFreq,
					noiseScale: this.noiseScale,
				},
				side: THREE.DoubleSide,
				depthTest: false,
				depthWrite: false,
			});
			const mesh = new THREE.Mesh(grid, material);
			mesh.frustumCulled = false;
			this.clumpScene.add(mesh);
		}

		this.extScene = new THREE.Scene();
		const extMaterial = new THREE.RawShaderMaterial({
			glslVersion: THREE.GLSL3,
			vertexShader: vsTex,
			fragmentShader: fsClumpExt,
			uniforms: {
				tex_clump: { value: this.clumpRT.texture },
			},
			side: THREE.DoubleSide,
			depthTest: false,
			depthWrite: false,
		});
		const quad = new THREE.Mesh(buildFullscreenQuadGeometry(), extMaterial);
		quad.frustumCulled = false;
		this.extScene.add(quad);
	}

	// The texture the hair shader should sample as tex_clump.
	get texture() {
		return this.clumpExtRT.texture;
	}

	resize(res) {
		this.res = res;
		this.clumpRT.setSize(res, res);
		this.clumpExtRT.setSize(res, res);
	}

	// Frees all GPU resources; the instance must not be used afterwards.
	// Needed because the pass is rebuilt whenever the hairmesh source changes.
	dispose() {
		this.clumpRT.dispose();
		this.clumpExtRT.dispose();
		this.gridGeometry.dispose();
		for (const scene of [this.clumpScene, this.extScene]) {
			for (const child of scene.children) {
				child.material.dispose();
			}
		}
		this.extScene.children[0]?.geometry.dispose();
	}

	// clumpNoise scales the scalp-UV jitter; the shader needs it pre-divided
	// by the texture resolution (original: noiseScale = clumpNoise / clumpRes).
	render({ clumpNoise, clumpFreq }) {
		this.clumpFreq.value = clumpFreq;
		this.noiseScale.value = clumpNoise / this.res;

		const renderer = this.renderer;
		const prevTarget = renderer.getRenderTarget();
		const prevClearColor = new THREE.Color();
		renderer.getClearColor(prevClearColor);
		const prevClearAlpha = renderer.getClearAlpha();

		renderer.setClearColor(0x000000, 0);
		renderer.setRenderTarget(this.clumpRT);
		renderer.render(this.clumpScene, this.camera);
		renderer.setRenderTarget(this.clumpExtRT);
		renderer.render(this.extScene, this.camera);

		renderer.setRenderTarget(prevTarget);
		renderer.setClearColor(prevClearColor, prevClearAlpha);
	}
}
