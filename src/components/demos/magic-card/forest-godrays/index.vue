<script setup lang="ts">
// The left magic card's art: god rays pouring through a forest. It fills the card's #art slot
// in MagicCardView, which only supplies the canvas and camera, so this component owns all the
// other scene content: models, environment, lights and effects.
import { useLoop, useTresContext } from '@tresjs/core'
import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  Texture,
  type Material
} from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { WebGPURenderer } from 'three/webgpu'
import { onUnmounted } from 'vue'
import { useTweakpane } from '../../../../composables/useTweakpane'
import GodRays from './god-rays.vue'

// The forest is Draco-compressed with KHR_texture_basisu textures; both decoders are served
// from public/ (shared with Wall of Mist) so the demo works offline.
const draco = new DRACOLoader().setDecoderPath('/draco/')
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/')

// Node materials only compile once the WebGPU backend is up, and KTX2 reads its transcode
// target off the live backend, so both wait for it. The top-level await is what makes the
// <Suspense> wrapper in the view meaningful.
const { renderer, scene } = useTresContext()
const rendererInstance = renderer.instance
if (rendererInstance instanceof WebGPURenderer) {
  // The godrays are read off the sun's shadow map, so shadows have to be on. Set here rather
  // than on the card's TresCanvas so only this card's renderer pays for them.
  rendererInstance.shadowMap.enabled = true
  await rendererInstance.init()
  ktx2.detectSupport(rendererInstance)
}

// Palette picked off the reference art's light alone: a pale yellow-green where the shafts
// are brightest, a hazy mid green for the air they cut through, near-black green in shadow.
const palette = {
  shaft: '#e3f39c',
  sun: '#d4ec84',
  haze: '#3f6419',
  skyFill: '#6f9a2e',
  groundFill: '#0b1a05'
}

// Straight ahead of the camera, past the back row of the forest and a little above its eye
// line, so the shafts fan out from the centre of the view and pour toward the viewer. The
// target stays at the origin.
const sun = new DirectionalLight(palette.sun, 3)
sun.position.set(0, 14, -95)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.bias = -0.0005
// The shadow camera is also the box the godrays march through, so it has to cover every
// occluder and the space in front of them — here the whole forest and on to the camera — but
// no more, since distance attenuation is measured against its far plane.
const shadowCamera = sun.shadow.camera
shadowCamera.left = -40
shadowCamera.right = 40
shadowCamera.top = 40
shadowCamera.bottom = -40
shadowCamera.near = 1
shadowCamera.far = 120

// The sun wanders a little around its rest position, so the shafts slide and shimmer through
// the gaps as if the canopy were moving. Two sines per axis at unrelated rates keep the path
// from visibly repeating. Kept well under a degree: every shadow in the scene moves with it.
const sunRest = sun.position.clone()
const sunDrift = { amplitude: 0.8, speed: 0.22 }

// The sun also brightens and dims on a slow sine, so the shafts swell and fade like light
// breaking through passing cloud. depth is the swing either side of base, as a fraction of it.
const sunPulse = { base: sun.intensity, depth: 0.3, speed: 0.4 }

const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }) => {
  sun.intensity = sunPulse.base * (1 + sunPulse.depth * Math.sin(elapsed * sunPulse.speed))

  const t = elapsed * sunDrift.speed
  const wanderX = (Math.sin(t) + 0.5 * Math.sin(t * 2.3 + 1.7)) / 1.5
  const wanderY = (Math.sin(t * 0.7 + 0.4) + 0.5 * Math.sin(t * 1.9 + 2.9)) / 1.5
  sun.position.set(
    sunRest.x + wanderX * sunDrift.amplitude,
    sunRest.y + wanderY * sunDrift.amplitude,
    sunRest.z
  )
})

// Soft green fill so the shadowed side reads as dim forest light rather than black.
const fill = new HemisphereLight(palette.skyFill, palette.groundFill, 1.6)

