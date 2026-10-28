// Geometry builders, ported from the original demo's UpdateHairInstance()
// and vertex-buffer setup in InitRendering().

import * as THREE from 'three';
import { stripToTriangles } from './hairMeshData.js';

// The "position" attributes built here hold curve/scalp texture coordinates,
// not spatial positions, so Three cannot compute a meaningful bounding sphere
// (and NaNs for the vec2 ones). Give every geometry a fixed sphere covering
// the [-1,1] model space; frustum culling is disabled on the objects anyway.
function fakeBoundingSphere(geometry) {
	geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2);
	return geometry;
}

// Instanced hair-guide geometry. Every instance shares the same per-vertex
// attributes (position/pos2/texW hold curve texture coordinates, not real
// positions); the vertex shader places each strand from the hair-mesh texture.
// renderMode 0: line strips; renderMode 1: triangle strips (converted to
// an indexed triangle list, since Three.js Meshes only draw gl.TRIANGLES).
export function buildHairInstanceGeometry({ numHairVerts, renderMode, hairWidth, resolution, w2t, maxLevel }) {
	// tex_uw/tex_v have maxLevel+1 depth layers; w must be remapped to sample
	// their texel centers
	const texWscale = maxLevel / (maxLevel + 1);
	const texWshift = 0.5 / (maxLevel + 1);
	const bias = 0.5;

	let hairPos = Array(numHairVerts * 4);
	let hairPos2 = Array(numHairVerts * 4);
	let hairTexW = Array(numHairVerts * 2);
	for (let i = 0; i < numHairVerts; ++i) {
		let w = i / (numHairVerts - 1);
		w = Math.pow(w, bias);
		let t = w2t(w);
		hairPos[4 * i] = t[1];
		hairPos[4 * i + 1] = t[2];
		hairPos[4 * i + 2] = t[0];
		hairPos[4 * i + 3] = w;
		let di = w < 0.5 ? 1 : -1;
		let w2 = (i + di) / (numHairVerts - 1);
		w2 = Math.pow(w2, bias);
		let tt = w2t(w2);
		hairPos2[4 * i] = tt[1];
		hairPos2[4 * i + 1] = tt[2];
		hairPos2[4 * i + 2] = tt[0];
		hairPos2[4 * i + 3] = di / (numHairVerts - 1);
		hairTexW[2 * i] = w * texWscale + texWshift;
		hairTexW[2 * i + 1] = w2 * texWscale + texWshift;
	}

	let texWSize = 2;
	if (renderMode > 0) {
		const width = hairWidth / resolution;
		let tHairPos = Array(numHairVerts * 8);
		let tHairPos2 = Array(numHairVerts * 8);
		let tHairTexW = Array(numHairVerts * 6);
		for (let i = 0; i < numHairVerts; ++i) {
			for (let k = 0; k < 4; ++k) {
				tHairPos[8 * i + k] = hairPos[4 * i + k];
				tHairPos[8 * i + 4 + k] = hairPos[4 * i + k];
				tHairPos2[8 * i + k] = hairPos2[4 * i + k];
				tHairPos2[8 * i + 4 + k] = hairPos2[4 * i + k];
			}
			tHairTexW[6 * i] = hairTexW[2 * i];
			tHairTexW[6 * i + 1] = hairTexW[2 * i + 1];
			tHairTexW[6 * i + 2] = -width;
			tHairTexW[6 * i + 3] = hairTexW[2 * i];
			tHairTexW[6 * i + 4] = hairTexW[2 * i + 1];
			tHairTexW[6 * i + 5] = width;
		}
		hairPos = tHairPos;
		hairPos2 = tHairPos2;
		hairTexW = tHairTexW;
		texWSize = 3;
	}

	const geometry = new THREE.InstancedBufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hairPos), 4));
	geometry.setAttribute('pos2', new THREE.BufferAttribute(new Float32Array(hairPos2), 4));
	geometry.setAttribute('texW', new THREE.BufferAttribute(new Float32Array(hairTexW), texWSize));

	if (renderMode > 0) {
		// triangle-strip order over the 2*numHairVerts vertices
		const strip = Array.from({ length: numHairVerts * 2 }, (_, i) => i);
		geometry.setIndex(stripToTriangles(strip));
	}

	return fakeBoundingSphere(geometry);
}

