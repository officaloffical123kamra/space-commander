// js/build.js
import * as THREE from 'three';
import { state, updateHud, createWorker, hasArmyRoom, addArmyMax, updateArmyHud, getEco, countArmy } from './economy.js';
import { session, ctrlOf, teamOfCtrl, tintFor, routeToRemote, withActor } from './session.js';
import { assignId } from './ids.js';
import { makeUnit, UNIT_PRESETS, detectors, drawHpBar, dealDamage, isHiddenFrom, spawnTracer } from './units.js';
import { playReady, playError, playBuildComplete, playSound } from './audio.js';
import { getModel, hasModel } from './models.js';
import { units as allUnits } from './units.js';
import { getHeight } from './terrain.js';
import {
  buildings, commandCenters, constructions, repairs,
  mineralPatches, geysers, findNearestMineralPatch, findNearestGeyser
} from './world.js';
import { upgrades, getWeaponBonus, getArmorReduction, getUpgrades } from './upgrades.js';
import { trackBuildingBuilt } from './achievements.js';

export { buildings, commandCenters, constructions, repairs };
export { upgrades, getWeaponBonus, getArmorReduction };

// ============================================================
// РЕМОНТ: константы (снижены для удобства)
// ============================================================
const REPAIR_COST_PER_HP = 0.10;   // 1 HP = 0.1◆
const REPAIR_RATE = 25;            // 25 HP/сек

export const BUILDING_NAMES = {
  cc: 'Командный центр',
  barracks: 'Казарма',
  factory: 'Завод',
  starport: 'Космопорт',
  storage: 'Хранилище',
  engineering: 'Инженерный комплекс',
  armory: 'Арсенал',
  refinery: 'Рефайнери',
  bunker: 'Бункер',
  sensor: 'Антенна',
  turret: 'Туррель'
};

export const REQUIREMENTS = {
  cc:          [],
  refinery:    [],
  storage:     [],
  barracks:    ['storage'],
  engineering: ['barracks'],
  bunker:      ['barracks'],
  sensor:      ['engineering'],
  turret:      ['engineering'],
  factory:     ['barracks', 'engineering'],
  armory:      ['factory'],
  starport:    ['factory']
};

export function canBuildType(type, ctrl = session.localCtrl) {
  const reqs = REQUIREMENTS[type];
  if (!reqs || reqs.length === 0) return true;
  for (const req of reqs) {
    const inBuildings = buildings.some(b => b.type === req && ctrlOf(b) === ctrl);
    const inConstructions = constructions.some(c => c.type === req && c.ctrl === ctrl);
    if (!inBuildings && !inConstructions) return false;
  }
  return true;
}

export function getMissingRequirement(type, ctrl = session.localCtrl) {
  const reqs = REQUIREMENTS[type];
  if (!reqs || reqs.length === 0) return null;
  for (const req of reqs) {
    const inBuildings = buildings.some(b => b.type === req && ctrlOf(b) === ctrl);
    const inConstructions = constructions.some(c => c.type === req && c.ctrl === ctrl);
    if (!inBuildings && !inConstructions) return BUILDING_NAMES[req] || req;
  }
  return null;
}

export function canPlaceBuilding(scene, type, x, z) {
  const half = 1;
  if (x - half < -28 || x + half > 28) return false;
  if (z - half < -28 || z + half > 28) return false;

  const h = getHeight(x, z);
  if (h > 2.5) return false;

  // Нельзя ставить здания на минералы и гейзеры (рефайнери — наоборот, только на гейзер)
  if (type !== 'refinery') {
    for (const mp of mineralPatches) {
      if (mp.amount > 0 && Math.abs(mp.x - x) < 2.2 && Math.abs(mp.z - z) < 2.2) return false;
    }
    for (const g of geysers) {
      if (Math.abs(g.x - x) < 2.2 && Math.abs(g.z - z) < 2.2) return false;
    }
  }

  const allBuildings = [...buildings];
  for (const cc of commandCenters) allBuildings.push(cc);
  for (const c of constructions) allBuildings.push({ mesh: c.mesh, type: c.type });

  for (const b of allBuildings) {
    if (!b || !b.mesh) continue;
    const dx = Math.abs(b.mesh.position.x - x);
    const dz = Math.abs(b.mesh.position.z - z);
    if (dx < 2 && dz < 2) return false;
  }
  return true;
}

export const COSTS = {
  barracks: { minerals: 100, vespene: 0 },
  factory:  { minerals: 150, vespene: 100 },
  starport: { minerals: 150, vespene: 100 },
  refinery: { minerals: 75,  vespene: 0 },
  storage:  { minerals: 100, vespene: 0 },
  bunker:   { minerals: 100, vespene: 0 },
  sensor:   { minerals: 125, vespene: 50 },
  turret:   { minerals: 100, vespene: 0 },
  engineering: { minerals: 125, vespene: 0 },
  armory:   { minerals: 150, vespene: 100 },
  cc:       { minerals: 400, vespene: 0 },
  reactor:  { minerals: 50,  vespene: 50 },
  techlab:  { minerals: 100, vespene: 100 },
  scv:      { minerals: 50,  vespene: 0 },
  marine:   UNIT_PRESETS.marine.cost,
  marauder: UNIT_PRESETS.marauder.cost,
  ghost:    UNIT_PRESETS.ghost.cost,
  medic:    UNIT_PRESETS.medic.cost,
  hellion:  UNIT_PRESETS.hellion.cost,
  tank:     UNIT_PRESETS.tank.cost,
  thor:     UNIT_PRESETS.thor.cost,
  viking:   UNIT_PRESETS.viking.cost,
  banshee:  UNIT_PRESETS.banshee.cost,
  battlecruiser: UNIT_PRESETS.battlecruiser.cost,
  upgInfWeapon: { minerals: 100, vespene: 100 },
  upgInfArmor:  { minerals: 100, vespene: 100 },
  upgVehWeapon: { minerals: 150, vespene: 150 },
  upgVehArmor:  { minerals: 150, vespene: 150 }
};

