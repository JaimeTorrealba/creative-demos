import {
  Data3DTexture,
  LinearFilter,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType
} from 'three/webgpu'

/**
 * Seamless 3D fractal tri-noise, ported from the three.js `webgpu_postprocessing_fog`
 * example. Triangle-wave noise domain-warped by itself gives the wispy, turbulent
 * structure clouds need; four octaves are enough at this texture size.
 *
 * At the default size this is 96^3 samples on the main thread, so build it behind the
 * component's <Suspense> boundary rather than on the first frame.
 */
export function createNoise3DTexture(size = 96) {
  const data = new Uint8Array(size * size * size)
  let idx = 0

  const tri = (x: number) => Math.abs(((x % 1.0) + 1.0) % 1.0 - 0.5)

  const tri3 = (x: number, y: number, z: number) => [
    tri(z + tri(y)),
    tri(z + tri(x)),
    tri(y + tri(x))
  ]

  const triNoise = (x: number, y: number, z: number) => {
    let px = x,
      py = y,
      pz = z
    let bpx = x,
      bpy = y,
      bpz = z
    let zFactor = 1.4
    let rz = 0.0

    for (let i = 0; i < 4; i++) {
      const [dgx, dgy, dgz] = tri3(bpx * 2.0, bpy * 2.0, bpz * 2.0)
      px += dgx
      py += dgy
      pz += dgz

      bpx = bpx * 1.8 + 0.14
      bpy = bpy * 1.8 + 0.14
      bpz = bpz * 1.8 + 0.14

      zFactor *= 1.5
      px *= 1.2
      py *= 1.2
      pz *= 1.2

      rz += tri(pz + tri(px + tri(py))) / zFactor
    }

    return rz
  }

  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size
        const v = y / size
        const w = z / size

        // Two octaves: a base shape plus offset high-frequency detail.
        const n1 = triNoise(u * 4.0, v * 4.0, w * 4.0)
        const n2 = triNoise(u * 8.0 + 1.7, v * 8.0 + 0.9, w * 8.0 + 2.5) * 0.45

        const val = Math.min(Math.max((n1 + n2) * 1.15 * 255, 0), 255)

        data[idx++] = Math.floor(val)
      }
    }
  }

  const texture = new Data3DTexture(data, size, size, size)
  texture.format = RedFormat
  texture.type = UnsignedByteType
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.wrapR = RepeatWrapping
  texture.unpackAlignment = 1
  texture.needsUpdate = true

  return texture
}
