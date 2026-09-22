import {
  exp,
  float,
  Fn,
  fwidth,
  getViewPosition,
  interleavedGradientNoise,
  Loop,
  pass,
  rtt,
  screenCoordinate,
  screenUV,
  texture3D,
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import {
  Color,
  RedFormat,
  RenderPipeline,
  UnsignedByteType,
  type Camera,
  type Data3DTexture,
  type Node,
  type Scene,
  type WebGPURenderer
} from 'three/webgpu'

export type FogDenoiser = 'jbu' | 'gaussian' | 'raw'

export type FogPipeline = ReturnType<typeof createFogPipeline>

interface FogPipelineOptions {
  renderer: WebGPURenderer
  scene: Scene
  camera: Camera
  noiseTexture: Data3DTexture
}

/**
 * Post-processing volumetric cloud fog, ported from the three.js
 * `webgpu_postprocessing_fog` example.
 *
 * The scene pass gives colour and depth; depth is reconstructed into world space so a ray
 * can be marched through a horizontal fog slab, sampling a 3D noise texture for density.
 * The march runs into a reduced-resolution buffer and is brought back to full resolution
 * by Joint Bilateral Upsampling, which uses full-res depth as a guide so the fog does not
 * bleed across object silhouettes.
 */
export function createFogPipeline({
  renderer,
  scene,
  camera,
  noiseTexture
}: FogPipelineOptions) {
  // These uniforms hold the camera's own matrices by reference and three mutates them in
  // place, so the fog tracks OrbitControls with no per-frame bookkeeping. They are needed
  // because the post-processing quad renders through its own orthographic camera.
  const cameraWorldMatrix = uniform(camera.matrixWorld)
  const cameraProjectionMatrixInverse = uniform(camera.projectionMatrixInverse)
  const cameraPositionUniform = uniform(camera.position)

  // The example is tuned for a scene about ten units across. This one is roughly 120 deep
  // — the towers reach z = -118 and y = 25 — so density has to drop by about the same
  // factor or every near-horizontal ray saturates and the sky blows out to flat white.
  const uniforms = {
    resolutionScale: uniform(0.4),
    steps: uniform(24),
    fogDensity: uniform(0.2),
    heightFalloff: uniform(0.3),
    // Slab top well above the camera so the towers rise out of the mist, while rays aimed
    // upward still leave the volume quickly and keep the environment map visible.
    fogHeight: uniform(6.0),
    // A uniform rather than the example's hardcoded float, so the slab can be aligned to
    // the GLTF from the pane instead of a code edit. The figure's base sits near y = 0.
    groundLevel: uniform(0.0),
    cloudScale: uniform(0.019),
    cloudThreshold: uniform(0.66),
    cloudSpeed: uniform(0.02),
    cloudTime: uniform(0.0),
    // Far enough to reach the back of the scene, so distance reads as depth across the
    // whole tower line instead of clipping to a uniform wall part way in.
    maxRayDist: uniform(10.0),
    fogColor: uniform(new Color(0xffffff)),
    // Just past the furthest tower, so distance fog is off by default but starts biting as
    // soon as `near` is dragged down.
    rangeFogNear: uniform(150.0),
    rangeFogFar: uniform(400.0),
    spatialSigma: uniform(1.2),
    depthSensitivity: uniform(30.0),
    blurRadius: uniform(0.5)
  }

  const {
    resolutionScale,
    steps,
    fogDensity,
    heightFalloff,
    fogHeight,
    groundLevel,
    cloudScale,
    cloudThreshold,
    cloudTime,
    maxRayDist,
    fogColor,
    rangeFogNear,
    rangeFogFar,
    spatialSigma,
    depthSensitivity,
    blurRadius
  } = uniforms

  const scenePass = pass(scene, camera)
  const sceneColor = scenePass.getTextureNode('output')
  const sceneDepth = scenePass.getTextureNode('depth')

  // Density of the cloud volume at a world position: two noise octaves drifting against
  // each other, the second warped by the first, faded out toward the top of the slab.
  const sampleCloudDensity = Fn(([pos]: [Node<'vec3'>]) => {
    const t = cloudTime
    const p = vec3(pos.mul(cloudScale)).toVar()

    const wind1 = vec3(t.mul(0.3), t.mul(0.05), t.mul(0.2))
    const n1 = texture3D(noiseTexture, p.add(wind1)).r

    const wind2 = vec3(t.negate().mul(0.15), t.mul(0.1), t.mul(0.08))
    const p2 = p.mul(2.2).add(vec3(1.7, 0.9, 2.5)).add(wind2).add(n1.mul(0.5))
    const n2 = texture3D(noiseTexture, p2).r.mul(0.5)

    const noise3D = n1.add(n2)

    const relHeight = pos.y.sub(groundLevel).div(fogHeight.max(0.01))
    const heightFactor = float(1.0).sub(relHeight).clamp(0.0, 1.0).pow(heightFalloff)

    return noise3D.sub(cloudThreshold).max(0.0).mul(heightFactor)
  })

  const volumetricFogPass = Fn(() => {
    const depth = sceneDepth.sample(screenUV).r
    const viewPos = getViewPosition(screenUV, depth, cameraProjectionMatrixInverse)
    const targetWorldPos = cameraWorldMatrix.mul(vec4(viewPos, 1.0)).xyz

    const rayVector = targetWorldPos.sub(cameraPositionUniform)
    const surfaceDist = rayVector.length()
    const rayDir = rayVector.normalize()

    // Clip the ray to the fog slab so every step is spent inside the volume.
    const fogBottomY = groundLevel
    const fogTopY = groundLevel.add(fogHeight)

    const dirY = rayDir.y
      .greaterThanEqual(0.0)
      .select(rayDir.y.max(0.00001), rayDir.y.min(-0.00001))
    const t0 = fogBottomY.sub(cameraPositionUniform.y).div(dirY)
    const t1 = fogTopY.sub(cameraPositionUniform.y).div(dirY)

    const tStart = t0.min(t1).max(0.0)
    const tEnd = t0.max(t1).min(surfaceDist).min(tStart.add(maxRayDist))
    const marchDist = tEnd.sub(tStart).max(0.0)

    const stepSize = marchDist.div(float(steps))
    const stepVector = rayDir.mul(stepSize)

    // Jittering the first step trades banding for noise, which the denoiser then cleans up.
    const ditherOffset = interleavedGradientNoise(screenCoordinate.xy)
    const positionRay = cameraPositionUniform
      .add(rayDir.mul(tStart))
      .add(stepVector.mul(ditherOffset))
      .toVar()

    const accumulation = float(0.0).toVar()

    Loop(steps, () => {
      accumulation.addAssign(sampleCloudDensity(positionRay).mul(stepSize).mul(fogDensity))
      positionRay.addAssign(stepVector)
    })

    // Beer-Lambert transmittance.
    const cloudFog = float(1.0).sub(accumulation.negate().exp())

    // Background pixels carry depth 1.0, so their surfaceDist is the camera far plane,
    // which is far beyond any sane rangeFogFar — left ungated, linear fog clamps to 1.0
    // across the whole sky and erases the environment map. Distance fog is for geometry;
    // the horizon is the volumetric layer's job.
    const rangeFog = depth
      .lessThan(0.9999)
      .select(
        surfaceDist
          .sub(rangeFogNear)
          .div(rangeFogFar.sub(rangeFogNear).max(0.001))
          .clamp(0.0, 1.0),
        float(0.0)
      )

    return cloudFog.max(rangeFog)
  })

  const lowResFogPass = rtt(volumetricFogPass(), null, null, {
    type: UnsignedByteType,
    format: RedFormat,
    resolutionScale: resolutionScale.value
  })

  // Joint Bilateral Upsampling (Kopf et al. 2007) — full-res depth guides a 5x5 gather over
  // the low-res fog, so weights collapse across depth discontinuities and edges stay sharp.
  // Unlike the example this takes no TSL arguments; it is built once, so the inputs are
  // simply captured from scope.
  const jointBilateralUpsampling = Fn(() => {
    const centerCoord = screenUV

    const centerDepth = getViewPosition(
      centerCoord,
      sceneDepth.sample(centerCoord).r,
      cameraProjectionMatrixInverse
    )
      .z.negate()
      .max(0.001)

    const lowResTexel = fwidth(centerCoord).div(resolutionScale)

    const spatialSigmaFactor = float(-0.5).div(spatialSigma.mul(spatialSigma).max(0.01))
    const depthSigmaFactor = depthSensitivity.mul(depthSensitivity).mul(-0.5)

    const sumColor = float(0.0).toVar()
    const sumWeight = float(0.0).toVar()

    for (let y = -2; y <= 2; y++) {
      for (let x = -2; x <= 2; x++) {
        const offset = vec2(float(x), float(y))
        const spatialDistSq = offset.x.mul(offset.x).add(offset.y.mul(offset.y))
        const spatialWeight = exp(spatialDistSq.mul(spatialSigmaFactor))

        const sampleUV = centerCoord.add(offset.mul(lowResTexel))
        const sampleFog = lowResFogPass.sample(sampleUV)
        const sampleDepth = getViewPosition(
          sampleUV,
          sceneDepth.sample(sampleUV).r,
          cameraProjectionMatrixInverse
        )
          .z.negate()
          .max(0.001)

        const depthDiff = sampleDepth.sub(centerDepth).div(centerDepth.max(0.1))
        const rangeWeight = exp(depthDiff.mul(depthDiff).mul(depthSigmaFactor))

        const totalWeight = spatialWeight.mul(rangeWeight)

        sumColor.addAssign(sampleFog.mul(totalWeight))
        sumWeight.addAssign(totalWeight)
      }
    }

    return sumColor.div(sumWeight.max(0.0001))
  })

  const denoisers = {
    jbu: jointBilateralUpsampling(),
    gaussian: gaussianBlur(lowResFogPass, blurRadius),
    raw: lowResFogPass.sample(screenUV)
  }

  const renderPipeline = new RenderPipeline(renderer)

  const setDenoiser = (mode: FogDenoiser) => {
    // `a.mix(b, c)` is `mix(b, c, a)` in TSL, so this lerps the scene toward the fog colour
    // by the fog amount.
    renderPipeline.outputNode = denoisers[mode].mix(sceneColor.rgb, fogColor)
    renderPipeline.needsUpdate = true
  }

  const setResolutionScale = (value: number) => {
    resolutionScale.value = value
    lowResFogPass.setResolutionScale(value)
  }

  setDenoiser('jbu')

  return {
    uniforms,
    render: () => renderPipeline.render(),
    advance: (delta: number) => {
      cloudTime.value += delta * uniforms.cloudSpeed.value
    },
    setDenoiser,
    setResolutionScale,
    dispose: () => renderPipeline.dispose()
  }
}
