<script setup lang="ts">
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
    <TresPerspectiveCamera
:position="[0.2, 1.7, 8.1]"
    :rotation-x="0.1"  />


    <Suspense>
      <TheExperience />
    </Suspense>
  </TresCanvas>
</template>
