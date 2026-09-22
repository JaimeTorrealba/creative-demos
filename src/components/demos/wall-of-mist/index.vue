<script setup lang="ts">
import { useTresContext } from '@tresjs/core'
import { EquirectangularReflectionMapping } from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { WebGPURenderer } from 'three/webgpu'
import { onUnmounted } from 'vue'
import VolumetricFog from './volumetric-fog.vue'

const { renderer, scene } = useTresContext()

// The model is Draco-compressed with KHR_texture_basisu textures; both decoders
// are served from public/ so the demo works offline.
const draco = new DRACOLoader().setDecoderPath('/draco/')
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/')

// KTX2 reads the transcode target off the live backend, so it has to be up before
// anything loads. The await is what makes the view's <Suspense> wrapper meaningful.
const rendererInstance = renderer.instance
if (rendererInstance instanceof WebGPURenderer) {
  await rendererInstance.init()
  ktx2.detectSupport(rendererInstance)
}

const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2)

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

  <VolumetricFog />
</template>
