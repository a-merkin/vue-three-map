<template>
  <div>
    <div class="options">
      <!-- <ButtonUI
        class="button-color" 
        type="secondary"
        @click="toggleColorMode"
      >
      {{ colorMode ? 'Отключить фон' : "Включить фон"}}
      </ButtonUI> -->
      <div class="color-option">
        <AutocompleteUI
          v-model="selectedWellLocal"
          :items="wellsVariables"
          :loading="loading"
          itemName="name"
          itemValue="name"
          return-object
          @change="handleWellChanged"
          class="autocomplete"
        >
        </AutocompleteUI>
        <div class="color-option__switches">
          <span>Фон</span>
          <SwitchUI 
            :model-value="colorMode"
            @switch="toggleColorMode" 
          />
          <RangeSlider
            class="options__slider"
            v-model="selectedChartOption"
            :options="chartsOptions"
            @selectOption="changeCircleScheme"
          ></RangeSlider>
        </div>
      </div>
    </div>
    <div ref="container" class="map-container">
      <div ref="minimap" class="minimap"></div>
      <div 
        v-if="activeTooltip" 
        class="tooltip" 
        :style="{ 
          left: tooltipPosition.x + 'px', 
          top: tooltipPosition.y + 'px' 
        }"
      >
        <span>Жидкость - Нефть - Обводненность</span>
        {{ activeTooltip }}
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import * as THREE from 'three';
import { geoMercator } from 'd3-geo';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MOUSE } from 'three';
import ApiClient from '@/services/api/client';
import { useScenariosStore } from "@/store/scenarios";
import ButtonUI from '../ButtonUI.vue';
import RangeSlider from "../RangeSlider.vue";
import SwitchUI from '@/components/SwitchUI.vue'
import AutocompleteUI from "@/components/AutocompleteUI.vue";

interface Props {
  tableData: any;
  selectedRows: [];
  selectedWell: any;
  wellsVariables: any
}


const scenarios = useScenariosStore();

const container = ref<HTMLElement | null>(null);
const minimap = ref<HTMLElement | null>(null);

const props = defineProps<Props>();
const emit = defineEmits(['changeSelectRow', 'wellUpdated']);

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let miniScene: THREE.Scene;
let miniCamera: THREE.OrthographicCamera;
let miniRenderer: THREE.WebGLRenderer;
let viewRect: THREE.Line;
let miniRootGroup: THREE.Group;
let miniViewDot: THREE.Mesh;
let animationFrameId: number;
let labels = []; // массив подписи

let contourPoints: THREE.Vector3[]

let wells;

const colorMode = ref(false); // true = цветной, false = монохромный
const selectedChartOption = ref("month");
const selectedWellLocal = ref(props.selectedWell);

const chartsOptions = [
  { id: "rate", name: "дебиты" },
  { id: "month", name: "добыча" },
  { id: "cumul", name: "нак. добыча" },
];

const activeTooltip = ref<string | null>(null);
const tooltipPosition = ref({ x: 0, y: 0 });

watch(() => props.selectedWell, (newValue) => {
  selectedWellLocal.value = newValue;
  // zoomToContour()
});

watch(() => props.tableData, async () => {
  // Добавить зачистку старых кругов
  await nextTick();
  wells = await ApiClient.scenarios.getWellsOutlinesScenariosScenarioIdCoordsWellsGet(scenarios.scenarioId);
  const circleGroup = await updateDrawCircle(wells)
  const dotGroup = await updateDrawDotAndLabel(wells)
  circleGroup.forEach(group => scene.add(group))
  dotGroup.forEach(group => scene.add(group))
})

watch(() => props.selectedRows, async () => {
  await nextTick();

  const childrens = scene.children.filter(obj => 'isWellDot' in obj.userData)

  childrens.forEach((child) => {
      scene.remove(child)
  })


  const dotGroup = await updateDrawDotAndLabel(wells)
  dotGroup.forEach(group => scene.add(group))
})

const changeCircleScheme = async () => {
  wells = await ApiClient.scenarios.getWellsOutlinesScenariosScenarioIdCoordsWellsGet(scenarios.scenarioId);
  const childrens = scene.children.filter(obj => 'isWellDot' in obj.userData || 'isCircle' in obj.userData)

  childrens.forEach((child) => {
    scene.remove(child)
  })

  const circleGroup = await updateDrawCircle(wells)
  const dotGroup = await updateDrawDotAndLabel(wells)
  circleGroup.forEach(group => scene.add(group))
  dotGroup.forEach(group => scene.add(group))
}

