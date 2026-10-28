// CPU-side data preparation, ported from the original demo's InitRendering()
// (model rescaling, hair-mesh 3D textures, uv/uw/v textures, noise texture,
// head geometry). Differences from the original:
//  - RGB float data is padded to RGBA (Three.js has no RGBFormat)
//  - float textures use half floats (RGBA16F), matching the original internal formats
//  - triangle strips are converted to indexed triangle lists (Three only draws TRIANGLES)

import * as THREE from 'three';
import { DataUtils } from 'three';
import {
	hairmesh_verts as july_hairmesh_verts,
	hairmesh_texCoords as july_hairmesh_texCoords,
	hairmesh_bundles as july_hairmesh_bundles,
	hairmesh_bundleTexCoords as july_hairmesh_bundleTexCoords,
	hairmesh_bundleLayout as july_hairmesh_bundleLayout,
} from './data/julyHairmesh.js';
import {
	obj_vert_pos as july_obj_vert_pos,
	obj_normals as july_obj_normals,
	obj_texCoords as july_obj_texCoords,
	obj_indices as july_obj_indices,
} from './data/julyLow.js';
import { noise_size, noise_data } from './data/noise.js';

export const modelShift = [0, -0.2, 0];

function toHalf(arr) {
	const out = new Uint16Array(arr.length);
	for (let i = 0; i < arr.length; ++i) out[i] = DataUtils.toHalfFloat(arr[i]);
	return out;
}

function padRGBtoRGBA(data, texelCount, alpha = 1) {
	const out = new Array(texelCount * 4);
	for (let i = 0; i < texelCount; ++i) {
		out[4 * i] = data[3 * i];
		out[4 * i + 1] = data[3 * i + 1];
		out[4 * i + 2] = data[3 * i + 2];
		out[4 * i + 3] = alpha;
	}
	return out;
}

// Converts a triangle-strip index list into a triangle-list index list,
// skipping degenerate (stitching) triangles and preserving orientation.
export function stripToTriangles(stripIndices) {
	const tris = [];
	for (let i = 0; i + 2 < stripIndices.length; ++i) {
		const a = stripIndices[i];
		const b = stripIndices[i + 1];
		const c = stripIndices[i + 2];
		if (a === b || b === c || a === c) continue;
		if (i % 2 === 0) tris.push(a, b, c);
		else tris.push(b, a, c);
	}
	return tris;
}

