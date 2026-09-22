import type { Pane } from 'tweakpane'
import type { FogDenoiser, FogPipeline } from './fog-pipeline'

/**
 * Wires the fog uniforms to a Tweakpane. A TSL `uniform()` is already a `{ value }` object,
 * so most controls bind straight to it with no adapter; the exceptions are the denoiser
 * mode, the resolution scale (which also has to resize the low-res buffer) and the colour,
 * whose uniform holds a `Color` rather than the hex string Tweakpane hands back.
 */
export function addFogControls(pane: Pane, fog: FogPipeline) {
  const { uniforms } = fog

  const params = {
    mode: 'jbu' as FogDenoiser,
    resolutionScale: uniforms.resolutionScale.value,
    fogColor: '#ffffff'
  }

  // Declared here so it keeps its place at the top of the pane; its handler needs the
  // denoiser folder below, so it is attached once that exists.
  const mode = pane.addBinding(params, 'mode', {
    label: 'denoiser',
    options: { JBU: 'jbu', 'Gaussian Blur': 'gaussian', Disabled: 'raw' }
  })

  pane
    .addBinding(params, 'resolutionScale', {
      label: 'resolution scale',
      min: 0.25,
      max: 0.75,
      step: 0.05
    })
    .on('change', (ev) => fog.setResolutionScale(ev.value))

  pane.addBinding(uniforms.steps, 'value', { label: 'steps', min: 4, max: 48, step: 1 })

  const denoiser = pane.addFolder({ title: 'Denoiser' })
  const spatialSigma = denoiser.addBinding(uniforms.spatialSigma, 'value', {
    label: 'spatial sigma',
    min: 0.5,
    max: 3,
    step: 0.1
  })
  const depthSensitivity = denoiser.addBinding(uniforms.depthSensitivity, 'value', {
    label: 'depth sensitivity',
    min: 1,
    max: 100,
    step: 1
  })
  const blurRadius = denoiser.addBinding(uniforms.blurRadius, 'value', {
    label: 'gaussian blur',
    min: 0,
    max: 1,
    step: 0.01
  })

  const updateDenoiserControls = (value: FogDenoiser) => {
    spatialSigma.hidden = value !== 'jbu'
    depthSensitivity.hidden = value !== 'jbu'
    blurRadius.hidden = value !== 'gaussian'
  }

  mode.on('change', (ev) => {
    fog.setDenoiser(ev.value)
    updateDenoiserControls(ev.value)
  })

  updateDenoiserControls(params.mode)

  const cloud = pane.addFolder({ title: 'Cloud' })
  cloud.addBinding(uniforms.cloudThreshold, 'value', {
    label: 'cloud threshold',
    min: 0,
    max: 0.8,
    step: 0.02
  })
  cloud.addBinding(uniforms.cloudScale, 'value', {
    label: 'cloud scale',
    min: 0.001,
    max: 0.15,
    step: 0.001
  })
  cloud.addBinding(uniforms.cloudSpeed, 'value', {
    label: 'cloud speed',
    min: 0,
    max: 0.2,
    step: 0.005
  })
  cloud.addBinding(uniforms.fogDensity, 'value', {
    label: 'fog density',
    min: 0,
    max: 3,
    step: 0.05
  })
  cloud.addBinding(uniforms.heightFalloff, 'value', {
    label: 'height falloff',
    min: 0.2,
    max: 4,
    step: 0.1
  })
  // Ranges widened from the example's to match this scene, which is ~120 units deep.
  cloud.addBinding(uniforms.fogHeight, 'value', {
    label: 'fog height',
    min: 0.2,
    max: 30,
    step: 0.1
  })
  cloud.addBinding(uniforms.groundLevel, 'value', {
    label: 'ground level',
    min: -10,
    max: 10,
    step: 0.1
  })
  cloud.addBinding(uniforms.maxRayDist, 'value', {
    label: 'max ray dist',
    min: 10,
    max: 200,
    step: 1
  })
  cloud
    .addBinding(params, 'fogColor', { label: 'fog colour', view: 'color' })
    .on('change', (ev) => uniforms.fogColor.value.set(ev.value))

  // Defaulted past the scene so the EXR sky stays visible; pull `near` in to fog the horizon.
  const rangeFog = pane.addFolder({ title: 'Range fog', expanded: false })
  rangeFog.addBinding(uniforms.rangeFogNear, 'value', {
    label: 'range fog near',
    min: 0,
    max: 600,
    step: 1
  })
  rangeFog.addBinding(uniforms.rangeFogFar, 'value', {
    label: 'range fog far',
    min: 5,
    max: 800,
    step: 1
  })
}