const handleWellChanged = (newValue) => {
  emit('wellUpdated', newValue);
}

onMounted(async () => {
  await nextTick();
  if (!container.value || !minimap.value) return;

  // Добавляем обработчики
  container.value.addEventListener('pointermove', onPointerMove);
  container.value.addEventListener('pointerout', onPointerOut);
  container.value.addEventListener('click', handleClick);

  const width = container.value.clientWidth;
  const height = container.value.clientHeight;
  // Основная сцена
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
  camera.position.set(0, 0, 400);
  camera.lookAt(0, 0, 0);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.value.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableRotate = false;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.1;
  controls.maxDistance = 2000;
  controls.zoomSpeed = 2.0;
  controls.minPolarAngle = Math.PI / 2;
  controls.maxPolarAngle = Math.PI / 2;
  controls.mouseButtons = {
    LEFT: MOUSE.PAN,
    MIDDLE: MOUSE.DOLLY,
    RIGHT: MOUSE.ROTATE
  };
  const projScale = 300;
  const projection = geoMercator().scale(projScale).translate([0, 0]);
  const projWidth = 360 * projScale;
  const projHeight = 180 * projScale;
  // Миникарта
  miniScene = new THREE.Scene();
  miniScene.background = new THREE.Color(0xf0f0f0);
  miniCamera = new THREE.OrthographicCamera(
    -projWidth / 2,
    projWidth / 2,
    projHeight / 2,
    -projHeight / 2,
    0.1,
    10
  );
  miniCamera.position.z = 5;
  miniRenderer = new THREE.WebGLRenderer({ antialias: true });
  miniRenderer.setSize(300, 180);
  minimap.value.appendChild(miniRenderer.domElement);
  miniRootGroup = new THREE.Group();
  miniRootGroup.scale.set(50, 30, 1);
  miniScene.add(miniRootGroup);
  // Прямоугольник области видимости
  const rectGeometry = new THREE.BufferGeometry();
  const rectMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
  const rectPoints = new Array(5).fill(0).map(() => new THREE.Vector3());
  rectGeometry.setFromPoints(rectPoints);
  viewRect = new THREE.Line(rectGeometry, rectMaterial);
  miniScene.add(viewRect);
  // Поинт-указатель центра обзора
  const dotGeometry = new THREE.CircleGeometry(24, 32);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
  miniViewDot = new THREE.Mesh(dotGeometry, dotMaterial);
  miniViewDot.position.set(0, 0, 0.1); // Поднимаем чуть выше плоскости
  miniRootGroup.add(miniViewDot); // Важно: добавляем в масштабируемую группу
  // Загрузка GeoJSON
  const res = await fetch(window.location.origin + '/nestroplan_beta' + '/countries.geo.json');
  // const res = await fetch('/countries.geo.json');

  const geojson = await res.json();
  geojson.features.forEach((feature: any) => {
    const name = feature.properties?.name || '';
    const type = feature.geometry.type;
    const coords = feature.geometry.coordinates;
    const polygons =
      type === 'Polygon'
        ? normalizeGeometryCoordinates([coords])
        : normalizeGeometryCoordinates(coords);
    polygons.forEach(polygon => {
      drawCountry(scene, polygon, projection, name);
      drawCountry(miniRootGroup, polygon, projection, name);
      // updateMapColors()
    });
  });

  // Отрисовка границы
  const dataOutlines = await ApiClient.scenarios.getFieldOutlinesScenariosScenarioIdOutlinesGet(scenarios.scenarioId);
  contourPoints = dataOutlines.coordinates.map(({ long, lat }: any) => {
    const [x, y] = projection([long, lat]);
    return new THREE.Vector3(x, -y, 0);
  });
  const contourGeometry = new THREE.BufferGeometry().setFromPoints(contourPoints);
  const contourMaterial = new THREE.LineBasicMaterial({ 
    color: colorMode.value ? 0xffffff : 0x000000,
    linewidth: 100
  });

  const contourMesh = new THREE.Line(contourGeometry, contourMaterial);
  contourMesh.userData.isBorder = true;
  scene.add(contourMesh);
  zoomToContour(contourPoints, false);

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);
    renderer.
    render(scene, camera);
        updateViewRect(camera, width, height);
        miniRenderer.render(miniScene, miniCamera);
  };
  animate();
});
onBeforeUnmount(() => {
  container.value.removeEventListener('pointermove', onPointerMove);
  container.value.removeEventListener('pointerout', onPointerOut);
  container.value.removeEventListener('click', handleClick);

  cancelAnimationFrame(animationFrameId);
  renderer.dispose();
  miniRenderer.dispose();
});
// === Утилиты ===
function normalizeGeometryCoordinates(coords: any[][][], offset = 0): any[][][] {
  return coords.map(polygon =>
    polygon.map(ring =>
      ring.map(([lon, lat]) => {
        let adjusted = lon + offset;
        if (adjusted < -180) adjusted += 360;
        if (adjusted > 180) adjusted -= 360;
        return [adjusted, lat];
      })
    )
  );
}
function drawCountry(target: THREE.Scene | THREE.Group, polygon: number[][], projection: any, countryName: string) {
  const shape = new THREE.Shape();
  const outer = polygon[0];
  outer.forEach(([lon, lat], i) => {
    const [x, y] = projection([lon, lat]);
    if (i === 0) shape.moveTo(x, -y);
    else shape.lineTo(x, -y);
  });
  for (let i = 1; i < polygon.length; i++) {
    const hole = new THREE.Path();
    polygon[i].forEach(([lon, lat], j) => {
      const [x, y] = projection([lon, lat]);
      if (j === 0) hole.moveTo(x, -y);
      else hole.lineTo(x, -y);
    });
    shape.holes.push(hole);
  }
  const geometry = new THREE.ShapeGeometry(shape);
  const isRussia = countryName === 'Russia';
  // colorMode.value
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: colorMode.value ? isRussia ? 0x00b051 : 0xd7e1e5 : 0xffffff,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, fillMaterial);
  mesh.userData = {
    isCountry: true,
    isRussia: isRussia,
    originalColor:  colorMode.value ? isRussia ? 0x00b051 : 0xd7e1e5 : 0xffffff
  }
  target.add(mesh);
  const borderMaterial = new THREE.LineBasicMaterial({ color: colorMode.value ? 0xffffff : 0x000000 });
  drawLineFromRing(target, polygon[0], projection, borderMaterial);
  for (let i = 1; i < polygon.length; i++) {
    drawLineFromRing(target, polygon[i], projection, borderMaterial);
  }
}
function drawLineFromRing(target: THREE.Scene | THREE.Group, ring: number[][], projection: any, material: THREE.Material) {
  const points = ring.map(([lon, lat]) => {
    const [x, y] = projection([lon, lat]);
    return new THREE.Vector3(x, -y, 0);
  });
  points.push(points[0].clone());
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, material);

  line.userData = {
    isBorder: true,
    originalColor: material.color.clone()
  }

  target.add(line);
}
function updateViewRect(cam: THREE.PerspectiveCamera, width: number, height: number) {
  const distance = cam.position.z;
  const fovRad = THREE.MathUtils.degToRad(cam.fov);
  const viewHeight = 2 * Math.tan(fovRad / 2) * distance;
  const viewWidth = viewHeight * cam.aspect;
  const centerX = cam.position.x;
  const centerY = cam.position.y;
  const left = centerX - viewWidth / 2;
  const right = centerX + viewWidth / 2;
  const top = centerY + viewHeight / 2;
  const bottom = centerY - viewHeight / 2;
  const scaleFactor = 1 / miniRootGroup.scale.x;
  const points = [
    new THREE.Vector3(left * scaleFactor, bottom * scaleFactor, 0),
    new THREE.Vector3(left * scaleFactor, top * scaleFactor, 0),
    new THREE.Vector3(right * scaleFactor, top * scaleFactor, 0),
    new THREE.Vector3(right * scaleFactor, bottom * scaleFactor, 0),
    new THREE.Vector3(left * scaleFactor, bottom * scaleFactor, 0)
  ];
  (viewRect.geometry as THREE.BufferGeometry).setFromPoints(points);
  // Обновление позиции поинта
  const centerOnMiniMapX = cam.position.x;
  const centerOnMiniMapY = cam.position.y;
  miniViewDot.position.set(centerOnMiniMapX, centerOnMiniMapY, 0.1); // в пределах группы
}
// Приближение к месту
function zoomToContour(points: THREE.Vector3[], refresh: boolean) {
  const box = new THREE.Box3().setFromPoints(points);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y);
  const distance = refresh ? camera.position.z : maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const fromPos = camera.position.clone();
  const toPos = new THREE.Vector3(center.x, center.y, distance);
  const fromTarget = controls.target.clone();
  const toTarget = center.clone();
  let t = 0;
  const duration = 1.0; // seconds
  const startTime = performance.now();
  function animateZoom(now: number) {
    t = Math.min((now - startTime) / (duration * 1000), 1);
camera.position.lerpVectors(fromPos, toPos, t);
    controls.target.lerpVectors(fromTarget, toTarget, t);
    controls.update();
    if (t < 1) requestAnimationFrame(animateZoom);
  }
  requestAnimationFrame(animateZoom);
}

