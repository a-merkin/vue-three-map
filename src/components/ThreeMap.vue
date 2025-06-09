<template>
  <div>
    <div ref="container" class="map-container">
      <div ref="minimap" class="minimap"></div>
      <div
        v-if="activeTooltip"
        class="tooltip"
        :style="{ left: tooltipPosition.x + 'px', top: tooltipPosition.y + 'px' }"
      >
        {{ activeTooltip }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import * as THREE from 'three';
import { geoMercator } from 'd3-geo';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MOUSE } from 'three';

interface MapPoint {
  id: string | number;
  name: string;
  lat: number;
  long: number;
  [key: string]: any;
}

interface OutlinePoint {
  lat: number;
  long: number;
}

interface Props {
  points: MapPoint[];
  selected?: (string | number)[];
  outline?: OutlinePoint[];
  tooltipFormatter?: (p: MapPoint) => string;
  width?: number;
  height?: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'point-click', p: MapPoint): void;
}>();

const container = ref<HTMLElement | null>(null);
const minimap = ref<HTMLElement | null>(null);

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

let contourPoints: THREE.Vector3[] = [];

const activeTooltip = ref<string | null>(null);
const tooltipPosition = ref({ x: 0, y: 0 });

watch(() => props.points, () => {
  nextTick().then(drawPoints);
});

watch(() => props.selected, () => {
  nextTick().then(drawPoints);
});

watch(() => props.outline, () => {
  nextTick().then(drawOutline);
});

onMounted(async () => {
  await nextTick();
  if (!container.value || !minimap.value) return;
  const width = props.width || 800;
  const height = props.height || 600;
  container.value.style.width = width + 'px';
  container.value.style.height = height + 'px';

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
  const projWidth = 360 * projScale;
  const projHeight = 180 * projScale;
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

  const rectGeometry = new THREE.BufferGeometry();
  const rectMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
  const rectPoints = new Array(5).fill(0).map(() => new THREE.Vector3());
  rectGeometry.setFromPoints(rectPoints);
  viewRect = new THREE.Line(rectGeometry, rectMaterial);
  miniScene.add(viewRect);
  const dotGeometry = new THREE.CircleGeometry(24, 32);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
  miniViewDot = new THREE.Mesh(dotGeometry, dotMaterial);
  miniViewDot.position.set(0, 0, 0.1);
  miniRootGroup.add(miniViewDot);

  drawOutline();
  drawPoints();

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
    updateViewRect(camera);
    miniRenderer.render(miniScene, miniCamera);
  };
  animate();

  container.value.addEventListener('pointermove', onPointerMove);
  container.value.addEventListener('pointerout', onPointerOut);
  container.value.addEventListener('click', handleClick);
});

onBeforeUnmount(() => {
  if (container.value) {
    container.value.removeEventListener('pointermove', onPointerMove);
    container.value.removeEventListener('pointerout', onPointerOut);
    container.value.removeEventListener('click', handleClick);
  }
  cancelAnimationFrame(animationFrameId);
  renderer.dispose();
  miniRenderer.dispose();
});

function drawOutline() {
  if (!scene) return;
  const projScale = 300;
  const projection = geoMercator().scale(projScale).translate([0, 0]);
  const existing = scene.children.filter(o => o.userData.isOutline);
  existing.forEach(o => scene.remove(o));
  contourPoints = [];
  if (props.outline) {
    contourPoints = props.outline.map(({ long, lat }) => {
      const [x, y] = projection([long, lat]) as [number, number];
      return new THREE.Vector3(x, -y, 0);
    });
    const contourGeometry = new THREE.BufferGeometry().setFromPoints(contourPoints);
    const contourMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const contourMesh = new THREE.Line(contourGeometry, contourMaterial);
    contourMesh.userData.isOutline = true;
    scene.add(contourMesh);
    zoomToContour(contourPoints, false);
  }
}

function drawPoints() {
  if (!scene) return;
  const existing = scene.children.filter(o => o.userData.isPointGroup);
  existing.forEach(o => scene.remove(o));
  const projScale = 300;
  const projection = geoMercator().scale(projScale).translate([0, 0]);

  props.points?.forEach(p => {
    const [x, y] = projection([p.long, p.lat]) as [number, number];
    const group = new THREE.Group();
    group.userData = { isPointGroup: true, point: p };
    const selected = props.selected?.includes(p.id);
    const geometry = new THREE.SphereGeometry(selected ? 0.01 : 0.002, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xe8771f });
    const dot = new THREE.Mesh(geometry, material);

    const label = createTextSprite(p.name);
    label.scale.set(selected ? 0.1 : 0.0625, selected ? 0.025 : 0.015625, 0);

    group.position.set(x, -y, 0.01);
    label.position.set(0, selected ? 0.02 : 0.01, 0.01);

    group.add(dot);
    group.add(label);
    scene.add(group);
  });
}

function updateViewRect(cam: THREE.PerspectiveCamera) {
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
  const centerOnMiniMapX = cam.position.x;
  const centerOnMiniMapY = cam.position.y;
  miniViewDot.position.set(centerOnMiniMapX, centerOnMiniMapY, 0.1);
}

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
  const duration = 1.0;
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

function createTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const fontSize = 24;
  canvas.width = 256;
  canvas.height = 64;
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

const onPointerMove = (event: PointerEvent) => {
  if (!container.value || !scene || !camera) return;
  const rect = container.value.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children.filter(obj => obj.userData.isPointGroup), true);
  if (intersects.length > 0) {
    const pointGroup = intersects[0].object.parent as THREE.Object3D & { userData: { point: MapPoint } };
    const point = pointGroup.userData.point;
    activeTooltip.value = props.tooltipFormatter ? props.tooltipFormatter(point) : point.name;
    tooltipPosition.value = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  } else {
    activeTooltip.value = null;
  }
};

const onPointerOut = () => {
  activeTooltip.value = null;
};

const handleClick = (event: MouseEvent) => {
  if (!container.value || !scene || !camera) return;
  const rect = container.value.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children.filter(obj => obj.userData.isPointGroup), true);
  if (intersects.length > 0) {
    const pointGroup = intersects[0].object.parent as THREE.Object3D & { userData: { point: MapPoint } };
    const point = pointGroup.userData.point;
    emit('point-click', point);
  }
};

defineExpose({
  zoomToDefaultPosition() {
    if (contourPoints.length) {
      zoomToContour(contourPoints, false);
    }
  }
});
</script>

<style scoped lang="scss">
.map-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
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
.tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 100;
  font-size: 14px;
  transform: translate(-50%, -100%);
  display: flex;
  flex-direction: column;
}
</style>
