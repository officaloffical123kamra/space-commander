// js/economy.js
import * as THREE from 'three';
import { units, makeHpBar, drawHpBar } from './units.js';
import { getModel, hasModel } from './models.js';
import { getHeight } from './terrain.js';
import { drawMineralLabel, drawGasLabel } from './scene.js';
import { findNearestMineralPatch, findNearestCC } from './world.js';
import { session, ctrlOf, tintFor } from './session.js';
import { assignId } from './ids.js';

// Поле может опустеть — тогда рабочий ищет следующее не дальше этого
const MINERAL_SEARCH_RADIUS = 20;

export const state = {
  minerals: 1000,
  vespene: 1000,
  armyUsed: 0,
  armyMax: 20,
  mineralsEl: null,
  vespeneEl: null,
  armyEl: null
};

// Ресурсы второго игрока (игра по сети). У хоста/одиночной игры — state.
// У друга на его компьютере state заполняется данными с хоста.
export const state2 = {
  minerals: 1000,
  vespene: 1000,
  armyUsed: 0,
  armyMax: 20
};

// Кошелёк управляющего: 'p1' → state, 'p2' → state2, бот — null
export function getEco(ctrl) {
  if (ctrl === 'p1') return state;
  if (ctrl === 'p2') return state2;
  return null;
}

export function updateHud() {
  if (state.mineralsEl) state.mineralsEl.textContent = Math.floor(state.minerals);
  if (state.vespeneEl)  state.vespeneEl.textContent  = Math.floor(state.vespene);
  updateArmyHud();
}

export function countArmy(ctrl) {
  let used = 0;
  for (const u of units) {
    if (u.hp > 0 && !u.dead && ctrlOf(u) === ctrl) used++;
  }
  return used;
}

export function updateArmyHud() {
  const used = countArmy(session.localCtrl);
  state.armyUsed = used;
  if (state.armyEl) state.armyEl.textContent = `${used} / ${state.armyMax}`;
}

export function hasArmyRoom(ctrl = 'p1') {
  const eco = getEco(ctrl);
  if (!eco) return true;
  return countArmy(ctrl) < eco.armyMax;
}

export function addArmyMax(amount, ctrl = 'p1') {
  const eco = getEco(ctrl);
  if (!eco) return;
  eco.armyMax += amount;
  updateArmyHud();
}

function makeCarryCrystal(color = 0x4ea6ff) {
  const geo = new THREE.ConeGeometry(0.15, 0.3, 5);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    flatShading: true
  });
  const crystal = new THREE.Mesh(geo, mat);
  crystal.visible = false;
  return crystal;
}

export function createWorker(scene, cc, minerals, isPlayer = true, startX = null, ctrl = null) {
  if (!ctrl) ctrl = (cc && cc.ctrl) || (isPlayer ? 'p1' : 'ai');
  const tint = tintFor(isPlayer ? 'player' : 'bot', ctrl);
  let mesh;

  if (hasModel('scv')) {
    mesh = getModel('scv', 0.9);
  } else {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: isPlayer ? 0xffcc33 : 0xff8844 })
    );
  }

  // Свои материалы у каждого рабочего: иначе вспышка урона
  // (и перекраска) действовала бы на всех КСМ сразу
  mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material = child.material.clone();
      if (tint !== null && child.material.color) {
        child.material.color.lerp(new THREE.Color(tint), 0.4);
      }
    }
  });

  const sx = startX !== null ? startX : cc.x + 2;
  const groundH = getHeight(sx, cc.z);
  mesh.position.set(sx, groundH + 0.3, cc.z);
  mesh.rotation.y = Math.PI;
  scene.add(mesh);

  const hpBar = makeHpBar();
  hpBar.position.y = 1.0;
  hpBar.scale.set(0.9, 0.12, 1);
  mesh.add(hpBar);

  const carryMineral = makeCarryCrystal(0x4ea6ff);
  carryMineral.position.set(0.45, 0.55, 0);
  mesh.add(carryMineral);

  const carryGas = makeCarryCrystal(0x22ff88);
  carryGas.position.set(0.45, 0.55, 0);
  mesh.add(carryGas);

  const worker = {
    isUnit: true,
    mesh,
    cc,
    minerals: minerals || null,
    refinery: null,
    isPlayer,
    isWorker: true,
    type: 'scv',
    owner: isPlayer ? 'player' : 'bot',
    ctrl,
    hp: 40,
    maxHp: 40,
    state: 'to_minerals',
    timer: 0,
    miningTime: 2.0,
    speed: 4,
    target: null,
    attackTarget: null,
    goingToBunker: null,
    inBunker: null,
    moveTarget: null,
    hpBar,
    carryMineral,
    carryGas,
    carrying: null,
    walkPhase: Math.random() * Math.PI * 2,
    construction: null,
    repairJob: null,
  };

  if (!worker.minerals) worker.state = 'idle';
  drawHpBar(worker);
  assignId(worker);
  units.push(worker);
  return worker;
}