function zoomToDefaultPosition() {
  zoomToContour(contourPoints, false)
}

// Лейбл для точек
function createTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const fontSize = 24;
  canvas.width = 256;
  canvas.height = 64;
  canvas.fillStyle = 'rgba(0,0,0,0)';
  context.font = `${fontSize}px Arial`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.0625, 0.015625, 0);
  return sprite;
}

async function updateDrawCircle(wellsData: any) {
  const projScale = 300;
  const projection = geoMercator().scale(projScale).translate([0, 0]);
  const WellDotMaterial = new THREE.MeshBasicMaterial({ color: 0xe8771f });
  const WellDotGeometry = new THREE.SphereGeometry(0.002, 16, 16);
  const mainGroups = []
  wellsData.forEach(well => {
    const [x, y] = projection([well.long, well.lat]);
    const group = new THREE.Group()
    group.userData = {
      isCircle: true
    } 

    const findWell = props.tableData.find(el => el.well_id.value === well.well_id)
    const variables = {
      rate: {
        liq: findWell?.liq_prod_rate_tn.value,
        oil: findWell?.oil_prod_rate_tn.value,
        scale: 0.00008
      },
      month: {
        liq: findWell?.liq_prod_month_tn.value,
        oil: findWell?.oil_prod_month_tn.value,
        scale: 0.000004
      },
      cumul: {
        liq: findWell?.liq_prod_cumul_tn.value,
        oil: findWell?.oil_prod_cumul_tn.value,
        scale: 0.00000002
      }
    }
    const radius = variables[selectedChartOption.value].scale *  ( variables[selectedChartOption.value].liq || 0 )
    const segments = 64

    const dot = new THREE.Mesh(WellDotGeometry, WellDotMaterial);

    // вся окр
    const backgroundCircle = new THREE.Mesh(
      new THREE.CircleGeometry(radius, segments),
      new THREE.MeshBasicMaterial({ 
        color: '#FF8333',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
      })
    )
    let percentage = 0
    
    if(findWell) {
      percentage = variables[selectedChartOption.value].oil / variables[selectedChartOption.value].liq
    }

    if(isNaN(percentage)) percentage = 0

    // кусок
    const sector = new THREE.Mesh(
      new THREE.RingGeometry(0, radius, segments, 1,  Math.PI / 2 , - Math.PI * 2 * percentage),
      new THREE.MeshBasicMaterial({ 
        color: '#C4CCF2',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
      })
    )

    group.position.set(x, -y, 0.01)

    group.add(dot);
    group.add(backgroundCircle)
    group.add(sector)
    mainGroups.push(group)
  })

  return mainGroups
}

