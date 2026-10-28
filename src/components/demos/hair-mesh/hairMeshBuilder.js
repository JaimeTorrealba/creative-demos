// Builds hairmesh source data (the arrays hand-authored in julyHairmesh.js)
// from an arbitrary THREE.BufferGeometry, so buildSceneData() can grow hair
// off any triangle mesh.
//
// Every mesh face becomes one triangle bundle whose guide cage has two rings:
// a root ring on the surface (w=0) and a tip ring extruded along the smoothed
// vertex normal (w=1), i.e. maxLevel=1. Strand positions come entirely from
// sampling the baked hairmesh texture between those rings, so without the
// extruded ring the hair would have zero length.
//
// Atlas cells are packed on a simple row-major grid: bundles never need to be
// texel-adjacent, since continuity across a shared mesh edge comes from both
// bundles referencing the same welded vertex id, baked independently into
// each 2x2 cell.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { obj_vert_pos as july_head_positions } from './data/julyLow.js';
import { hairmesh_verts as july_hairmesh_verts } from './data/julyHairmesh.js';

export function buildHairMeshFromGeometry(geometry, {
	hairLength = 0.25, // fraction of the largest bounding-box dimension
	weldEpsilon = 1e-4, // fraction of the largest bounding-box dimension
} = {}) {
	const posAttr = geometry.attributes.position;
	const uvAttr = geometry.attributes.uv;
	const index = geometry.index
		? geometry.index.array
		: Array.from({ length: posAttr.count }, (_, i) => i);

	///////////////////////////////////////////////////////////////////////
	// bounding box (for weld epsilon, hair length and projection UVs)

	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < posAttr.count; ++i) {
		const p = [posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)];
		for (let j = 0; j < 3; ++j) {
			min[j] = Math.min(min[j], p[j]);
			max[j] = Math.max(max[j], p[j]);
		}
	}
	const maxDim = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;

	///////////////////////////////////////////////////////////////////////
	// weld positions so faces sharing an edge share guide-vertex ids
	// (index buffers from loaders often duplicate vertices along UV seams)

	const eps = weldEpsilon * maxDim;
	const weldMap = new Map(); // quantized position -> welded id
	const attrToWeld = new Array(posAttr.count); // attribute index -> welded id
	const weldedPos = []; // [x,y,z] per welded id
	for (let i = 0; i < posAttr.count; ++i) {
		const p = [posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)];
		const key = Math.round(p[0] / eps) + ',' + Math.round(p[1] / eps) + ',' + Math.round(p[2] / eps);
		let id = weldMap.get(key);
		if (id === undefined) {
			id = weldedPos.length;
			weldMap.set(key, id);
			weldedPos.push(p);
		}
		attrToWeld[i] = id;
	}

	///////////////////////////////////////////////////////////////////////
	// faces (skipping ones degenerate after welding) and smoothed normals

	const faces = [];
	const normals = weldedPos.map(() => [0, 0, 0]);
	for (let i = 0; i + 2 < index.length; i += 3) {
		const a = attrToWeld[index[i]];
		const b = attrToWeld[index[i + 1]];
		const c = attrToWeld[index[i + 2]];
		if (a === b || b === c || a === c) continue;
		const pa = weldedPos[a], pb = weldedPos[b], pc = weldedPos[c];
		const ab = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
		const ac = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
		// area-weighted face normal
		const n = [
			ab[1] * ac[2] - ab[2] * ac[1],
			ab[2] * ac[0] - ab[0] * ac[2],
			ab[0] * ac[1] - ab[1] * ac[0],
		];
		for (const v of [a, b, c]) {
			normals[v][0] += n[0];
			normals[v][1] += n[1];
			normals[v][2] += n[2];
		}
		faces.push([index[i], index[i + 1], index[i + 2]]); // keep attribute ids for UV lookup
	}
	for (const n of normals) {
		const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
		if (len < 1e-12) { n[0] = 0; n[1] = 1; n[2] = 0; continue; }
		n[0] /= len; n[1] /= len; n[2] /= len;
	}

	///////////////////////////////////////////////////////////////////////
	// scalp texture coordinates: the geometry's own UVs when present,
	// otherwise a planar projection onto the two largest bbox axes

	let attrToTexCoord; // attribute index -> texcoord id
	const texCoords = [];
	if (uvAttr) {
		const uvMap = new Map();
		attrToTexCoord = new Array(posAttr.count);
		for (let i = 0; i < posAttr.count; ++i) {
			const u = uvAttr.getX(i), v = uvAttr.getY(i);
			const key = Math.round(u * 1e6) + ',' + Math.round(v * 1e6);
			let id = uvMap.get(key);
			if (id === undefined) {
				id = texCoords.length;
				uvMap.set(key, id);
				texCoords.push([u, v]);
			}
			attrToTexCoord[i] = id;
		}
	} else {
		// pick the two axes with the largest extent; one texcoord per welded vertex
		const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
		const axes = [0, 1, 2].sort((i, j) => ext[j] - ext[i]).slice(0, 2).sort();
		const [ax, ay] = axes;
		const sx = Math.max(ext[ax], 1e-9), sy = Math.max(ext[ay], 1e-9);
		for (const p of weldedPos) texCoords.push([(p[ax] - min[ax]) / sx, (p[ay] - min[ay]) / sy]);
		attrToTexCoord = attrToWeld;
	}

	///////////////////////////////////////////////////////////////////////
	// guide vertices: roots on the surface (w=0), tips extruded along the
	// normal (w=1, prev -> root), forming one subdivision level

	const len = hairLength * maxDim;
	const numRoots = weldedPos.length;
	const hairmeshVerts = [];
	for (let i = 0; i < numRoots; ++i) {
		hairmeshVerts.push({ p: weldedPos[i].slice(), w: 0, prev: -1 });
	}
	for (let i = 0; i < numRoots; ++i) {
		const p = weldedPos[i], n = normals[i];
		hairmeshVerts.push({ p: [p[0] + n[0] * len, p[1] + n[1] * len, p[2] + n[2] * len], w: 1, prev: i });
	}
	const tip = (weldedId) => numRoots + weldedId;

	///////////////////////////////////////////////////////////////////////
	// bundles (one triangle per face, referencing tip vertices) and a
	// row-major atlas grid of isolated 2x2-texel cells

	const hairmeshBundles = [];
	const hairmeshBundleTexCoords = [];
	for (const [ia, ib, ic] of faces) {
		hairmeshBundles.push([tip(attrToWeld[ia]), tip(attrToWeld[ib]), tip(attrToWeld[ic])]);
		hairmeshBundleTexCoords.push([attrToTexCoord[ia], attrToTexCoord[ib], attrToTexCoord[ic]]);
	}
	const cols = Math.max(1, Math.ceil(Math.sqrt(hairmeshBundles.length)));
	const hairmeshBundleLayout = hairmeshBundles.map((_, i) => [(i % cols) * 2, Math.floor(i / cols) * 2]);

	return {
		hairmeshVerts,
		hairmeshTexCoords: texCoords,
		hairmeshBundles,
		hairmeshBundleTexCoords,
		hairmeshBundleLayout,
	};
}