// Builds all GPU-side scene data from a hairmesh definition plus a base
// ("head") geometry. With no arguments this reproduces the original demo
// (hand-authored July head + hairmesh); pass overrides (e.g. produced by
// buildHairMeshFromGeometry) to grow hair from arbitrary geometry instead.
export function buildSceneData({
	hairmeshVerts = july_hairmesh_verts,
	hairmeshTexCoords = july_hairmesh_texCoords,
	hairmeshBundles = july_hairmesh_bundles,
	hairmeshBundleTexCoords = july_hairmesh_bundleTexCoords,
	hairmeshBundleLayout = july_hairmesh_bundleLayout,
	headPositions = july_obj_vert_pos,
	headNormals = july_obj_normals,
	headTexCoords = july_obj_texCoords,
	headIndices = july_obj_indices,
	headIndexMode = 'strip', // 'strip' (original data) | 'list' (generated meshes)
} = {}) {
	// the normalization below mutates positions in place, so work on copies;
	// buildSceneData may run many times against the same source arrays
	const hairmesh_verts = hairmeshVerts.map((v) => ({ p: v.p.slice(), w: v.w, prev: v.prev }));
	const obj_vert_pos = Array.from(headPositions);
	const hairmesh_texCoords = hairmeshTexCoords;
	const hairmesh_bundles = hairmeshBundles;
	const hairmesh_bundleTexCoords = hairmeshBundleTexCoords;
	const hairmesh_bundleLayout = hairmeshBundleLayout;
	const obj_normals = headNormals;
	const obj_texCoords = headTexCoords;
	const obj_indices = headIndices;

	///////////////////////////////////////////////////////////////////////
	// scale and center the positions

	const big = 99999;
	let pos_min = [big, big, big];
	let pos_max = [-big, -big, -big];
	for (let i = 0; i < obj_vert_pos.length; i += 3) {
		for (let j = 0; j < 3; ++j) {
			let p = obj_vert_pos[i + j];
			pos_min[j] = Math.min(p, pos_min[j]);
			pos_max[j] = Math.max(p, pos_max[j]);
		}
	}
	for (let i = 0; i < hairmesh_verts.length; ++i) {
		let p = hairmesh_verts[i].p;
		for (let j = 0; j < 3; ++j) {
			pos_min[j] = Math.min(p[j], pos_min[j]);
			pos_max[j] = Math.max(p[j], pos_max[j]);
		}
	}

	let center = [
		(pos_max[0] + pos_min[0]) / 2,
		(pos_max[1] + pos_min[1]) / 2,
		(pos_max[2] + pos_min[2]) / 2,
	];
	let sizeX = pos_max[0] - pos_min[0];
	let sizeY = pos_max[1] - pos_min[1];
	let sizeZ = pos_max[2] - pos_min[2];
	let scale = 2 / Math.max(sizeX, sizeY, sizeZ);

	for (let i = 0; i < obj_vert_pos.length; i += 3) {
		for (let j = 0; j < 3; ++j) {
			obj_vert_pos[i + j] -= center[j];
			obj_vert_pos[i + j] *= scale;
			obj_vert_pos[i + j] += modelShift[j];
		}
	}
	for (let i = 0; i < hairmesh_verts.length; ++i) {
		for (let j = 0; j < 3; ++j) {
			hairmesh_verts[i].p[j] -= center[j];
			hairmesh_verts[i].p[j] *= scale;
			hairmesh_verts[i].p[j] += modelShift[j];
		}
	}

	///////////////////////////////////////////////////////////////////////
	// hair mesh texture layout

	let maxLevel = 0;
	let hairMeshVertLevels = new Array(hairmesh_verts.length);
	for (let i = 0; i < hairmesh_bundles.length; ++i) {
		let level = -1;
		let b = hairmesh_bundles[i];
		let v = b[0];
		while (v >= 0) {
			v = hairmesh_verts[v].prev;
			level++;
		}
		if (maxLevel < level) maxLevel = level;
		for (let j = 0; j < b.length; ++j) {
			let v = b[j];
			for (let l = level; l >= 0; --l) {
				hairMeshVertLevels[v] = l;
				v = hairmesh_verts[v].prev;
			}
		}
	}
	const tex_hairmesh_depth = 3 * maxLevel + 1;

	function GenerateBundleLayout(bundles) {
		// generate bundle layout; a triangle bundle fills its 2x2 atlas cell by
		// repeating its last corner in the fourth texel
		let layout = new Array();
		for (let i = 0; i < hairmesh_bundleLayout.length; ++i) {
			let b = bundles[i];
			let b3 = b.length === 4 ? b[3] : b[2];
			let l = hairmesh_bundleLayout[i];
			if (!Array.isArray(layout[l[1]])) layout[l[1]] = new Array();
			if (!Array.isArray(layout[l[1] + 1])) layout[l[1] + 1] = new Array();
			layout[l[1]][l[0]] = b[0];
			layout[l[1]][l[0] + 1] = b[1];
			layout[l[1] + 1][l[0] + 1] = b[2];
			layout[l[1] + 1][l[0]] = b3;
		}

		// verify the layout
		for (let i = 0; i < hairmesh_bundleLayout.length; ++i) {
			let b = bundles[i];
			let b3 = b.length === 4 ? b[3] : b[2];
			let l = hairmesh_bundleLayout[i];
			if (
				layout[l[1]][l[0]] != b[0] ||
				layout[l[1]][l[0] + 1] != b[1] ||
				layout[l[1] + 1][l[0] + 1] != b[2] ||
				layout[l[1] + 1][l[0]] != b3
			) {
				console.log('Hair mesh layout error: [' +
					layout[l[1]][l[0]] + ', ' +
					layout[l[1]][l[0] + 1] + ', ' +
					layout[l[1] + 1][l[0] + 1] + ', ' +
					layout[l[1] + 1][l[0]] + '] != [' +
					b[0] + ', ' + b[1] + ', ' + b[2] + ', ' + b[3] + ']');
			}
		}
		return layout;
	}

	let hairMeshTextureLayout = GenerateBundleLayout(hairmesh_bundles);

	// hair mesh texture width and height
	const tex_hairmesh_height = hairMeshTextureLayout.length;
	let tex_hairmesh_width = 0;
	for (let i = 0; i < tex_hairmesh_height; ++i) {
		if (tex_hairmesh_width < hairMeshTextureLayout[i].length) tex_hairmesh_width = hairMeshTextureLayout[i].length;
	}

	function plen(p0, p1) {
		let p01 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
		return Math.sqrt(p01[0] * p01[0] + p01[1] * p01[1] + p01[2] * p01[2]);
	}

	///////////////////////////////////////////////////////////////////////
	// Position-dependent texture data. Wrapped in a function so it can be
	// re-run after the hair-mesh guide vertices are edited (see rebake below).
	// The body keeps the original one-shot code and indentation.

	function bakeTexData() {

	///////////////////////////////////////////////////////////////////////
	// hair mesh curve ids and weights

	const tex_hairmesh_ids = new Array(tex_hairmesh_width * tex_hairmesh_height * tex_hairmesh_depth * 3);
	const tex_hairmesh_weights = new Array(tex_hairmesh_width * tex_hairmesh_height * tex_hairmesh_depth * 3);
	for (let i = 0; i < tex_hairmesh_ids.length; ++i) tex_hairmesh_ids[i] = 0;
	for (let i = 0; i < tex_hairmesh_weights.length; ++i) tex_hairmesh_weights[i] = 0;
	for (let y = 0; y < tex_hairmesh_height; ++y) {
		for (let x = 0; x < hairMeshTextureLayout[y].length; ++x) {
			let v1 = hairMeshTextureLayout[y][x];
			let level = hairMeshVertLevels[v1];
			let v0 = v1;
			for (let lev = level; lev > 0; --lev) {
				let p1 = hairmesh_verts[v1].p;
				let v2 = hairmesh_verts[v1].prev;
				let p2 = hairmesh_verts[v2].p;
				let l2 = plen(p1, p2);
				let s1i0 = v0;
				let s2i0 = v0;
				let s1w0 = 1;
				let s1w1 = 0;
				let s1w2 = 0;
				let s2w0 = 1;
				let s2w1 = 0;
				let s2w2 = 0;
				if (v0 != v1) {
					let p0 = hairmesh_verts[v0].p;
					let l1 = plen(p0, p1);
					let L = l1 + Math.sqrt(l1 * l2);
					s1i0 = v0;
					s1w0 = -l2 / L;
					s1w1 = (l2 - l1) / L + 2;
					s1w2 = l1 / L - 1;
					if (lev > 1) {
						let v3 = hairmesh_verts[v2].prev;
						let p3 = hairmesh_verts[v3].p;
						let l3 = plen(p3, p2);
						let L = l3 + Math.sqrt(l3 * l2);
						s2i0 = v3;
						s2w0 = -l2 / L;
						s2w1 = (l2 - l3) / L + 2;
						s2w2 = l3 / L - 1;
					} else {
						s2w0 = -s1w0;
						s2w1 = s1w1;
						s2w2 = s1w2;
					}
				} else {
					if (lev > 1) {
						let v3 = hairmesh_verts[v2].prev;
						let p3 = hairmesh_verts[v3].p;
						let l3 = plen(p3, p2);
						let L = l3 + Math.sqrt(l3 * l2);
						s1i0 = v3;
						s2i0 = v3;
						s1w0 = l2 / L;
						s1w1 = (l2 - l3) / L + 2;
						s1w2 = l3 / L - 1;
						s2w0 = -s1w0;
						s2w1 = s1w1;
						s2w2 = s1w2;
					} else {
						s1i0 = v1;
						s2i0 = v2;
					}
				}
				let z = 3 * lev;
				let i = (z * tex_hairmesh_height + y) * tex_hairmesh_width + x;
				let dz = tex_hairmesh_width * tex_hairmesh_height;
				tex_hairmesh_ids[3 * i] = v1;
				tex_hairmesh_ids[3 * i + 1] = 0;
				tex_hairmesh_ids[3 * i + 2] = 0;
				tex_hairmesh_ids[3 * (i - dz)] = s1i0;
				tex_hairmesh_ids[3 * (i - dz) + 1] = v1;
				tex_hairmesh_ids[3 * (i - dz) + 2] = v2;
				tex_hairmesh_ids[3 * (i - 2 * dz)] = s2i0;
				tex_hairmesh_ids[3 * (i - 2 * dz) + 1] = v2;
				tex_hairmesh_ids[3 * (i - 2 * dz) + 2] = v1;
				tex_hairmesh_weights[3 * i] = 1;
				tex_hairmesh_weights[3 * i + 1] = 0;
				tex_hairmesh_weights[3 * i + 2] = 0;
				tex_hairmesh_weights[3 * (i - dz)] = s1w0;
				tex_hairmesh_weights[3 * (i - dz) + 1] = s1w1;
				tex_hairmesh_weights[3 * (i - dz) + 2] = s1w2;
				tex_hairmesh_weights[3 * (i - 2 * dz)] = s2w0;
				tex_hairmesh_weights[3 * (i - 2 * dz) + 1] = s2w1;
				tex_hairmesh_weights[3 * (i - 2 * dz) + 2] = s2w2;
				v0 = v1;
				v1 = v2;
			}
			let i = y * tex_hairmesh_width + x;
			tex_hairmesh_ids[3 * i] = v1;
			tex_hairmesh_ids[3 * i + 1] = 0;
			tex_hairmesh_ids[3 * i + 2] = 0;
			tex_hairmesh_weights[3 * i] = 1;
			tex_hairmesh_weights[3 * i + 1] = 0;
			tex_hairmesh_weights[3 * i + 2] = 0;
		}
	}

	///////////////////////////////////////////////////////////////////////
	// uv-texture

	let uvTextureLayout = GenerateBundleLayout(hairmesh_bundleTexCoords);

	let tex_uv_data = new Array(tex_hairmesh_width * tex_hairmesh_height * 2);
	for (let i = 0; i < tex_uv_data.length; ++i) tex_uv_data[i] = 0;
	for (let y = 0; y < tex_hairmesh_height; ++y) {
		for (let x = 0; x < uvTextureLayout[y].length; ++x) {
			tex_uv_data[2 * (y * tex_hairmesh_width + x)] = hairmesh_texCoords[uvTextureLayout[y][x]][0];
			tex_uv_data[2 * (y * tex_hairmesh_width + x) + 1] = hairmesh_texCoords[uvTextureLayout[y][x]][1];
		}
	}

	///////////////////////////////////////////////////////////////////////
	// u-texture and v-texture

	let tex_vertTri = new Array(hairmesh_verts.length);
	function buildTMatrix(tc0, tc1, tc2) {
		let m0 = tc1[0] - tc0[0];
		let m1 = tc1[1] - tc0[1];
		let m2 = tc2[0] - tc0[0];
		let m3 = tc2[1] - tc0[1];
		return [m3, -m1, -m2, m0];
	}
	function setNewTri(v, vn, vp, m) {
		if (!Array.isArray(tex_vertTri[v])) tex_vertTri[v] = new Array();
		tex_vertTri[v].push({ v1: vn, v2: vp, m: m });
	}
	for (let i = 0; i < hairmesh_bundles.length; ++i) {
		let b = hairmesh_bundles[i];
		let bt = hairmesh_bundleTexCoords[i];
		let tc0 = hairmesh_texCoords[bt[0]];
		let tc1 = hairmesh_texCoords[bt[1]];
		let tc2 = hairmesh_texCoords[bt[2]];
		if (b.length == 4) {
			let tc3 = hairmesh_texCoords[bt[3]];
			let m0 = buildTMatrix(tc0, tc1, tc3);
			let m1 = buildTMatrix(tc1, tc2, tc0);
			let m2 = buildTMatrix(tc2, tc3, tc1);
			let m3 = buildTMatrix(tc3, tc0, tc2);
			let v = [b[0], b[1], b[2], b[3]];
			while (v[0] >= 0) {
				setNewTri(v[0], v[1], v[3], m0);
				setNewTri(v[1], v[2], v[0], m1);
				setNewTri(v[2], v[3], v[1], m2);
				setNewTri(v[3], v[0], v[2], m3);
				v[0] = hairmesh_verts[v[0]].prev;
				v[1] = hairmesh_verts[v[1]].prev;
				v[2] = hairmesh_verts[v[2]].prev;
				v[3] = hairmesh_verts[v[3]].prev;
			}
		} else {
			let m0 = buildTMatrix(tc0, tc1, tc2);
			let m1 = buildTMatrix(tc1, tc2, tc0);
			let m2 = buildTMatrix(tc2, tc0, tc1);
			let v = [b[0], b[1], b[2]];
			while (v[0] >= 0) {
				setNewTri(v[0], v[1], v[2], m0);
				setNewTri(v[1], v[2], v[0], m1);
				setNewTri(v[2], v[0], v[1], m2);
				v[0] = hairmesh_verts[v[0]].prev;
				v[1] = hairmesh_verts[v[1]].prev;
				v[2] = hairmesh_verts[v[2]].prev;
			}
		}
	}

	const tex_uvw_ids = new Array(tex_hairmesh_width * tex_hairmesh_height * (maxLevel + 1));
	for (let i = 0; i < tex_uvw_ids.length; ++i) tex_uvw_ids[i] = -1;
	for (let y = 0; y < tex_hairmesh_height; ++y) {
		for (let x = 0; x < hairMeshTextureLayout[y].length; ++x) {
			let v = hairMeshTextureLayout[y][x];
			let level = hairMeshVertLevels[v];
			for (let lev = level; lev >= 0; --lev) {
				tex_uvw_ids[(lev * tex_hairmesh_height + y) * tex_hairmesh_width + x] = v;
				v = hairmesh_verts[v].prev;
			}
		}
	}

	///////////////////////////////////////////////////////////////////////
	// hair mesh texture data

	let tex_hairmesh_data = new Array(tex_hairmesh_ids.length);
	for (let i = 0; i < tex_hairmesh_ids.length; i += 3) {
		let v0 = tex_hairmesh_ids[i];
		let v1 = tex_hairmesh_ids[i + 1];
		let v2 = tex_hairmesh_ids[i + 2];
		let w0 = tex_hairmesh_weights[i];
		let w1 = tex_hairmesh_weights[i + 1];
		let w2 = tex_hairmesh_weights[i + 2];
		if (w2 == 0) {
			tex_hairmesh_data[i] = hairmesh_verts[v0].p[0];
			tex_hairmesh_data[i + 1] = hairmesh_verts[v0].p[1];
			tex_hairmesh_data[i + 2] = hairmesh_verts[v0].p[2];
		} else {
			if (w0 < 0) {
				tex_hairmesh_data[i] = w0 * hairmesh_verts[v0].p[0];
				tex_hairmesh_data[i + 1] = w0 * hairmesh_verts[v0].p[1];
				tex_hairmesh_data[i + 2] = w0 * hairmesh_verts[v0].p[2];
			} else {
				let dx = hairmesh_verts[v2].p[0] - hairmesh_verts[v1].p[0];
				let dy = hairmesh_verts[v2].p[1] - hairmesh_verts[v1].p[1];
				let dz = hairmesh_verts[v2].p[2] - hairmesh_verts[v1].p[2];
				let rx = hairmesh_verts[v0].p[0] - hairmesh_verts[v2].p[0];
				let ry = hairmesh_verts[v0].p[1] - hairmesh_verts[v2].p[1];
				let rz = hairmesh_verts[v0].p[2] - hairmesh_verts[v2].p[2];
				let s = 1 + 2 * (dx * rx + dy * ry + dz * rz) / (dx * dx + dy * dy + dz * dz);
				tex_hairmesh_data[i] = -w0 * (hairmesh_verts[v0].p[0] - s * dx);
				tex_hairmesh_data[i + 1] = -w0 * (hairmesh_verts[v0].p[1] - s * dy);
				tex_hairmesh_data[i + 2] = -w0 * (hairmesh_verts[v0].p[2] - s * dz);
			}
			tex_hairmesh_data[i] += w1 * hairmesh_verts[v1].p[0] + w2 * hairmesh_verts[v2].p[0];
			tex_hairmesh_data[i + 1] += w1 * hairmesh_verts[v1].p[1] + w2 * hairmesh_verts[v2].p[1];
			tex_hairmesh_data[i + 2] += w1 * hairmesh_verts[v1].p[2] + w2 * hairmesh_verts[v2].p[2];
		}
	}

	let tex_uw_data = new Array(tex_hairmesh_width * tex_hairmesh_height * (maxLevel + 1) * 4);
	let tex_v_data = new Array(tex_hairmesh_width * tex_hairmesh_height * (maxLevel + 1) * 3);
	// guards zero-length input (possible with degenerate UVs on generated
	// meshes), which would otherwise spread NaNs through the whole texture
	function normalizeVec(v) {
		let len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
		if (len < 1e-12) { v[0] = 1; v[1] = 0; v[2] = 0; return; }
		v[0] /= len; v[1] /= len; v[2] /= len;
	}
	for (let i = 0; i < tex_uvw_ids.length; ++i) {
		if (tex_uvw_ids[i] >= 0) {
			let vid = tex_uvw_ids[i];
			let vertTri = tex_vertTri[vid];
			let u = [0, 0, 0];
			let v = [0, 0, 0];
			let p0 = hairmesh_verts[vid].p;
			for (let j = 0; j < vertTri.length; ++j) {
				let p1 = hairmesh_verts[vertTri[j].v1].p;
				let p2 = hairmesh_verts[vertTri[j].v2].p;
				for (let k = 0; k < 3; ++k) {
					let p10 = p1[k] - p0[k];
					let p20 = p2[k] - p0[k];
					u[k] += p10 * vertTri[j].m[0] + p20 * vertTri[j].m[1];
					v[k] += p10 * vertTri[j].m[2] + p20 * vertTri[j].m[3];
				}
			}
			normalizeVec(u);
			normalizeVec(v);
			tex_uw_data[4 * i] = u[0];
			tex_uw_data[4 * i + 1] = u[1];
			tex_uw_data[4 * i + 2] = u[2];
			tex_uw_data[4 * i + 3] = hairmesh_verts[vid].w;
			tex_v_data[3 * i] = v[0];
			tex_v_data[3 * i + 1] = v[1];
			tex_v_data[3 * i + 2] = v[2];
		} else {
			tex_uw_data[4 * i] = 0;
			tex_uw_data[4 * i + 1] = 0;
			tex_uw_data[4 * i + 2] = 0;
			tex_uw_data[4 * i + 3] = 0;
			tex_v_data[3 * i] = 0;
			tex_v_data[3 * i + 1] = 0;
			tex_v_data[3 * i + 2] = 0;
		}
	}

	return { tex_hairmesh_data, tex_uv_data, tex_uw_data, tex_v_data };
	} // end bakeTexData

	const baked = bakeTexData();

	///////////////////////////////////////////////////////////////////////
	// Create the textures

	function makeHMTex3D(rgbaHalfData, w, h, d) {
		const tex = new THREE.Data3DTexture(rgbaHalfData, w, h, d);
		tex.format = THREE.RGBAFormat;
		tex.type = THREE.HalfFloatType;
		tex.minFilter = THREE.LinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.wrapS = THREE.ClampToEdgeWrapping;
		tex.wrapT = THREE.ClampToEdgeWrapping;
		tex.wrapR = THREE.ClampToEdgeWrapping;
		tex.needsUpdate = true;
		return tex;
	}

	const texelCountHM = tex_hairmesh_width * tex_hairmesh_height * tex_hairmesh_depth;
	const texHairmesh = makeHMTex3D(
		toHalf(padRGBtoRGBA(baked.tex_hairmesh_data, texelCountHM)),
		tex_hairmesh_width, tex_hairmesh_height, tex_hairmesh_depth);

	const texUW = makeHMTex3D(
		toHalf(baked.tex_uw_data),
		tex_hairmesh_width, tex_hairmesh_height, maxLevel + 1);

	const texelCountUVW = tex_hairmesh_width * tex_hairmesh_height * (maxLevel + 1);
	const texV = makeHMTex3D(
		toHalf(padRGBtoRGBA(baked.tex_v_data, texelCountUVW)),
		tex_hairmesh_width, tex_hairmesh_height, maxLevel + 1);

	const texUV = new THREE.DataTexture(
		toHalf(baked.tex_uv_data), tex_hairmesh_width, tex_hairmesh_height,
		THREE.RGFormat, THREE.HalfFloatType);
	texUV.minFilter = THREE.LinearFilter;
	texUV.magFilter = THREE.LinearFilter;
	texUV.wrapS = THREE.ClampToEdgeWrapping;
	texUV.wrapT = THREE.ClampToEdgeWrapping;
	texUV.needsUpdate = true;

	///////////////////////////////////////////////////////////////////////
	// noise texture

	const noiseTexels = noise_size * noise_size * noise_size;
	const noiseRGBA = new Uint8Array(noiseTexels * 4);
	for (let i = 0; i < noiseTexels; ++i) {
		noiseRGBA[4 * i] = noise_data[3 * i];
		noiseRGBA[4 * i + 1] = noise_data[3 * i + 1];
		noiseRGBA[4 * i + 2] = noise_data[3 * i + 2];
		noiseRGBA[4 * i + 3] = 255;
	}
	const texNoise = new THREE.Data3DTexture(noiseRGBA, noise_size, noise_size, noise_size);
	texNoise.format = THREE.RGBAFormat;
	texNoise.type = THREE.UnsignedByteType;
	texNoise.minFilter = THREE.LinearFilter;
	texNoise.magFilter = THREE.LinearFilter;
	texNoise.wrapS = THREE.RepeatWrapping;
	texNoise.wrapT = THREE.RepeatWrapping;
	texNoise.wrapR = THREE.RepeatWrapping;
	texNoise.needsUpdate = true;

	///////////////////////////////////////////////////////////////////////
	// head geometry (triangle strip -> triangles)

	const headGeometry = new THREE.BufferGeometry();
	headGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(obj_vert_pos), 3));
	headGeometry.setAttribute('nrm', new THREE.BufferAttribute(new Float32Array(obj_normals), 3));
	headGeometry.setAttribute('uvs', new THREE.BufferAttribute(new Float32Array(obj_texCoords), 2));
	headGeometry.setIndex(headIndexMode === 'strip' ? stripToTriangles(obj_indices) : Array.from(obj_indices));

	///////////////////////////////////////////////////////////////////////
	// w -> texture-coordinate mapping along the hair curve (w2t)

	function w2t(w) {
		let segment = Math.min(maxLevel - 1, Math.floor(maxLevel * w));
		let t = maxLevel * w - segment;
		let t1 = (3 * segment + 0.5 + (1 - t) * t) / tex_hairmesh_depth;
		let t2 = (3 * (segment + 1) + 0.5 - (1 - t) * t) / tex_hairmesh_depth;
		return [t, t1, t2];
	}

	///////////////////////////////////////////////////////////////////////
	// re-bake the position-dependent textures after guide-vertex edits;
	// texture dimensions are topology-only, so the data is updated in place

	function rebake() {
		const b = bakeTexData();
		texHairmesh.image.data.set(toHalf(padRGBtoRGBA(b.tex_hairmesh_data, texelCountHM)));
		texHairmesh.needsUpdate = true;
		texUW.image.data.set(toHalf(b.tex_uw_data));
		texUW.needsUpdate = true;
		texV.image.data.set(toHalf(padRGBtoRGBA(b.tex_v_data, texelCountUVW)));
		texV.needsUpdate = true;
	}

	return {
		texHairmesh, texUV, texUW, texV, texNoise,
		headGeometry,
		maxLevel,
		texWidth: tex_hairmesh_width,
		texHeight: tex_hairmesh_height,
		texDepth: tex_hairmesh_depth,
		bundleLayout: hairmesh_bundleLayout,
		w2t,
		rebake,
		// normalized, mutable guide-cage data for the hair-mesh editor
		hairmeshVerts: hairmesh_verts,
		hairmeshBundles: hairmesh_bundles,
	};
}
