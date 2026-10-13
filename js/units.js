// js/units.js
import * as THREE from 'three';
import { playSound } from './audio.js';
import { getModel, hasModel } from './models.js';
import { getHeight, isInChasm } from './terrain.js';
import { buildings as worldBuildings, commandCenters as worldCCs } from './world.js';
import { getWeaponBonus, getArmorReduction } from './upgrades.js';

export const units = [];

// Статистика матча (для достижения «Без потерь»)
export const combatStats = { playerUnitsLost: 0 };

let buildingsProvider = null;
export function setBuildingsProvider(fn) { buildingsProvider = fn; }

function getAllBuildings() {
  if (buildingsProvider) return buildingsProvider();
  return worldBuildings.concat(worldCCs);
}

export const UNIT_PRESETS = {
  marine:    { name: 'Боец',     color: 0x3366ff, hp: 100, attack: 10, attackRange: 2.0, attackSpeed: 1.0, speed: 4, size: 0.8, sight: 8,  yawOffset: Math.PI,
               cost: { minerals: 50, vespene: 0 } },
  marauder:  { name: 'Мародёр',  color: 0x2255cc, hp: 160, attack: 20, attackRange: 2.5, attackSpeed: 1.2, speed: 3.2, size: 0.9, sight: 8,  yawOffset: Math.PI,
               cost: { minerals: 75, vespene: 25 } },
  ghost:     { name: 'Призрак',  color: 0x44aaff, hp: 90,  attack: 35, attackRange: 3.0, attackSpeed: 1.5, speed: 4, size: 0.75, sight: 10, yawOffset: Math.PI,
               isInvisible: true, superShot: { damage: 50, range: 7.0, cooldown: 8.0, cost: 25 },
               cost: { minerals: 100, vespene: 50 } },
  medic:     { name: 'Медик',    color: 0xffffff, hp: 80,  attack: 0,  attackRange: 0,   attackSpeed: 1.0, speed: 4, size: 0.75, sight: 7, yawOffset: Math.PI,
               isHealer: true, healAmount: 7, healRange: 2.5, healCooldown: 1.0,
               cost: { minerals: 75, vespene: 0 } },
  hellion:   { name: 'Гелион',   color: 0xff7733, hp: 90,  attack: 8,  attackRange: 2.2, attackSpeed: 0.8, speed: 6, size: 0.75, sight: 8, yawOffset: Math.PI,
               cost: { minerals: 100, vespene: 0 } },
  tank:      { name: 'Танк',     color: 0x557733, hp: 250, attack: 30, attackRange: 4.0, attackSpeed: 2.0, speed: 2.5, size: 1.1, sight: 10, yawOffset: Math.PI,
               siege: { attack: 60, attackRange: 7.0, attackSpeed: 2.5, speed: 0 },
               cost: { minerals: 150, vespene: 100 } },
  thor:      { name: 'Тор',      color: 0x995533, hp: 400, attack: 60, attackRange: 4.5, attackSpeed: 2.0, speed: 1.8, size: 1.4, sight: 10, yawOffset: Math.PI,
               cost: { minerals: 300, vespene: 200 } },
  viking:    { name: 'Викинг',   color: 0xff8855, hp: 130, attack: 20, attackRange: 2.5, attackSpeed: 1.2, speed: 4, size: 0.9, sight: 9, yawOffset: Math.PI,
               flying: false,
               transform: {
                 ground: { attack: 20, attackRange: 2.5, attackSpeed: 1.2, speed: 4, flying: false, baseY: 0.45, color: 0xff8855, sight: 9 },
                 air:    { attack: 15, attackRange: 3.5, attackSpeed: 1.5, speed: 5, flying: true,  baseY: 2.5,  color: 0x88aaff, sight: 11 }
               },
               cost: { minerals: 125, vespene: 75 } },
  banshee:   { name: 'Банши',    color: 0xcc66cc, hp: 140, attack: 25, attackRange: 4.0, attackSpeed: 1.3, speed: 4.5, size: 1.0, sight: 10, yawOffset: Math.PI,
               flying: true, isInvisible: true,
               cost: { minerals: 150, vespene: 100 } },
  battlecruiser: { name: 'Крейсер', color: 0xdddddd, hp: 550, attack: 50, attackRange: 5.0, attackSpeed: 2.0, speed: 2.2, size: 1.8, sight: 11, yawOffset: Math.PI,
               flying: true,
               cost: { minerals: 400, vespene: 300 } }
};

