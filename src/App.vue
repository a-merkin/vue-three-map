<script setup lang="ts">
import ThreeMap from './components/ThreeMap.vue'

const points = [
  { id: 1, name: 'Point 1', lat: 0, long: 0 }
]
</script>

<template>
  <ThreeMap :points="points" />
</template>

<style scoped>
</style>
