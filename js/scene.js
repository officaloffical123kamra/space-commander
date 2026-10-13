import * as THREE from 'three';
import { getModel, hasModel, loadAllModels } from './models.js';
import { BIOMES } from './maps.js';
import { mineralPatches, geysers } from './world.js';
import { IS_TOUCH } from './ui.js';

export { mineralPatches, geysers };

export function createScene(map = null) {
  const biome = map && map.biome ? (BIOMES[map.biome] || BIOMES.grass) : BIOMES.grass;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080d);

  // Очень яркий ambient
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));

  const dir = new THREE.DirectionalLight(0xffffff, 2.0);
  dir.position.set(10, 20, 10);
  scene.add(dir);

  const fill = new THREE.DirectionalLight(0xaaccff, 1.2);
  fill.position.set(-10, 15, -10);
  scene.add(fill);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.5);
  scene.add(hemi);

  return scene;
}

export function createGround(scene, map) {}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000);
  camera.position.set(15, 18, 15);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function createRenderer() {
  // На телефонах без сглаживания и с ограниченным pixelRatio — иначе
  // экраны с dpr 3 рендерят в 9 раз больше пикселей и игра тормозит.
  const renderer = new THREE.WebGLRenderer({
    antialias: !IS_TOUCH,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.domElement.id = 'game-canvas';
  document.body.appendChild(renderer.domElement);
  return renderer;
}

function makeBuildingHpBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 8;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(1.8, 0.2, 1);
  sprite.userData = { canvas, ctx, texture };
  return sprite;
}
function drawHpBar(b) {
  const { canvas, ctx, texture } = b.hpBar.userData;
  const ratio = Math.max(0, Math.min(1, b.hp / b.maxHp));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, 64, 8);
  ctx.fillStyle = ratio > 0.5 ? '#44dd44' : ratio > 0.25 ? '#ddaa22' : '#dd3333';
  ctx.fillRect(1, 1, 62 * ratio, 6);
  texture.needsUpdate = true;
}

function makeProgressBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 96; canvas.height = 16;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(2.6, 0.44, 1);
  sprite.userData = { canvas, ctx, texture };
  sprite.visible = false;
  return sprite;
}

export function createCommandCenter(scene, x, z, color = 0x5577aa, owner = 'player') {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = Math.PI;

  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(3, 2, 3),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.y = 1;
  hitbox.userData.isBuildingHitbox = true;
  group.add(hitbox);

  if (hasModel('cc')) {
    const model = getModel('cc', 3.5);
    group.add(model);
  } else {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2, 3),
      new THREE.MeshStandardMaterial({ color })
    );
    mesh.position.y = 1;
    group.add(mesh);
  }

  scene.add(group);

  const b = {
    mesh: group, type: 'cc', x, z, owner,
    productionQueue: [],
    minerals: null, geyser: null,
    hp: 300, maxHp: 300,
    hasReactor: false, hasTechlab: false, addonTaken: false,
    attackCooldown: 0,
    sight: 11
  };

  const hpBar = makeBuildingHpBar();
  hpBar.position.y = 2.8;
  group.add(hpBar);
  b.hpBar = hpBar;
  drawHpBar(b);

  const pBar = makeProgressBar();
  pBar.position.y = 3.2;
  group.add(pBar);
  b.progressBar = pBar;

  return b;
}

export function createMineralPatch(scene, x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x4ea6ff,
    emissive: 0x0a2a55,
    emissiveIntensity: 0.4,
    metalness: 0.2,
    roughness: 0.5,
    flatShading: true
  });

  const positions = [
    { x: 0,    z: 0,    h: 0.9,  r: 0.30 },
    { x: 0.6,  z: 0.2,  h: 0.65, r: 0.24 },
    { x: -0.5, z: 0.4,  h: 0.75, r: 0.26 },
    { x: 0.3,  z: -0.6, h: 0.55, r: 0.22 },
    { x: -0.4, z: -0.5, h: 0.70, r: 0.25 },
    { x: 0.55, z: -0.35,h: 0.50, r: 0.20 },
    { x: -0.2, z: 0.7,  h: 0.60, r: 0.22 }
  ];

  for (const p of positions) {
    const geo = new THREE.ConeGeometry(p.r, p.h, 6, 1);
    const crystal = new THREE.Mesh(geo, crystalMat);
    crystal.position.set(p.x, p.h / 2, p.z);
    crystal.rotation.y = Math.random() * Math.PI * 2;
    crystal.rotation.z = (Math.random() - 0.5) * 0.15;
    crystal.rotation.x = (Math.random() - 0.5) * 0.15;
    group.add(crystal);
  }

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.2, 0.15, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 1 })
  );
  base.position.y = 0.075;
  group.add(base);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(2.0, 0.5, 1);
  sprite.position.y = 1.3;
  group.add(sprite);

  const mp = {
    group, x, z,
    amount: 1500,
    initialAmount: 1500,
    labelCanvas: canvas,
    labelCtx: ctx,
    labelTexture: texture,
    labelSprite: sprite
  };

  drawMineralLabel(mp);

  scene.add(group);
  mineralPatches.push(mp);
  return mp;
}

export function drawMineralLabel(mp) {
  if (!mp || !mp.labelCtx) return;
  const ctx = mp.labelCtx;
  const canvas = mp.labelCanvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mp.amount <= 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff5555';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ПУСТО', 64, 16);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#4ea6ff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mp.amount + ' ◆', 64, 16);
  }

  if (mp.labelTexture) mp.labelTexture.needsUpdate = true;
}

export function createGeyser(scene, x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x2a3a2a,
    roughness: 0.9,
    flatShading: true
  });
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.2, 0.3, 8),
    baseMat
  );
  base.position.y = 0.15;
  group.add(base);

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x22aa55,
    emissive: 0x0a5522,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.7,
    roughness: 0.5
  });
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    glowMat
  );
  dome.position.y = 0.3;
  dome.scale.set(1, 0.5, 1);
  group.add(dome);

  const bubbles = [];
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0x55ee88,
    emissive: 0x22aa55,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.6,
    roughness: 0.3
  });

  for (let i = 0; i < 8; i++) {
    const size = 0.1 + Math.random() * 0.15;
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), bubbleMat.clone());
    bubble.userData = {
      baseX: (Math.random() - 0.5) * 0.6,
      baseZ: (Math.random() - 0.5) * 0.6,
      speed: 0.5 + Math.random() * 0.8,
      offset: Math.random() * 3,
      maxY: 1.5 + Math.random() * 1.5
    };
    bubble.position.set(bubble.userData.baseX, 0.3, bubble.userData.baseZ);
    bubble.visible = false;
    group.add(bubble);
    bubbles.push(bubble);
  }

  group.userData.bubbles = bubbles;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(2.0, 0.5, 1);
  sprite.position.y = 1.6;
  group.add(sprite);

  const gy = {
    group, x, z, bubbles,
    amount: 5000,
    initialAmount: 5000,
    labelCanvas: canvas,
    labelCtx: ctx,
    labelTexture: texture,
    labelSprite: sprite
  };

  drawGasLabel(gy);

  scene.add(group);
  geysers.push(gy);
  return gy;
}

export function drawGasLabel(gy) {
  if (!gy || !gy.labelCtx) return;
  const ctx = gy.labelCtx;
  const canvas = gy.labelCanvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (gy.amount <= 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff5555';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ПУСТО', 64, 16);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#22ff88';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gy.amount + ' ⬢', 64, 16);
  }
  if (gy.labelTexture) gy.labelTexture.needsUpdate = true;
}

export { loadAllModels };