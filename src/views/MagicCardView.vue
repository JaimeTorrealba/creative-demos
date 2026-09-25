<script setup lang="ts">
import { TresCanvas, type TresRendererSetupContext } from '@tresjs/core'
import { WebGPURenderer } from 'three/webgpu'
import { markRaw, toValue } from 'vue'
import SlideOut from '../components/ui/slide-out.vue'
import CameraParallax from '../components/demos/magic-card/camera-parallax.vue'
import type { MagicCard } from '../components/demos/magic-card/card-face.vue'
import ForestGodrays from '../components/demos/magic-card/forest-godrays/index.vue'
import ShowcaseCard from '../components/demos/magic-card/showcase-card.vue'
import WallOfMist from '../components/demos/magic-card/wall-of-mist/index.vue'

// The art's fog pipeline is built from node materials and needs the WebGPU backend.
const createRenderer = (ctx: TresRendererSetupContext) =>
  new WebGPURenderer({
    canvas: toValue(ctx.canvas),
    alpha: true,
    antialias: true
  })

const wallOfMist: MagicCard = {
  name: 'Wall of Mist',
  cost: ['1', 'u'],
  typeLine: 'Creature — Wall',
  setCode: 'grn',
  rarity: 'common',
  rules: ['Defender'],
  flavor:
    'Fog haunts the streets, rendering the familiar as otherworldly, changing neighbors into shadows, and muffling cries for help.',
  power: '0',
  toughness: '5',
  collectorNumber: '058/259',
  rarityLetter: 'C',
  setLabel: 'GRN',
  language: 'EN',
  artist: 'Tianhua X',
  copyright: '™ & © 2018 Wizards of the Coast'
}

// A basic land, so no rules text: the old frame prints its mana symbol in the text box.
const forest: MagicCard = {
  name: 'Forest',
  cost: [],
  typeLine: 'Land',
  setCode: 'inv',
  rarity: 'common',
  rules: [],
  watermark: 'g',
  collectorNumber: '347/350',
  rarityLetter: 'C',
  setLabel: 'INV',
  language: 'EN',
  artist: 'John Avon',
  copyright: '©1993–2000 Wizards of the Coast, Inc.'
}

// Each card brings its own face, scene and the camera pose that frames it. CameraParallax
// reads its rest pose off position and rotation, so the pose is written as a rotation, not
// a look-at.
interface CameraPose {
  position: [number, number, number]
  rotationX: number
  fov: number
  // Overrides for CameraParallax's swing; left out, it keeps its defaults.
  parallax?: { maxYaw?: number; maxPitch?: number; maxShift?: number }
}
// fov 50 is the PerspectiveCamera default the Wall of Mist was framed with.
const wallOfMistCamera: CameraPose = { position: [0.2, 1.7, 8.1], rotationX: 0.1, fov: 50 }
const forestCamera: CameraPose = {
  // Level with the trees, tipped up to look at (0, 5, 0), straight at the sun behind them.
  position: [0, 4, 14],
  rotationX: Math.atan2(1, 14),
  fov: 40,
  // The forest is far bigger than the Wall of Mist set, so the default swing barely moves
  // the view; this one steps and turns wide enough to slide the trunks past each other.
  parallax: { maxYaw: 0.15, maxPitch: 0.09, maxShift: 1.5 }
}
const cards = [
  {
    id: 'first',
    card: forest,
    frame: 'classic' as const,
    scene: markRaw(ForestGodrays),
    camera: forestCamera
  },
  {
    id: 'second',
    card: wallOfMist,
    frame: 'modern' as const,
    scene: markRaw(WallOfMist),
    camera: wallOfMistCamera
  },
  {
    id: 'third',
    card: wallOfMist,
    frame: 'modern' as const,
    scene: markRaw(WallOfMist),
    camera: wallOfMistCamera
  }
]
</script>

