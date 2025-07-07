<script setup lang="ts">
import { ref } from 'vue'
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

const selectedGeoBackground = ref<'countries' | 'russia' | 'custom' | null>(null)

const handlePointClick = (point: any) => {
  console.log('Клик по точке:', point)
}
</script>

<template>
  <div>
    <div class="controls">
      <h3>Гео подложка</h3>
      <div class="button-group">
        <button 
          @click="selectedGeoBackground = null"
          :class="{ active: selectedGeoBackground === null }"
        >
          Без подложки
        </button>
        <button 
          @click="selectedGeoBackground = 'countries'"
          :class="{ active: selectedGeoBackground === 'countries' }"
        >
          Страны мира
        </button>
        <button 
          @click="selectedGeoBackground = 'russia'"
          :class="{ active: selectedGeoBackground === 'russia' }"
        >
          Россия
        </button>
        <button 
          @click="selectedGeoBackground = 'custom'"
          :class="{ active: selectedGeoBackground === 'custom' }"
        >
          Кастомная
        </button>
      </div>
    </div>
    
    <ThreeMap 
      :points="points" 
      :geo-background="selectedGeoBackground"
      @point-click="handlePointClick"
    />
  </div>
</template>

<style scoped>
.controls {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(255, 255, 255, 0.9);
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  min-width: 200px;
}

.controls h3 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #333;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.button-group button {
  padding: 8px 12px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.button-group button:hover {
  background: #f5f5f5;
}

.button-group button.active {
  background: #007bff;
  color: white;
  border-color: #007bff;
}
</style>
