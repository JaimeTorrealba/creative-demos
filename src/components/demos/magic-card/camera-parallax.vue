<script setup lang="ts">
import { useLoop, useTresContext } from '@tresjs/core'
import type { Euler, Vector3 } from 'three'

// Makes the art read as a window into the scene rather than a picture on the card: when a
// corner of the card lifts toward the viewer, the camera steps toward that corner and looks
// across to the opposite one, the way the view through a real window shifts as you lean.
// Renderless — it only steers whatever camera is active.

const props = withDefaults(
  defineProps<{
    // Pointer offset from the card's centre, each axis in -1..1, y growing downward.
    tilt: { x: number; y: number }
    maxYaw?: number
    maxPitch?: number
    maxShift?: number
    // How quickly the camera catches up, per second. The card itself eases over ~150 ms.
    damping?: number
  }>(),
  {
    maxYaw: 0.06,
    maxPitch: 0.04,
    maxShift: 0.3,
    damping: 8
  }
)

const { camera } = useTresContext()

// Taken off the camera on the first frame rather than at setup, so it is whatever the view
// declared once the camera is actually registered, and every offset is layered on top of it.
let rest: { position: Vector3; rotation: Euler } | null = null

// Eased separately from the camera so the rest pose never drifts from accumulated lerps.
const current = { x: 0, y: 0 }

const { onBeforeRender } = useLoop()

onBeforeRender(({ delta }) => {
  const activeCamera = camera.activeCamera.value
  if (!activeCamera) return

  rest ??= { position: activeCamera.position.clone(), rotation: activeCamera.rotation.clone() }

  // Frame-rate independent exponential ease toward the pointer.
  const t = 1 - Math.exp(-props.damping * delta)
  current.x += (props.tilt.x - current.x) * t
  current.y += (props.tilt.y - current.y) * t

  // Pointer top-left (x, y = -1): turning negative about y looks right, negative about x
  // looks down — so the camera faces bottom-right while it steps up and to the left.
  activeCamera.rotation.set(
    rest.rotation.x + current.y * props.maxPitch,
    rest.rotation.y + current.x * props.maxYaw,
    rest.rotation.z
  )
  activeCamera.position.set(
    rest.position.x + current.x * props.maxShift,
    rest.position.y - current.y * props.maxShift,
    rest.position.z
  )
})
</script>

<!-- Renderless: the slot keeps this a valid template root without adding an object. -->
<template>
  <slot />
</template>
