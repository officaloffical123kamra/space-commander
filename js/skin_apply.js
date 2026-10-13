// js/skin_apply.js
import * as THREE from 'three';
import { progress } from './progress.js';
import { SKINS } from './skins.js';

export function getActiveSkin() {
  const id = progress.activeSkin || 'default';
  return SKINS[id] || SKINS.default;
}

export function getUnitSkin(unitType) {
  const personal = progress.unitSkins && progress.unitSkins[unitType];
  if (personal && SKINS[personal]) return SKINS[personal];
  return SKINS.default;
}

export function getBuildingSkin(buildingType) {
  const personal = progress.buildingSkins && progress.buildingSkins[buildingType];
  if (personal && SKINS[personal]) return SKINS[personal];
  return SKINS.default;
}

export function applySkinToMesh(mesh, owner = 'player', skin = null) {
  if (!mesh) return;
  if (owner === 'bot') return;
  const useSkin = skin || SKINS.default;
  if (!useSkin.colors) return;

  const mainColor = new THREE.Color(useSkin.colors.main);
  const glowColor = useSkin.colors.glow ? new THREE.Color(useSkin.colors.glow) : null;

  mesh.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (child.userData.isParticle) return;

    if (!child.material._skinCloned) {
      child.material = child.material.clone();
      child.material._skinCloned = true;
      child.material._origColor = child.material.color
        ? child.material.color.clone()
        : new THREE.Color(0xffffff);
    }

    if (child.material.color) {
      child.material.color.copy(child.material._origColor);
      child.material.color.lerp(mainColor, 0.7);
    }

    if (glowColor) {
      child.material.emissive = glowColor.clone();
      child.material.emissiveIntensity = 0.6;
    } else if (child.material.emissive) {
      child.material.emissive = new THREE.Color(0, 0, 0);
      child.material.emissiveIntensity = 0;
    }
    // Запоминаем как «исходное» свечение, чтобы вспышки выстрела/урона возвращали именно его
    if (child.material.emissive) {
      child.material._origEmissive = child.material.emissive.getHex();
      child.material._origEI = child.material.emissiveIntensity;
    }
  });
}

export function applySkinToAllPlayerUnits(scene, units, buildings, commandCenters) {
  for (const u of units) {
    if (!u || !u.mesh) continue;
    if (!u.isPlayer) continue;

    const unitSkin = getUnitSkin(u.type);
    const key = u.type + ':' + (unitSkin.name || 'default');
    if (u._skinApplied === key) continue;
    applySkinToMesh(u.mesh, 'player', unitSkin);
    u._skinApplied = key;
  }

  for (const b of buildings) {
    if (!b || !b.mesh) continue;
    if ((b.owner || 'player') !== 'player') continue;

    const bSkin = getBuildingSkin(b.type);
    const key = b.type + ':' + (bSkin.name || 'default');
    if (b._skinApplied === key) continue;
    applySkinToMesh(b.mesh, 'player', bSkin);
    b._skinApplied = key;
    updateBuildingParticles(scene, b, bSkin);
  }
  for (const cc2 of commandCenters) {
    if (!cc2 || !cc2.mesh) continue;
    if ((cc2.owner || 'player') !== 'player') continue;

    const bSkin = getBuildingSkin(cc2.type || 'cc');
    const key = 'cc:' + (bSkin.name || 'default');
    if (cc2._skinApplied === key) continue;
    applySkinToMesh(cc2.mesh, 'player', bSkin);
    cc2._skinApplied = key;
    updateBuildingParticles(scene, cc2, bSkin);
  }
}

function updateBuildingParticles(scene, building, skin) {
  if (!building.mesh) return;

  if (building._particles) {
    building.mesh.remove(building._particles);
    building._particles.geometry.dispose();
    building._particles.material.dispose();
    building._particles = null;
  }
  if (building._aura) {
    building.mesh.remove(building._aura);
    building._aura.geometry.dispose();
    building._aura.material.dispose();
    building._aura = null;
  }

  if (!skin || skin.rarity === 'common' || !skin.colors) return;

  const rarity = skin.rarity;
  const color = skin.colors.glow || skin.colors.main || 0xffffff;

  let count = 6;
  let size = 0.1;
  let radius = 1.6;
  let speed = 0.4;

  if (rarity === 'rare') { count = 8; size = 0.09; radius = 1.6; speed = 0.4; }
  if (rarity === 'epic') { count = 14; size = 0.11; radius = 1.8; speed = 0.6; }
  if (rarity === 'legendary') { count = 22; size = 0.14; radius = 2.1; speed = 0.9; }

  const positions = new Float32Array(count * 3);
  const data = [];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const y = Math.random() * 2.5;
    positions[i * 3]     = Math.cos(angle) * radius;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    data.push({
      angle,
      radius,
      y,
      vy: 0.2 + Math.random() * 0.5,
      va: (Math.random() - 0.5) * 0.5
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const points = new THREE.Points(geo, mat);
  points.userData.isParticle = true;
  points.userData.data = data;
  points.userData.speedMult = speed;
  building._particles = points;
  building.mesh.add(points);

  if (rarity === 'legendary') {
    const auraGeo = new THREE.SphereGeometry(2.3, 16, 12);
    const auraMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.userData.isParticle = true;
    aura.position.y = 1.2;
    building._aura = aura;
    building.mesh.add(aura);
  }
}

export function tickBuildingParticles(buildings, commandCenters, dt) {
  const all = [...buildings, ...commandCenters];
  const t = performance.now() * 0.001;

  for (const b of all) {
    if (!b || !b._particles) continue;
    const points = b._particles;
    const positions = points.geometry.attributes.position.array;
    const data = points.userData.data;
    const speed = points.userData.speedMult || 0.5;

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      d.y += d.vy * dt * speed;
      d.angle += d.va * dt * speed;

      if (d.y > 3.5) {
        d.y = 0;
        d.angle = Math.random() * Math.PI * 2;
      }

      positions[i * 3]     = Math.cos(d.angle) * d.radius;
      positions[i * 3 + 1] = d.y;
      positions[i * 3 + 2] = Math.sin(d.angle) * d.radius;
    }
    points.geometry.attributes.position.needsUpdate = true;

    if (b._aura) {
      const pulse = 1 + Math.sin(t * 2) * 0.08;
      b._aura.scale.set(pulse, pulse, pulse);
      b._aura.material.opacity = 0.06 + Math.sin(t * 3) * 0.04;
    }
  }
}