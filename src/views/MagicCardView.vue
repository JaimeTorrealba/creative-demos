<script setup lang="ts">
import { TresCanvas, type TresRendererSetupContext } from '@tresjs/core'
import { WebGPURenderer } from 'three/webgpu'
import { toValue } from 'vue'
import CameraParallax from '../components/demos/magic-card/camera-parallax.vue'
import type { MagicCard } from '../components/demos/magic-card/card-face.vue'
import ShowcaseCard from '../components/demos/magic-card/showcase-card.vue'
import TheExperience from '../components/demos/magic-card/wall-of-mist/index.vue'

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

// Three copies of the same card for now; each will get its own card data and scene.
const cards = [
  { id: 'first', card: wallOfMist },
  { id: 'second', card: wallOfMist },
  { id: 'third', card: wallOfMist }
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

    <ShowcaseCard v-for="entry in cards" :key="entry.id" :card="entry.card">
      <template #art="{ tilt }">
        <TresCanvas clear-color="#000" :renderer="createRenderer">
          <TresPerspectiveCamera :position="[0.2, 1.7, 8.1]" :rotation-x="0.1" />
          <!-- Follows the card's tilt. It reads the camera's starting pose as its rest
               pose, so it has to come after the camera. -->
          <CameraParallax :tilt="tilt" />
          <Suspense>
            <TheExperience />
          </Suspense>
        </TresCanvas>
      </template>
    </ShowcaseCard>
  </main>
</template>

<style scoped>
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
