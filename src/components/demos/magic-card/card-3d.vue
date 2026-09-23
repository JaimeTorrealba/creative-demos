<script setup lang="ts">
import { onUnmounted, ref, useTemplateRef } from 'vue'

// A pointer-driven 3D tilt container, ported from markmiro's "3D card hover effect"
// (https://codepen.io/markmiro/pen/wbqMPa). The component is deliberately style-free:
// it owns the transform and the glare, nothing else, so whatever markup and CSS the
// consumer drops into the slot comes through untouched.

const props = withDefaults(
  defineProps<{
    perspective?: number
    scale?: number
    tilt?: number
    restDuration?: number
    activeDuration?: number
  }>(),
  {
    perspective: 1500,
    scale: 1.07,
    tilt: 2,
    restDuration: 300,
    activeDuration: 150
  }
)

// Any class/style written on <Card3D> should dress the card itself, not the
// perspective wrapper, so the fallthrough is redirected by hand below.
defineOptions({ inheritAttrs: false })

const card = useTemplateRef<HTMLElement>('card')
const glow = useTemplateRef<HTMLElement>('glow')

const isTilting = ref(false)

// Measured once when the pointer arrives rather than per move — the card is not
// going to move underneath the cursor while it is being hovered.
let bounds: DOMRect | null = null

function rotateToMouse(event: MouseEvent) {
  if (!bounds || !card.value || !glow.value) return

  // Pointer position relative to the centre of the card.
  const centerX = event.clientX - bounds.x - bounds.width / 2
  const centerY = event.clientY - bounds.y - bounds.height / 2
  const distance = Math.sqrt(centerX ** 2 + centerY ** 2)

  // The rotation axis is the pointer offset turned 90°, and the angle grows with
  // the log of the distance — that is what gives the lean its soft falloff instead
  // of a linear ramp that feels mechanical near the edges.
  card.value.style.transform = `
    scale3d(${props.scale}, ${props.scale}, ${props.scale})
    rotate3d(${centerY / 100}, ${-centerX / 100}, 0, ${Math.log(distance) * props.tilt}deg)
  `

  // Doubling the offset makes the highlight outrun the cursor, which reads as the
  // card catching a light source somewhere well behind the viewer.
  glow.value.style.backgroundImage = `
    radial-gradient(
      circle at
      ${centerX * 2 + bounds.width / 2}px
      ${centerY * 2 + bounds.height / 2}px,
      #ffffff55,
      #0000000f
    )
  `
}

function startTilting() {
  if (!card.value) return

  bounds = card.value.getBoundingClientRect()
  isTilting.value = true
  // Listening on the document, not the card, keeps the tilt tracking while the
  // pointer skims just past an edge that the transform itself is moving around.
  document.addEventListener('mousemove', rotateToMouse)
}

function stopTilting() {
  document.removeEventListener('mousemove', rotateToMouse)
  isTilting.value = false
  bounds = null

  if (card.value) card.value.style.transform = ''
  // The pen clears the card's background here, which leaves the glare frozen at
  // wherever the pointer left it; clearing the glare is what was meant.
  if (glow.value) glow.value.style.backgroundImage = ''
}

// The pen never tears down, so leaving the page mid-hover would strand the
// document listener for the rest of the session.
onUnmounted(() => document.removeEventListener('mousemove', rotateToMouse))
</script>

<template>
  <div class="card-3d-scene" :style="{ perspective: `${perspective}px` }">
    <div
      ref="card"
      class="card-3d"
      v-bind="$attrs"
      :data-tilting="isTilting ? '' : undefined"
      :style="{ transitionDuration: `${isTilting ? activeDuration : restDuration}ms` }"
      @mouseenter="startTilting"
      @mouseleave="stopTilting"
    >
      <slot />
      <div ref="glow" class="card-3d__glow" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.card-3d-scene {
  display: inline-block;
}

/* Structural only. Size, background, radius and shadow all belong to the consumer,
   which is what lets an arbitrary card design be dropped in unchanged. */
.card-3d {
  position: relative;
  transform: rotate3d(0, 0, 0, 0deg);
  transition-property: transform, box-shadow;
  transition-timing-function: ease-out;
}

.card-3d__glow {
  position: absolute;
  inset: 0;
  /* Follows whatever corner rounding the consumer set on the card. */
  border-radius: inherit;
  pointer-events: none;
  background-image: radial-gradient(circle at 50% -20%, #ffffff22, #0000000f);
}
</style>