const FLY_HEIGHT = 2.5;
const MAP_LIMIT = 28;
const RETARGET_INTERVAL = 0.25;  // как часто юнит ищет новую цель (сек)
const REVEAL_TIME = 1.5;         // невидимка заметна столько секунд после выстрела

// ============================================================
// ПРИОРИТЕТЫ ЦЕЛЕЙ
// Чем больше число — тем важнее цель.
// ============================================================
const TARGET_PRIORITY = {
  attackerUnit: 100,
  bunker: 90,
  turret: 90,
  productionBuilding: 60,
  supportUnit: 40,
  normalBuilding: 30,
  worker: 10,
  commandCenter: 5,
};

// Если рабочий ближе этого расстояния — атакуем его, даже если приоритет низкий
const WORKER_CLOSE_RANGE = 4.0;

export function isUnit(obj) {
  return !!(obj && obj.isUnit);
}

export function ownerOf(obj) {
  if (!obj) return null;
  if (obj.isUnit) return obj.isPlayer ? 'player' : 'bot';
  return obj.owner || 'player';
}

function getTargetPriority(target) {
  if (!target) return 0;

  if (target.isUnit) {
    if (target.inBunker) return 0;
    if (target.isWorker) return TARGET_PRIORITY.worker;
    if (target.isHealer) return TARGET_PRIORITY.supportUnit;
    return TARGET_PRIORITY.attackerUnit;
  }

  if (target.type) {
    if (target.type === 'bunker') return TARGET_PRIORITY.bunker;
    if (target.type === 'turret') return TARGET_PRIORITY.turret;
    if (target.type === 'cc') return TARGET_PRIORITY.commandCenter;
    if (target.type === 'barracks' || target.type === 'factory' || target.type === 'starport') {
      return TARGET_PRIORITY.productionBuilding;
    }
    return TARGET_PRIORITY.normalBuilding;
  }

  return 0;
}

function clampPosition(pos) {
  pos.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, pos.x));
  pos.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, pos.z));
  if (isInChasm(pos.x, pos.z)) return { blocked: true };
  return { blocked: false };
}

function applyTerrainHeight(unit) {
  if (!unit || !unit.mesh) return;
  if (unit.isFlying) return;
  const h = getHeight(unit.mesh.position.x, unit.mesh.position.z);
  unit.baseY = h + unit.size / 2;
}

function faceTo(unit, targetX, targetZ, dt) {
  if (!unit || !unit.mesh) return;
  const dx = targetX - unit.mesh.position.x;
  const dz = targetZ - unit.mesh.position.z;
  if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) return;

  const yawOffset = (unit.baseData && unit.baseData.yawOffset) || 0;
  const targetAngle = Math.atan2(dx, dz) + yawOffset;

  const currentAngle = unit.mesh.rotation.y || 0;
  let diff = targetAngle - currentAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  unit.mesh.rotation.y += diff * Math.min(1, dt * 10);
}

export function makeHpBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 8;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(1.2, 0.15, 1);
  sprite.position.y = 1.0;
  sprite.userData = { canvas, ctx, texture };
  return sprite;
}

// Рисует полоску HP и для юнитов, и для зданий
export function drawHpBar(obj) {
  try {
    if (!obj || !obj.hpBar || !obj.hpBar.userData) return;
    const { canvas, ctx, texture } = obj.hpBar.userData;
    if (!canvas || !ctx || !texture) return;
    const ratio = Math.max(0, Math.min(1, obj.hp / obj.maxHp));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = obj.isUnit ? '#000' : 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillStyle = ratio > 0.5 ? '#44dd44' : ratio > 0.25 ? '#ddaa22' : '#dd3333';
    ctx.fillRect(1, 1, 62 * ratio, 6);
    texture.needsUpdate = true;
  } catch (err) {}
}

