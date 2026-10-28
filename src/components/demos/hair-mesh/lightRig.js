// Light matrices, ported from the original demo's MatrixLight / MatrixMVPLight /
// MVLightDir. The original arrays are column-major, matching Matrix3/Matrix4.fromArray.

import * as THREE from 'three';

const lightScale = 1;

// world -> light space (3x3, includes lightScale)
export function matrixLight(rot, tilt, target = new THREE.Matrix3()) {
	const cm = Math.cos(rot);
	const sm = Math.sin(rot);
	const c = Math.cos(tilt);
	const s = Math.sin(tilt);
	const r = lightScale;
	return target.fromArray([r * cm, r * s * sm, -r * c * sm, 0, r * c, r * s, -r * sm, r * s * cm, -r * c * cm]);
}

// world -> light clip space (4x4 used as the shadow-pass mvp)
export function matrixMVPLight(rot, tilt, target = new THREE.Matrix4()) {
	const m = matrixLight(rot, tilt).elements;
	return target.fromArray([m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1]);
}

// world-space direction pointing toward the light
export function lightWorldDir(rot, tilt, target = new THREE.Vector3()) {
	const c = Math.cos(tilt);
	const s = Math.sin(tilt);
	return target.set(c * Math.sin(rot), -s, c * Math.cos(rot));
}