// Куда сдавать ресурсы: свой КЦ, а если он разрушен — ближайший живой
function getHomeCC(worker) {
  if (worker.cc && worker.cc.hp > 0) return worker.cc;
  const p = worker.mesh.position;
  worker.cc = findNearestCC(p.x, p.z, worker.owner);
  return worker.cc;
}

export function updateWorker(worker, dt) {
  if (!worker || !worker.mesh || worker.dead) return;
  const { mesh, speed } = worker;

  function showCarry(type) {
    if (worker.carryMineral) worker.carryMineral.visible = (type === 'mineral');
    if (worker.carryGas)     worker.carryGas.visible     = (type === 'gas');
    worker.carrying = type;
  }

  function hideCarry() {
    if (worker.carryMineral) worker.carryMineral.visible = false;
    if (worker.carryGas)     worker.carryGas.visible = false;
    worker.carrying = null;
  }

  function applyH() {
    if (worker.inBunker) return;
    const h = getHeight(mesh.position.x, mesh.position.z);
    mesh.position.y = h + 0.3;
  }

  function stepTowards(tx, tz) {
    if (typeof tx !== 'number' || typeof tz !== 'number') return true;
    if (isNaN(tx) || isNaN(tz)) return true;
    const dx = tx - mesh.position.x;
    const dz = tz - mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.5) return true;
    const step = speed * dt;
    if (step >= dist) {
      mesh.position.x = tx;
      mesh.position.z = tz;
      applyH();
      return true;
    }
    mesh.position.x += (dx / dist) * step;
    mesh.position.z += (dz / dist) * step;
    mesh.position.x = Math.max(-28, Math.min(28, mesh.position.x));
    mesh.position.z = Math.max(-28, Math.min(28, mesh.position.z));
    applyH();

    worker.walkPhase += dt * speed * 2.0;
    mesh.rotation.z = Math.sin(worker.walkPhase) * 0.05;

    const targetAngle = Math.atan2(dx, dz) + Math.PI;
    const currentAngle = mesh.rotation.y || 0;
    let diff = targetAngle - currentAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    mesh.rotation.y += diff * Math.min(1, dt * 10);

    return false;
  }

  // === РЕМОНТ: только двигаем к цели ===
  if (worker.repairJob) {
    if (worker.moveTarget) {
      const done = stepTowards(worker.moveTarget.x, worker.moveTarget.z);
      if (done) worker.moveTarget = null;
    }
    return;
  }

  // === СТРОЙКА: тоже двигаем к цели ===
  if (worker.construction) {
    if (worker.moveTarget) {
      const done = stepTowards(worker.moveTarget.x, worker.moveTarget.z);
      if (done) worker.moveTarget = null;
    }
    return;
  }

  // === Свободный moveTarget ===
  if (worker.moveTarget) {
    if (stepTowards(worker.moveTarget.x, worker.moveTarget.z)) {
      worker.moveTarget = null;
    }
    return;
  }

  // Рефайнери уничтожена — назад на минералы
  if (worker.refinery && worker.refinery.hp <= 0) {
    worker.refinery = null;
    backToMinerals();
    return;
  }

  // Поле минералов опустело — переходим на ближайшее непустое
  function backToMinerals() {
    const p = mesh.position;
    if (!worker.minerals || worker.minerals.amount <= 0) {
      worker.minerals = findNearestMineralPatch(p.x, p.z, MINERAL_SEARCH_RADIUS);
    }
    worker.state = worker.minerals ? 'to_minerals' : 'idle';
  }

  // === ГАЗ ===
  if (worker.state.startsWith('gas')) {
    if (!worker.refinery) { backToMinerals(); return; }

    const gy = worker.refinery.geyser;
    const r = worker.refinery.mesh.position;

    if (worker.state === 'gas_to') {
      hideCarry();
      if (gy && gy.amount !== undefined && gy.amount <= 0) {
        worker.refinery = null;
        backToMinerals();
        return;
      }
      if (stepTowards(r.x, r.z)) { worker.state = 'gas_mining'; worker.timer = 2.5; }
    } else if (worker.state === 'gas_mining') {
      worker.timer -= dt;
      if (worker.timer <= 0) {
        if (gy && gy.amount !== undefined) {
          if (gy.amount <= 0) {
            if (gy.group && !gy._removed) {
              gy.group.visible = false;
              gy._removed = true;
            }
            worker.refinery = null;
            backToMinerals();
            return;
          }
          gy.amount -= 6;
          if (gy.amount <= 0) {
            gy.amount = 0;
            if (gy.group && !gy._removed) {
              gy.group.visible = false;
              gy._removed = true;
            }
          }
          if (typeof drawGasLabel === 'function') {
            drawGasLabel(gy);
          }
        }
        worker.state = 'gas_to_cc';
        showCarry('gas');
      }
    } else if (worker.state === 'gas_to_cc') {
      const cc = getHomeCC(worker);
      if (!cc) { worker.state = 'idle'; return; }
      if (stepTowards(cc.x + 2, cc.z)) {
        const eco = getEco(worker.ctrl);
        if (eco) { eco.vespene += 6; if (eco === state) updateHud(); }
        else if (worker.onDeliverGas) worker.onDeliverGas(6);
        worker.state = 'gas_to';
        hideCarry();
      }
    }
    return;
  }

  // === МИНЕРАЛЫ ===
  if (worker.state === 'to_minerals') {
    if (!worker.minerals || typeof worker.minerals.x !== 'number' || worker.minerals.amount <= 0) {
      worker.minerals = null;
      backToMinerals();
      return;
    }
    hideCarry();
    if (stepTowards(worker.minerals.x, worker.minerals.z)) {
      worker.state = 'mining';
      worker.timer = worker.miningTime;
    }
  }
  else if (worker.state === 'mining') {
    worker.timer -= dt;
    if (worker.timer <= 0) {
      const mp = worker.minerals;
      if (mp && mp.amount !== undefined) {
        if (mp.amount <= 0) {
          if (mp.group && !mp._removed) {
            mp.group.visible = false;
            mp._removed = true;
          }
          worker.target = null;
          worker.minerals = null;
          backToMinerals();
          return;
        }
        mp.amount -= 8;
        if (mp.amount <= 0) {
          mp.amount = 0;
          if (mp.group && !mp._removed) {
            mp.group.visible = false;
            mp._removed = true;
          }
        }
        if (typeof drawMineralLabel === 'function') {
          drawMineralLabel(mp);
        }
      }
      worker.state = 'to_cc';
      showCarry('mineral');
    }
  }
  else if (worker.state === 'to_cc') {
    const cc = getHomeCC(worker);
    if (!cc) { worker.state = 'idle'; return; }
    if (stepTowards(cc.x + 2, cc.z)) {
      const eco = getEco(worker.ctrl);
      if (eco) { eco.minerals += 8; if (eco === state) updateHud(); }
      else if (worker.onDeliver) worker.onDeliver(8);
      worker.state = 'to_minerals';
      hideCarry();
    }
  }
}

export function orderMove(worker, x, z) {
  if (!worker) return;
  worker.refinery = null;
  worker.state = 'idle';
  worker.target = null;
  worker.moveTarget = { x, z };
}

export function orderMineMinerals(worker, minerals) {
  if (!worker) return;
  worker.refinery = null;
  worker.moveTarget = null;
  worker.minerals = minerals;
  worker.state = 'to_minerals';
  worker.target = null;
}

export function orderMineGas(worker, refinery) {
  if (!worker) return;
  worker.moveTarget = null;
  worker.refinery = refinery;
  worker.state = 'gas_to';
  worker.target = null;
}

export function assignWorkerToRefinery(worker, refinery) {
  orderMineGas(worker, refinery);
}