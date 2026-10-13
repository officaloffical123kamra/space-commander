import * as THREE from 'three';
import { getHeight } from './terrain.js';
import { BIOMES } from './maps.js';

export function createDecor(scene, map) {
  if (!map) return;

  const decor = new THREE.Group();
  scene.add(decor);

  const biome = map.biome || 'grass';
  const biomeData = BIOMES[biome] || BIOMES.grass;

  // === КАМНИ — Lambert, без бликов ===
  const rockMat = new THREE.MeshLambertMaterial({
    color: biomeData.rockColor,
    flatShading: true
  });

  for (let i = 0; i < 18; i++) {
    const x = (Math.random() - 0.5) * 50;
    const z = (Math.random() - 0.5) * 50;

    if (Math.abs(x - map.playerCC.x) < 8 && Math.abs(z - map.playerCC.z) < 8) continue;
    if (Math.abs(x - map.botCC.x) < 8 && Math.abs(z - map.botCC.z) < 8) continue;

    const y = getHeight(x, z);
    if (y > 1.5) continue;

    const size = 0.2 + Math.random() * 0.3;
    const geo = new THREE.DodecahedronGeometry(size, 0);
    const rock = new THREE.Mesh(geo, rockMat);
    rock.position.set(x, y + size * 0.4, z);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    rock.scale.set(
      0.7 + Math.random() * 0.6,
      0.5 + Math.random() * 0.5,
      0.7 + Math.random() * 0.6
    );
    decor.add(rock);
  }

  // === РАСТЕНИЯ — Lambert ===
  const hasTrees = biome === 'grass' || biome === 'snow';
  if (hasTrees) {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3a2e1f, flatShading: true });
    const leafColor = biome === 'snow' ? 0x2a3a2a : 0x2a4a28;
    const leafMat = new THREE.MeshLambertMaterial({ color: leafColor, flatShading: true });

    for (let i = 0; i < 12; i++) {
      const x = (Math.random() - 0.5) * 50;
      const z = (Math.random() - 0.5) * 50;

      if (Math.abs(x - map.playerCC.x) < 8 && Math.abs(z - map.playerCC.z) < 8) continue;
      if (Math.abs(x - map.botCC.x) < 8 && Math.abs(z - map.botCC.z) < 8) continue;

      const y = getHeight(x, z);
      if (y > 1.5) continue;

      const tree = new THREE.Group();

      const trunkH = 0.7 + Math.random() * 0.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, trunkH, 5), trunkMat);
      trunk.position.y = trunkH / 2;
      tree.add(trunk);

      const leafSize = 0.5 + Math.random() * 0.3;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(leafSize, leafSize * 1.8, 6), leafMat);
      leaves.position.y = trunkH + leafSize * 0.6;
      tree.add(leaves);

      tree.position.set(x, y, z);
      tree.rotation.y = Math.random() * Math.PI * 2;
      decor.add(tree);
    }
  }

  // === КРИСТАЛЛЫ (лава) — Lambert ===
  if (biome === 'lava') {
    const crystalMat = new THREE.MeshLambertMaterial({
      color: 0xaa3311,
      flatShading: true
    });
    for (let i = 0; i < 10; i++) {
      const x = (Math.random() - 0.5) * 50;
      const z = (Math.random() - 0.5) * 50;

      if (Math.abs(x - map.playerCC.x) < 8 && Math.abs(z - map.playerCC.z) < 8) continue;
      if (Math.abs(x - map.botCC.x) < 8 && Math.abs(z - map.botCC.z) < 8) continue;

      const y = getHeight(x, z);
      if (y > 1.5) continue;

      const h = 0.4 + Math.random() * 0.6;
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.2, h, 5), crystalMat);
      crystal.position.set(x, y + h / 2, z);
      crystal.rotation.y = Math.random() * Math.PI * 2;
      decor.add(crystal);
    }
  }

  return decor;
}