// js/survival.js
// Режим «Выживание»: бесконечные волны врагов со всех 4 сторон карты.
// Соло — одна база в центре, кооператив — от 2 до 4 баз рядом.
import { makeUnit, drawHpBar } from './units.js';
import { spawnBossWave } from './bosses.js';
import { assignBotUnitTarget } from './bot.js';

export const SURVIVAL_MAP = {
  id: 'survival',
  name: 'Осада',
  biome: 'snow',
  music: 'music_survival',
  // Декор не ставится рядом с этими точками (места баз)
  playerCC: { x: -7, z: 2 },
  botCC: { x: 7, z: 2 }
};

// Базу задаёт только положение командного центра: минералы — на 5 южнее, гейзер сбоку.
function baseAt(x, z) {
  const side = x < 0 ? -1 : 1;
  return { cc: { x, z }, mins: { x, z: z - 5 }, geys: { x: x + side * 4, z } };
}

// Базы по числу игроков (по порядку: p1, p2, p3, p4)
const COOP_BASES = {
  1: [baseAt(0, 2)],
  2: [baseAt(-7, 2), baseAt(7, 2)],
  3: [baseAt(-9, -2), baseAt(9, -2), baseAt(0, 10)],
  4: [baseAt(-9, -4), baseAt(9, -4), baseAt(-9, 10), baseAt(9, 10)]
};

export const SURVIVAL_EXTRA = {
  mins: [{ x: 0, z: 19 }, { x: -18, z: -14 }, { x: 18, z: -14 }],
  geys: [{ x: -16, z: 16 }, { x: 16, z: 16 }]
};

export function getSurvivalBases(playerCount) {
  return COOP_BASES[Math.max(1, Math.min(4, playerCount))];
}

// Арена для 3–4 игроков «друг против друга»: четыре угла карты
export const ARENA = {
  bases: [
    { cc: { x: -22, z: -22 }, mins: { x: -22, z: -17 }, geys: { x: -18, z: -22 } },
    { cc: { x: 22, z: 22 },   mins: { x: 22, z: 17 },   geys: { x: 18, z: 22 } },
    { cc: { x: 22, z: -22 },  mins: { x: 22, z: -17 },  geys: { x: 18, z: -22 } },
    { cc: { x: -22, z: 22 },  mins: { x: -22, z: 17 },  geys: { x: -18, z: 22 } }
  ],
  extraMins: [{ x: 0, z: 0 }, { x: 0, z: -22 }, { x: 0, z: 22 }, { x: -22, z: 0 }, { x: 22, z: 0 }],
  extraGeys: [{ x: -10, z: 0 }, { x: 10, z: 0 }]
};

const SIDES = [
  { x: 0, z: -27, name: 'севера' },
  { x: 0, z: 27, name: 'юга' },
  { x: -27, z: 0, name: 'запада' },
  { x: 27, z: 0, name: 'востока' }
];

// ============================================================
// БАЛАНС (лёгкий старт: можно спокойно отстроиться)
// ============================================================
const FIRST_WAVE_DELAY = 80;   // сек до первой волны
const MAX_ALIVE = 70;          // защита производительности на телефонах
const BOSS_EVERY = 10;         // босс раз в столько волн

// С какой волны какие враги появляются
const POOLS = [
  [1,  ['marine']],
  [4,  ['marine', 'marine', 'marauder']],
  [8,  ['marine', 'marauder', 'hellion', 'medic']],
  [13, ['marine', 'marauder', 'hellion', 'tank', 'medic']],
  [18, ['marauder', 'tank', 'viking', 'marine', 'ghost']],
  [24, ['marauder', 'tank', 'thor', 'viking', 'ghost', 'banshee']],
  [30, ['marauder', 'tank', 'thor', 'viking', 'battlecruiser', 'ghost', 'banshee']]
];

