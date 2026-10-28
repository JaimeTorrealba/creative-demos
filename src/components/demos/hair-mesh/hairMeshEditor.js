// Face-drag editor for the hair-mesh guide cage.
//
// Builds one pickable face per (bundle, level > 0): the ring of 3-4 guide
// vertices of that bundle at that level. Dragging a face translates its
// vertices in a camera-parallel plane. Level-0 rings are excluded so hair
// roots stay anchored to the scalp.
//
// Edits move the CPU-side guide vertices (sceneData.hairmeshVerts) and this
// overlay, and fire onEdit on every drag move so the caller can rebake the
// hair textures live.
//
// Pointer listeners are registered on window in the capture phase so a click
// that grabs a face can stopPropagation() before OrbitControls sees it.

import * as THREE from 'three';

export function createHairMeshEditor({ sceneData, camera, domElement, requestRender, onEdit }) {
	const verts = sceneData.hairmeshVerts;

	// each handle: array of 3-4 guide-vertex ids forming a face
	const handles = [];
	for (const bundle of sceneData.hairmeshBundles) {
		const rings = [];
		let ring = bundle;
		while (ring[0] >= 0) {
			rings.push(ring);
			ring = ring.map((v) => verts[v].prev);
		}
		for (let i = 0; i < rings.length - 1; ++i) handles.push(rings[i]); // skip scalp ring
	}

	///////////////////////////////////////////////////////////////////////
	// pickable face geometry (indexed triangle list, triangle -> handle map)

	const handleOffsets = [];
	const indices = [];
	const triHandle = [];
	let vertCount = 0;
	handles.forEach((face, h) => {
		handleOffsets.push(vertCount);
		indices.push(vertCount, vertCount + 1, vertCount + 2);
		triHandle.push(h);
		if (face.length === 4) {
			indices.push(vertCount, vertCount + 2, vertCount + 3);
			triHandle.push(h);
		}
		vertCount += face.length;
	});

	const positions = new Float32Array(vertCount * 3);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2);

	function updatePositions() {
		for (let h = 0; h < handles.length; ++h) {
			let o = handleOffsets[h] * 3;
			for (const vid of handles[h]) {
				positions[o++] = verts[vid].p[0];
				positions[o++] = verts[vid].p[1];
				positions[o++] = verts[vid].p[2];
			}
		}
		geometry.attributes.position.needsUpdate = true;
	}
	updatePositions();

	const facesMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
		color: 0x3399ff,
		transparent: true,
		opacity: 0.15,
		side: THREE.DoubleSide,
		depthWrite: false,
	}));
	facesMesh.frustumCulled = false;

	// hovered / dragged face outline
	const outlineGeometry = new THREE.BufferGeometry();
	outlineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
	outlineGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2);
	const outline = new THREE.LineLoop(outlineGeometry, new THREE.LineBasicMaterial({ color: 0xffcc00 }));
	outline.frustumCulled = false;
	outline.visible = false;

	const object = new THREE.Group();
	object.add(facesMesh, outline);
	object.visible = false;

	///////////////////////////////////////////////////////////////////////
	// picking and dragging

	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	const dragPlane = new THREE.Plane();
	const planeNormal = new THREE.Vector3();
	const dragStart = new THREE.Vector3();
	const dragPoint = new THREE.Vector3();

	let hovered = -1;
	let drag = null; // { handle, vids, orig }

	function setOutline(h) {
		if (h < 0) {
			outline.visible = false;
			return;
		}
		const face = handles[h];
		const attr = outlineGeometry.attributes.position;
		for (let i = 0; i < face.length; ++i) {
			const p = verts[face[i]].p;
			attr.setXYZ(i, p[0], p[1], p[2]);
		}
		attr.needsUpdate = true;
		outlineGeometry.setDrawRange(0, face.length);
		outline.visible = true;
	}

	function castFromEvent(e) {
		const r = domElement.getBoundingClientRect();
		pointer.set(
			((e.clientX - r.left) / r.width) * 2 - 1,
			-((e.clientY - r.top) / r.height) * 2 + 1,
		);
		raycaster.setFromCamera(pointer, camera);
	}

	function pick() {
		const hits = raycaster.intersectObject(facesMesh, false);
		return hits.length ? hits[0] : null;
	}

	function onPointerDown(e) {
		if (!object.visible || e.button !== 0 || e.target !== domElement) return;
		castFromEvent(e);
		const hit = pick();
		if (!hit) return;
		e.stopPropagation(); // keep OrbitControls from starting an orbit
		const h = triHandle[hit.faceIndex];
		const face = handles[h];
		drag = { handle: h, vids: face, orig: face.map((vid) => verts[vid].p.slice()) };
		dragStart.copy(hit.point);
		dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(planeNormal), dragStart);
		domElement.setPointerCapture(e.pointerId);
		domElement.style.cursor = 'grabbing';
		setOutline(h);
		requestRender();
	}

	function onPointerMove(e) {
		if (!object.visible) return;
		if (drag) {
			castFromEvent(e);
			if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
			for (let i = 0; i < drag.vids.length; ++i) {
				const p = verts[drag.vids[i]].p;
				p[0] = drag.orig[i][0] + dragPoint.x - dragStart.x;
				p[1] = drag.orig[i][1] + dragPoint.y - dragStart.y;
				p[2] = drag.orig[i][2] + dragPoint.z - dragStart.z;
			}
			updatePositions();
			setOutline(drag.handle);
			if (onEdit) onEdit();
			requestRender();
		} else {
			if (e.target !== domElement) return;
			castFromEvent(e);
			const hit = pick();
			const h = hit ? triHandle[hit.faceIndex] : -1;
			if (h !== hovered) {
				hovered = h;
				setOutline(h);
				domElement.style.cursor = h >= 0 ? 'grab' : '';
				requestRender();
			}
		}
	}

	function onPointerUp(e) {
		if (!drag) return;
		drag = null;
		domElement.style.cursor = hovered >= 0 ? 'grab' : '';
		if (domElement.hasPointerCapture(e.pointerId)) domElement.releasePointerCapture(e.pointerId);
	}

	window.addEventListener('pointerdown', onPointerDown, true);
	window.addEventListener('pointermove', onPointerMove, true);
	window.addEventListener('pointerup', onPointerUp, true);
	window.addEventListener('pointercancel', onPointerUp, true);

	function setEnabled(on) {
		object.visible = on;
		if (!on) {
			hovered = -1;
			drag = null;
			outline.visible = false;
			domElement.style.cursor = '';
		}
		requestRender();
	}

	// Removes the window-level pointer listeners and frees GPU resources.
	// Must be called when the editor is replaced (e.g. on a hairmesh rebuild),
	// or each rebuild leaks a full set of capture-phase listeners.
	function dispose() {
		window.removeEventListener('pointerdown', onPointerDown, true);
		window.removeEventListener('pointermove', onPointerMove, true);
		window.removeEventListener('pointerup', onPointerUp, true);
		window.removeEventListener('pointercancel', onPointerUp, true);
		geometry.dispose();
		facesMesh.material.dispose();
		outlineGeometry.dispose();
		outline.material.dispose();
		domElement.style.cursor = '';
	}

	return { object, setEnabled, updatePositions, dispose };
}
