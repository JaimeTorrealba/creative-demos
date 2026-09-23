<script setup lang="ts">
import { CameraShake } from '@tresjs/cientos'
import { TresCanvas, type TresRendererSetupContext } from '@tresjs/core'
import { WebGPURenderer } from 'three/webgpu'
import { toValue } from 'vue'
import Card3D from '../components/demos/magic-card/card-3d.vue'
import CardFace, { type MagicCard } from '../components/demos/magic-card/card-face.vue'
import TheExperience from '../components/demos/wall-of-mist/index.vue'

// Same renderer as the standalone Wall of Mist view — the experience's fog
// pipeline is built from node materials and needs the WebGPU backend.
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
</script>

<template>
  <main class="stage">
    <Card3D>
      <CardFace :card="wallOfMist">
        <template #art>
          <TresCanvas clear-color="#000" :renderer="createRenderer">
            <TresPerspectiveCamera :position="[0.2, 1.7, 8.1]" :rotation-x="0.1" />
            <!-- A slow handheld drift. The shake is layered on top of the camera's
                 starting rotation, so it has to come after the camera. -->
            <CameraShake
              :max-yaw="0.03"
              :max-pitch="0.02"
              :max-roll="0.015"
              :yaw-frequency="0.4"
              :pitch-frequency="0.4"
              :roll-frequency="0.3"
            />
            <Suspense>
              <TheExperience />
            </Suspense>
          </TresCanvas>
        </template>
      </CardFace>
    </Card3D>
  </main>
</template>

<style scoped>
.stage {
  /* The one size the whole card derives from: everything inside is in cqw of this
     width, so capping it here is all the responsiveness the card needs. */
  --card-w: min(90vw, calc(90svh * 63 / 88), 480px);

  display: grid;
  place-items: center;
  min-height: 100svh;
  background: linear-gradient(white, #efefef);
}

/* The card lives inside Card3D, so it needs :deep() to be reached from here. */
.stage :deep(.card-3d) {
  width: var(--card-w);
  aspect-ratio: 63 / 88;
  /* Real cards have a 3 mm corner on a 63 mm width. */
  border-radius: calc(var(--card-w) * 0.047);
  overflow: hidden;
  box-shadow: 0 1px 5px #00000099;
}

.stage :deep(.card-3d[data-tilting]) {
  box-shadow: 0 5px 20px 5px #00000044;
}
</style>