async function updateDrawDotAndLabel(wellsData: any) {
  const projScale = 300;
  const projection = geoMercator().scale(projScale).translate([0, 0]);
  const mainGroups = []

  console.log(wellsData)
  console.log(props.tableData)

  wellsData.forEach((well) => {
    const [x, y] = projection([well.long, well.lat]);
    const findObjectWell = props.tableData?.find((el) => el.well_id.value === well.well_id)
    if(!findObjectWell) {
      return
    }
    const isSelected = props.selectedRows?.includes(findObjectWell?.id)
    const group = new THREE.Group()
    group.userData = {
      isWellDot: true,
      well: findObjectWell
    }

    const WellDotMaterial = new THREE.MeshBasicMaterial({ color: 0xe8771f });
    const WellDotGeometry = new THREE.SphereGeometry(isSelected ? 0.01 : 0.002, 16, 16);

    const dot = new THREE.Mesh(WellDotGeometry, WellDotMaterial);
    const label = createTextSprite(well.well_name);
    label.scale.set(
      isSelected ? 0.1: 0.0625,
      isSelected ? 0.025 : 0.015625
    )

    group.position.set(x, -y, 0.01)

    label.position.set(0, isSelected ? 0.02 : 0.01, 0.01);

    group.add(dot);
    group.add(label)

    mainGroups.push(group)

    if(isSelected) {
      console.log(camera)
      zoomToContour([new THREE.Vector3(x, -y, 0)], true)
    }
  })

  return mainGroups
}

