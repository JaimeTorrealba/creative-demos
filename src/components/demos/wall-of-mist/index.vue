<script setup lang="ts">
import { isWebGPURenderer, useTresContext } from '@tresjs/core'
import { EquirectangularReflectionMapping } from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { onUnmounted } from 'vue'

// KTX2 picks its transcode target from the backend, so it has to be up first.
// The top-level await is what makes the <Suspense> wrapper in the view meaningful.
const { renderer, scene } = useTresContext()
if (isWebGPURenderer(renderer.instance)) await renderer.instance.init()

// The model is Draco-compressed with KHR_texture_basisu textures; both decoders
// are served from public/ so the demo works offline.
const draco = new DRACOLoader().setDecoderPath('/draco/')
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer.instance)

const loader = new GLTFLoader()
loader.setDRACOLoader(draco)
loader.setKTX2Loader(ktx2)

const { scene: model } = await loader.loadAsync('/WallOfMist/MTGWallOfMist.glb')

const envMap = await new EXRLoader().loadAsync(
  '/WallOfMist/cloudy-sky-over-the-sea_1K_c8cc5897-1bb2-445a-8563-e094a4c2dfb6.exr'
)
envMap.mapping = EquirectangularReflectionMapping
scene.value.environment = envMap
scene.value.background = envMap

onUnmounted(() => {
  scene.value.environment = null
  scene.value.background = null
  envMap.dispose()
  draco.dispose()
  ktx2.dispose()
})
</script>

<template>
  <primitive :object="model" />
</template>
