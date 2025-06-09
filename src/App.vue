<script setup lang="ts">
import ThreeMap from './components/ThreeMap.vue'

const points = [
  { id: 1, name: 'Москва', lat: 55.7558, long: 37.6176 },
  { id: 2, name: 'Санкт-Петербург', lat: 59.9343, long: 30.3351 },
  { id: 3, name: 'Калининград', lat: 54.7104, long: 20.4522 },
  { id: 4, name: 'Владивосток', lat: 43.1155, long: 131.8855 },
  { id: 5, name: 'Сочи', lat: 43.6028, long: 39.7342 },
  { id: 6, name: 'Екатеринбург', lat: 56.8389, long: 60.6057 },
  { id: 7, name: 'Новосибирск', lat: 55.0084, long: 82.9357 },
  { id: 8, name: 'Казань', lat: 55.7963, long: 49.1088 },
  { id: 9, name: 'Нижний Новгород', lat: 56.3269, long: 44.0059 },
  { id: 10, name: 'Самара', lat: 53.1959, long: 50.1008 }
]

const outline = [
  { lat: 41, long: 19 },   // Юго-запад
  { lat: 81, long: 19 },   // Северо-запад
  { lat: 81, long: 169 },  // Северо-восток
  { lat: 41, long: 169 },  // Юго-восток
  { lat: 41, long: 19 }    // Замыкаем контур
]
</script>

<template>
  <ThreeMap :points="points" :outline="outline" :width="1000" :height="700" />
</template>

<style scoped>
</style>
