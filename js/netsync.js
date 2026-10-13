// js/netsync.js
// Синхронизация игры по сети.
//  Хост: ~10 раз в секунду отправляет снимок (юниты, здания, стройки, ресурсы, волна).
//  Друг: по снимку создаёт/двигает/удаляет «копии» объектов. Сам он ничего не считает —
//        только показывает и отправляет приказы (commands.js).
import * as THREE from 'three';
import {
  units, makeUnit, drawHpBar, toggleSiege, toggleTransform, isHiddenFrom
} from './units.js';
import { createWorker, state, state2, updateHud } from './economy.js';
import {
  createBarracks, createFactory, createStarport, createRefinery, createStorage,
  createBunker, createSensor, createTurret, createEngineering, createArmory,
  attachAddon, drawProgressBar, makeBuildingMesh
} from './build.js';
import { createCommandCenter, drawMineralLabel, drawGasLabel } from './scene.js';
import { spawnBoss } from './bosses.js';
import {
  buildings, commandCenters, constructions, mineralPatches, geysers
} from './world.js';
import { upgrades, botUpgrades } from './upgrades.js';
import { assignId, getById, forgetId } from './ids.js';
import { session, teamOfCtrl } from './session.js';
import { netSend } from './net.js';

const CTRL_CODE = { p1: 1, p2: 2, ai: 0 };
const CODE_CTRL = ['ai', 'p1', 'p2'];
const BOSS_TYPES = ['titan', 'hydra', 'ark'];

const r2 = (v) => Math.round(v * 100) / 100;

// ============================================================
// ХОСТ: снимок состояния
// ============================================================

function unitFlags(u) {
  let f = 0;
  if (u.isWorker) f |= 1;
  if (u.sieged) f |= 2;
  if (u.inAirForm) f |= 4;
  if (u.isInvisible && !(u.revealTimer > 0)) f |= 8;
  if (u.carrying === 'mineral') f |= 16;
  if (u.carrying === 'gas') f |= 32;
  if (u.construction) f |= 64;
  if (u.repairJob) f |= 128;
  if (u.isBoss) f |= 256;
  if (u.isWorker && u.state === 'idle' && !u.moveTarget && !u.construction && !u.repairJob) f |= 512;
  return f;
}

export function buildSnapshot(extra = {}) {
  const guestTeam = teamOfCtrl('p2');
  const us = [];
  for (const u of units) {
    if (!u || u.dead || u.hp <= 0 || !u.mesh) continue;
    // Невидимок врага, которых друг не обнаружил, не отправляем вовсе
    if (isHiddenFrom(u, guestTeam)) continue;
    const p = u.mesh.position;
    us.push([
      u.id, u.type, u.isPlayer ? 0 : 1, CTRL_CODE[u.ctrl] ?? 0,
      r2(p.x), r2(p.y), r2(p.z), r2(u.mesh.rotation.y),
      Math.ceil(u.hp), u.maxHp, unitFlags(u),
      u.inBunker ? u.inBunker.id : 0,
      u.repairJob && u.repairJob.building ? u.repairJob.building.id : 0,
      u.isBoss ? u.name : 0
    ]);
  }

  const bs = [];
  for (const list of [buildings, commandCenters]) {
    for (const b of list) {
      if (!b || b.hp <= 0) continue;
      bs.push([
        b.id, b.type, (b.owner || 'player') === 'player' ? 0 : 1, CTRL_CODE[b.ctrl] ?? 0,
        r2(b.x), r2(b.z), Math.ceil(b.hp), b.maxHp,
        (b.hasReactor ? 1 : 0) | (b.hasTechlab ? 2 : 0),
        (b.productionQueue || []).map((j) => [j.type, r2(j.time), j.totalTime]),
        (b.garrison || []).map((g) => g.id),
        b.rallyPoint ? [r2(b.rallyPoint.x), r2(b.rallyPoint.z)] : 0
      ]);
    }
  }

  const cs = constructions.map((c) => [
    c.id, c.type, CTRL_CODE[c.ctrl] ?? 0, c.x, c.z,
    r2(Math.max(0, 1 - c.timeLeft / c.totalTime)), c.started ? 1 : 0,
    c.scv ? c.scv.id : 0
  ]);

  return {
    t: 'snap',
    us, bs, cs,
    res: [mineralPatches.map((m) => m.amount), geysers.map((g) => g.amount)],
    eco: { m: Math.floor(state2.minerals), v: Math.floor(state2.vespene), max: state2.armyMax },
    upg: [upgrades, botUpgrades],
    ...extra
  };
}

export function sendSnapshot(extra) {
  netSend(buildSnapshot(extra));
}

// ============================================================
// ДРУГ: применение снимка
// ============================================================