const BUILD_TIMES = {
  barracks: 8, factory: 10, starport: 12, storage: 5, refinery: 6,
  bunker: 7, sensor: 6, turret: 5, engineering: 8, armory: 10, cc: 20
};

function buildingHp(type) {
  if (type === 'cc') return 300;
  if (type === 'barracks') return 200;
  if (type === 'factory' || type === 'starport') return 250;
  if (type === 'storage') return 150;
  if (type === 'refinery') return 100;
  if (type === 'bunker') return 300;
  if (type === 'sensor') return 120;
  if (type === 'turret') return 180;
  if (type === 'engineering') return 200;
  if (type === 'armory') return 220;
  return 150;
}

function buildingHeight(type) {
  if (type === 'cc') return 2.2;
  if (type === 'barracks') return 1.8;
  if (type === 'factory' || type === 'starport') return 2.4;
  if (type === 'storage') return 1.4;
  if (type === 'bunker') return 1.2;
  if (type === 'engineering') return 1.9;
  if (type === 'armory') return 2.2;
  return 1.5;
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

export function drawBuildingHpBar(b) {
  if (!b || !b.hpBar || !b.hpBar.userData) return;
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

export function drawProgressBar(b) {
  if (!b || !b.progressBar || !b.progressBar.userData) return;
  const { canvas, ctx, texture } = b.progressBar.userData;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!b.productionQueue || b.productionQueue.length === 0) {
    b.progressBar.visible = false;
    texture.needsUpdate = true;
    return;
  }
  b.progressBar.visible = true;
  let totalMax = 0, totalLeft = 0;
  for (const job of b.productionQueue) {
    totalMax += job.totalTime || job.time;
    totalLeft += Math.max(0, job.time);
  }
  const ratio = totalMax > 0 ? (1 - totalLeft / totalMax) : 0;
  const pct = Math.round(ratio * 100);
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, 96, 16);
  ctx.fillStyle = '#33aaff'; ctx.fillRect(2, 2, 92 * ratio, 12);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(pct + '%', 48, 8);
  texture.needsUpdate = true;
}

function attachBuildingHpBar(b, height) {
  const hpBar = makeBuildingHpBar();
  hpBar.position.y = height + 0.3;
  b.mesh.add(hpBar);
  b.hpBar = hpBar;
  drawBuildingHpBar(b);
}

function attachProgressBar(b, height) {
  const pBar = makeProgressBar();
  pBar.position.y = height + 0.7;
  b.mesh.add(pBar);
  b.progressBar = pBar;
}

function makeBuildingBase(type, x, z, owner, mesh, ctrl = null) {
  let sight = 10;
  if (type === 'sensor') sight = 22;      // ← АНТЕННА: было 12, стало 22
  if (type === 'cc') sight = 11;
  if (type === 'turret') sight = 12;
  if (type === 'bunker') sight = 10;

  const b = {
    mesh, type, x, z, owner,
    productionQueue: [],
    hasReactor: false, hasTechlab: false, addonTaken: false,
    hp: buildingHp(type), maxHp: buildingHp(type),
    attackCooldown: 0,
    sight: sight,
    detectorRadius: type === 'sensor' ? 22 : 0,
    rallyPoint: null,
    ctrl: ctrl || (owner === 'bot' ? 'ai' : 'p1')
  };
  assignId(b);
  const h = buildingHeight(type);
  attachBuildingHpBar(b, h);
  attachProgressBar(b, h);
  return b;
}

export function makeBuildingMesh(scene, type, x, z, owner, ctrl = null) {
  const group = new THREE.Group();
  group.rotation.y = Math.PI;
  const col = (c1, c2) => owner === 'bot' ? c2 : c1;
  const tint = tintFor(owner, ctrl || (owner === 'bot' ? 'ai' : 'p1'));

  if (hasModel(type)) {
    const targetSize = {
      barracks: 2.4, factory: 3.0, starport: 3.2, storage: 1.8,
      bunker: 2.0, sensor: 1.6, turret: 1.4, engineering: 2.6,
      armory: 2.8, refinery: 2.0, cc: 3.0
    }[type] || 2.4;

    const model = getModel(type, targetSize);

    if (tint !== null) {
      model.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.color.lerp(new THREE.Color(tint), 0.4);
        }
      });
    }
    group.add(model);
  } else {
    let mesh;
    if (type === 'barracks') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.4),
        new THREE.MeshStandardMaterial({ color: col(0x8b5a2b, 0x884422) }));
      mesh.position.y = 0.7;
    } else if (type === 'factory') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 3.0),
        new THREE.MeshStandardMaterial({ color: col(0x556677, 0x664444) }));
      mesh.position.y = 0.9;
    } else if (type === 'starport') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 3.2),
        new THREE.MeshStandardMaterial({ color: col(0x334455, 0x445566) }));
      mesh.position.y = 1.0;
    } else if (type === 'storage') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.8),
        new THREE.MeshStandardMaterial({ color: col(0x9999aa, 0x666666) }));
      mesh.position.y = 0.6;
    } else if (type === 'refinery') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.8, 12),
        new THREE.MeshStandardMaterial({ color: 0x22aa55 }));
      mesh.position.y = 0.4;
    } else if (type === 'bunker') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 2.0),
        new THREE.MeshStandardMaterial({ color: 0x556644 }));
      mesh.position.y = 0.5;
    } else if (type === 'sensor') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.6, 12),
        new THREE.MeshStandardMaterial({ color: 0x3377aa }));
      mesh.position.y = 0.3;
    } else if (type === 'turret') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x666655 }));
      mesh.position.y = 0.3;
    } else if (type === 'engineering') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6),
        new THREE.MeshStandardMaterial({ color: 0x667799 }));
      mesh.position.y = 0.8;
    } else if (type === 'armory') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.8, 2.8),
        new THREE.MeshStandardMaterial({ color: 0x774466 }));
      mesh.position.y = 0.9;
    } else if (type === 'cc') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3),
        new THREE.MeshStandardMaterial({ color: col(0x5577aa, 0xaa4455) }));
      mesh.position.y = 1.0;
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x888888 }));
      mesh.position.y = 0.5;
    }
    group.add(mesh);
  }

  const groundH = getHeight(x, z);
  group.position.set(x, groundH, z);
  scene.add(group);
  return group;
}

