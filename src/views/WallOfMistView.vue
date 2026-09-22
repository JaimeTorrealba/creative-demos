<script setup lang="ts">
import { OrbitControls } from '@tresjs/cientos'
import { TresCanvas, type TresRendererSetupContext } from '@tresjs/core'
import { WebGPURenderer } from 'three/webgpu'
import { toValue } from 'vue'
import TheExperience from '../components/demos/wall-of-mist/index.vue'

const createRenderer = (ctx: TresRendererSetupContext) =>
  new WebGPURenderer({
    canvas: toValue(ctx.canvas),
    alpha: true,
    antialias: true
  })
</script>

<template>
  <TresCanvas window-size clear-color="#333" :renderer="createRenderer">
    <TresPerspectiveCamera :position="[0, 0, 5]" :look-at="[0, 0, 0]" />
    <OrbitControls />

    <TresMesh>
      <TresBoxGeometry :args="[1, 1, 1]" />
      <TresMeshBasicMaterial color="#c084fc" />
    </TresMesh>

    <Suspense>
      <TheExperience />
    </Suspense>

    <TresAmbientLight :intensity="0.2" />
    <TresDirectionalLight :position="[5, 5, 5]" :intensity="1" />
  </TresCanvas>
</template>
