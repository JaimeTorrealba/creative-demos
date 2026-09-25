import type { FolderApi } from 'tweakpane'
import type { GodraysPipeline } from './godrays-pipeline'

/**
 * Wires the godrays to a Tweakpane. The node's own uniforms bind straight to their
 * `{ value }`; the blur toggle swaps the pipeline's output node, and the ray colour's uniform
 * holds a `Color` rather than the hex string Tweakpane hands back.
 */
export function addGodraysControls(pane: FolderApi, pipeline: GodraysPipeline) {
  const { godrays, uniforms } = pipeline

  const params = {
    blur: true,
    rayColor: `#${uniforms.rayColor.value.getHexString()}`
  }

  pane
    .addBinding(params, 'rayColor', { label: 'ray colour', view: 'color' })
    .on('change', (ev) => uniforms.rayColor.value.set(ev.value))

  pane.addBinding(godrays.raymarchSteps, 'value', {
    label: 'raymarch steps',
    min: 24,
    max: 120,
    step: 1
  })
  pane.addBinding(godrays.density, 'value', { label: 'density', min: 0, max: 5, step: 0.05 })
  pane.addBinding(godrays.maxDensity, 'value', {
    label: 'max density',
    min: 0,
    max: 1,
    step: 0.01
  })
  pane.addBinding(godrays.distanceAttenuation, 'value', {
    label: 'distance attenuation',
    min: 0,
    max: 5,
    step: 0.05
  })

  const blend = pane.addFolder({ title: 'Blend' })
  blend
    .addBinding(params, 'blur', { label: 'bilateral blur' })
    .on('change', (ev) => pipeline.setBlur(ev.value))
  blend.addBinding(uniforms.edgeRadius, 'value', {
    label: 'edge radius',
    min: 0,
    max: 5,
    step: 1
  })
  blend.addBinding(uniforms.edgeStrength, 'value', {
    label: 'edge strength',
    min: 0,
    max: 5,
    step: 0.1
  })
}