///////////////////////////////////////////////////////////////////////
// geometry presets for the demo UI; 'head' is handled by the caller
// (it means "use the original hand-authored data")

export function createPresetGeometry(name) {
	switch (name) {
		case 'plane': return new THREE.PlaneGeometry(1.6, 1.6, 4, 4).rotateX(-Math.PI / 2);
		case 'sphere': return new THREE.SphereGeometry(0.8, 8, 6);
		case 'box': return new THREE.BoxGeometry(1.1, 1.1, 1.1, 2, 2, 2);
		default: return null;
	}
}

// Pulls the plain arrays buildSceneData() needs to display the base geometry
// itself (the "head" slot: position/nrm/uvs attributes + triangle-list index).
export function extractHeadArrays(geometry) {
	const pos = geometry.attributes.position;
	const nrm = geometry.attributes.normal;
	const uv = geometry.attributes.uv;
	const count = pos.count;
	const positions = Array.from(pos.array.slice(0, count * 3));
	const normals = nrm ? Array.from(nrm.array.slice(0, count * 3)) : new Array(count * 3).fill(0);
	const texCoords = uv ? Array.from(uv.array.slice(0, count * 2)) : new Array(count * 2).fill(0);
	const indices = geometry.index
		? Array.from(geometry.index.array)
		: Array.from({ length: count }, (_, i) => i);
	return {
		headPositions: positions,
		headNormals: normals,
		headTexCoords: texCoords,
		headIndices: indices,
		headIndexMode: 'list',
	};
}

