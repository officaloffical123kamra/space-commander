// js/inventory_preview.js
import * as THREE from 'three';
import { getModel, hasModel } from './models.js';
import { progress } from './progress.js';
import { SKINS } from './skins.js';

let renderer = null;
let scene = null;
let camera = null;
let currentModel = null;
let rotating = false;
let lastTime = 0;
let activeUnitId = null;
let activeCategory = 'units';

let particleSystem = null;
let particleType = null;
let particleTime = 0;

export function initPreview(canvas) {
  if (!canvas) return;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 1.2, 3.5);
  camera.lookAt(0, 0.6, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const dir = new THREE.DirectionalLight(0xffffff, 2.0);
  dir.position.set(3, 5, 4);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0x88aaff, 1.0);
  fill.position.set(-3, 2, -2);
  scene.add(fill);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.5, 0.15, 32),
    new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.6, metalness: 0.4 })
  );
  platform.position.y = -0.1;
  scene.add(platform);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.7, 48),
    new THREE.MeshBasicMaterial({ color: 0xc89848, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.02;
  scene.add(ring);

  rotating = true;
  lastTime = performance.now();
  animatePreview();
}

export function setPreviewCategory(cat) {
  activeCategory = cat;
}

export function showUnitInPreview(unitId) {
  if (!scene) return;
  activeUnitId = unitId;

  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
  }

  if (!hasModel(unitId)) {
    currentModel = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x5577aa })
    );
    currentModel.position.y = 0.4;
    scene.add(currentModel);
    applySkinToModel(unitId);
    return;
  }

  currentModel = getModel(unitId, 1.6);
  currentModel.position.y = 0.05;
  scene.add(currentModel);
  applySkinToModel(unitId);
}

export function refreshPreviewSkin(unitId) {
  if (activeUnitId !== unitId) return;
  applySkinToModel(unitId);
}

function applySkinToModel(unitId) {
  if (!currentModel) return;

  let skin;
  if (activeCategory === 'buildings') {
    const personal = progress.buildingSkins && progress.buildingSkins[unitId];
    skin = personal && SKINS[personal] ? SKINS[personal] : SKINS.default;
  } else {
    const personal = progress.unitSkins && progress.unitSkins[unitId];
    skin = personal && SKINS[personal] ? SKINS[personal] : SKINS.default;
  }

  currentModel.traverse((child) => {
    if (!child.isMesh || !child.material) return;

    if (!child.material._origColor) {
      child.material = child.material.clone();
      child.material._origColor = child.material.color
        ? child.material.color.clone()
        : new THREE.Color(0xffffff);
    }

    child.material.color.copy(child.material._origColor);

    if (skin.colors) {
      const mainColor = new THREE.Color(skin.colors.main);
      child.material.color.lerp(mainColor, 0.7);

      if (skin.colors.glow) {
        child.material.emissive = new THREE.Color(skin.colors.glow);
        child.material.emissiveIntensity = 0.6;
      } else if (child.material.emissive) {
        child.material.emissive = new THREE.Color(0, 0, 0);
        child.material.emissiveIntensity = 0;
      }
    }
  });

  setParticles(skin.particles, skin.colors);
}

function setParticles(type, colors) {
  if (particleSystem) {
    scene.remove(particleSystem);
    particleSystem.geometry.dispose();
    particleSystem.material.dispose();
    particleSystem = null;
  }
  particleType = type;
  particleTime = 0;

  if (!type || !colors) return;

  const count = 40;
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 1.6;
    positions[i * 3 + 1] = Math.random() * 1.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
    velocities.push({
      vy: 0.3 + Math.random() * 0.6,
      drift: (Math.random() - 0.5) * 0.3
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  let color = colors.glow || colors.accent || colors.main;
  let size = 0.08;
  let opacity = 0.9;

  if (type === 'stars') { color = 0xffffff; size = 0.06; }
  if (type === 'fire') { color = 0xff6622; size = 0.1; }
  if (type === 'snow') { color = 0xaaddff; size = 0.07; }
  if (type === 'rainbow') { color = 0xff88ff; size = 0.09; }
  if (type === 'glitch') { color = 0x00ffff; size = 0.07; }
  if (type === 'digital') { color = 0x00ff44; size = 0.07; }
  if (type === 'blood') { color = 0xff0022; size = 0.09; }
  if (type === 'void') { color = 0x8844ff; size = 0.09; }
  if (type === 'bubble') { color = 0x88ff00; size = 0.09; }
  if (type === 'spark') { color = colors.glow || 0xffffff; size = 0.07; }

  const mat = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particleSystem = new THREE.Points(geo, mat);
  particleSystem.userData.velocities = velocities;
  scene.add(particleSystem);
}

function updateParticles(dt) {
  if (!particleSystem) return;
  particleTime += dt;

  const positions = particleSystem.geometry.attributes.position.array;
  const velocities = particleSystem.userData.velocities;
  const count = positions.length / 3;

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 1] += velocities[i].vy * dt;
    positions[i * 3] += velocities[i].drift * dt;
    positions[i * 3 + 2] += velocities[i].drift * dt;

    if (positions[i * 3 + 1] > 2.0) {
      positions[i * 3] = (Math.random() - 0.5) * 1.6;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
    }
  }

  particleSystem.geometry.attributes.position.needsUpdate = true;

  if (particleType === 'glitch' || particleType === 'rainbow') {
    particleSystem.material.opacity = 0.6 + Math.sin(particleTime * 8) * 0.3;
  }
  if (particleType === 'fire') {
    particleSystem.material.opacity = 0.7 + Math.sin(particleTime * 5) * 0.2;
  }
}

function animatePreview() {
  if (!rotating) return;
  requestAnimationFrame(animatePreview);

  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  if (currentModel) {
    currentModel.rotation.y += dt * 0.8;
  }

  updateParticles(dt);

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

export function stopPreview() {
  rotating = false;
  if (particleSystem && scene) {
    scene.remove(particleSystem);
    particleSystem.geometry.dispose();
    particleSystem.material.dispose();
    particleSystem = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer = null;
  }
  scene = null;
  camera = null;
  currentModel = null;
}