export function createBarracks(scene, x, z, owner = 'player', ctrl = null) {
  const mesh = makeBuildingMesh(scene, 'barracks', x, z, owner, ctrl);
  const b = makeBuildingBase('barracks', x, z, owner, mesh, ctrl);
  buildings.push(b); return b;
}
export function createFactory(scene, x, z, owner = 'player', ctrl = null) {
  const mesh = makeBuildingMesh(scene, 'factory', x, z, owner, ctrl);
  const b = makeBuildingBase('factory', x, z, owner, mesh, ctrl);
  buildings.push(b); return b;
}
export function createStarport(scene, x, z, owner = 'player', ctrl = null) {
  const mesh = makeBuildingMesh(scene, 'starport', x, z, owner, ctrl);
  const b = makeBuildingBase('starport', x, z, owner, mesh, ctrl);
  buildings.push(b); return b;
}
export function createRefinery(scene, geyser, owner = 'player', ctrl = null) {
  const mesh = makeBuildingMesh(scene, 'refinery', geyser.x, geyser.z, owner, ctrl);
  const b = makeBuildingBase('refinery', geyser.x, geyser.z, owner, mesh, ctrl);
  b.geyser = geyser; b.workers = [];
  buildings.push(b); return b;
}
export function createStorage(scene, x, z, owner = 'player', ctrl = null) {
  const mesh = makeBuildingMesh(scene, 'storage', x, z, owner, ctrl);
  const b = makeBuildingBase('storage', x, z, owner, mesh, ctrl);
  buildings.push(b);
  return b;
}
export function createBunker(scene, x, z, owner = 'player', ctrl = null) {
  const mesh = makeBuildingMesh(scene, 'bunker', x, z, owner, ctrl);
  const b = makeBuildingBase('bunker', x, z, owner, mesh, ctrl);
  b.garrison = [];
  b.maxGarrison = 4;
  b.attackRange = 6.0;
  buildings.push(b); return b;
}
export function createSensor(scene, x, z, owner = 'player', ctrl = null) {
  const mesh = makeBuildingMesh(scene, 'sensor', x, z, owner, ctrl);
  const b = makeBuildingBase('sensor', x, z, owner, mesh, ctrl);
  buildings.push(b);
  // Регистрируем как детектор невидимок (для своего владельца)
  detectors.push({ x, z, range: 22, source: b, owner });
  // Визуальный радар на земле
  b.radarRing = createSensorRadar(mesh);
  return b;
}
export function createTurret(scene, x, z, owner = 'player', ctrl = null) {
  const mesh = makeBuildingMesh(scene, 'turret', x, z, owner, ctrl);
  const b = makeBuildingBase('turret', x, z, owner, mesh, ctrl);
  b.attack = 15; b.attackRange = 5.0; b.attackSpeed = 1.0;
  buildings.push(b);
  detectors.push({ x, z, range: 6, source: b, owner });
  return b;
}
export function createEngineering(scene, x, z, owner = 'player', ctrl = null) {
  const mesh = makeBuildingMesh(scene, 'engineering', x, z, owner, ctrl);
  const b = makeBuildingBase('engineering', x, z, owner, mesh, ctrl);
  buildings.push(b); return b;
}
export function createArmory(scene, x, z, owner = 'player', ctrl = null) {
  const mesh = makeBuildingMesh(scene, 'armory', x, z, owner, ctrl);
  const b = makeBuildingBase('armory', x, z, owner, mesh, ctrl);
  buildings.push(b); return b;
}
export function createCC(scene, x, z, owner = 'player', ctrl = null) {
  const mesh = makeBuildingMesh(scene, 'cc', x, z, owner, ctrl);
  const b = makeBuildingBase('cc', x, z, owner, mesh, ctrl);
  // Привязываем ближайшие ресурсы. Раньше рабочие нового КЦ
  // «добывали» бесконечные минералы из пустой точки.
  b.minerals = findNearestMineralPatch(x, z, 12);
  b.geyser = findNearestGeyser(x, z, 12);
  commandCenters.push(b);
  return b;
}

// ============================================================
// АНТЕННА: радар
// ============================================================

function createSensorRadar(mesh) {
  const ringGeo = new THREE.RingGeometry(21.7, 22, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x44ddff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.07;
  ring.userData.isRadar = true;
  mesh.add(ring);

  const innerGeo = new THREE.CircleGeometry(22, 64);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0x44ddff,
    transparent: true,
    opacity: 0.04,
    depthWrite: false,
  });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.06;
  inner.userData.isRadar = true;
  mesh.add(inner);

  const pulseGeo = new THREE.RingGeometry(0.5, 1.2, 64);
  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0x88eeff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.y = 0.08;
  pulse.userData.isRadar = true;
  pulse.userData.isPulse = true;
  pulse.userData.t = Math.random() * 3;
  mesh.add(pulse);

  return { ring, inner, pulse };
}