let viewScene = null;
let lastSnap = null;
const unitProxies = new Map();
const buildingProxies = new Map();
const consProxies = new Map();

export function initGuestView(scene) {
  viewScene = scene;
}

export function getLastSnapshot() {
  return lastSnap;
}

const BUILDING_CREATORS = {
  barracks: createBarracks, factory: createFactory, starport: createStarport,
  storage: createStorage, bunker: createBunker, sensor: createSensor,
  turret: createTurret, engineering: createEngineering, armory: createArmory
};

function createUnitProxy(row) {
  const [id, type, team, ctrlCode, x, y, z, , , , flags, , , bossName] = row;
  const isPlayer = team === 0;
  const ctrl = CODE_CTRL[ctrlCode] || 'ai';
  let u;
  if (flags & 1) {
    u = createWorker(viewScene, { x, z, ctrl }, null, isPlayer, x, ctrl);
  } else if (flags & 256 || BOSS_TYPES.includes(type)) {
    u = spawnBoss(viewScene, x, z, type, isPlayer ? 'player' : 'bot', { name: bossName || undefined });
  } else {
    u = makeUnit(viewScene, x, z, type, isPlayer, type, ctrl);
  }
  if (!u) return null;
  u.ctrl = ctrl;
  assignId(u, id);
  u.mesh.position.set(x, y, z);
  u._net = { x, y, z, ry: row[7] };
  u.mesh.rotation.y = row[7];
  return u;
}

function setCloakLook(u, cloaked) {
  if (u._cloakShown === cloaked) return;
  u._cloakShown = cloaked;
  u.mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.transparent = true;
      child.material.opacity = cloaked ? 0.4 : 1.0;
    }
  });
}

function applyUnits(rows) {
  const seen = new Set();
  for (const row of rows) {
    const [id, , , , x, y, z, ry, hp, maxHp, flags, bunkerId, repairBId] = row;
    seen.add(id);
    let u = unitProxies.get(id);
    if (!u) {
      u = createUnitProxy(row);
      if (!u) continue;
      unitProxies.set(id, u);
    }
    u._net.x = x; u._net.y = y; u._net.z = z; u._net.ry = ry;
    if (u.hp !== hp || u.maxHp !== maxHp) {
      u.hp = hp;
      u.maxHp = maxHp;
      drawHpBar(u);
    }
    if (u.canSiege && !!(flags & 2) !== !!u.sieged) toggleSiege(u);
    if (u.canTransform && !!(flags & 4) !== !!u.inAirForm) toggleTransform(u);
    if (u.isInvisible) {
      u.revealTimer = 1; // для отображения у друга невидимка не скрыта
      setCloakLook(u, !!(flags & 8));
    }
    if (u.isWorker) {
      if (u.carryMineral) u.carryMineral.visible = !!(flags & 16);
      if (u.carryGas) u.carryGas.visible = !!(flags & 32);
      u.state = flags & 512 ? 'idle' : 'busy';
      u.moveTarget = null;
      u._buildingFlag = !!(flags & 64);
      u.repairJob = (flags & 128) ? { building: getById(repairBId) || { hp: 0, maxHp: 1, type: '' }, worker: u } : null;
    }
    u.inBunker = bunkerId ? (getById(bunkerId) || true) : null;
  }

  for (const [id, u] of unitProxies) {
    if (seen.has(id)) continue;
    removeUnitProxy(u);
    unitProxies.delete(id);
  }
}

function removeUnitProxy(u) {
  u.dead = true;
  u.hp = 0;
  const idx = units.indexOf(u);
  if (idx >= 0) units.splice(idx, 1);
  if (u.mesh) viewScene.remove(u.mesh);
  forgetId(u);
}

function createBuildingProxy(row) {
  const [id, type, team, ctrlCode, x, z] = row;
  const owner = team === 0 ? 'player' : 'bot';
  const ctrl = CODE_CTRL[ctrlCode] || 'ai';
  let b;
  if (type === 'cc') {
    b = createCommandCenter(viewScene, x, z, 0x5577aa, owner, ctrl);
    commandCenters.push(b);
  } else if (type === 'refinery') {
    let g = geysers.find((gg) => Math.abs(gg.x - x) < 0.5 && Math.abs(gg.z - z) < 0.5);
    if (!g) g = { x, z };
    b = createRefinery(viewScene, g, owner, ctrl);
  } else if (BUILDING_CREATORS[type]) {
    b = BUILDING_CREATORS[type](viewScene, x, z, owner, ctrl);
  }
  if (!b) return null;
  b.ctrl = ctrl;
  assignId(b, id);
  return b;
}

