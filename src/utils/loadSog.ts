// three renders Gaussian splats natively but has no loader for PlayCanvas's SOG format, so this
// decodes one into the same geometry three's own splat loaders produce.
//
// A .sog (version 2) is a zip of a meta.json plus WebP images, one pixel per splat:
//   means_l / means_u  low and high bytes of 16-bit positions, quantised between mins and maxs
//                      after a sign(x) * log(|x| + 1) transform
//   quats              the three smallest quaternion components; alpha is 252 + the index of the
//                      dropped largest one, in (w, x, y, z) order
//   scales             per-axis indices into a codebook of log scales
//   sh0                per-channel indices into a codebook of DC colour; alpha is opacity
//   shN_labels         a 16-bit index into shN_centroids, 64 centroids per row, each spanning one
//                      pixel per higher-order SH coefficient, with RGB as codebook indices
import { type BufferGeometry } from 'three'
import { unzipSync } from 'three/addons/libs/fflate.module.js'
import {
  SH_BAND_WORDS,
  createGaussianSplatGeometry,
  createPackedSphericalHarmonicsBand,
  writeColorBytesFromSH0,
  writeCovariance
} from 'three/addons/utils/GaussianSplatUtils.js'

interface SogMeta {
  version: number
  count: number
  means: { mins: number[]; maxs: number[]; files: string[] }
  scales: { codebook: number[]; files: string[] }
  quats: { files: string[] }
  sh0: { codebook: number[]; files: string[] }
  shN?: { count: number; bands: number; codebook: number[]; files: string[] }
}

// Higher-order SH coefficients per colour channel, indexed by band count, and the first
// coefficient of each band, indexed by band.
const SH_COEFFICIENTS = [0, 3, 8, 15]
const BAND_START = [0, 0, 3, 8]

// WebP pixels have to come out exactly as stored: sh0's alpha is opacity, and a 2D canvas would
// premultiply by it and wreck the colour indices of faint splats. A WebGL texture read back
// unpremultiplied keeps every byte intact.
async function decodeImages(files: Uint8Array[]) {
  const gl = new OffscreenCanvas(1, 1).getContext('webgl2')!
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
  const texture = gl.createTexture()
  const framebuffer = gl.createFramebuffer()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)

  const images = []
  for (const file of files) {
    const bitmap = await createImageBitmap(new Blob([file as BlobPart], { type: 'image/webp' }), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none'
    })
    const { width, height } = bitmap
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    bitmap.close()
    images.push({ pixels, width })
  }

  gl.deleteFramebuffer(framebuffer)
  gl.deleteTexture(texture)
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return images
}

export async function loadSog(url: string): Promise<BufferGeometry> {
  const archive = unzipSync(new Uint8Array(await (await fetch(url)).arrayBuffer()))
  const meta: SogMeta = JSON.parse(new TextDecoder().decode(archive['meta.json']))
  if (meta.version !== 2) throw new Error(`loadSog: unsupported SOG version ${meta.version}`)

  const bands = meta.shN?.bands ?? 0
  const fileNames = [
    ...meta.means.files,
    ...meta.quats.files,
    ...meta.scales.files,
    ...meta.sh0.files,
    ...(bands > 0 ? meta.shN!.files : [])
  ]
  const [meansL, meansU, quats, scales, sh0, centroids, labels] = await decodeImages(
    fileNames.map((name) => archive[name]!)
  )

  const { count } = meta
  const { mins, maxs } = meta.means
  const centers = new Float32Array(count * 3)
  const covariances = new Float32Array(count * 6)
  const colors = new Uint8ClampedArray(count * 4)
  const sphericalHarmonics = Array.from({ length: bands }, (_, band) =>
    createPackedSphericalHarmonicsBand(count, band + 1)
  )
  const coefficients = SH_COEFFICIENTS[bands]!
  const quaternion = [0, 0, 0, 0]

  for (let i = 0; i < count; i++) {
    const p = i * 4

    for (let axis = 0; axis < 3; axis++) {
      const n = ((meansU!.pixels[p + axis]! << 8) | meansL!.pixels[p + axis]!) / 65535
      const v = mins[axis]! + (maxs[axis]! - mins[axis]!) * n
      centers[i * 3 + axis] = Math.sign(v) * (Math.exp(Math.abs(v)) - 1)
    }

    // The dropped largest component is recovered from the unit length, then slotted back in.
    const a = (quats!.pixels[p]! / 255 - 0.5) * Math.SQRT2
    const b = (quats!.pixels[p + 1]! / 255 - 0.5) * Math.SQRT2
    const c = (quats!.pixels[p + 2]! / 255 - 0.5) * Math.SQRT2
    const d = Math.sqrt(Math.max(0, 1 - a * a - b * b - c * c))
    const largest = quats!.pixels[p + 3]! - 252
    let k = 0
    for (let j = 0; j < 4; j++) quaternion[j] = j === largest ? d : [a, b, c][k++]!
    const [qw, qx, qy, qz] = quaternion as [number, number, number, number]

    const scaleBook = meta.scales.codebook
    writeCovariance(
      covariances,
      i * 6,
      Math.exp(scaleBook[scales!.pixels[p]!]!),
      Math.exp(scaleBook[scales!.pixels[p + 1]!]!),
      Math.exp(scaleBook[scales!.pixels[p + 2]!]!),
      qx,
      qy,
      qz,
      qw
    )

    const colorBook = meta.sh0.codebook
    writeColorBytesFromSH0(
      colors,
      p,
      colorBook[sh0!.pixels[p]!]!,
      colorBook[sh0!.pixels[p + 1]!]!,
      colorBook[sh0!.pixels[p + 2]!]!,
      sh0!.pixels[p + 3]! / 255
    )

    if (bands === 0) continue

    // three packs each band as coefficient-major RGB bytes, (value * 128 + 128).
    const label = labels!.pixels[p]! | (labels!.pixels[p + 1]! << 8)
    const texel = ((label >> 6) * centroids!.width + (label & 63) * coefficients) * 4
    for (let j = 0; j < coefficients; j++) {
      const band = j < 3 ? 1 : j < 8 ? 2 : 3
      const target = sphericalHarmonics[band - 1]!.bytes
      const offset = i * SH_BAND_WORDS[band]! * 4 + (j - BAND_START[band]!) * 3
      for (let channel = 0; channel < 3; channel++) {
        const index = centroids!.pixels[texel + j * 4 + channel]!
        target[offset + channel] = meta.shN!.codebook[index]! * 128 + 128
      }
    }
  }

  return createGaussianSplatGeometry(centers, covariances, colors, {
    sh1: sphericalHarmonics[0]?.packed,
    sh2: sphericalHarmonics[1]?.packed,
    sh3: sphericalHarmonics[2]?.packed
  })
}