export function updateSensorRadars(dt) {
  for (const b of buildings) {
    if (b.type !== 'sensor' || !b.radarRing) continue;
    const p = b.radarRing.pulse;
    if (!p || !p.userData) continue;

    p.userData.t += dt * 0.8;
    if (p.userData.t > 3) p.userData.t = 0;
    const t = p.userData.t;
    const scale = t / 3;
    p.scale.setScalar(Math.max(0.01, scale * 22));
    p.material.opacity = 0.6 * (1 - scale);
  }
}

// ============================================================
// ГАРНИЗОН БУНКЕРА
// ============================================================

export function orderGarrison(scene, bunker, unit) {
  if (!bunker || !unit) return false;
  if (!bunker.garrison) bunker.garrison = [];
  if (bunker.garrison.length >= bunker.maxGarrison) {
    showHint('Бункер полон (4)');
    return false;
  }
  if (unit.isWorker || unit.isHealer) {
    showHint('Только боевые юниты');
    return false;
  }
  if (unit.inBunker || unit.goingToBunker) return false;
  if (!unit.mesh) return false;

  unit.goingToBunker = bunker;
  unit.target = { x: bunker.x, y: 0, z: bunker.z };
  unit.attackTarget = null;
  return true;
}

export function checkGarrisonArrival() {
  for (const u of allUnits) {
    if (!u || !u.goingToBunker) continue;
    const b = u.goingToBunker;
    if (!b || !b.mesh || b.hp <= 0) { u.goingToBunker = null; continue; }
    const d = u.mesh.position.distanceTo(b.mesh.position);
    if (d < 1.8) {
      if (b.garrison.length >= b.maxGarrison) {
        u.goingToBunker = null;
        continue;
      }
      u.mesh.visible = false;
      u.inBunker = b;
      u.goingToBunker = null;
      u.preBunkerPos = { x: u.mesh.position.x, z: u.mesh.position.z };
      u.target = null;
      u.attackTarget = null;
      b.garrison.push(u);
    }
  }
}

export function ungarrisonAll(scene, bunker) {
  try {
    if (!bunker || !bunker.garrison) return;
    for (const u of bunker.garrison) {
      if (!u || !u.mesh || u.dead) continue;
      u.mesh.visible = true;
      u.inBunker = null;
      u.goingToBunker = null;
      u.mesh.position.x = bunker.x + (Math.random() - 0.5) * 3;
      u.mesh.position.z = bunker.z + (Math.random() - 0.5) * 3;
      u.mesh.position.y = u.baseY || 0.4;
      u.target = null;
      u.attackTarget = null;
    }
    bunker.garrison = [];
  } catch (err) {
    console.error('ungarrisonAll error:', err);
  }
}

// Ближайший враг для стреляющего здания (бункер, туррель)
function findBuildingTarget(b, range) {
  const owner = b.owner || 'player';
  let nearest = null, nearestDist = range;
  for (const u of allUnits) {
    if (!u || !u.mesh || u.hp <= 0) continue;
    if (u.inBunker) continue;
    if (u.isPlayer === (owner === 'player')) continue;
    if (isHiddenFrom(u, owner)) continue;
    const d = u.mesh.position.distanceTo(b.mesh.position);
    if (d < nearestDist) { nearestDist = d; nearest = u; }
  }
  return nearest;
}

function updateBunkerCombat(bunker, scene, dt) {
  if (!bunker || !bunker.garrison || bunker.garrison.length === 0) return;
  if (!bunker.mesh) return;
  if (bunker.attackCooldown > 0) { bunker.attackCooldown -= dt; return; }

  const nearest = findBuildingTarget(bunker, bunker.attackRange || 6);
  if (!nearest) return;

  let totalDamage = 0;
  for (const g of bunker.garrison) {
    if (g) totalDamage += (g.attack || 0) + getWeaponBonus(g.type, bunker.owner || 'player');
  }
  totalDamage = Math.floor(totalDamage * 1.5);
  if (totalDamage <= 0) return;

  bunker.attackCooldown = 0.8;
  const startPos = bunker.mesh.position.clone();
  startPos.y += 1.0;
  const endPos = nearest.mesh.position.clone();
  endPos.y += 0.4;
  spawnTracer(scene, startPos, endPos, bunker.owner === 'bot' ? 0xff6644 : 0x66ccff);
  dealDamage(scene, null, nearest, totalDamage);
}

// Выпустить гарнизон разрушенного бункера (раньше юниты навсегда оставались внутри)
function ejectGarrison(bunker) {
  if (!bunker.garrison || bunker.garrison.length === 0) return;
  ungarrisonAll(null, bunker);
}

// ============================================================
// СТРОИТЕЛЬСТВО
// ============================================================

