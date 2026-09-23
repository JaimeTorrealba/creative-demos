import { Pane, type FolderApi } from 'tweakpane'
import { onUnmounted } from 'vue'

const DEBUG_HASH = '#debug'

/**
 * One pane shared by every caller, because Tweakpane builds a fresh wrapper element per
 * `Pane` and styles them all `position: absolute; top: 8px; right: 8px` — two panes would
 * sit exactly on top of each other. Callers get a folder on the shared root instead, and
 * the root is torn down once the last one releases it.
 */
let root: Pane | null = null
let folderCount = 0

const syncVisibility = () => {
  if (root) root.hidden = window.location.hash !== DEBUG_HASH
}

const acquireRoot = () => {
  if (!root) {
    root = new Pane({ title: 'Debug' })
    syncVisibility()
    window.addEventListener('hashchange', syncVisibility)
  }

  folderCount++

  return root
}

const releaseRoot = () => {
  folderCount--

  if (folderCount > 0 || !root) return

  window.removeEventListener('hashchange', syncVisibility)
  root.dispose()
  root = null
}

/**
 * A Tweakpane folder scoped to the calling component, on a pane visible only while the URL
 * carries the `#debug` hash.
 *
 * The pane is built and then hidden rather than built on demand, so toggling the hash takes
 * effect immediately — changing a hash does not reload the page.
 */
export function useTweakpane(title: string): FolderApi {
  const folder = acquireRoot().addFolder({ title })

  onUnmounted(() => {
    folder.dispose()
    releaseRoot()
  })

  return folder
}
