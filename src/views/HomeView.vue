<script setup lang="ts">
import { useRouter } from 'vue-router'

// Read the demos off the router rather than keeping a second list in sync by hand —
// a new demo route shows up here the moment it is registered.
const demos = useRouter()
  .getRoutes()
  .filter((route) => route.name !== 'home' && route.name !== 'not-found')
  .sort((a, b) => a.path.localeCompare(b.path))
</script>

<template>
  <main>
    <h1>in construction</h1>
    <ul>
      <li v-for="demo in demos" :key="demo.path">
        <RouterLink :to="demo.path">{{ demo.path }}</RouterLink>
      </li>
    </ul>
  </main>
</template>

<style scoped>
main {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

a {
  font-family: var(--mono);
  font-size: 0.85em;
}
</style>