<template>
  <main class="stage">
    <!-- Parchment backdrop, after stevenmonson's pen (https://codepen.io/stevenmonson/pen/VwzpQPd):
         a flat cream sheet with a brown inset burn, pushed around by turbulence so its
         edges and burn go ragged, with a lit fibre grain laid over the top. -->
    <svg class="parchment-defs" aria-hidden="true">
      <defs>
        <filter id="parchment-wavy">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="5" seed="1" />
          <feDisplacementMap in="SourceGraphic" scale="40" />
        </filter>
        <!-- Light raked across a noise height map, so the paper fibres catch it. -->
        <filter id="parchment-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.6 0.9" numOctaves="3" seed="4" />
          <feDiffuseLighting lighting-color="#fff6e0" surfaceScale="1.6">
            <feDistantLight azimuth="45" elevation="60" />
          </feDiffuseLighting>
        </filter>
      </defs>
    </svg>
    <div class="parchment" aria-hidden="true" />
    <svg class="parchment-grain" aria-hidden="true">
      <rect width="100%" height="100%" filter="url(#parchment-grain)" />
    </svg>

    <ShowcaseCard v-for="entry in cards" :key="entry.id" :card="entry.card" :frame="entry.frame">
      <template #art="{ tilt }">
        <TresCanvas clear-color="#000" :renderer="createRenderer">
          <TresPerspectiveCamera
            :position="entry.camera.position"
            :rotation-x="entry.camera.rotationX"
            :fov="entry.camera.fov"
          />
          <!-- Follows the card's tilt. It reads the camera's starting pose as its rest
               pose, so it has to come after the camera. -->
          <CameraParallax :tilt="tilt" v-bind="entry.camera.parallax" />
          <Suspense>
            <component :is="entry.scene" />
          </Suspense>
        </TresCanvas>
      </template>
    </ShowcaseCard>

    <SlideOut title="Magic Card">
      <h3>About</h3>
      <p>
        A Magic: The Gathering card whose art is a live 3D scene, seen through the card like a
        window as it tilts toward the pointer.
      </p>
      <p>
        The printed cards below were used as references for the look and feel, not copied one
        to one: the frames and the scenes are reinterpretations of them.
      </p>

      <h3>Credits</h3>
      <ul>
        <li>Forest card art by John Avon.</li>
        <li>Wall of Mist card art by Tianhua X.</li>
        <li>Card text and frames ™ &amp; © Wizards of the Coast.</li>
        <li>
          <a href="https://skfb.ly/oOVIJ" target="_blank" rel="noopener">Tree models</a> for the
          Forest scene.
        </li>
        <li>
          Parchment backdrop after
          <a href="https://codepen.io/stevenmonson/pen/VwzpQPd" target="_blank" rel="noopener">
            stevenmonson's pen</a
          >.
        </li>
      </ul>

      <h3>References</h3>
      <div class="references">
        <figure>
          <img src="/magic-card/forest%20land.webp" alt="The printed Forest card by John Avon" />
          <figcaption>Forest</figcaption>
        </figure>
        <figure>
          <img
            src="/magic-card/Wall%20of%20mist.webp"
            alt="The printed Wall of Mist card by Tianhua X"
          />
          <figcaption>Wall of Mist</figcaption>
        </figure>
      </div>
    </SlideOut>
  </main>
</template>

<style scoped>
/* The reference cards side by side, sized to share the panel's width. */
.references {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.references figure {
  margin: 0;
}

.references img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 4.7% / 3.4%;
}

.references figcaption {
  margin-top: 4px;
  font-size: 0.8rem;
  text-align: center;
}

.stage {
  /* The one size every card derives from: everything inside is in cqw of this width, so
     capping it here is all the responsiveness the cards need. */
  --card-w: min(90vw, calc(90svh * 63 / 88), 480px);

  /* Side by side while they fit, stacked once they do not — and centred either way. */
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-content: center;
  justify-content: center;
  gap: 48px;
  min-height: 100svh;
  padding: 48px 16px;
  box-sizing: border-box;
  /* Shows through wherever the displaced parchment edge pulls in from the viewport. */
  background: #5a3a1c;
  /* Lets the parchment layers sit at z-index -1 without falling behind the page. */
  isolation: isolate;
}

.parchment-defs {
  /* Not display: none — Firefox drops filters defined inside a hidden svg. */
  position: absolute;
  width: 0;
  height: 0;
}

.parchment,
.parchment-grain {
  position: fixed;
  z-index: -1;
  pointer-events: none;
}

.parchment {
  /* Inset so the displacement tears the edge into view instead of off-screen. */
  inset: 12px;
  background: #fffef0;
  box-shadow:
    0 0 125px #8f5922 inset,
    0 0 40px #3a220d inset;
  filter: url(#parchment-wavy);
}

.parchment-grain {
  inset: 0;
  width: 100%;
  height: 100%;
  mix-blend-mode: multiply;
  opacity: 0.35;
}
</style>
