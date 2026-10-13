import * as THREE from 'three';
import { BIOMES } from './maps.js';

const MAP_SIZE = 60;
const SEGMENTS = 60;
const HALF = MAP_SIZE / 2;

let heights = null;
let mesh = null;

export function getHeight(x, z) {
  if (!heights) return 0;
  const fx = (x + HALF) / MAP_SIZE * SEGMENTS;
  const fz = (z + HALF) / MAP_SIZE * SEGMENTS;
  const i0 = Math.floor(fx), j0 = Math.floor(fz);
  const i1 = Math.min(i0 + 1, SEGMENTS), j1 = Math.min(j0 + 1, SEGMENTS);
  if (i0 < 0 || i0 > SEGMENTS || j0 < 0 || j0 > SEGMENTS) return 0;

  const tx = fx - i0, tz = fz - j0;
  const h00 = heights[i0]?.[j0] ?? 0;
  const h10 = heights[i1]?.[j0] ?? 0;
  const h01 = heights[i0]?.[j1] ?? 0;
  const h11 = heights[i1]?.[j1] ?? 0;
  const a = h00 * (1 - tx) + h10 * tx;
  const b = h01 * (1 - tx) + h11 * tx;
  return a * (1 - tz) + b * tz;
}

export function isInChasm(x, z) { return false; }

export function isInsideMap(x, z, margin = 1.5) {
  const lim = HALF - margin;
  return x > -lim && x < lim && z > -lim && z < lim;
}

export function clampToMap(x, z, margin = 1.5) {
  const lim = HALF - margin;
  return {
    x: Math.max(-lim, Math.min(lim, x)),
    z: Math.max(-lim, Math.min(lim, z))
  };
}

function generateHeights(peaks) {
  heights = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    heights[i] = [];
    for (let j = 0; j <= SEGMENTS; j++) {
      heights[i][j] = 0;
    }
  }
}

function makeGroundTexture(biome) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const base = new THREE.Color(biome.ground);
  ctx.fillStyle = '#' + base.getHexString();
  ctx.fillRect(0, 0, size, size);

  const dark = new THREE.Color(biome.low);
  const light = new THREE.Color(biome.high);

  for (let i = 0; i < 800; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 20;
    const c = Math.random() > 0.5 ? light : dark;
    ctx.globalAlpha = 0.08 + Math.random() * 0.15;
    ctx.fillStyle = '#' + c.getHexString();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.globalAlpha = 0.05 + Math.random() * 0.1;
    const c = Math.random() > 0.5 ? dark : light;
    ctx.fillStyle = '#' + c.getHexString();
    ctx.fillRect(x, y, 1, 1);
  }

  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.anisotropy = 4;
  return tex;
}

function makeStars(scene) {
  const geo = new THREE.BufferGeometry();
  const count = 2500;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 250 + Math.random() * 400;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const t = Math.random();
    let cr, cg, cb;
    if (t < 0.7) { cr = 1.0; cg = 1.0; cb = 1.0; }
    else if (t < 0.9) { cr = 0.7; cg = 0.8; cb = 1.0; }
    else { cr = 1.0; cg = 0.9; cb = 0.7; }
    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 1.5,
    sizeAttenuation: false,
    vertexColors: true
  });
  const stars = new THREE.Points(geo, mat);
  scene.add(stars);
}

export function createTerrain(scene, map) {
  generateHeights();

  const biome = BIOMES[map.biome] || BIOMES.grass;

  makeStars(scene);

  const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);

  const texture = makeGroundTexture(biome);

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1.0,
    metalness: 0.0
  });

  mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  const EDGE_COLOR = biome.chasm || 0x2a3a20;
  const blockH = 6;
  const blockMat = new THREE.MeshStandardMaterial({
    color: EDGE_COLOR,
    roughness: 1.0,
    metalness: 0.0
  });

  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE), blockMat);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -blockH;
  scene.add(bottom);

  const half = MAP_SIZE / 2;
  const wallPositions = [
    { x: 0,    z: -half, rotY: 0 },
    { x: 0,    z:  half, rotY: 0 },
    { x: -half, z: 0,    rotY: Math.PI / 2 },
    { x:  half, z: 0,    rotY: Math.PI / 2 }
  ];
  for (const wp of wallPositions) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, blockH), blockMat);
    wall.position.set(wp.x, -blockH / 2, wp.z);
    wall.rotation.y = wp.rotY;
    scene.add(wall);
  }

  return mesh;
}

export function getTerrainMesh() { return mesh; }
export function getMapSize() { return MAP_SIZE; }
export function getChasms() { return []; }
export function getShape() { return 'rect'; }

export function getTerrainObjects() {
  return mesh ? [mesh] : [];
}