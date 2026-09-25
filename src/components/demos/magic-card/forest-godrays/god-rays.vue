<script setup lang="ts">
import { useLoop, useTresContext } from '@tresjs/core'
import type { ColorRepresentation, DirectionalLight } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { onUnmounted } from 'vue'
import { useTweakpane } from '../../../../composables/useTweakpane'
import { addGodraysControls } from './godrays-pane'
import { createGodraysPipeline } from './godrays-pipeline'

const props = defineProps<{
  // Must cast shadows: the rays are read off its shadow map.
  light: DirectionalLight
  rayColor: ColorRepresentation
}>()

const { camera, renderer, scene } = useTresContext()

/**
 * Renders nothing into the scene graph — the godrays are a post-processing pass, so this
 * component exists to own their lifetime: it takes over the render loop, builds the pane,
 * and tears both down again on unmount.
 */
function setupGodrays() {
  const rendererInstance = renderer.instance
  const activeCamera = camera.activeCamera.value

  if (!(rendererInstance instanceof WebGPURenderer) || !activeCamera) return null

  const pipeline = createGodraysPipeline({
    renderer: rendererInstance,
    scene: scene.value,
    camera: activeCamera,
    light: props.light,
    rayColor: props.rayColor
  })

  // Swaps out TresJS's default `renderer.render(scene, camera)` for the pipeline, which
  // still applies tone mapping and the output colour space at the end of the chain.
  const { render } = useLoop()
  render((notifySuccess) => {
    pipeline.render()
    notifySuccess()
  })

  addGodraysControls(useTweakpane('Godrays'), pipeline)

  return pipeline
}

const pipeline = setupGodrays()

onUnmounted(() => pipeline?.dispose())
</script>

<!-- Renderless: the godrays are a post-processing pass, so there is no geometry to add. The
     slot keeps this a valid template root without putting a stray object in the scene. -->
<template>
  <slot />
</template>
