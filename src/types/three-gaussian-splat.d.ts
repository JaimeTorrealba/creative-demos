// three r186 ships its Gaussian splat addons without typings, and @types/three has not caught up
// yet. Only what this project uses is declared, with signatures taken from three's own source.

declare module 'three/addons/objects/GaussianSplat.js' {
  import type { BufferGeometry, Material, Mesh } from 'three'

  export class GaussianSplat extends Mesh<BufferGeometry, Material> {
    constructor(splatGeometry: BufferGeometry, options?: { autoSort?: boolean })
    readonly isGaussianSplat: true
    // The geometry passed in; the mesh's own `geometry` is an internal instanced quad.
    splatGeometry: BufferGeometry
  }
}

declare module 'three/addons/utils/GaussianSplatUtils.js' {
  import type { BufferGeometry } from 'three'

  // Packed 32-bit words per splat for each spherical-harmonics band, indexed by band.
  export const SH_BAND_WORDS: readonly number[]

  export function createGaussianSplatGeometry(
    centers: Float32Array,
    covariances: Float32Array,
    colors: Uint8Array | Uint8ClampedArray,
    sphericalHarmonics?: { sh1?: Uint32Array; sh2?: Uint32Array; sh3?: Uint32Array }
  ): BufferGeometry

  export function createPackedSphericalHarmonicsBand(
    count: number,
    degree: number
  ): { packed: Uint32Array; bytes: Uint8ClampedArray }

  export function writeColorBytesFromSH0(
    target: Uint8Array | Uint8ClampedArray,
    offset: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void

  export function writeCovariance(
    target: Float32Array,
    offset: number,
    sx: number,
    sy: number,
    sz: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number
  ): void
}
