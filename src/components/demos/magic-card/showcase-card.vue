<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, useTemplateRef } from 'vue'
import Card3D from './card-3d.vue'
import CardFace, { type MagicCard } from './card-face.vue'
import ClassicCardFace from './classic-card-face.vue'

// One interactive card on the page: the tilt, the click-to-expand over a dimmed page and
// the double-click-to-fullscreen art. What goes in the art window is the consumer's — it
// arrives through the `art` slot, which is handed the pointer offset to steer a camera by.

const props = withDefaults(defineProps<{ card: MagicCard; frame?: 'modern' | 'classic' }>(), {
  frame: 'modern'
})

const face = computed(() => (props.frame === 'classic' ? ClassicCardFace : CardFace))

defineSlots<{ art(props: { tilt: { x: number; y: number } }): unknown }>()

const root = useTemplateRef<HTMLElement>('root')

// Mutated in place rather than replaced, so a camera reading it each frame sees the new
// offset without every mousemove re-rendering the slot.
const tilt = reactive({ x: 0, y: 0 })

// Click the card to blow it up over a dimmed page; click it, the overlay or Escape to put
// it back. Only the way in animates — collapsing is instant.
const expanded = ref(false)

// Where the card sits relative to the centre of the screen, captured as it expands: the
// expanded card is pinned to the centre, and the grow animation starts from this offset
// so it flies there from its place in the row instead of jumping.
const expandFrom = reactive({ '--from-x': '0px', '--from-y': '0px' })

function expand() {
  if (root.value) {
    const bounds = root.value.getBoundingClientRect()
    expandFrom['--from-x'] = `${bounds.x + bounds.width / 2 - window.innerWidth / 2}px`
    expandFrom['--from-y'] = `${bounds.y + bounds.height / 2 - window.innerHeight / 2}px`
  }
  expanded.value = true
}

// A double click fires two clicks first; only the first may toggle, so a double click
// from rest expands the card rather than expanding and collapsing it again.
function toggleExpanded(event: MouseEvent) {
  if (event.detail > 1) return
  if (expanded.value) expanded.value = false
  else expand()
}

const collapseOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') expanded.value = false
}

// Double click the art to take just the scene fullscreen. The wrapper goes fullscreen,
// not the canvas: it is the canvas's parent that TresCanvas measures, so the renderer and
// camera aspect follow it out to the screen and back.
const artFullscreen = useTemplateRef<HTMLElement>('art-fullscreen')
const isFullscreen = ref(false)

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else artFullscreen.value?.requestFullscreen()
}

// Every card hears every fullscreenchange, so each checks whether it is the one involved.
const syncFullscreen = () => {
  const wasFullscreen = isFullscreen.value
  isFullscreen.value = !!artFullscreen.value && document.fullscreenElement === artFullscreen.value
  if (wasFullscreen !== isFullscreen.value) Object.assign(tilt, { x: 0, y: 0 })
}

// Card3D measures the pointer against the card, which is hidden behind the fullscreen
// layer — so while fullscreen, the parallax is driven off the screen instead, and the
// card's own reports are dropped.
function onCardTilt(offset: { x: number; y: number }) {
  if (!isFullscreen.value) Object.assign(tilt, offset)
}

function tiltFromScreen(event: MouseEvent) {
  if (!isFullscreen.value) return
  Object.assign(tilt, {
    x: (event.clientX / window.innerWidth) * 2 - 1,
    y: (event.clientY / window.innerHeight) * 2 - 1
  })
}

// Clicks inside the fullscreen scene would otherwise bubble up and toggle the card
// hidden beneath it.
function keepClickInFullscreen(event: MouseEvent) {
  if (isFullscreen.value) event.stopPropagation()
}

onMounted(() => {
  document.addEventListener('keydown', collapseOnEscape)
  document.addEventListener('fullscreenchange', syncFullscreen)
})
onUnmounted(() => {
  document.removeEventListener('keydown', collapseOnEscape)
  document.removeEventListener('fullscreenchange', syncFullscreen)
})
</script>