///////////////////////////////////////////////////////////////////////
// LeePerrySmith face-scan model: swaps in a different head display mesh
// while leaving the hairmesh guide cage completely untouched (the guide
// cage stays shaped/sized for the original July head, so this only
// "barely matches" the new head, by design - see the alignment below).

function boundsOf(getPoint, count) {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < count; ++i) {
		const p = getPoint(i);
		for (let j = 0; j < 3; ++j) {
			min[j] = Math.min(min[j], p[j]);
			max[j] = Math.max(max[j], p[j]);
		}
	}
	return {
		size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
		center: [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2],
	};
}

const headBounds = boundsOf(
	(i) => [july_head_positions[3 * i], july_head_positions[3 * i + 1], july_head_positions[3 * i + 2]],
	july_head_positions.length / 3,
);

let cachedLeePerrySmith = null;

// Loads public/models/LeePerrySmith/LeePerrySmith.glb and rescales/repositions
// it (uniform scale + translate only, no reshaping) so its bounding box
// roughly matches the default head's, then returns the same head-array shape
// as extractHeadArrays. Does not call buildHairMeshFromGeometry - callers
// should leave the hairmesh_* buildSceneData options at their defaults so
// the original hand-authored guide cage is reused as-is.
export async function loadLeePerrySmithHeadArrays() {
	if (cachedLeePerrySmith) return cachedLeePerrySmith;

	const gltf = await new GLTFLoader().loadAsync('/hair-mesh/models/LeePerrySmith/LeePerrySmith.glb');
	gltf.scene.updateMatrixWorld(true);
	let mesh;
	gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
	const geometry = mesh.geometry.clone();
	geometry.applyMatrix4(mesh.matrixWorld);

	const pos = geometry.attributes.position;
	const nrm = geometry.attributes.normal;
	const leeBounds = boundsOf((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)], pos.count);
	const scale = (Math.max(...headBounds.size) / Math.max(...leeBounds.size)) * 0.9;
	// 180deg rotation about Y (about the model's own center), then scale + recenter
	for (let i = 0; i < pos.count; ++i) {
		const dx = pos.getX(i) - leeBounds.center[0];
		const dy = pos.getY(i) - leeBounds.center[1];
		const dz = pos.getZ(i) - leeBounds.center[2];
		pos.setXYZ(
			i,
			-dx * scale + headBounds.center[0],
			dy * scale + headBounds.center[1],
			-dz * scale + headBounds.center[2],
		);
		if (nrm) nrm.setXYZ(i, -nrm.getX(i), nrm.getY(i), -nrm.getZ(i));
	}

	// nudge it up slightly, in the same ~2-unit normalized space buildSceneData
	// produces (matching its modelShift convention); convert to raw units using
	// the exact scale buildSceneData will derive from this head + the default
	// hairmesh cage's combined bounding box
	const Y_OFFSET_NORMALIZED = 0.1;
	const combined = boundsOf(
		(i) => (i < pos.count ? [pos.getX(i), pos.getY(i), pos.getZ(i)] : july_hairmesh_verts[i - pos.count].p),
		pos.count + july_hairmesh_verts.length,
	);
	const normScale = 2 / Math.max(...combined.size);
	const yOffsetRaw = Y_OFFSET_NORMALIZED / normScale;
	for (let i = 0; i < pos.count; ++i) pos.setY(i, pos.getY(i) + yOffsetRaw);

	pos.needsUpdate = true;
	if (nrm) nrm.needsUpdate = true;

	cachedLeePerrySmith = extractHeadArrays(geometry);
	geometry.dispose();
	return cachedLeePerrySmith;
}