export function startConstruction(scene, type, x, z, scv) {
  const c = COSTS[type];
  if (!c) return { ok: false };
  const ctrl = ctrlOf(scv);
  const eco = getEco(ctrl);
  if (!eco) return { ok: false };

  if (!canBuildType(type, ctrl)) {
    const missing = getMissingRequirement(type, ctrl);
    showHint(`Требуется: ${missing}`);
    err();
    return { ok: false };
  }

  if (!canPlaceBuilding(scene, type, x, z)) {
    showHint('Здесь нельзя строить');
    err();
    return { ok: false };
  }

  if (eco.minerals < c.minerals || eco.vespene < c.vespene) {
    showHint('Мало ресурсов'); err(); return { ok: false };
  }
  eco.minerals -= c.minerals;
  eco.vespene  -= c.vespene;
  updateHud();

  const mesh = makeBuildingMesh(scene, type, x, z, teamOfCtrl(ctrl), ctrl);
  mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.transparent = true;
      child.material.opacity = 0.35;
    }
  });
  mesh.visible = false;

  const pBar = makeProgressBar();
  pBar.position.y = buildingHeight(type) + 0.7;
  mesh.add(pBar);

  const construction = {
    type, x, z, mesh, scv, ctrl,
    timeLeft: BUILD_TIMES[type] || 6,
    totalTime: BUILD_TIMES[type] || 6,
    geyser: null,
    started: false,
    progressBar: pBar
  };
  if (type === 'refinery') construction.geyser = { x, z };

  assignId(construction);
  constructions.push(construction);

  if (scv && scv.isWorker) {
    scv.state = 'move';
    scv.moveTarget = { x, z };
    scv.target = null;
    scv.construction = construction;
    scv.busy = true;
  }
  return { ok: true, construction };
}

export function cancelConstruction(scene, construction) {
  const idx = constructions.indexOf(construction);
  if (idx < 0) return false;

  if (construction.mesh) scene.remove(construction.mesh);

  const cost = COSTS[construction.type];
  if (cost) {
    const refundMinerals = Math.floor(cost.minerals * 0.75);
    const refundVespene  = Math.floor(cost.vespene * 0.75);
    const eco = getEco(construction.ctrl) || state;
    eco.minerals += refundMinerals;
    eco.vespene  += refundVespene;
    updateHud();
    showHint(`Отменено. Возврат: ${refundMinerals}◆ ${refundVespene}⬢`);
  }

  if (construction.scv) {
    construction.scv.construction = null;
    construction.scv.busy = false;
    construction.scv.moveTarget = null;
    construction.scv.target = null;
    construction.scv.state = 'idle';
  }

  constructions.splice(idx, 1);
  return true;
}

export function updateConstructions(scene, dt) {
  for (let i = constructions.length - 1; i >= 0; i--) {
    const c = constructions[i];
    const scv = c.scv;

    if (!scv || !scv.mesh || scv.dead || scv.hp <= 0) {
      if (c.mesh) { scene.remove(c.mesh); }
      constructions.splice(i, 1);
      continue;
    }

    const dx = c.x - scv.mesh.position.x;
    const dz = c.z - scv.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (!scv.isWorker) {
      if (c.mesh) { scene.remove(c.mesh); }
      constructions.splice(i, 1);
      withActor(c.ctrl, () => showHint('Стройка отменена'));
      continue;
    }

    if (!c.started) {
      if (dist > 2.5) {
        scv.moveTarget = { x: c.x, z: c.z };
        continue;
      } else {
        c.started = true;
        c.mesh.visible = true;
        scv.state = 'idle';
        scv.target = null;
        scv.moveTarget = null;
      }
    }

    if (dist > 3.5) continue;

    scv.state = 'idle';
    scv.target = null;
    scv.moveTarget = null;

    c.timeLeft -= dt;
    const progress = 1 - c.timeLeft / c.totalTime;

    if (c.mesh) {
      c.mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.opacity = 0.35 + progress * 0.65;
        }
      });
    }

    if (c.progressBar && c.progressBar.userData) {
      const { canvas, ctx, texture } = c.progressBar.userData;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, 96, 16);
      ctx.fillStyle = '#33aaff'; ctx.fillRect(2, 2, 92 * progress, 12);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(progress * 100) + '%', 48, 8);
      texture.needsUpdate = true;
      c.progressBar.visible = true;
    }

    if (c.timeLeft <= 0) {
      if (c.mesh) { scene.remove(c.mesh); }

      const team = teamOfCtrl(c.ctrl);
      if (c.type === 'refinery') createRefinery(scene, c.geyser, team, c.ctrl);
      else if (BUILDING_CREATORS[c.type]) BUILDING_CREATORS[c.type](scene, c.x, c.z, team, c.ctrl);
      if (c.type === 'storage') addArmyMax(8, c.ctrl);

      if (scv) {
        scv.construction = null;
        scv.busy = false;
        scv.state = scv.minerals ? 'to_minerals' : 'idle';
      }

      constructions.splice(i, 1);
      if (c.ctrl === session.localCtrl) trackBuildingBuilt(c.type);
      withActor(c.ctrl, () => {
        showHint(`Готово: ${BUILDING_NAMES[c.type] || 'постройка'}`);
        if (!routeToRemote('sound', 'ui_build_complete')) {
          playBuildComplete();
          playSound('build_complete');
        }
      });

      import('./selection.js').then(m => m.renderBuildRow());
    }
  }
}

// ============================================================
// ПРИСТРОЙКИ
// ============================================================

export function attachAddon(scene, building, addonType) {
  if (!building) return false;
  if (building.type !== 'barracks' && building.type !== 'factory' && building.type !== 'starport') return false;
  if (building.addonTaken) return false;
  const isReactor = addonType === 'reactor';
  const size = isReactor ? 1.2 : 1.5;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, 0.9, size),
    new THREE.MeshStandardMaterial({ color: isReactor ? 0x33aaff : 0xaa33ff }));
  const baseH = getHeight(building.x, building.z);
  mesh.position.set(building.x + (isReactor ? -2.0 : 2.0), baseH + 0.45, building.z);
  scene.add(mesh);
  building.addonTaken = true;
  if (isReactor) { building.hasReactor = true; building.reactorMesh = mesh; }
  else { building.hasTechlab = true; building.techlabMesh = mesh; }
  return true;
}