export function makeUnit(scene, x, z, typeOrColor, isPlayer = true, presetName = 'marine') {
  let preset;
  if (typeof typeOrColor === 'number') {
    preset = { ...UNIT_PRESETS.marine, color: typeOrColor };
  } else {
    preset = UNIT_PRESETS[typeOrColor] || UNIT_PRESETS.marine;
  }

  const size = preset.size;
  let mesh;

  if (hasModel(presetName)) {
    mesh = getModel(presetName, size * 1.4);
    mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        if (!isPlayer) {
          child.material.color.lerp(new THREE.Color(0xaa3333), 0.4);
        }
        // Невидимкам нужна прозрачность, иначе opacity не работает
        if (preset.isInvisible) child.material.transparent = true;
      }
    });
  } else {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ color: preset.color, transparent: true, opacity: 1 })
    );
  }

  const groundH = preset.flying ? 0 : getHeight(x, z);
  const baseY = preset.flying ? FLY_HEIGHT : groundH + size / 2;
  mesh.position.set(x, baseY, z);
  scene.add(mesh);

  const hpBar = makeHpBar();
  hpBar.position.y = size + 0.3;
  mesh.add(hpBar);

  const unit = {
    isUnit: true,
    mesh, hpBar,
    type: presetName,
    name: preset.name,
    owner: isPlayer ? 'player' : 'bot',
    target: null,
    attackTarget: null,
    hp: preset.hp,
    maxHp: preset.hp,
    attack: preset.attack,
    attackRange: preset.attackRange,
    attackCooldown: 0,
    attackSpeed: preset.attackSpeed,
    speed: preset.speed,
    sight: preset.sight || 8,
    isPlayer,
    isWorker: false,
    inBunker: null,
    goingToBunker: null,
    autoAttackDisabled: false,
    isFlying: !!preset.flying,
    baseY: baseY,
    size: size,
    canSiege: !!preset.siege,
    sieged: false,
    siegeData: preset.siege || null,
    canTransform: !!preset.transform,
    transformData: preset.transform || null,
    inAirForm: !!preset.flying,
    isInvisible: !!preset.isInvisible,
    revealTimer: 0,
    isHealer: !!preset.isHealer,
    healAmount: preset.healAmount || 0,
    healRange: preset.healRange || 0,
    healCooldown: preset.healCooldown || 0,
    healTimer: 0,
    superShot: preset.superShot || null,
    superShotTimer: 0,
    flashTimer: 0,
    damageFlashTimer: 0,
    retargetTimer: Math.random() * RETARGET_INTERVAL,
    walkPhase: Math.random() * Math.PI * 2,
    recoilTimer: 0,
    baseData: {
      attack: preset.attack, attackRange: preset.attackRange,
      attackSpeed: preset.attackSpeed, speed: preset.speed,
      isFlying: !!preset.flying, baseY: baseY, sight: preset.sight || 8,
      yawOffset: preset.yawOffset || 0
    }
  };

  drawHpBar(unit);
  units.push(unit);
  return unit;
}

function isAlive(u) {
  return !!(u && u.mesh && u.hp > 0 && !u.dead);
}

// ============================================================
// ДЕТЕКТОРЫ НЕВИДИМОСТИ
// ============================================================

// { x, z, range, owner, source } — source: здание-детектор
export const detectors = [];

export function isDetectedBy(owner, pos) {
  for (const d of detectors) {
    if (d.owner !== owner) continue;
    if (d.source && d.source.hp <= 0) continue;
    const dx = d.x - pos.x;
    const dz = d.z - pos.z;
    if (dx * dx + dz * dz < d.range * d.range) return true;
  }
  return false;
}

// Скрыт ли юнит от глаз владельца viewerOwner (невидимка без детекции)
export function isHiddenFrom(unit, viewerOwner) {
  if (!unit || !unit.isUnit || !unit.isInvisible) return false;
  if (ownerOf(unit) === viewerOwner) return false;
  if (unit.revealTimer > 0) return false;
  return !isDetectedBy(viewerOwner, unit.mesh.position);
}

function cleanupDetectors() {
  for (let i = detectors.length - 1; i >= 0; i--) {
    if (detectors[i].source && detectors[i].source.hp <= 0) detectors.splice(i, 1);
  }
}

/**
 * Поиск цели с приоритетами в радиусе обзора.
 * Приоритет важнее расстояния, но далёкие цели вне обзора не рассматриваются
 * (иначе юнит «видел» врага на другом конце карты и игнорировал соседей).
 */