<template>
  <div ref="root" class="showcase-card" :class="{ 'is-expanded': expanded }" :style="expandFrom">
    <div v-if="expanded" class="overlay" @click="expanded = false" />

    <!-- Expanded, the card stops leaning and scaling — a full-screen card tipping toward
         you would run off the edges — but it keeps reporting the pointer, so the camera
         parallax carries on inside the art. -->
    <Card3D
      :class="{ 'is-expanded': expanded }"
      :tilt="expanded ? 0 : 2"
      :scale="expanded ? 1 : 1.07"
      @click="toggleExpanded"
      @tilt="onCardTilt"
    >
      <component :is="face" :card="card">
        <template #art>
          <div
            ref="art-fullscreen"
            class="art-fullscreen"
            @dblclick="toggleFullscreen"
            @click="keepClickInFullscreen"
            @mousemove="tiltFromScreen"
          >
            <slot name="art" :tilt="tilt" />
          </div>
        </template>
      </component>
    </Card3D>
  </div>
</template>

<style scoped>
/* Sized like the card it holds, and it keeps that size while the card is pinned to the
   centre of the screen, so the rest of the row does not close up behind it. */
.showcase-card {
  /* The resting width, captured before an expanded card overrides --card-w for itself —
     it is where the grow animation starts from. */
  --rest-w: var(--card-w);

  display: grid;
  width: var(--card-w);
  aspect-ratio: 63 / 88;
}

/* Lifted as a whole so its overlay covers the other cards on the page, not just the page. */
.showcase-card.is-expanded {
  position: relative;
  z-index: 1;
}

/* The card lives inside Card3D, so it needs :deep() to be reached from here. */
.showcase-card :deep(.card-3d) {
  width: var(--card-w);
  aspect-ratio: 63 / 88;
  /* Real cards have a 3 mm corner on a 63 mm width. */
  border-radius: calc(var(--card-w) * 0.047);
  overflow: hidden;
  box-shadow: 0 1px 5px #00000099;
  cursor: zoom-in;
}

.showcase-card :deep(.card-3d[data-tilting]) {
  box-shadow: 0 5px 20px 5px #00000044;
}

/* --- Expanded ------------------------------------------------------------- */

.overlay {
  position: fixed;
  inset: 0;
  z-index: 1;
  background: #000000c0;
  cursor: zoom-out;
  animation: overlay-in 400ms ease-out;
}

/* The perspective wrapper is its own stacking context, so it is the one lifted over the
   overlay — and the one pinned to the centre of the screen. */
.showcase-card.is-expanded :deep(.card-3d-scene) {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 2;
  translate: -50% -50%;
  animation: card-fly 500ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* Everything inside is in cqw, so the card scales with its width rather than reflowing,
   and the art canvas follows the resize. */
.showcase-card :deep(.card-3d.is-expanded) {
  --card-w: min(100vw - 32px, calc((100svh - 32px) * 63 / 88));

  cursor: zoom-out;
  box-shadow: 0 10px 60px 10px #00000088;
  /* Keyframe animations rather than transitions: Card3D drives transition-duration
     inline, and with no animation on the way back the collapse is instant. The fly and
     the grow share a duration and easing, so they land together. */
  animation: card-grow 500ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* TresCanvas only resizes once its parent's size has stopped changing for 10 ms, and
   renderer.setSize() pins the canvas to that size in inline px — so mid-grow the art sat
   at its old size. The art window's aspect never changes (it is all cqw), so stretching
   the canvas to fill it is distortion-free; it is just soft until the grow settles and
   Tres re-renders at the new resolution. !important is what outranks the inline px. */
.showcase-card :deep(.art-window canvas) {
  width: 100% !important;
  height: 100% !important;
}

/* --- Fullscreen art ------------------------------------------------------- */

.art-fullscreen {
  width: 100%;
  height: 100%;
  background: #000;
}

/* The browser already sizes a fullscreen element to the screen; this only drops the card's
   zoom cursors, which mean nothing once the card is out of sight. */
.art-fullscreen:fullscreen {
  cursor: default;
}

@keyframes card-grow {
  from {
    width: var(--rest-w);
  }
}

@keyframes card-fly {
  from {
    translate: calc(-50% + var(--from-x)) calc(-50% + var(--from-y));
  }
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
}
</style>
