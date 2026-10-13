import * as THREE from 'three';
import { isFriendly } from './session.js';

const MAP_SIZE = 60;
const GRID = 60;
const CELL = MAP_SIZE / GRID;
const HALF = MAP_SIZE / 2;
const UPDATE_INTERVAL = 0.15;

const visible = new Uint8Array(GRID * GRID);
const explored = new Uint8Array(GRID * GRID);

let fogMesh = null;
let fogTexture = null;
let canvas = null;
let ctx = null;
let updateTimer = 0;

export function initFog(scene) {
  canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID;
  ctx = canvas.getContext('2d');

  fogTexture = new THREE.CanvasTexture(canvas);
  fogTexture.magFilter = THREE.LinearFilter;
  fogTexture.minFilter = THREE.LinearFilter;
  fogTexture.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
  const mat = new THREE.MeshBasicMaterial({
    map: fogTexture,
    transparent: true,
    depthWrite: false,
    opacity: 1.0
  });
  fogMesh = new THREE.Mesh(geo, mat);
  fogMesh.rotation.x = -Math.PI / 2;
  fogMesh.position.y = 0.15;
  fogMesh.renderOrder = 10;
  scene.add(fogMesh);

  renderFog();
}

export function updateFog(units, buildings, commandCenters) {
  for (let i = 0; i < visible.length; i++) visible[i] = 0;

  const seers = [];
  for (const u of units) {
    if (!u || !u.mesh) continue;
    if (u.inBunker) continue;
    if (!isFriendly(u)) continue;
    seers.push({ x: u.mesh.position.x, z: u.mesh.position.z, r: u.sight || 8 });
  }
  for (const b of buildings) {
    if (!b || !b.mesh) continue;
    if (!isFriendly(b)) continue;
    seers.push({ x: b.mesh.position.x, z: b.mesh.position.z, r: b.sight || 10 });
  }
  for (const cc of commandCenters) {
    if (!cc || !cc.mesh) continue;
    if (!isFriendly(cc)) continue;
    seers.push({ x: cc.mesh.position.x, z: cc.mesh.position.z, r: cc.sight || 11 });
  }

  for (const s of seers) {
    const gx = Math.floor((s.x + HALF) / CELL);
    const gz = Math.floor((s.z + HALF) / CELL);
    const gr = Math.ceil(s.r / CELL);

    for (let dx = -gr; dx <= gr; dx++) {
      for (let dz = -gr; dz <= gr; dz++) {
        if (dx*dx + dz*dz > gr*gr) continue;
        const x = gx + dx;
        const z = gz + dz;
        if (x < 0 || x >= GRID || z < 0 || z >= GRID) continue;
        visible[z * GRID + x] = 1;
        explored[z * GRID + x] = 1;
      }
    }
  }
}

export function renderFog() {
  if (!ctx) return;
  const img = ctx.createImageData(GRID, GRID);
  const data = img.data;
  for (let i = 0; i < GRID * GRID; i++) {
    let a;
    if (visible[i]) a = 0;
    else if (explored[i]) a = 140;
    else a = 235;
    data[i * 4 + 0] = 0;
    data[i * 4 + 1] = 0;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  if (fogTexture) fogTexture.needsUpdate = true;
}

export function tickFog(dt, units, buildings, commandCenters) {
  updateTimer += dt;
  if (updateTimer < UPDATE_INTERVAL) return;
  updateTimer = 0;
  updateFog(units, buildings, commandCenters);
  renderFog();
}

export function isVisible(worldX, worldZ) {
  const gx = Math.floor((worldX + HALF) / CELL);
  const gz = Math.floor((worldZ + HALF) / CELL);
  if (gx < 0 || gx >= GRID || gz < 0 || gz >= GRID) return false;
  return !!visible[gz * GRID + gx];
}
export function isExplored(worldX, worldZ) {
  const gx = Math.floor((worldX + HALF) / CELL);
  const gz = Math.floor((worldZ + HALF) / CELL);
  if (gx < 0 || gx >= GRID || gz < 0 || gz >= GRID) return false;
  return !!explored[gz * GRID + gx];
}
// Холст тумана (GRID×GRID, альфа = темнота) — миникарта рисует его одним drawImage
export function getFogCanvas() {
  return canvas;
}

export function shouldHide(worldX, worldZ) {
  return !isVisible(worldX, worldZ);
}