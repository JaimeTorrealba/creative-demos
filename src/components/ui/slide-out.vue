<script setup lang="ts">
import { useTemplateRef } from 'vue'

// A floating info button that slides a panel in from the right — for a demo's description,
// credits and references. Built on a native <dialog> opened with showModal(), which brings
// Esc-to-close, a focus trap, a backdrop and top-layer stacking (above any canvas) for free.

withDefaults(
  defineProps<{
    title: string
    // Accessible name for the icon-only trigger.
    label?: string
  }>(),
  {
    label: 'About this demo'
  }
)

const dialog = useTemplateRef<HTMLDialogElement>('dialog')

const open = () => dialog.value?.showModal()
const close = () => dialog.value?.close()

// The dialog box fills the panel, so a click whose target is the dialog itself landed on
// the backdrop outside it.
const onDialogClick = (event: MouseEvent) => {
  if (event.target === dialog.value) close()
}
</script>

<template>
  <button
    type="button"
    class="slide-out-trigger"
    :aria-label="label"
    aria-haspopup="dialog"
    @click="open"
  >
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8" />
      <line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="12" cy="7.5" r="1.25" fill="currentColor" />
    </svg>
  </button>

  <dialog ref="dialog" class="slide-out" :aria-label="title" @click="onDialogClick">
    <div class="slide-out-panel">
      <header class="slide-out-header">
        <h2>{{ title }}</h2>
        <button type="button" class="slide-out-close" aria-label="Close" @click="close">×</button>
      </header>
      <div class="slide-out-body">
        <slot />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.slide-out-trigger {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 10;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--bg);
  color: var(--text-h);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.3);
  cursor: pointer;
  transition:
    transform 75 ease-out,
    color 75 ease-out;
}

.slide-out-trigger:hover {
  transform: scale(1.08);
  color: var(--accent);
}

.slide-out-trigger:focus-visible,
.slide-out-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.slide-out {
  /* Pinned to the right edge at full height, instead of the default centred box. */
  inset: 0 0 0 auto;
  width: min(420px, 100vw);
  height: 100svh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: none;
  border-left: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  box-shadow: -8px 0 32px rgb(0 0 0 / 0.35);

  /* Closed state; `display` and `overlay` transition discretely so the slide-out plays
     before the dialog leaves the top layer. */
  transform: translateX(100%);
  transition:
    transform 150ms ease-out,
    display 150ms allow-discrete,
    overlay 150ms allow-discrete;
}

.slide-out[open] {
  transform: translateX(0);
}

@starting-style {
  .slide-out[open] {
    transform: translateX(100%);
  }
}

.slide-out::backdrop {
  background: rgb(0 0 0 / 0);
  transition:
    background 300ms ease-out,
    display 300ms allow-discrete,
    overlay 300ms allow-discrete;
}

.slide-out[open]::backdrop {
  background: rgb(0 0 0 / 0.4);
}

@starting-style {
  .slide-out[open]::backdrop {
    background: rgb(0 0 0 / 0);
  }
}

.slide-out-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.slide-out-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.slide-out-header h2 {
  margin: 0;
  font-size: 1.2rem;
}

.slide-out-close {
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-h);
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
}

.slide-out-close:hover {
  background: var(--border);
}

.slide-out-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 20px 24px;
  font-size: 0.9rem;
}

/* Slotted content comes from the parent, so it needs :deep to be styled here. */
.slide-out-body :deep(h3) {
  margin: 20px 0 6px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-h);
}

.slide-out-body :deep(p) {
  margin: 0 0 10px;
}

.slide-out-body :deep(ul) {
  margin: 0 0 10px;
  padding-left: 20px;
}

/* Fade instead of slide. */
@media (prefers-reduced-motion: reduce) {
  .slide-out {
    transform: none;
    opacity: 0;
    transition:
      opacity 200ms ease-out,
      display 200ms allow-discrete,
      overlay 200ms allow-discrete;
  }

  .slide-out[open] {
    transform: none;
    opacity: 1;
  }

  @starting-style {
    .slide-out[open] {
      transform: none;
      opacity: 0;
    }
  }
}
</style>
