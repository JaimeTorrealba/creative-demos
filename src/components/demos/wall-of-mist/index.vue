<script setup lang="ts">
import { isWebGPURenderer, useTresContext } from '@tresjs/core'
import { mix, uv, vec3 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { onUnmounted } from 'vue'

// Node materials only compile once the WebGPU backend is up, so wait for it.
// The top-level await is what makes the <Suspense> wrapper in the view meaningful.
const { renderer } = useTresContext()
if (isWebGPURenderer(renderer.instance)) await renderer.instance.init()

const material = new MeshBasicNodeMaterial()
material.colorNode = mix(vec3(0.1, 0.1, 0.15), vec3(0.75, 0.5, 1.0), uv().y)

onUnmounted(() => material.dispose())
</script>

<template>
  <TresMesh :position="[0, 0, -2]" :material="material">
    <TresPlaneGeometry :args="[4, 3]" />
  </TresMesh>
</template>
