<script setup lang="ts">
import { computed, ref, watch } from 'vue'

// Covers the page while it loads underneath, then fades out. The page has to be rendered to
// load — scenes only start once their canvases are mounted — just not seen. The parent counts
// what has finished (a <Suspense> resolving, typically) and passes it in as `ready`.
const props = withDefaults(
  defineProps<{
    ready: number
    total: number
    title?: string
    // What is being counted, printed after "ready / total".
    unit?: string
  }>(),
  {
    title: 'Loading…',
    unit: 'scenes'
  }
)

const progress = computed(() => (props.total ? props.ready / props.total : 1))

// Fonts are checked last: the page is rendering under the screen by then, so every font it
// uses has been requested, and waiting on them keeps the text from swapping in.
const done = ref(false)
watch(
  () => props.ready >= props.total,
  async (allReady) => {
    if (!allReady) return
    await document.fonts.ready
    done.value = true
  },
  { immediate: true }
)
</script>

<template>
  <Transition name="loading">
    <div v-if="!done" class="loading" role="status" aria-live="polite">
      <p class="loading-title">{{ title }}</p>
      <div class="loading-bar">
        <div class="loading-fill" :style="{ width: `${progress * 100}%` }" />
      </div>
      <p class="loading-count">{{ ready }} / {{ total }} {{ unit }}</p>
    </div>
  </Transition>
</template>

<style scoped>
/* Above the slide-out (z-index 10), in a burnt brown with cream for the text and bar. */
.loading {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  background: radial-gradient(circle at center, #5a3a1c, #1e1208);
  color: #fffef0;
}

.loading-title {
  margin: 0;
  font-family: 'Almendra', Georgia, serif;
  font-size: clamp(1.5rem, 5vw, 2.25rem);
  text-align: center;
}

.loading-bar {
  width: min(280px, 70vw);
  height: 4px;
  border-radius: 2px;
  background: rgb(255 254 240 / 0.2);
  overflow: hidden;
}

.loading-fill {
  height: 100%;
  background: #fffef0;
  transition: width 0.4s ease;
}

.loading-count {
  margin: 0;
  font-family: 'Crimson Pro', 'Times New Roman', serif;
  font-size: 1rem;
  opacity: 0.8;
}

.loading-leave-active {
  transition: opacity 0.6s ease;
}

.loading-leave-to {
  opacity: 0;
}
</style>
