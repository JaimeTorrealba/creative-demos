// Hair material LUT textures and head diffuse texture, ported from the
// original demo's LoadTextureImage / SetHairMaterial. Each texture starts as a
// 1x1 placeholder with the original default color so the scene renders before
// the images arrive. GI.png stores a 3D texture as vertically stacked slices.

import * as THREE from 'three';

function makePlaceholder2D(rgba) {
	const tex = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
	tex.minFilter = THREE.LinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.needsUpdate = true;
	return tex;
}

function makePlaceholder3D(rgba) {
	const tex = new THREE.Data3DTexture(new Uint8Array(rgba), 1, 1, 1);
	tex.format = THREE.RGBAFormat;
	tex.type = THREE.UnsignedByteType;
	tex.minFilter = THREE.LinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.needsUpdate = true;
	return tex;
}

function configure2D(tex) {
	tex.flipY = false;
	tex.wrapS = THREE.ClampToEdgeWrapping;
	tex.wrapT = THREE.ClampToEdgeWrapping;
	tex.minFilter = THREE.LinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.generateMipmaps = false;
	tex.colorSpace = THREE.NoColorSpace;
	return tex;
}

function load2D(url, uniform, onLoad) {
	new THREE.TextureLoader().load(url, (tex) => {
		uniform.value = configure2D(tex);
		onLoad();
	});
}

// Loads an image whose height is a multiple of its width and interprets it as
// depth = height/width stacked slices of a 3D texture.
function load3D(url, uniform, onLoad) {
	new THREE.ImageLoader().load(url, (image) => {
		const w = image.width;
		const h = w;
		const d = image.height / h;
		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(image, 0, 0);
		const data = ctx.getImageData(0, 0, image.width, image.height).data;
		const tex = new THREE.Data3DTexture(new Uint8Array(data.buffer), w, h, d);
		tex.format = THREE.RGBAFormat;
		tex.type = THREE.UnsignedByteType;
		tex.minFilter = THREE.LinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.wrapS = THREE.ClampToEdgeWrapping;
		tex.wrapT = THREE.ClampToEdgeWrapping;
		tex.wrapR = THREE.ClampToEdgeWrapping;
		tex.needsUpdate = true;
		uniform.value = tex;
		onLoad();
	});
}

// Returns { N_TT_R, N_TRT, N_TT_R_GI, N_TRT_GI, GI, M_GI } uniform objects and
// a loader for switching materials (only std_blond ships with this demo, but
// any folder with the same file set under /materials works).
export function createHairLUTUniforms() {
	return {
		N_TT_R: { value: makePlaceholder2D([13, 11, 9, 5]) },
		N_TRT: { value: makePlaceholder2D([17, 13, 8, 255]) },
		N_TT_R_GI: { value: makePlaceholder2D([42, 38, 31, 5]) },
		N_TRT_GI: { value: makePlaceholder2D([22, 19, 13, 255]) },
		GI: { value: makePlaceholder3D([34, 24, 12, 255]) },
		M_GI: { value: makePlaceholder2D([29, 34, 49, 255]) },
	};
}

export function loadHairMaterial(name, uniforms, onLoad) {
	const base = `/hair-mesh/materials/${name}/`;
	load2D(base + 'N_TT_R.png', uniforms.N_TT_R, onLoad);
	load2D(base + 'N_TRT.png', uniforms.N_TRT, onLoad);
	load2D(base + 'N_TT_R_GI.png', uniforms.N_TT_R_GI, onLoad);
	load2D(base + 'N_TRT_GI.png', uniforms.N_TRT_GI, onLoad);
	load2D(base + 'M_GI.png', uniforms.M_GI, onLoad);
	load3D(base + 'GI.png', uniforms.GI, onLoad);
}

export function createHeadTextureUniform(onLoad) {
	const uniform = { value: makePlaceholder2D([240, 167, 134, 255]) };
	load2D('/hair-mesh/models/july.jpg', uniform, onLoad);
	return uniform;
}

// Swaps the head diffuse texture, e.g. when switching to a head model whose
// UV layout doesn't match the July head's (the July photo texture would
// otherwise be sampled through the wrong UVs and look badly distorted).
export function loadHeadTexture(url, uniform, onLoad) {
	load2D(url, uniform, onLoad);
}