scene.value.background = new Color(palette.haze)
scene.value.fog = new Fog(palette.haze, 12, 60)

// The rays only show in the gaps between shadow casters, so the trees are what the light cuts
// through.
const { scene: forest } = await new GLTFLoader()
  .setDRACOLoader(draco)
  .setKTX2Loader(ktx2)
  .loadAsync('/magic-card/Trees_compressed.glb')
// A 7×7 grid of trees about 49 wide and 45 deep, up to 12 tall, on a rocks-and-roots floor,
// all centred near (-28, 0, -1) in its own space. Scaled up to stand well over the camera and
// slid so the grid is centred on the camera's line of sight at z = -30. After the quarter turn
// below, its front row stops about 7 short of the camera.
forest.scale.setScalar(1.5)
forest.position.set(42, 0, 1)
// The model's origin sits far off to one side of the trees, so rotating it directly would
// swing the whole grid around that point. It is offset inside a pivot placed at the grid's
// centre instead, so the pane's rotation turns the forest in place.
const forestPivot = new Group()
forestPivot.position.set(0, 0, -30)
// The trees' back faces were cut in Blender to save polygons, and the kept sides face -X in
// the model's own space. A quarter turn about the up axis (Blender's Z) swings them round to
// face the camera, so it only ever sees the full side.
forestPivot.rotation.y = Math.PI / 2
forestPivot.add(forest)
forest.traverse((child) => {
  if (!(child instanceof Mesh)) return
  child.castShadow = true
  child.receiveShadow = true
})

const params = {
  sunColor: palette.sun,
  background: palette.haze
}

const pane = useTweakpane('Lighting')
pane
  .addBinding(params, 'sunColor', { label: 'sun colour', view: 'color' })
  .on('change', (ev) => sun.color.set(ev.value))
pane.addBinding(sunPulse, 'base', { label: 'sun intensity', min: 0, max: 10, step: 0.1 })
pane.addBinding(sunPulse, 'depth', { label: 'pulse depth', min: 0, max: 1, step: 0.01 })
pane.addBinding(sunPulse, 'speed', { label: 'pulse speed', min: 0, max: 2, step: 0.01 })
pane.addBinding(fill, 'intensity', { label: 'fill intensity', min: 0, max: 3, step: 0.05 })
pane.addBinding(sunDrift, 'amplitude', { label: 'sun drift', min: 0, max: 4, step: 0.05 })
pane.addBinding(sunDrift, 'speed', { label: 'drift speed', min: 0, max: 1, step: 0.01 })

// In radians, around the grid's centre. Y turns the forest on the spot; X and Z tilt it.
const forestRotation = pane.addFolder({ title: 'Forest rotation' })
for (const axis of ['x', 'y', 'z'] as const) {
  forestRotation.addBinding(forestPivot.rotation, axis, {
    label: axis,
    min: -Math.PI,
    max: Math.PI,
    step: 0.01
  })
}
pane
  .addBinding(params, 'background', { label: 'haze', view: 'color' })
  .on('change', (ev) => {
    ;(scene.value.background as Color).set(ev.value)
    scene.value.fog?.color.set(ev.value)
  })

onUnmounted(() => {
  scene.value.background = null
  scene.value.fog = null
  sun.dispose()
  fill.dispose()
  // The floor's material carries a colour, normal and specular map, so every texture slot is
  // swept rather than naming each one.
  forest.traverse((child) => {
    if (!(child instanceof Mesh)) return
    const material = child.material as Material
    child.geometry.dispose()
    for (const value of Object.values(material)) {
      if (value instanceof Texture) value.dispose()
    }
    material.dispose()
  })
  draco.dispose()
  ktx2.dispose()
})
</script>

<template>
  <primitive :object="sun" />
  <primitive :object="fill" />

  <primitive :object="forestPivot" />



  <GodRays :light="sun" :ray-color="palette.shaft" />
</template>
