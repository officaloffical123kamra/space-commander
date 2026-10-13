// js/survival.js
// Режим «Выживание»: бесконечные волны врагов со всех 4 сторон карты.
// Соло — одна база в центре, кооператив — две базы рядом.
import { makeUnit, drawHpBar } from './units.js';
import { spawnBossWave } from './bosses.js';
import { assignBotUnitTarget } from './bot.js';

export const SURVIVAL_MAP = {
  id: 'survival',
  name: 'Осада',
  biome: 'snow',
  music: 'music_labyrinth',
  // Декор не ставится рядом с этими точками (места баз)
  playerCC: { x: -7, z: 2 },
  botCC: { x: 7, z: 2 }
};

// Расположение баз и ресурсов
export const SURVIVAL_LAYOUTS = {
  solo: {
    p1: { cc: { x: 0, z: 2 }, mins: { x: 0, z: -3 }, geys: { x: -4, z: 2 } }
  },
  coop: {
    p1: { cc: { x: -7, z: 2 }, mins: { x: -7, z: -3 }, geys: { x: -11, z: 2 } },
    p2: { cc: { x: 7, z: 2 },  mins: { x: 7, z: -3 },  geys: { x: 11, z: 2 } }
  },
  extraMins: [{ x: 0, z: 14 }, { x: -16, z: -13 }, { x: 16, z: -13 }],
  extraGeys: [{ x: -16, z: 13 }, { x: 16, z: 13 }]
};

const SIDES = [
  { x: 0, z: -27, name: 'севера' },
  { x: 0, z: 27, name: 'юга' },
  { x: -27, z: 0, name: 'запада' },
  { x: 27, z: 0, name: 'востока' }
];

const FIRST_WAVE_DELAY = 50; // сек — время отстроиться
const MAX_ALIVE = 70;        // защита производительности на телефонах

// С какой волны какие враги появляются
const POOLS = [
  [1,  ['marine']],
  [3,  ['marine', 'marine', 'marauder']],
  [5,  ['marine', 'marauder', 'hellion', 'medic']],
  [8,  ['marine', 'marauder', 'hellion', 'tank', 'medic']],
  [12, ['marauder', 'tank', 'viking', 'thor', 'marine', 'ghost']],
  [16, ['marauder', 'tank', 'thor', 'viking', 'battlecruiser', 'ghost', 'banshee']]
];

let st = null;

export function initSurvival(scene, { coop = false } = {}) {
  st = {
    scene,
    coop,
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

function waveInterval(wave) {
  return Math.max(24, 42 - wave * 1.2);
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
  const wanted = Math.round((3 + w * 1.6) * (st.coop ? 1.6 : 1));
  const count = Math.max(0, Math.min(room, wanted));
  const hpMult = 1 + (w - 1) * 0.06;
  const dmgMult = 1 + (w - 1) * 0.03;
  const pool = poolFor(w);

  // Первые волны — с 1–2 сторон, потом со всех четырёх
  const sideCount = w < 3 ? 1 : w < 6 ? 2 : 4;
  const sides = SIDES.slice().sort(() => Math.random() - 0.5).slice(0, sideCount);

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

  if (w % 5 === 0) {
    const s = SIDES[Math.floor(Math.random() * SIDES.length)];
    const bossType = w >= 15 ? 'ark' : (w % 10 === 0 ? 'hydra' : 'titan');
    const boss = spawnBossWave(st.scene, w, s.x * 0.9, s.z * 0.9, {
      bossType,
      hpMult: (0.5 + w * 0.08) * (st.coop ? 1.5 : 1)
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
