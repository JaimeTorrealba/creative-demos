<script setup lang="ts">
import { useLoop, useTresContext } from '@tresjs/core'
import { WebGPURenderer } from 'three/webgpu'
import { onUnmounted } from 'vue'
import { useTweakpane } from '../../../../composables/useTweakpane'
import { addFogControls } from './fog-pane'
import { createFogPipeline } from './fog-pipeline'
import { createNoise3DTexture } from './noise-3d'

const { camera, renderer, scene } = useTresContext()

/**
 * Renders nothing into the scene graph — the fog is a post-processing pass, so this
 * component exists to own its lifetime: it takes over the render loop, builds the pane,
 * and tears both down again on unmount.
 */
function setupFog() {
  const rendererInstance = renderer.instance
  const activeCamera = camera.activeCamera.value

  if (!(rendererInstance instanceof WebGPURenderer) || !activeCamera) return null

  // Blocking for a few hundred milliseconds, but it runs once and the parent has already
  // awaited the model and environment map by the time this mounts.
  const noiseTexture = createNoise3DTexture()

  const fog = createFogPipeline({
    renderer: rendererInstance,
    scene: scene.value,
    camera: activeCamera,
    noiseTexture
  })

  const { onBeforeRender, render } = useLoop()

  onBeforeRender(({ delta }) => fog.advance(delta))

  // Swaps out TresJS's default `renderer.render(scene, camera)` for the pipeline, which
  // still applies tone mapping and the output colour space at the end of the chain.
  render((notifySuccess) => {
    fog.render()
    notifySuccess()
  })

  addFogControls(useTweakpane('Volumetric Fog'), fog)

  return { fog, noiseTexture }
}

const active = setupFog()

onUnmounted(() => {
  active?.fog.dispose()
  active?.noiseTexture.dispose()
})
</script>

<!-- Renderless: the fog is a post-processing pass, so there is no geometry to add. The
     slot keeps this a valid template root without putting a stray object in the scene. -->
<template>
  <slot />
</template>
