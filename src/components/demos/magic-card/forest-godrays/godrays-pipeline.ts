import { float, int, pass, uniform } from 'three/tsl'
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js'
import { depthAwareBlend } from 'three/addons/tsl/display/depthAwareBlend.js'
import { godrays } from 'three/addons/tsl/display/GodraysNode.js'
import {
  Color,
  RenderPipeline,
  type Camera,
  type ColorRepresentation,
  type DirectionalLight,
  type Scene,
  type WebGPURenderer
} from 'three/webgpu'

export type GodraysPipeline = ReturnType<typeof createGodraysPipeline>

interface GodraysPipelineOptions {
  renderer: WebGPURenderer
  scene: Scene
  camera: Camera
  light: DirectionalLight
  rayColor: ColorRepresentation
}

/**
 * Screen-space raymarched godrays, ported from the three.js `webgpu_postprocessing_godrays`
 * example.
 *
 * Each pixel's ray is marched through the light's shadow box, sampling the shadow map to
 * find how much of it is lit. That accumulated amount is blurred and then mixed over the
 * scene toward the ray colour. The rays only exist where something casts a shadow, so they
 * come from the gaps between occluders.
 */
export function createGodraysPipeline({
  renderer,
  scene,
  camera,
  light,
  rayColor
}: GodraysPipelineOptions) {
  const scenePass = pass(scene, camera)
  const sceneColor = scenePass.getTextureNode('output')
  const sceneDepth = scenePass.getTextureNode('depth')

  const godraysPass = godrays(sceneDepth, camera, light)
  const godraysColor = godraysPass.getTextureNode()

  const blurPass = bilateralBlur(godraysColor)
  const blurColor = blurPass.getTextureNode()

  // The example's defaults are tuned for a scene about 350 units across; this one is closer
  // to 40, so density goes up to make up for the shorter rays.
  godraysPass.raymarchSteps.value = 72
  godraysPass.density.value = 1.4
  godraysPass.maxDensity.value = 0.75
  godraysPass.distanceAttenuation.value = 5

  const uniforms = {
    rayColor: uniform(new Color(rayColor)),
    edgeRadius: uniform(int(2)),
    edgeStrength: uniform(float(0))
  }

  const blendOptions = {
    blendColor: uniforms.rayColor,
    edgeRadius: uniforms.edgeRadius,
    edgeStrength: uniforms.edgeStrength
  }

  const outputs = {
    blurred: depthAwareBlend(sceneColor, blurColor, sceneDepth, camera, blendOptions),
    raw: depthAwareBlend(sceneColor, godraysColor, sceneDepth, camera, blendOptions)
  }

  const renderPipeline = new RenderPipeline(renderer)

  const setBlur = (enabled: boolean) => {
    renderPipeline.outputNode = enabled ? outputs.blurred : outputs.raw
    renderPipeline.needsUpdate = true
  }

  setBlur(true)

  return {
    godrays: godraysPass,
    uniforms,
    render: () => renderPipeline.render(),
    setBlur,
    dispose: () => {
      godraysPass.dispose()
      blurPass.dispose()
      renderPipeline.dispose()
    }
  }
}