function toggleColorMode() {
  colorMode.value = !colorMode.value;
  updateMapColors();
}

function updateMapColors() {
  scene.traverse((obj) => {
    // Обновляем материалы стран
    if (obj instanceof THREE.Mesh && obj.userData.isCountry) {
      if (colorMode.value) {
        // Возвращаем оригинальные цвета
        if (obj.userData.isRussia) {
          obj.material.color.set(0x00b051); // Зеленый для России
        } else {
          obj.material.color.set(0xd7e1e5); // Светло-серый для других стран
        }
      } else {
        // Белый цвет для всех стран
        obj.material.color.set(0xffffff);
      }
    }
    // Обновляем границы (делаем черными)
    if (obj instanceof THREE.Line && obj.userData.isBorder) {
      obj.material.color.set(colorMode.value ? 0xffffff : 0x000000);
    }
  });
}

// При наведении на точку
const onPointerMove = (event: PointerEvent) => {
  if (!container.value || !scene || !camera) return;

  // Получаем координаты мыши относительно canvas Three.js
  const rect = container.value.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  // Проверяем пересечение луча с объектами
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  // Ищем только точки скважин (у них есть userData.isWellDot)
  const intersects = raycaster.intersectObjects(
    scene.children.filter(obj => obj.userData.isWellDot), 
    true
  );
  if (intersects.length > 0) {
    const data = intersects[0].object.parent; // Группа, содержащая точку и лейбл
    const wellName = data.userData.well

    const variables = {
      rate: {
        liq: wellName?.liq_prod_rate_tn.value,
        oil: wellName?.oil_prod_rate_tn.value,
      },
      month: {
        liq: wellName?.liq_prod_month_tn.value,
        oil: wellName?.oil_prod_month_tn.value,
      },
      cumul: {
        liq: wellName?.liq_prod_cumul_tn.value,
        oil: wellName?.oil_prod_cumul_tn.value,
      }
    }

    if(selectedChartOption.value === 'month' || selectedChartOption.value === 'cumul') {
      activeTooltip.value = `${(variables[selectedChartOption.value].liq * 0.001).toFixed(2)} - ${(variables[selectedChartOption.value].oil * 0.001).toFixed(2)} - ${((1 - variables[selectedChartOption.value].oil/variables[selectedChartOption.value].liq)*100 || 0).toFixed(2)}%`;
    } else {
      activeTooltip.value = `${variables[selectedChartOption.value].liq.toFixed(2)} - ${variables[selectedChartOption.value].oil.toFixed(2)} - ${((1 - variables[selectedChartOption.value].oil/variables[selectedChartOption.value].liq)*100 || 0).toFixed(2)}%`;
    }
    
    // Обновляем позицию и текст тултипа
    tooltipPosition.value = { 
      x: event.clientX - rect.left, 
      y: event.clientY - rect.top 
    };
  } else {
    activeTooltip.value = null; // Скрываем, если нет пересечений
  }
};
// При уходе курсора с canvas
const onPointerOut = () => {
  activeTooltip.value = null;
};

const handleClick = (event: MouseEvent) => {
  if (!container.value || !scene || !camera) return;
  // Получаем координаты клика
  const rect = container.value.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  // Проверяем пересечение
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  // Ищем только точки скважин
  const intersects = raycaster.intersectObjects(
    scene.children.filter(obj => obj.userData.isWellDot), 
    true
  );
  if (intersects.length > 0) {
    const wellGroup = intersects[0].object.parent;
    emit('wellUpdated', { id: wellGroup.userData.well.well_id.value, name:  wellGroup.userData.well.well_name.value  });
  }
};


defineExpose({
  zoomToDefaultPosition
})

</script>
<style lang="scss" scoped>
.map-container {
  width: 100%;
  height: 860px;
  overflow: hidden;
  position: relative;
  background: #fff;
}
.minimap {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 300px;
  height: 180px;
  border: 1px solid #ccc;
  background: white;
  z-index: 10;
}

.options {
  display: flex;
  align-items: center;
  margin-bottom: 30px;
  gap: 40px;

  &__slider {
    width: 400px;
  }
}

.tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 100;
  font-size: 14px;
  //max-width: 200px;
  transform: translate(-50%, -100%); // Чтобы появился над точкой
  display: flex;
  flex-direction: column;
}

.color-option {
  display: flex;
  justify-content: space-between;
  width: 100%;

  &__switches {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  &__switches span {
    
  }
}

.autocomplete {
  width: 10%;
}
</style>