function findNearestEnemy(unit) {
  let best = null;
  let bestScore = -Infinity;

  const myOwner = ownerOf(unit);
  const pos = unit.mesh.position;
  const sight = unit.sight || 8;

  for (const other of units) {
    if (!other || !other.mesh || other === unit) continue;
    if (other.isPlayer === unit.isPlayer) continue;
    if (other.inBunker || other.hp <= 0) continue;
    if (isHiddenFrom(other, myOwner)) continue;

    const d = pos.distanceTo(other.mesh.position);
    if (d > sight) continue;
    if (other.isWorker && d > WORKER_CLOSE_RANGE) continue;

    const score = getTargetPriority(other) * 10 - d;
    if (score > bestScore) { bestScore = score; best = other; }
  }

  for (const b of getAllBuildings()) {
    if (!b || !b.mesh || b.hp <= 0) continue;
    if ((b.owner || 'player') === myOwner) continue;
    const d = pos.distanceTo(b.mesh.position);
    if (d > sight + 1.5) continue;
    const score = getTargetPriority(b) * 10 - d;
    if (score > bestScore) { bestScore = score; best = b; }
  }

  return best;
}

function findNearestWoundedAlly(unit) {
  let best = null;
  let bestDist = Infinity;
  for (const other of units) {
    if (!other || !other.mesh) continue;
    if (other === unit) continue;
    if (other.isPlayer !== unit.isPlayer) continue;
    if (other.isHealer) continue;
    if (other.hp >= other.maxHp || other.hp <= 0) continue;
    if (other.inBunker) continue;
    const mechanical = ['hellion','tank','thor','viking','banshee','battlecruiser'].includes(other.type);
    if (mechanical) continue;
    const d = unit.mesh.position.distanceTo(other.mesh.position);
    if (d < bestDist) { bestDist = d; best = other; }
  }
  return best;
}

// ============================================================
// ВСПЫШКИ (выстрел / попадание)
// ============================================================

function setFlash(unit, hex, intensity) {
  unit.mesh.traverse((child) => {
    const m = child.material;
    if (!child.isMesh || !m || !m.emissive) return;
    if (m._origEmissive === undefined) {
      m._origEmissive = m.emissive.getHex();
      m._origEI = m.emissiveIntensity;
    }
    m.emissive.setHex(hex);
    m.emissiveIntensity = intensity;
  });
}

function clearFlash(unit) {
  unit.mesh.traverse((child) => {
    const m = child.material;
    if (!child.isMesh || !m || !m.emissive || m._origEmissive === undefined) return;
    m.emissive.setHex(m._origEmissive);
    m.emissiveIntensity = m._origEI;
  });
}

function flashShoot(unit) {
  if (!unit || !unit.mesh) return;
  setFlash(unit, 0xffcc00, 1.5);
  unit.flashTimer = 0.1;
}

function flashDamage(unit) {
  if (!unit || !unit.mesh || !unit.isUnit || unit.dead) return;
  setFlash(unit, 0xff2200, 1.2);
  unit.damageFlashTimer = 0.12;
}

function updateFlash(unit, dt) {
  if (!unit || !unit.mesh) return;
  if (unit.flashTimer > 0) {
    unit.flashTimer -= dt;
    if (unit.flashTimer <= 0 && unit.damageFlashTimer <= 0) clearFlash(unit);
  }
  if (unit.damageFlashTimer > 0) {
    unit.damageFlashTimer -= dt;
    if (unit.damageFlashTimer <= 0 && unit.flashTimer <= 0) clearFlash(unit);
  }
}

// ============================================================
// УРОН И СМЕРТЬ
// ============================================================

function playDeathAnimation(unit, scene) {
  if (!unit || !unit.mesh) return;
  const mesh = unit.mesh;
  if (!mesh.visible) {
    scene.remove(mesh);
    return;
  }
  const startY = mesh.position.y;
  const startTime = performance.now();
  const duration = 400;

  function animStep() {
    const t = Math.min(1, (performance.now() - startTime) / duration);
    mesh.rotation.z = t * Math.PI * 0.7;
    mesh.scale.setScalar(1 - t * 0.5);
    mesh.position.y = startY - t * 0.3;
    if (t < 1) requestAnimationFrame(animStep);
    else scene.remove(mesh);
  }
  requestAnimationFrame(animStep);
}