export function buyAddon(scene, building, addonType) {
  if (!building || building.addonTaken) { showHint('Уже есть пристройка'); return false; }
  const ctrl = ctrlOf(building);
  const cost = COSTS[addonType === 'reactor' ? 'reactor' : 'techlab'];
  if (!canAfford(cost, ctrl)) { showHint('Мало ресурсов'); err(); return false; }
  if (!attachAddon(scene, building, addonType)) return false;
  spend(cost, ctrl);
  showHint(addonType === 'reactor' ? 'Реактор установлен' : 'Тех-лаб установлен');
  return true;
}

// ============================================================
// ПРОИЗВОДСТВО
// ============================================================

function canAfford(cost, ctrl = 'p1') {
  const eco = getEco(ctrl);
  return !!eco && eco.minerals >= cost.minerals && eco.vespene >= cost.vespene;
}
function spend(cost, ctrl = 'p1') {
  const eco = getEco(ctrl);
  eco.minerals -= cost.minerals; eco.vespene -= cost.vespene; updateHud();
}
function limitText(ctrl) {
  const eco = getEco(ctrl);
  return `Лимит: ${countArmy(ctrl)}/${eco ? eco.armyMax : 0}`;
}

export function availableUnits(building) {
  if (!building) return [];
  if (building.type === 'barracks') {
    const list = ['marine', 'medic'];
    if (building.hasTechlab) { list.push('marauder'); list.push('ghost'); }
    return list;
  }
  if (building.type === 'factory') {
    const list = ['hellion'];
    if (building.hasTechlab) { list.push('tank'); list.push('thor'); }
    return list;
  }
  if (building.type === 'starport') {
    const list = ['viking', 'banshee'];
    if (building.hasTechlab) list.push('battlecruiser');
    return list;
  }
  return [];
}

export function queueUnit(building, unitType) {
  const preset = UNIT_PRESETS[unitType];
  if (!preset) return false;
  const available = availableUnits(building);
  const ctrl = ctrlOf(building);
  if (!available.includes(unitType)) { showHint('Недоступно в этом здании'); return false; }
  if (!hasArmyRoom(ctrl)) { showHint(limitText(ctrl)); return false; }
  if (!canAfford(preset.cost, ctrl)) { showHint('Мало ресурсов'); err(); return false; }
  spend(preset.cost, ctrl);
  const times = { ghost: 5.0, marauder: 4.0, medic: 3.5, hellion: 3.5, tank: 5.0, thor: 7.0, viking: 4.0, banshee: 5.0, battlecruiser: 9.0 };
  const buildTime = times[unitType] || 3.0;
  building.productionQueue.push({ type: unitType, time: buildTime, totalTime: buildTime });
  return true;
}

export function queueScv(scene, cc) {
  const c = COSTS.scv;
  const ctrl = ctrlOf(cc);
  if (!hasArmyRoom(ctrl)) { showHint(limitText(ctrl)); return false; }
  if (!canAfford(c, ctrl)) { showHint('Мало минералов'); err(); return false; }
  spend(c, ctrl);
  cc.productionQueue.push({ type: 'scv', time: 4.0, totalTime: 4.0 });
  return true;
}

export function buyUpgrade(type, ctrl = session.localCtrl) {
  const cost = COSTS[type];
  if (!cost) return false;
  const key = {
    upgInfWeapon: 'infantryWeapon',
    upgInfArmor:  'infantryArmor',
    upgVehWeapon: 'vehicleWeapon',
    upgVehArmor:  'vehicleArmor'
  }[type];
  if (!key) return false;
  const upg = getUpgrades(teamOfCtrl(ctrl));
  if (upg[key] >= 5) { showHint('Максимум (5)'); return false; }
  if (!canAfford(cost, ctrl)) { showHint('Мало ресурсов'); err(); return false; }
  spend(cost, ctrl);
  upg[key]++;
  const UPG_NAMES = {
    infantryWeapon: 'Оружие пехоты', infantryArmor: 'Броня пехоты',
    vehicleWeapon: 'Оружие техники', vehicleArmor: 'Броня техники'
  };
  showHint(`${UPG_NAMES[key]}: уровень ${upg[key]}`);
  return true;
}

// ============================================================
// РЕМОНТ ЗДАНИЙ
// ============================================================

/**
 * Начать ремонт.
 * options.pay(cost) -> boolean — списать ресурсы (по умолчанию — минералы игрока).
 * Для бота передаётся своя функция, чтобы он не тратил деньги игрока.
 */
export function startRepair(scene, building, worker, options = {}) {
  if (!building || !worker) return false;
  const silent = !!options.pay;
  const hint = (t) => { if (!silent) showHint(t); };
  if (!worker.isWorker) {
    hint('Чинить может только КСМ');
    return false;
  }
  if (worker.construction) {
    hint('КСМ занят стройкой');
    return false;
  }
  if (worker.repairJob) {
    hint('КСМ уже ремонтирует');
    return false;
  }
  if (building.hp >= building.maxHp) {
    hint('Здание не требует ремонта');
    return false;
  }

  const repair = {
    building,
    worker,
    timeLeft: 0,
    totalTime: 0,
    healing: false,
    progressBar: null,
    pay: options.pay || null,
    silent,
    ctrl: ctrlOf(worker),
    prevRefinery: worker.refinery || null,
  };

  worker.repairJob = repair;
  worker.moveTarget = { x: building.mesh.position.x, z: building.mesh.position.z };
  worker.target = null;
  worker.state = 'repair';
  worker.autoAttackDisabled = true;

  repairs.push(repair);
  return true;
}