// Hair-mesh curve overlay: one instanced line strip per hair-mesh texel column.
export function buildHairmeshCurveGeometry({ numCurveVerts, w2t }) {
	const bias = 0.5;
	const hmCurvePos = Array(numCurveVerts * 4);
	for (let i = 0; i < numCurveVerts; ++i) {
		let w = i / (numCurveVerts - 1);
		w = Math.pow(w, bias);
		let t = w2t(w);
		hmCurvePos[4 * i] = t[1];
		hmCurvePos[4 * i + 1] = t[2];
		hmCurvePos[4 * i + 2] = t[0];
		hmCurvePos[4 * i + 3] = w;
	}
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hmCurvePos), 4));
	return fakeBoundingSphere(geometry);
}

// Hair-mesh level lines overlay: quad outlines per bundle, instanced per level.
export function buildHairmeshLineGeometry({ bundleLayout, texWidth, texHeight }) {
	const numVerts = bundleLayout.length * 4 * 2;
	const pos = Array(numVerts * 2);
	for (let i = 0, j = 0; i < bundleLayout.length; ++i) {
		const p = bundleLayout[i];
		const corners = [
			[p[0] + 0.5, p[1] + 0.5],
			[p[0] + 1.5, p[1] + 0.5],
			[p[0] + 1.5, p[1] + 1.5],
			[p[0] + 0.5, p[1] + 1.5],
		];
		for (let e = 0; e < 4; ++e) {
			const a = corners[e];
			const b = corners[(e + 1) % 4];
			pos[j++] = a[0] / texWidth;
			pos[j++] = a[1] / texHeight;
			pos[j++] = b[0] / texWidth;
			pos[j++] = b[1] / texHeight;
		}
	}
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 2));
	return fakeBoundingSphere(geometry);
}

// Light-direction indicator lines.
export function buildLightGeometry() {
	const lightVerts = [
		0, 0, 0,
		0, 0, -0.9,
		-0.1, -0.1, -0.9,
		0.1, -0.1, -0.9,
		0.1, -0.1, -0.9,
		0.1, 0.1, -0.9,
		0.1, 0.1, -0.9,
		-0.1, 0.1, -0.9,
		-0.1, 0.1, -0.9,
		-0.1, -0.1, -0.9,
	];
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lightVerts), 3));
	return fakeBoundingSphere(geometry);
}

// Subdivided unit quad in [0,1]^2, used to rasterize each bundle's scalp patch
// into the clump texture (original used an indexed triangle strip).
export function buildGridGeometry(quadRes = 32) {
	const verts = new Float32Array((quadRes + 1) * (quadRes + 1) * 2);
	for (let y = 0, i = 0; y <= quadRes; ++y) {
		for (let x = 0; x <= quadRes; ++x) {
			verts[i++] = x / quadRes;
			verts[i++] = y / quadRes;
		}
	}
	const indices = [];
	for (let y = 0; y < quadRes; ++y) {
		for (let x = 0; x < quadRes; ++x) {
			const j = y * (quadRes + 1) + x;
			indices.push(j, j + quadRes + 1, j + 1);
			indices.push(j + 1, j + quadRes + 1, j + quadRes + 2);
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(verts, 2));
	geometry.setIndex(indices);
	return fakeBoundingSphere(geometry);
}

// Fullscreen quad in [0,1]^2 for the clump-extension pass.
export function buildFullscreenQuadGeometry() {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
	geometry.setIndex([0, 1, 2, 2, 1, 3]);
	return fakeBoundingSphere(geometry);
}