// Единая точка смерти юнита: убирает из всех списков, чтобы не оставалось «зомби»
export function killUnit(scene, u) {
  if (!u || u.dead) return;
  u.dead = true;
  u.hp = 0;
  if (u.isPlayer) combatStats.playerUnitsLost++;
  playSound(u.type + '_death');

  for (const other of units) {
    if (other && other.attackTarget === u) other.attackTarget = null;
  }
  if (u.inBunker && u.inBunker.garrison) {
    const gi = u.inBunker.garrison.indexOf(u);
    if (gi >= 0) u.inBunker.garrison.splice(gi, 1);
  }

  const idx = units.indexOf(u);
  if (idx >= 0) units.splice(idx, 1);
  playDeathAnimation(u, scene);
}

function destroyBuilding(scene, b) {
  b.hp = 0;
  if (b.mesh) {
    try { scene.remove(b.mesh); } catch (err) {}
  }
  for (const other of units) {
    if (other && other.attackTarget === b) other.attackTarget = null;
  }
}

/**
 * Нанести урон с учётом улучшений оружия и брони.
 * Возвращает true, если цель уничтожена.
 */
export function dealDamage(scene, attacker, target, baseDamage) {
  if (!target || target.hp <= 0 || target.dead) return false;

  let dmg = baseDamage;
  if (attacker && attacker.isUnit) dmg += getWeaponBonus(attacker.type, ownerOf(attacker));
  if (target.isUnit) dmg -= getArmorReduction(target.type, ownerOf(target));
  dmg = Math.max(1, dmg);

  target.hp -= dmg;
  drawHpBar(target);
  if (target.isUnit) flashDamage(target);

  if (target.hp <= 0) {
    if (target.isUnit) killUnit(scene, target);
    else destroyBuilding(scene, target);
    return true;
  }
  return false;
}

// ============================================================
// ТРАССЕРЫ
// ============================================================

const tracers = [];
export function spawnTracer(scene, from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const mat = new THREE.LineBasicMaterial({
    color: color || 0xffcc00,
    transparent: true,
    opacity: 0.95
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracers.push({ line, life: 0.12 });
}

if (typeof window !== 'undefined') {
  window.__spawnTracer = spawnTracer;
}

function updateTracers(scene, dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.12) * 0.95;
    if (t.life <= 0) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
}

// ============================================================
// АНИМАЦИИ ДВИЖЕНИЯ
// ============================================================

function updateWalkAnim(unit, dt) {
  if (!unit || !unit.mesh) return;
  const baseY = unit.baseY;
  const moving = !!(unit.target && unit.speed > 0);

  if (moving && !unit.isFlying) {
    unit.walkPhase += dt * unit.speed * 2.0;
    const swing = Math.sin(unit.walkPhase) * 0.05;
    unit.mesh.position.y = baseY + Math.abs(swing);
    unit.mesh.rotation.z = Math.sin(unit.walkPhase) * 0.04;
  } else if (moving && unit.isFlying) {
    unit.walkPhase += dt * 1.5;
    unit.mesh.position.y = baseY + Math.sin(unit.walkPhase) * 0.15;
    unit.mesh.rotation.z = Math.sin(unit.walkPhase * 0.7) * 0.05;
  } else {
    unit.mesh.rotation.z *= 0.85;
    const dy = unit.baseY - unit.mesh.position.y;
    if (Math.abs(dy) > 0.001) {
      unit.mesh.position.y += dy * Math.min(1, dt * 8);
    }
  }
}

function applyRecoil(unit) {
  if (!unit || !unit.mesh) return;
  unit.recoilTimer = 0.15;
}

function updateRecoil(unit, dt) {
  if (!unit || !unit.mesh) return;
  if (unit.recoilTimer > 0) {
    unit.recoilTimer -= dt;
    const t = Math.max(0, unit.recoilTimer / 0.15);
    unit.mesh.position.y = unit.baseY + t * 0.08;
  }
}

function separateUnits() {
  const minDist = 0.85;
  const minDistSq = minDist * minDist;

  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (!a || !a.mesh || a.hp <= 0 || a.inBunker) continue;

    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (!b || !b.mesh || b.hp <= 0 || b.inBunker) continue;
      if (!!a.isFlying !== !!b.isFlying) continue;

      const dx = b.mesh.position.x - a.mesh.position.x;
      const dz = b.mesh.position.z - a.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > minDistSq || d2 < 0.0001) continue;

      const d = Math.sqrt(d2);
      const overlap = (minDist - d) * 0.5;
      const nx = dx / d;
      const nz = dz / d;

      a.mesh.position.x -= nx * overlap;
      a.mesh.position.z -= nz * overlap;
      b.mesh.position.x += nx * overlap;
      b.mesh.position.z += nz * overlap;

      clampPosition(a.mesh.position);
      clampPosition(b.mesh.position);
    }
  }
}

