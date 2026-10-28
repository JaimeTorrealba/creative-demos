<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { createHairMeshDemo, type HairMeshDemo } from './main.js'

// The demo is a standalone WebGL2 app (raw GLSL3 shaders, its own shadow passes and on-demand
// render loop), so it is mounted as-is instead of being rebuilt on TresCanvas / WebGPU.
const containerRef = ref<HTMLDivElement>()
let hairMeshDemo: HairMeshDemo | null = null

onMounted(() => {
  if (containerRef.value) hairMeshDemo = createHairMeshDemo(containerRef.value)
})

onUnmounted(() => hairMeshDemo?.dispose())
</script>

<template>
  <div ref="containerRef" class="hair-mesh" />
</template>

<style scoped>
/* Carried over from the original index.html. */
.hair-mesh {
  position: fixed;
  inset: 0;
  background-color: #222;
  overflow: hidden;
}

.hair-mesh :deep(canvas) {
  display: block;
  background-color: black;
}
</style>