export function updateRepairs(scene, dt) {
  for (let i = repairs.length - 1; i >= 0; i--) {
    const r = repairs[i];
    const b = r.building;
    const w = r.worker;

    if (!b || !b.mesh || b.hp <= 0) {
      cancelRepair(r);
      repairs.splice(i, 1);
      continue;
    }
    if (!w || !w.mesh || w.hp <= 0) {
      cancelRepair(r);
      repairs.splice(i, 1);
      continue;
    }
    if (b.hp >= b.maxHp) {
      if (!r.silent) {
        withActor(r.ctrl, () => {
          showHint(`Отремонтировано: ${BUILDING_NAMES[b.type] || b.type}`);
          if (!routeToRemote('sound', 'ui_build_complete')) playBuildComplete();
        });
      }
      cancelRepair(r);
      repairs.splice(i, 1);
      continue;
    }

    const dx = b.mesh.position.x - w.mesh.position.x;
    const dz = b.mesh.position.z - w.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 2.2) {
      if (!w.moveTarget) {
        w.moveTarget = { x: b.mesh.position.x, z: b.mesh.position.z };
      }
      continue;
    }

    w.moveTarget = null;
    w.state = 'repair';

    let healAmount = REPAIR_RATE * dt;
    const needed = b.maxHp - b.hp;
    if (healAmount > needed) healAmount = needed;

    // Копим дробную стоимость, иначе ceil() каждый кадр делал ремонт в разы дороже
    r.costDebt = (r.costDebt || 0) + healAmount * REPAIR_COST_PER_HP;
    const cost = Math.floor(r.costDebt);

    if (cost > 0) {
      const paid = r.pay ? r.pay(cost) : payMinerals(cost, r.ctrl);
      if (!paid) {
        r.costDebt -= healAmount * REPAIR_COST_PER_HP;
        if (!r.healing && !r.silent) withActor(r.ctrl, () => showHint('Мало минералов для ремонта'));
        r.healing = true;
        continue;
      }
      r.costDebt -= cost;
    }
    r.healing = false;

    b.hp += healAmount;
    if (b.hp > b.maxHp) b.hp = b.maxHp;
    drawBuildingHpBar(b);

    if (!r.progressBar) {
      r.progressBar = createRepairProgressBar(b);
    }
    updateRepairProgressBar(r);
  }
}

function createRepairProgressBar(building) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true
  }));
  sprite.scale.set(2.6, 0.44, 1);
  const height = buildingHeight(building.type) + 1.1;
  sprite.position.y = height;
  sprite.userData = { canvas, ctx, texture };
  building.mesh.add(sprite);
  return sprite;
}

function updateRepairProgressBar(repair) {
  const b = repair.building;
  const pBar = repair.progressBar;
  if (!pBar || !pBar.userData) return;
  const { canvas, ctx, texture } = pBar.userData;

  const progress = Math.max(0, Math.min(1, b.hp / b.maxHp));

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, 96, 16);
  ctx.fillStyle = '#ffaa22';
  ctx.fillRect(2, 2, 92 * progress, 12);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔧 ' + Math.round(progress * 100) + '%', 48, 8);
  texture.needsUpdate = true;
}

export function cancelRepair(repair) {
  if (!repair) return;
  const w = repair.worker;
  const b = repair.building;

  if (repair.progressBar && b && b.mesh) {
    b.mesh.remove(repair.progressBar);
    if (repair.progressBar.userData && repair.progressBar.userData.texture) {
      repair.progressBar.userData.texture.dispose();
    }
    if (repair.progressBar.material) repair.progressBar.material.dispose();
    repair.progressBar = null;
  }

  if (w) {
    w.repairJob = null;
    w.moveTarget = null;
    w.autoAttackDisabled = false;
    // После ремонта рабочий возвращается к добыче (раньше вставал без дела,
    // а рабочие бота так и стояли до конца игры)
    if (repair.prevRefinery && repair.prevRefinery.hp > 0) {
      w.refinery = repair.prevRefinery;
      w.state = 'gas_to';
    } else {
      w.state = w.minerals ? 'to_minerals' : 'idle';
    }
  }
}

function payMinerals(cost, ctrl = 'p1') {
  const eco = getEco(ctrl);
  if (!eco || eco.minerals < cost) return false;
  eco.minerals -= cost;
  updateHud();
  return true;
}

export function getRepairByWorker(worker) {
  return repairs.find(r => r.worker === worker);
}

// ============================================================
// ГЛАВНЫЙ АПДЕЙТ ЗДАНИЙ
// ============================================================