function updateCloakLook(u) {
  const cloaked = u.isInvisible && u.revealTimer <= 0;
  if (u._cloakShown === cloaked) return;
  u._cloakShown = cloaked;
  u.mesh.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.transparent = true;
      child.material.opacity = cloaked ? 0.4 : 1.0;
    }
  });
}

const _tmpDir = new THREE.Vector3();

function moveTowards(u, tx, tz, dt) {
  _tmpDir.set(tx - u.mesh.position.x, 0, tz - u.mesh.position.z);
  const len = _tmpDir.length();
  if (len < 0.0001) return len;
  _tmpDir.multiplyScalar(1 / len);
  u.mesh.position.addScaledVector(_tmpDir, Math.min(len, u.speed * dt));
  return len;
}

export function updateUnits(scene, dt) {
  cleanupDetectors();

  const snapshot = units.slice();
  for (const u of snapshot) {
    if (!isAlive(u)) continue;
    if (u.revealTimer > 0) u.revealTimer -= dt;
    if (u.isInvisible) updateCloakLook(u);

    if (u.isWorker) continue;
    if (u.inBunker) continue;

    updateFlash(u, dt);
    updateWalkAnim(u, dt);
    updateRecoil(u, dt);

    if (u.goingToBunker) {
      if (u.target) {
        const left = Math.hypot(u.target.x - u.mesh.position.x, u.target.z - u.mesh.position.z);
        if (left < 0.3) u.target = null;
        else {
          moveTowards(u, u.target.x, u.target.z, dt);
          clampPosition(u.mesh.position);
          applyTerrainHeight(u);
          faceTo(u, u.target.x, u.target.z, dt);
        }
      }
      continue;
    }

    if (u.superShotTimer > 0) u.superShotTimer -= dt;

    if (u.isHealer) {
      if (u.healTimer > 0) u.healTimer -= dt;
      const wounded = u.healTimer <= 0 ? findNearestWoundedAlly(u) : null;
      if (wounded) {
        const d = u.mesh.position.distanceTo(wounded.mesh.position);
        if (d < u.healRange) {
          wounded.hp = Math.min(wounded.maxHp, wounded.hp + u.healAmount);
          drawHpBar(wounded);
          u.healTimer = u.healCooldown;
          if (u.isPlayer) playSound('medic_heal');
          faceTo(u, wounded.mesh.position.x, wounded.mesh.position.z, dt);
        }
      }
      if (u.target) {
        const left = Math.hypot(u.target.x - u.mesh.position.x, u.target.z - u.mesh.position.z);
        if (left < 0.3) u.target = null;
        else {
          moveTowards(u, u.target.x, u.target.z, dt);
          clampPosition(u.mesh.position);
          applyTerrainHeight(u);
          faceTo(u, u.target.x, u.target.z, dt);
        }
      }
      continue;
    }

    if (u.attackCooldown > 0) u.attackCooldown -= dt;

    // Проверка текущей цели
    if (u.attackTarget) {
      const t = u.attackTarget;
      const valid = t.mesh && t.hp > 0 && !t.dead &&
        (!t.isUnit || (!t.inBunker && !isHiddenFrom(t, ownerOf(u))));
      if (!valid) u.attackTarget = null;
    }

    // Поиск/смена цели — не каждый кадр, а раз в RETARGET_INTERVAL
    u.retargetTimer -= dt;
    if (u.retargetTimer <= 0 && !u.autoAttackDisabled) {
      u.retargetTimer = RETARGET_INTERVAL;
      const best = findNearestEnemy(u);
      if (best) {
        const cur = u.attackTarget;
        if (!cur) {
          u.attackTarget = best;
        } else if (!cur.isUnit && best.isUnit) {
          // Целились в здание, а рядом появился юнит
          u.attackTarget = best;
        } else if (cur.isUnit && cur.isWorker && best !== cur && !(best.isUnit && best.isWorker)) {
          // Били рабочего, а рядом цель поважнее
          u.attackTarget = best;
        }
      }
    }

    if (u.attackTarget) {
      const target = u.attackTarget;
      faceTo(u, target.mesh.position.x, target.mesh.position.z, dt);

      const dist = Math.hypot(
        target.mesh.position.x - u.mesh.position.x,
        target.mesh.position.z - u.mesh.position.z
      );
      const isBuilding = !target.isUnit;
      const effectiveRange = u.attackRange + (isBuilding ? 1.5 : 0);

      if (dist > effectiveRange) {
        if (u.speed > 0) {
          moveTowards(u, target.mesh.position.x, target.mesh.position.z, dt);
          clampPosition(u.mesh.position);
          applyTerrainHeight(u);
        }
      } else if (u.attackCooldown <= 0 && u.attack > 0) {
        flashShoot(u);
        applyRecoil(u);
        if (u.isInvisible) u.revealTimer = REVEAL_TIME;

        const startPos = u.mesh.position.clone();
        startPos.y += 0.3;
        const endPos = target.mesh.position.clone();
        endPos.y += 0.3;
        spawnTracer(scene, startPos, endPos, u.isPlayer ? 0x66ccff : 0xff6644);

        if (u.isPlayer) playSound(u.type + '_shoot');
        u.attackCooldown = u.attackSpeed;

        dealDamage(scene, u, target, u.attack);
      }
      continue;
    }

    if (!u.target) continue;
    if (u.speed <= 0) { u.target = null; continue; }

    const left = Math.hypot(u.target.x - u.mesh.position.x, u.target.z - u.mesh.position.z);
    if (left < 0.3) {
      u.target = null;
      u.autoAttackDisabled = false;
    } else {
      const prevX = u.mesh.position.x;
      const prevZ = u.mesh.position.z;
      moveTowards(u, u.target.x, u.target.z, dt);
      const r = clampPosition(u.mesh.position);
      if (r && r.blocked) {
        u.mesh.position.x = prevX;
        u.mesh.position.z = prevZ;
        u.target = null;
      } else {
        applyTerrainHeight(u);
      }
      if (u.target) faceTo(u, u.target.x, u.target.z, dt);
    }
  }

  updateTracers(scene, dt);
  separateUnits();
}

