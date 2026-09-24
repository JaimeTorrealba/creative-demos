/**
 * Procedural puff textures for the smoke banks. cientos' <Smoke> defaults to a texture
 * fetched from raw.githubusercontent.com, and this demo deliberately vendors its draco and
 * basis decoders so it runs offline — so the puffs are built here instead, the same way
 * `createNoise3DTexture()` builds the fog's volume.
 *
 * <Smoke> takes a URL string rather than a Texture, so these come back as data URIs;
 * three's ImageLoader accepts those directly.
 */

/** Small seeded PRNG, so a given bank gets the same puff on every reload. */
function mulberry32(seed: number) {
  let a = seed >>> 0

  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Value noise on a wrapping lattice. Wrapping keeps the octaves tileable, which matters
 * less for a radially masked puff than it would for the fog, but it costs nothing and
 * stops a hard seam showing when the falloff is pushed wide.
 */
function createValueNoise(random: () => number, gridSize: number) {
  const lattice = new Float32Array(gridSize * gridSize)
  for (let i = 0; i < lattice.length; i++) lattice[i] = random()

  const smooth = (t: number) => t * t * (3 - 2 * t)

  return (x: number, y: number) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = smooth(x - x0)
    const fy = smooth(y - y0)

    const wrap = (v: number) => ((v % gridSize) + gridSize) % gridSize
    const ix0 = wrap(x0)
    const iy0 = wrap(y0)
    const ix1 = wrap(x0 + 1)
    const iy1 = wrap(y0 + 1)

    const v00 = lattice[iy0 * gridSize + ix0]
    const v10 = lattice[iy0 * gridSize + ix1]
    const v01 = lattice[iy1 * gridSize + ix0]
    const v11 = lattice[iy1 * gridSize + ix1]

    const top = v00 + (v10 - v00) * fx
    const bottom = v01 + (v11 - v01) * fx

    return top + (bottom - top) * fy
  }
}

/**
 * One puff: fractal value noise multiplied by a radial falloff, written into the alpha
 * channel over white. The RGB stays white so the <Smoke> `color` prop is what tints it.
 */
export function createSmokeTexture(seed: number, size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('smoke-texture: no 2d context')

  const random = mulberry32(seed)
  const noise = createValueNoise(random, 16)

  // Each puff gets its own lopsidedness, so the banks do not all read as the same blob.
  const stretchX = 1.0 + random() * 0.5
  const stretchY = 0.65 + random() * 0.35
  const offsetX = (random() - 0.5) * 0.15
  const offsetY = (random() - 0.5) * 0.15

  const image = ctx.createImageData(size, size)
  let idx = 0

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size

      // Four octaves of value noise, each finer and quieter than the last.
      let amplitude = 0.5
      let frequency = 3.0
      let n = 0.0
      for (let octave = 0; octave < 4; octave++) {
        n += noise(u * frequency, v * frequency) * amplitude
        amplitude *= 0.5
        frequency *= 2.1
      }

      // Radial falloff, squeezed per axis so the puff is wider than it is tall. Squared
      // at the end so alpha reaches zero well inside the edge and no quad border shows.
      const dx = (u - 0.5 - offsetX) / stretchX
      const dy = (v - 0.5 - offsetY) / stretchY
      const radius = Math.sqrt(dx * dx + dy * dy) * 2.0
      const falloff = Math.max(0, 1 - radius)

      const alpha = Math.min(Math.max(n * falloff * falloff * 2.4 - 0.12, 0), 1)

      image.data[idx++] = 255
      image.data[idx++] = 255
      image.data[idx++] = 255
      image.data[idx++] = Math.floor(alpha * 255)
    }
  }

  ctx.putImageData(image, 0, 0)

  return canvas.toDataURL('image/png')
}

/** A distinct puff per bank, built once per component instance by the caller. */
export function createSmokeTextures(count: number, size = 256) {
  return Array.from({ length: count }, (_, index) => createSmokeTexture(index * 7919 + 101, size))
}
