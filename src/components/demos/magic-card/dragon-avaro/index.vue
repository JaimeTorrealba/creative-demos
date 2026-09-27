<script setup lang="ts">
// The right magic card's art: Dragón avaro flying over its treasure hoard, a cliff behind. It
// fills the card's #art slot in MagicCardView, which only supplies the canvas and camera, so
// this component owns all the other scene content: models, backdrop and lights.
import { useLoop, useTresContext } from '@tresjs/core'
import {
  AnimationMixer,
  Box3,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PointLight,
  Texture,
  Vector3,
  type Material,
  type Object3D
} from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { GaussianSplat } from 'three/addons/objects/GaussianSplat.js'
import { WebGPURenderer } from 'three/webgpu'
import { onUnmounted } from 'vue'
import { useTweakpane } from '../../../../composables/useTweakpane'
import { loadSog } from '../../../../utils/loadSog'

// Both models are Draco-compressed with KHR_texture_basisu textures; the decoders are served
// from public/, shared with the other card scenes.
const draco = new DRACOLoader().setDecoderPath('/draco/')
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/')

// KTX2 reads its transcode target off the live backend, so it waits for it. The top-level
// await is what makes the <Suspense> wrapper in the view meaningful.
const { renderer, camera } = useTresContext()
const rendererInstance = renderer.instance
if (rendererInstance instanceof WebGPURenderer) {
  await rendererInstance.init()
  ktx2.detectSupport(rendererInstance)
}

const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2)
const [dragonGltf, treasureGltf, cliffGeometry] = await Promise.all([
  loader.loadAsync('/magic-card/dragonAvaro/dragon_compressed.glb'),
  loader.loadAsync('/magic-card/dragonAvaro/MTG - treasure_compressed.glb'),
  loadSog('/magic-card/dragonAvaro/Cliff.sog')
])
const dragon = dragonGltf.scene
const treasure = treasureGltf.scene

// The cliff splat is the backdrop. The capture is y-down, hence the flip on x; the quarter turn
// on y faces the cliff towards the camera, and it sits back behind the hoard.
const cliff = new GaussianSplat(cliffGeometry)
const cliffParams = { scale: 0.47 }
cliff.position.set(0, -1.1, -8.7)
cliff.rotation.set(Math.PI, Math.PI / 2, 0)
cliff.scale.setScalar(cliffParams.scale)

// The cliff spans about 60 units as captured, so the ranges are wide; scale stays uniform.
const pane = useTweakpane('Cliff splat')
const cliffPosition = pane.addFolder({ title: 'Position' })
const cliffRotation = pane.addFolder({ title: 'Rotation' })
for (const axis of ['x', 'y', 'z'] as const) {
  cliffPosition.addBinding(cliff.position, axis, { label: axis, min: -50, max: 50, step: 0.1 })
  cliffRotation.addBinding(cliff.rotation, axis, {
    label: axis,
    min: -Math.PI,
    max: Math.PI,
    step: 0.01
  })
}
pane
  .addBinding(cliffParams, 'scale', { label: 'scale', min: 0.01, max: 3, step: 0.01 })
  .on('change', (ev) => cliff.scale.setScalar(ev.value))

// The splat carries its own baked lighting, so these only light the two models: a soft sky and
// ground fill, a warm key from above and in front, a cool rim from behind the cliff to pick the
// dragon's silhouette out of it, and a warm glow low over the hoard for the gold to catch.
const palette = {
  sky: '#b8c8e0',
  ground: '#3a2a1c',
  key: '#ffd9a0',
  rim: '#8fb4ff',
  glow: '#ffb347'
}

const fill = new HemisphereLight(palette.sky, palette.ground, 1)

const key = new DirectionalLight(palette.key, 3)
key.position.set(3, 6, 5)

const rim = new DirectionalLight(palette.rim, 2)
rim.position.set(-4, 3, -6)

const glow = new PointLight(palette.glow, 4, 8)
glow.position.set(0, -0.5, 1.5)

const lights = pane.addFolder({ title: 'Lights' })
for (const [name, light] of [
  ['key', key],
  ['rim', rim],
  ['glow', glow],
  ['fill', fill]
] as const) {
  const params = { color: `#${light.color.getHexString()}` }
  lights
    .addBinding(params, 'color', { label: `${name} colour`, view: 'color' })
    .on('change', (ev) => light.color.set(ev.value))
  lights.addBinding(light, 'intensity', { label: `${name} intensity`, min: 0, max: 20, step: 0.1 })
}

// Each model comes in at its own arbitrary scale and offset, so it is measured and fitted:
// longest side scaled to `size`, centred on the origin across the ground, and its vertical
// centre moved to `y`.
function fit(object: Object3D, size: number, y: number) {
  const bounds = new Box3().setFromObject(object)
  const scale = size / Math.max(...bounds.getSize(new Vector3()).toArray())
  const center = bounds.getCenter(new Vector3()).multiplyScalar(scale)
  object.scale.setScalar(scale)
  object.position.set(-center.x, y - center.y, -center.z)
}

// The hoard spreads out below the view's centre, and the dragon hovers over it.
fit(treasure, 6, -1.8)
fit(dragon, 3.5, 0.6)

// Clips on the dragon: atk, fall, fly, idle, pose, pose2, roar.
const mixer = new AnimationMixer(dragon)
const fly = dragonGltf.animations.find((clip) => clip.name === 'fly')
if (fly) mixer.clipAction(fly).play()

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => mixer.update(delta))

// The camera stays locked on the dragon as the fly clip carries it about. rootupper is the bone
// the whole body hangs from, so it tracks the body rather than a flapping wing or the tail. Run
// after CameraParallax (priority 0), which still steps the camera with the card's tilt; only
// its turn is replaced by this look-at.
const dragonBody = dragon.getObjectByName('rootupper_109')
const lookTarget = new Vector3()
onBeforeRender(() => {
  const activeCamera = camera.activeCamera.value
  if (!activeCamera || !dragonBody) return
  activeCamera.lookAt(dragonBody.getWorldPosition(lookTarget))
}, 1)

function disposeModel(model: Object3D) {
  model.traverse((child) => {
    if (!(child instanceof Mesh)) return
    const material = child.material as Material
    child.geometry.dispose()
    for (const value of Object.values(material)) {
      if (value instanceof Texture) value.dispose()
    }
    material.dispose()
  })
}

onUnmounted(() => {
  fill.dispose()
  key.dispose()
  rim.dispose()
  glow.dispose()
  cliff.splatGeometry.dispose()
  cliff.geometry.dispose()
  cliff.material.dispose()
  mixer.stopAllAction()
  mixer.uncacheRoot(dragon)
  disposeModel(dragon)
  disposeModel(treasure)
  draco.dispose()
  ktx2.dispose()
})
</script>

<template>
  <primitive :object="treasure" :position-y="-0.75" />
  <primitive :object="dragon" />
  <primitive :object="cliff" />
  <primitive :object="fill" />
  <primitive :object="key" />
  <primitive :object="rim" />
  <primitive :object="glow" />
</template>