function applyBuildings(rows) {
  const seen = new Set();
  let added = false;
  for (const row of rows) {
    const [id, , , , , , hp, maxHp, addons, queue, garrisonIds, rally] = row;
    seen.add(id);
    let b = buildingProxies.get(id);
    if (!b) {
      b = createBuildingProxy(row);
      if (!b) continue;
      buildingProxies.set(id, b);
      added = true;
    }
    if (b.hp !== hp || b.maxHp !== maxHp) {
      b.hp = hp;
      b.maxHp = maxHp;
      drawHpBar(b);
    }
    if ((addons & 1) && !b.hasReactor) attachAddon(viewScene, b, 'reactor');
    if ((addons & 2) && !b.hasTechlab) attachAddon(viewScene, b, 'techlab');
    b.productionQueue = queue.map(([type, time, totalTime]) => ({ type, time, totalTime }));
    drawProgressBar(b);
    if (b.type === 'bunker') b.garrison = garrisonIds.map((gid) => getById(gid)).filter(Boolean);
    b.rallyPoint = rally ? { x: rally[0], z: rally[1] } : null;
  }

  for (const [id, b] of buildingProxies) {
    if (seen.has(id)) continue;
    b.hp = 0;
    if (b.mesh) viewScene.remove(b.mesh);
    if (b.reactorMesh) viewScene.remove(b.reactorMesh);
    if (b.techlabMesh) viewScene.remove(b.techlabMesh);
    for (const list of [buildings, commandCenters]) {
      const idx = list.indexOf(b);
      if (idx >= 0) list.splice(idx, 1);
    }
    forgetId(b);
    buildingProxies.delete(id);
  }
  return added;
}

function applyConstructions(rows) {
  const seen = new Set();
  for (const row of rows) {
    const [id, type, ctrlCode, x, z, progress, started, scvId] = row;
    seen.add(id);
    let c = consProxies.get(id);
    if (!c) {
      const ctrl = CODE_CTRL[ctrlCode] || 'ai';
      const mesh = makeBuildingMesh(viewScene, type, x, z, teamOfCtrl(ctrl), ctrl);
      mesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.transparent = true;
        }
      });
      c = { type, x, z, ctrl, mesh, scv: null };
      assignId(c, id);
      consProxies.set(id, c);
      constructions.push(c);
    }
    c.mesh.visible = !!started;
    c.mesh.traverse((child) => {
      if (child.isMesh && child.material) child.material.opacity = 0.35 + progress * 0.65;
    });
    c.scv = getById(scvId);
    if (c.scv) c.scv.construction = c;
  }

  for (const [id, c] of consProxies) {
    if (seen.has(id)) continue;
    viewScene.remove(c.mesh);
    const idx = constructions.indexOf(c);
    if (idx >= 0) constructions.splice(idx, 1);
    if (c.scv && c.scv.construction === c) c.scv.construction = null;
    forgetId(c);
    consProxies.delete(id);
  }

  // Рабочие, у которых больше нет стройки
  for (const u of unitProxies.values()) {
    if (u.isWorker && u.construction && !u._buildingFlag) u.construction = null;
  }
}

function applyResources(res) {
  const [mins, gas] = res;
  mins.forEach((amount, i) => {
    const mp = mineralPatches[i];
    if (!mp || mp.amount === amount) return;
    mp.amount = amount;
    drawMineralLabel(mp);
    if (amount <= 0 && mp.group) mp.group.visible = false;
  });
  gas.forEach((amount, i) => {
    const g = geysers[i];
    if (!g || g.amount === amount) return;
    g.amount = amount;
    drawGasLabel(g);
    if (amount <= 0 && g.group) g.group.visible = false;
  });
}

// Возвращает true, если появились новые здания (нужно обновить панель стройки)
export function applySnapshot(snap) {
  if (!viewScene) return false;
  lastSnap = snap;
  applyUnits(snap.us || []);
  const added = applyBuildings(snap.bs || []);
  applyConstructions(snap.cs || []);
  if (snap.res) applyResources(snap.res);
  if (snap.eco) {
    state.minerals = snap.eco.m;
    state.vespene = snap.eco.v;
    state.armyMax = snap.eco.max;
    updateHud();
  }
  if (snap.upg) {
    Object.assign(upgrades, snap.upg[0]);
    Object.assign(botUpgrades, snap.upg[1]);
  }
  return added;
}

// Плавное движение между снимками
const _target = new THREE.Vector3();
export function tickGuestView(dt) {
  const k = Math.min(1, dt * 10);
  for (const u of unitProxies.values()) {
    const n = u._net;
    if (!n || !u.mesh) continue;
    _target.set(n.x, n.y, n.z);
    if (u.mesh.position.distanceToSquared(_target) > 25) u.mesh.position.copy(_target);
    else u.mesh.position.lerp(_target, k);
    let d = n.ry - u.mesh.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    u.mesh.rotation.y += d * k;
  }
}

export function guestViewActive() {
  return session.role === 'guest' && !!viewScene;
}