export function toggleSiege(unit) {
  if (!unit || !unit.canSiege || !unit.siegeData) return;
  unit.sieged = !unit.sieged;
  if (unit.sieged) {
    unit.attack = unit.siegeData.attack;
    unit.attackRange = unit.siegeData.attackRange;
    unit.attackSpeed = unit.siegeData.attackSpeed;
    unit.speed = 0;
    unit.target = null;
    unit.mesh.scale.multiply(new THREE.Vector3(1.2, 0.6, 1.2));
  } else {
    unit.attack = unit.baseData.attack;
    unit.attackRange = unit.baseData.attackRange;
    unit.attackSpeed = unit.baseData.attackSpeed;
    unit.speed = unit.baseData.speed;
    unit.mesh.scale.divide(new THREE.Vector3(1.2, 0.6, 1.2));
  }
}

export function toggleTransform(unit) {
  if (!unit || !unit.canTransform || !unit.transformData) return;
  unit.inAirForm = !unit.inAirForm;
  const data = unit.inAirForm ? unit.transformData.air : unit.transformData.ground;
  unit.attack = data.attack;
  unit.attackRange = data.attackRange;
  unit.attackSpeed = data.attackSpeed;
  unit.speed = data.speed;
  unit.isFlying = data.flying;
  unit.sight = data.sight || 9;
  unit.baseY = data.flying ? FLY_HEIGHT : getHeight(unit.mesh.position.x, unit.mesh.position.z) + unit.size / 2;
}

export function useSuperShot(scene, unit, target) {
  if (!unit || !unit.superShot || unit.superShotTimer > 0) return false;
  if (!target || !target.mesh || target.hp <= 0) return false;
  const d = unit.mesh.position.distanceTo(target.mesh.position);
  if (d > unit.superShot.range) return false;
  flashShoot(unit);
  unit.superShotTimer = unit.superShot.cooldown;
  if (unit.isInvisible) unit.revealTimer = REVEAL_TIME;
  if (unit.isPlayer) playSound('ghost_shoot');
  dealDamage(scene, unit, target, unit.superShot.damage);
  return true;
}
