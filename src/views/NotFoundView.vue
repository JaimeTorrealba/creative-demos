<script setup lang="ts"></script>

<template>
  <main>
    <h1>404</h1>
    <p>Page not found.</p>
    <router-link to="/">Back home</router-link>
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
</style>