export function updateBuildings(scene, dt) {
  for (const b of buildings) drawProgressBar(b);

  for (let i = buildings.length - 1; i >= 0; i--) {
    const b = buildings[i];
    if (b.hp <= 0) {
      if (b.mesh) { try { scene.remove(b.mesh); } catch (err) {} }
      if (b.type === 'bunker') ejectGarrison(b);
      if (b.type === 'storage') addArmyMax(-8, ctrlOf(b));
      if (b.reactorMesh) scene.remove(b.reactorMesh);
      if (b.techlabMesh) scene.remove(b.techlabMesh);
      buildings.splice(i, 1);
    }
  }
  for (let i = commandCenters.length - 1; i >= 0; i--) {
    const cc = commandCenters[i];
    if (cc.hp <= 0) {
      if (cc.mesh) { try { scene.remove(cc.mesh); } catch (err) {} }
      commandCenters.splice(i, 1);
    }
  }

  for (const b of buildings) {
    if (b.type !== 'barracks' && b.type !== 'factory' && b.type !== 'starport') continue;
    if (!b.productionQueue || b.productionQueue.length === 0) continue;
    const slots = b.hasReactor ? 2 : 1;
    for (let i = 0; i < slots && i < b.productionQueue.length; i++) {
      const job = b.productionQueue[i];
      job.time -= dt;
      if (job.time <= 0) {
        const offset = i === 0 ? 2 : 2.8;
        const sx = b.mesh.position.x + offset;
        const sz = b.mesh.position.z;
        const preset = UNIT_PRESETS[job.type];
        const ctrl = ctrlOf(b);
        const u = makeUnit(scene, sx, sz, job.type, (b.owner || 'player') !== 'bot', job.type, ctrl);

        if (ctrl === 'ai') {
          u.target = { x: sx + 1, y: 0, z: sz + 1 };
        } else {
          if (b.rallyPoint) {
            u.target = { x: b.rallyPoint.x, y: 0, z: b.rallyPoint.z };
            u.attackTarget = null;
            u.autoAttackDisabled = true;
          } else {
            u.target = null;
            u.attackTarget = null;
          }
        }

        b.productionQueue.splice(i, 1);
        i--;
        if (ctrl !== 'ai') {
          updateArmyHud();
          withActor(ctrl, () => {
            showHint(`${preset.name} готов`);
            if (!routeToRemote('sound', 'ui_ready')) {
              playReady();
              playSound(b.type + '_ready');
            }
          });
        }
      }
    }
  }

  // ТУРЕЛИ (раньше стреляли только турели игрока — турели бота были декорацией)
  for (const b of buildings) {
    if (b.type !== 'turret' || b.hp <= 0) continue;

    if (!b.attack) b.attack = 15;
    if (!b.attackRange) b.attackRange = 5.0;
    if (!b.attackSpeed) b.attackSpeed = 1.0;
    if (!b.attackCooldown) b.attackCooldown = 0;

    if (b.attackCooldown > 0) { b.attackCooldown -= dt; continue; }

    const nearest = findBuildingTarget(b, b.attackRange);
    if (nearest) {
      const dx = nearest.mesh.position.x - b.mesh.position.x;
      const dz = nearest.mesh.position.z - b.mesh.position.z;
      b.mesh.rotation.y = Math.atan2(dx, dz);
      b.attackCooldown = b.attackSpeed;

      if (ctrlOf(b) === session.localCtrl) playSound('turret_shoot', 0.6);

      const startPos = b.mesh.position.clone();
      startPos.y += 0.6;
      const endPos = nearest.mesh.position.clone();
      endPos.y += 0.4;
      spawnTracer(scene, startPos, endPos, b.owner === 'bot' ? 0xff8844 : 0xffee44);

      dealDamage(scene, null, nearest, b.attack);
    }
  }

  for (const b of buildings) {
    if (b.type === 'bunker') updateBunkerCombat(b, scene, dt);
  }

  for (const cc of commandCenters) {
    drawProgressBar(cc);
    if (!cc.productionQueue || cc.productionQueue.length === 0) continue;
    const job = cc.productionQueue[0];
    job.time -= dt;
    if (job.time <= 0) {
      const sx = cc.x + 2;
      if (!cc.minerals || cc.minerals.amount <= 0) cc.minerals = findNearestMineralPatch(cc.x, cc.z, 20);
      const ctrl = ctrlOf(cc);
      const w = createWorker(scene, cc, cc.minerals, (cc.owner || 'player') === 'player', sx, ctrl);
      if (ctrl === 'ai' && cc.onWorker) cc.onWorker(w);
      if (ctrl !== 'ai' && cc.rallyPoint) {
        w.state = 'idle';
        w.moveTarget = { x: cc.rallyPoint.x, z: cc.rallyPoint.z };
      }
      cc.productionQueue.shift();
      if (ctrl !== 'ai') {
        updateArmyHud();
        withActor(ctrl, () => {
          showHint('Рабочий готов');
          if (!routeToRemote('sound', 'ui_ready')) {
            playReady();
            playSound('cc_ready');
          }
        });
      }
    }
  }
}

export function repairBuilding(building, amount) {
  if (!building) return false;
  if (building.hp >= building.maxHp) return false;
  building.hp = Math.min(building.maxHp, building.hp + amount);
  drawBuildingHpBar(building);
  return true;
}
export function isMechanical(unit) {
  if (!unit) return false;
  return ['hellion', 'tank', 'thor', 'viking', 'banshee', 'battlecruiser'].includes(unit.type);
}
export function repairUnit(unit, amount) {
  if (!unit) return false;
  if (unit.hp >= unit.maxHp) return false;
  unit.hp = Math.min(unit.maxHp, unit.hp + amount);
  if (unit.hpBar && unit.hpBar.userData) {
    const { canvas, ctx, texture } = unit.hpBar.userData;
    const ratio = Math.max(0, unit.hp / unit.maxHp);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 64, 8);
    ctx.fillStyle = ratio > 0.5 ? '#44dd44' : ratio > 0.25 ? '#ddaa22' : '#dd3333';
    ctx.fillRect(1, 1, 62 * ratio, 6);
    texture.needsUpdate = true;
  }
  return true;
}

const BUILDING_CREATORS = {
  barracks: createBarracks, factory: createFactory, starport: createStarport,
  storage: createStorage, bunker: createBunker, sensor: createSensor,
  turret: createTurret, engineering: createEngineering, armory: createArmory,
  cc: createCC
};

// Звук ошибки — тому, чей это приказ
function err() {
  if (!routeToRemote('sound', 'ui_error')) playError();
}

let hintTimer = null;
export function showHint(text, ms = 2000) {
  if (routeToRemote('hint', text)) return;
  const el = document.getElementById('hint');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('show'), ms);
}