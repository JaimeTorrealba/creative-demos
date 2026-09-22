import { Pane } from 'tweakpane'
import { onUnmounted } from 'vue'

const DEBUG_HASH = '#debug'

/**
 * A Tweakpane scoped to the calling component, visible only while the URL carries the
 * `#debug` hash. Tweakpane already fixes its default container to the top right above the
 * canvas, so this owns creation, visibility and teardown.
 *
 * The pane is always built and then hidden rather than built on demand, so toggling the
 * hash takes effect immediately — changing a hash does not reload the page, and bindings
 * hold references to live uniforms that are cheap to keep around.
 */
export function useTweakpane(title: string) {
  const pane = new Pane({ title })

  const syncVisibility = () => {
    pane.hidden = window.location.hash !== DEBUG_HASH
  }

  syncVisibility()
  window.addEventListener('hashchange', syncVisibility)

  onUnmounted(() => {
    window.removeEventListener('hashchange', syncVisibility)
    pane.dispose()
  })

  return pane
}
