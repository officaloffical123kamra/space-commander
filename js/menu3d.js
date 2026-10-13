import * as THREE from 'three';
import { IS_TOUCH } from './ui.js';

let renderer, scene, camera, planetGroup, stars, sunLight;
let running = false;
let camAngle = Math.random() * Math.PI * 2;
const CAM_RADIUS = 28;
const CAM_HEIGHT = 8;

export function initMenu3D() {
  const canvas = document.getElementById('menu-canvas');
  if (!canvas) return;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH, alpha: false });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
  renderer.setClearColor(0x000308, 1);

  scene = new THREE.Scene();

  // Камера
  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000);

  // === Звёзды ===
  const starsGeo = new THREE.BufferGeometry();
  const starsCount = 3000;
  const positions = new Float32Array(starsCount * 3);
  for (let i = 0; i < starsCount; i++) {
    const r = 200 + Math.random() * 300;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false });
  stars = new THREE.Points(starsGeo, starsMat);
  scene.add(stars);

  // === Планета ===
  planetGroup = new THREE.Group();
  scene.add(planetGroup);

  // Сама планета
  const planetGeo = new THREE.SphereGeometry(6, 48, 32);
  const planetMat = new THREE.MeshStandardMaterial({
    color: 0x2a5588,
    roughness: 0.85,
    metalness: 0.1,
    emissive: 0x0a1a33,
    emissiveIntensity: 0.4
  });
  const planet = new THREE.Mesh(planetGeo, planetMat);
  planetGroup.add(planet);

  // Атмосфера — сфера чуть больше, полупрозрачная
  const atmosphereGeo = new THREE.SphereGeometry(6.5, 48, 32);
  const atmosphereMat = new THREE.MeshBasicMaterial({
    color: 0x4488cc,
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide
  });
  const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
  planetGroup.add(atmosphere);

  // Материки — пятна неправильной формы (используем несколько кубов и сфер)
  for (let i = 0; i < 20; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 6.1;
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(0.6 + Math.random() * 1.4, 8, 8),
      new THREE.MeshStandardMaterial({
        color: Math.random() > 0.5 ? 0x336644 : 0x226633,
        roughness: 1
      })
    );
    blob.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
    blob.scale.set(1, 0.6, 1);
    planetGroup.add(blob);
  }

  // Кольцо вокруг планеты (как у Сатурна)
  const ringGeo = new THREE.RingGeometry(8.5, 11.5, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x6688cc,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2.2;
  planetGroup.add(ring);

  // Второе тонкое кольцо
  const ring2Geo = new THREE.RingGeometry(12, 12.5, 64);
  const ring2Mat = new THREE.MeshBasicMaterial({
    color: 0x88aaff,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide
  });
  const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
  ring2.rotation.x = Math.PI / 2.2;
  planetGroup.add(ring2);

  // === Освещение ===
  // Ambient (мягкий)
  scene.add(new THREE.AmbientLight(0x445577, 0.6));

  // Солнце
  sunLight = new THREE.DirectionalLight(0xffddaa, 1.5);
  sunLight.position.set(30, 20, 15);
  scene.add(sunLight);

  // Тёплое свечение сзади
  const backLight = new THREE.PointLight(0x4466aa, 2, 100);
  backLight.position.set(-20, 10, -20);
  scene.add(backLight);

  // Визуализация солнца (яркая точка)
  const sunSprite = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffddaa })
  );
  sunSprite.position.set(60, 40, 30);
  scene.add(sunSprite);

  // === Случайная начальная позиция камеры ===
  camAngle = Math.random() * Math.PI * 2;

  window.addEventListener('resize', onResize);

  running = true;
  animateMenu();
}

function onResize() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

let lastTime = performance.now();
function animateMenu() {
  if (!running) return;
  requestAnimationFrame(animateMenu);

  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  // Камера вращается по орбите
  camAngle += dt * 0.15;

  // Планета медленно крутится
  if (planetGroup) planetGroup.rotation.y += dt * 0.05;

  // Орбитальная позиция камеры
  const camX = Math.cos(camAngle) * CAM_RADIUS;
  const camZ = Math.sin(camAngle) * CAM_RADIUS;
  const camY = CAM_HEIGHT + Math.sin(camAngle * 0.7) * 2;

  camera.position.set(camX, camY, camZ);
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
}

export function stopMenu3D() {
  running = false;
  const canvas = document.getElementById('menu-canvas');
  if (canvas) canvas.classList.add('hidden');
  window.removeEventListener('resize', onResize);
  // Освобождаем WebGL-контекст меню: на телефонах их число ограничено
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer = null;
  }
}

export function showMenu3D() {
  const canvas = document.getElementById('menu-canvas');
  if (canvas) canvas.classList.remove('hidden');
  if (!renderer) { initMenu3D(); return; }
  running = true;
  lastTime = performance.now();
  animateMenu();
}