// Сколько врагов в волне: плавно растёт, на каждого дополнительного игрока — больше
function waveSize(wave, players) {
  const base = 2 + wave * 0.9;
  return Math.round(base * (1 + (players - 1) * 0.6));
}

function waveInterval(wave) {
  return Math.max(32, 55 - wave * 0.8);
}

// С какой стороны и со скольких сторон идут враги
function sidesCountFor(wave) {
  if (wave < 4) return 1;
  if (wave < 8) return 2;
  if (wave < 12) return 3;
  return 4;
}

let st = null;

export function initSurvival(scene, { players = 1 } = {}) {
  st = {
    scene,
    players,
    wave: 0,
    timer: FIRST_WAVE_DELAY,
    warned: false,
    retarget: 0,
    enemies: []
  };
  return st;
}

export function stopSurvival() {
  st = null;
}

export function getSurvivalInfo() {
  if (!st) return null;
  return { wave: st.wave, eta: Math.max(0, Math.ceil(st.timer)), alive: st.enemies.length };
}

function poolFor(wave) {
  let pool = POOLS[0][1];
  for (const [from, list] of POOLS) if (wave >= from) pool = list;
  return pool;
}

export function updateSurvival(dt) {
  if (!st) return;
  st.enemies = st.enemies.filter((u) => !u.dead && u.hp > 0);

  st.timer -= dt;
  if (!st.warned && st.timer <= 5) {
    st.warned = true;
    window.dispatchEvent(new CustomEvent('survival-wave-prepare', { detail: { wave: st.wave + 1 } }));
  }
  if (st.timer <= 0) {
    spawnWave();
    st.timer = waveInterval(st.wave);
    st.warned = false;
  }

  // Враги без цели идут к ближайшей постройке/армии игроков
  st.retarget -= dt;
  if (st.retarget <= 0) {
    st.retarget = 1;
    for (const u of st.enemies) {
      if (!u.attackTarget || u.attackTarget.hp <= 0 || u.attackTarget.dead) assignBotUnitTarget(u);
    }
  }
}

function spawnWave() {
  st.wave++;
  const w = st.wave;
  const room = MAX_ALIVE - st.enemies.length;
  const count = Math.max(0, Math.min(room, waveSize(w, st.players)));
  const hpMult = 1 + (w - 1) * 0.04;
  const dmgMult = 1 + (w - 1) * 0.02;
  const pool = poolFor(w);

  const sides = SIDES.slice().sort(() => Math.random() - 0.5).slice(0, sidesCountFor(w));

  for (let i = 0; i < count; i++) {
    const s = sides[i % sides.length];
    const type = pool[Math.floor(Math.random() * pool.length)];
    const along = (Math.random() - 0.5) * 14;
    const x = s.x === 0 ? along : s.x;
    const z = s.z === 0 ? along : s.z;
    const u = makeUnit(st.scene, x, z, type, false, type);
    u.maxHp = Math.round(u.maxHp * hpMult);
    u.hp = u.maxHp;
    u.attack = Math.round(u.attack * dmgMult);
    u.baseData.attack = u.attack;
    if (u.siegeData) u.siegeData = { ...u.siegeData, attack: Math.round(u.siegeData.attack * dmgMult) };
    drawHpBar(u);
    assignBotUnitTarget(u);
    st.enemies.push(u);
  }

  if (w % BOSS_EVERY === 0) {
    const s = SIDES[Math.floor(Math.random() * SIDES.length)];
    const bossType = w >= 30 ? 'ark' : (w >= 20 ? 'hydra' : 'titan');
    const boss = spawnBossWave(st.scene, w, s.x * 0.9, s.z * 0.9, {
      bossType,
      hpMult: (0.35 + w * 0.03) * (1 + (st.players - 1) * 0.5)
    });
    if (boss) {
      assignBotUnitTarget(boss);
      st.enemies.push(boss);
    }
  }

  window.dispatchEvent(new CustomEvent('survival-wave', {
    detail: { wave: w, count, sides: sides.map((s) => s.name) }
  }));
}
