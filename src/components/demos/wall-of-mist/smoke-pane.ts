import type { FolderApi } from 'tweakpane'

export interface SmokeBank {
  label: string
  position: { x: number; y: number; z: number }
  scale: number
  opacity: number
  color: string
  speed: number
  segments: number
  depth: number
  spreadX: number
  spreadY: number
  texture: string
}

export interface SmokeShared {
  visible: boolean
  depthTest: boolean
  opacityScale: number
  speedScale: number
}

/**
 * Wires the smoke banks to a Tweakpane. Unlike the fog pane there is no `{ value }` indirection
 * — these are plain reactive props, so every binding goes straight at the bank object and Vue
 * picks the mutation up. The colour needs no adapter either: <Smoke>'s `color` prop is a
 * TresColor, which takes the hex string Tweakpane hands back as-is.
 *
 * Worth knowing while tuning: <Smoke> lays its puffs out in a `computed` over `segments`,
 * `scale`, `spreadX` and `spreadY` that calls Math.random(), so dragging any of those four
 * reshuffles the puff positions. That is the component, not a bug — it doubles as a reroll.
 */
export function addSmokeControls(pane: FolderApi, banks: SmokeBank[], shared: SmokeShared) {
  pane.addBinding(shared, 'visible', { label: 'visible' })

  // Off makes the smoke paint over everything, including the foreground figure; on lets the
  // towers occlude the banks sitting behind them.
  pane.addBinding(shared, 'depthTest', { label: 'depth test' })

  const all = pane.addFolder({ title: 'All banks' })
  all.addBinding(shared, 'opacityScale', {
    label: 'opacity scale',
    min: 0,
    max: 2,
    step: 0.05
  })
  all.addBinding(shared, 'speedScale', {
    label: 'speed scale',
    min: 0,
    max: 3,
    step: 0.05
  })

  banks.forEach((bank, index) => {
    const folder = pane.addFolder({ title: `Bank ${index} · ${bank.label}`, expanded: false })

    folder.addBinding(bank, 'position', {
      label: 'position',
      x: { min: -30, max: 30, step: 0.5 },
      y: { min: -6, max: 12, step: 0.1 },
      z: { min: -130, max: 10, step: 0.5 }
    })

    // The puff size grows with the square of this: <Smoke> applies `scale` to its root group
    // and again to every child mesh, so 4.5 spans roughly 20 units, not 4.5.
    folder.addBinding(bank, 'scale', { label: 'scale (squared)', min: 1, max: 12, step: 0.1 })

    folder.addBinding(bank, 'opacity', { label: 'opacity', min: 0, max: 1, step: 0.01 })
    folder.addBinding(bank, 'speed', { label: 'speed', min: 0, max: 1.5, step: 0.01 })
    folder.addBinding(bank, 'segments', { label: 'segments', min: 4, max: 20, step: 1 })
    folder.addBinding(bank, 'depth', { label: 'depth', min: 0.05, max: 1, step: 0.01 })

    // Both spreads are inside the scaled group, so their world reach is this times `scale`.
    folder.addBinding(bank, 'spreadX', { label: 'spread x', min: 0, max: 2, step: 0.05 })
    folder.addBinding(bank, 'spreadY', { label: 'spread y', min: 0, max: 1, step: 0.05 })

    folder.addBinding(bank, 'color', { label: 'colour', view: 'color' })
  })
}
