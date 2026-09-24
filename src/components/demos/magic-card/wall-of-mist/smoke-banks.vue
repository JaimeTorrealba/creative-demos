<script setup lang="ts">
import { Smoke } from '@tresjs/cientos'
import { reactive } from 'vue'
import { useTweakpane } from '../../../../composables/useTweakpane'
import { addSmokeControls, type SmokeBank, type SmokeShared } from './smoke-pane'
import { createSmokeTextures } from './smoke-texture'

const textures = createSmokeTextures(9)

/**
 * The GLB has no ground plane — every tower's geometry stops flat at y = 0 against the EXR sky,
 * which is what makes the city read as floating. These banks lay billboarded smoke along that
 * cut line so the towers appear to rise out of mist instead.
 *
 * Each bank sits *in front of* the tower it hides rather than level with it. `depthTest` is on,
 * so a bank centred on a tower's own z has half its puffs behind the tower and only the front
 * half occluding — which is what left the cut lines showing. Size goes up and opacity broadly
 * down with distance, for aerial perspective against the pale sky.
 *
 * The cut lines being covered, from the GLB bounds: tower_19001 (x -15..-9, z -25..-18, the
 * nearest and so the only one given two banks),
 * tower_20_details001 (x 6..10, z -21..-17), tower_10001_1 (x -16..3, a long span),
 * tower_07002 (x 6..20, z -107..-90) and tower_10001 (x -16..-8, z -123..-115) all cut at
 * y = 0; tower_07002_2 is the exception, floating with its base at y = 6.5.
 */
const banks = reactive<SmokeBank[]>([
  {
    label: 'foreground drift',
    position: { x: 1, y: 0.4, z: 2 },
    scale: 3.0,
    opacity: 0.3,
    color: '#d8dee6',
    speed: 0.25,
    segments: 8,
    depth: 0.25,
    spreadX: 0.9,
    spreadY: 0.15,
    texture: textures[0]
  },
  {
    // Widened past tower_19001's full 6-unit span: the card's CameraShake drift swings the
    // left edge of the frame across it, and the narrower bank left its corners showing.
    label: 'near left',
    position: { x: -12.5, y: 0.8, z: -14 },
    scale: 6.5,
    opacity: 0.85,
    color: '#dde3ea',
    speed: 0.35,
    segments: 16,
    depth: 0.3,
    spreadX: 1.1,
    spreadY: 0.3,
    texture: textures[1]
  },
  {
    // A low, dense band pressed against tower_19001's front face, right on its y = 0 cut.
    label: 'near left low',
    position: { x: -12, y: 0.3, z: -17 },
    scale: 5.0,
    opacity: 0.8,
    color: '#dde3ea',
    speed: 0.3,
    segments: 12,
    depth: 0.25,
    spreadX: 1.0,
    spreadY: 0.2,
    texture: textures[8]
  },
  {
    label: 'near right',
    position: { x: 8, y: 1.2, z: -12 },
    scale: 5.0,
    opacity: 0.75,
    color: '#dfe4eb',
    speed: 0.3,
    segments: 12,
    depth: 0.3,
    spreadX: 0.7,
    spreadY: 0.3,
    texture: textures[2]
  },
  {
    label: 'mid span',
    position: { x: -6, y: 2.0, z: -40 },
    scale: 7.5,
    opacity: 0.7,
    color: '#e4e9ef',
    speed: 0.2,
    segments: 14,
    depth: 0.35,
    spreadX: 1.0,
    spreadY: 0.35,
    texture: textures[3]
  },
  {
    // Fills the gap between 'mid span' and 'far right', where nothing previously reached.
    label: 'mid right',
    position: { x: 5, y: 2.0, z: -55 },
    scale: 7.0,
    opacity: 0.65,
    color: '#e6ebf0',
    speed: 0.18,
    segments: 14,
    depth: 0.35,
    spreadX: 0.9,
    spreadY: 0.35,
    texture: textures[4]
  },
  {
    label: 'far right',
    position: { x: 12, y: 2.5, z: -80 },
    scale: 9.0,
    opacity: 0.7,
    color: '#e9edf2',
    speed: 0.15,
    segments: 14,
    depth: 0.4,
    spreadX: 0.8,
    spreadY: 0.35,
    texture: textures[5]
  },
  {
    label: 'far left',
    position: { x: -12, y: 3.0, z: -102 },
    scale: 9.5,
    opacity: 0.65,
    color: '#eceff4',
    speed: 0.12,
    segments: 14,
    depth: 0.4,
    spreadX: 0.6,
    spreadY: 0.35,
    texture: textures[6]
  },
  {
    // The only bank off the ground: tower_07002_2 floats, so its underside needs its own
    // band at that height rather than mist rising from y = 0.
    label: 'span underside',
    position: { x: -3, y: 6.5, z: -48 },
    scale: 8.0,
    opacity: 0.6,
    color: '#e7ecf1',
    speed: 0.16,
    segments: 12,
    depth: 0.35,
    spreadX: 1.0,
    spreadY: 0.3,
    texture: textures[7]
  }
])

const shared = reactive<SmokeShared>({
  visible: true,
  depthTest: true,
  opacityScale: 1,
  speedScale: 1
})

addSmokeControls(useTweakpane('Smoke'), banks, shared)
</script>

<template>
  <TresGroup
    v-for="bank in banks"
    :key="bank.label"
    :position="[bank.position.x, bank.position.y, bank.position.z]"
    :visible="shared.visible"
  >
    <Smoke
      :scale="bank.scale"
      :opacity="bank.opacity * shared.opacityScale"
      :color="bank.color"
      :speed="bank.speed * shared.speedScale"
      :segments="bank.segments"
      :depth="bank.depth"
      :spread-x="bank.spreadX"
      :spread-y="bank.spreadY"
      :texture="bank.texture"
      :depth-test="shared.depthTest"
    />
  </TresGroup>
</template>
