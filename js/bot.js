// js/bot.js
import { createCommandCenter, createMineralPatch, createGeyser } from './scene.js';
import { createWorker, assignWorkerToRefinery, orderMineMinerals } from './economy.js';
import {
  createBarracks, createFactory, createStarport, createRefinery,
  createEngineering, createTurret, createBunker, createSensor,
  COSTS, buildings, commandCenters, startRepair, drawBuildingHpBar
} from './build.js';
import { units, isHiddenFrom } from './units.js';
import { botUpgrades } from './upgrades.js';
import { findNearestMineralPatch } from './world.js';

const WAVE_WARNING_TIME = 5; // сек между предупреждением и атакой

export const BOT_DIFFICULTY = {
  easy: {
    name: 'Лёгкий', startMoney: 50, moneyMult: 0.6, gasMult: 0.6,
    maxArmy: 4, waveSize: 2, waveCooldown: 45, maxWorkers: 1,
    buildRefinery: false, maxExpansions: 0, maxTurrets: 0, maxBunkers: 0,
    buildSensor: false, buildEngineering: false, buildFactory: false,
    buildStarport: false, buildTechlab: false, upgrades: false,
    retreat: false, raidWorkers: false, useAirGroup: false,
    repairBuildings: false, waveComp: ['marine'],
  },
  normal: {
    name: 'Обычный', startMoney: 150, moneyMult: 0.9, gasMult: 0.9,
    maxArmy: 8, waveSize: 4, waveCooldown: 30, maxWorkers: 3,
    buildRefinery: true, maxExpansions: 0, maxTurrets: 2, maxBunkers: 0,
    buildSensor: false, buildEngineering: false, buildFactory: false,
    buildStarport: false, buildTechlab: false, upgrades: false,
    retreat: false, raidWorkers: false, useAirGroup: false,
    repairBuildings: false, waveComp: ['marine', 'marine', 'medic'],
  },
  hard: {
    name: 'Сложный', startMoney: 400, moneyMult: 1.3, gasMult: 1.3,
    maxArmy: 14, waveSize: 6, waveCooldown: 22, maxWorkers: 5,
    buildRefinery: true, maxExpansions: 1, maxTurrets: 4, maxBunkers: 1,
    buildSensor: true, buildEngineering: true, buildFactory: true,
    buildStarport: false, buildTechlab: true, upgrades: true,
    retreat: true, raidWorkers: true, useAirGroup: false,
    repairBuildings: true, waveComp: ['marine', 'marauder', 'medic', 'marine', 'tank', 'marine'],
  },
  insane: {
    name: 'Безумный', startMoney: 600, moneyMult: 1.7, gasMult: 1.7,
    maxArmy: 22, waveSize: 8, waveCooldown: 16, maxWorkers: 8,
    buildRefinery: true, maxExpansions: 2, maxTurrets: 8, maxBunkers: 2,
    buildSensor: true, buildEngineering: true, buildFactory: true,
    buildStarport: true, buildTechlab: true, upgrades: true,
    retreat: true, raidWorkers: true, useAirGroup: true,
    repairBuildings: true, waveComp: ['marine', 'marauder', 'medic', 'tank', 'viking', 'ghost', 'marine', 'banshee'],
  }
};

export function createBot(scene, options = {}) {
  const ccX = options.ccX ?? 18;
  const ccZ = options.ccZ ?? 18;
  const minsX = options.minsX ?? 18;
  const minsZ = options.minsZ ?? 13;
  const geysX = options.geysX ?? 14;
  const geysZ = options.geysZ ?? 18;
  const difficulty = options.difficulty || 'normal';
  const cfg = BOT_DIFFICULTY[difficulty] || BOT_DIFFICULTY.normal;

  const cc = createCommandCenter(scene, ccX, ccZ, 0xaa4455, 'bot');
  const minerals = createMineralPatch(scene, minsX, minsZ);
  const geyser = createGeyser(scene, geysX, geysZ);

  const bot = {
    scene, cc, minerals, geyser, difficulty, cfg,
    money: cfg.startMoney, gas: 0,
    workers: [], barracks: null, factory: null, starport: null,
    refinery: null, engineering: null, armory: null,
    turrets: [], bunkers: [], sensors: [], expansions: [],
    army: [], wave: [], raidSquad: [], airSquad: [],
    maxArmy: cfg.maxArmy, timer: 0,
    waveTimer: cfg.waveCooldown, raidTimer: 60, airTimer: 40,
    buildTimer: 3, economyTimer: 2, repairTimer: 10,
    waveNumber: 0, attackStarted: false,
    baseX: ccX, baseZ: ccZ,
    moneyMult: cfg.moneyMult, gasMult: cfg.gasMult,
    upgradeTimer: 10, waveSpawnIndex: 0,
    refineries: [], repairJobs: [],
    pendingWaveTimer: -1,
  };

  const w = createWorker(scene, cc, minerals, false);
  w.onDeliver = (a) => { bot.money += a * bot.moneyMult; };
  w.onDeliverGas = (a) => { bot.gas += a * bot.gasMult; };
  w.state = 'to_minerals';
  bot.workers.push(w);

  return bot;
}

// ============================================================
// ПОИСК ЦЕЛЕЙ
// ============================================================

function findNearestPlayerBuilding(fromX, fromZ, preferTurrets = false) {
  let best = null, bestDist = Infinity;
  const check = (b) => {
    if (!b || !b.mesh) return;
    if ((b.owner || 'player') !== 'player') return;
    if (b.hp <= 0) return;
    const dx = b.mesh.position.x - fromX;
    const dz = b.mesh.position.z - fromZ;
    let d = Math.sqrt(dx*dx + dz*dz);
    if (preferTurrets && (b.type === 'turret' || b.type === 'bunker')) d *= 0.3;
    if (d < bestDist) { bestDist = d; best = b; }
  };
  for (const b of buildings) check(b);
  for (const c of commandCenters) check(c);
  return best;
}

function findNearestPlayerUnit(fromX, fromZ, filter = null) {
  let best = null, bestDist = Infinity;
  for (const u of units) {
    if (!u || !u.mesh) continue;
    if (!u.isPlayer) continue;
    if (u.inBunker) continue;
    if (u.hp <= 0) continue;
    if (isHiddenFrom(u, 'bot')) continue;
    if (filter && !filter(u)) continue;
    const dx = u.mesh.position.x - fromX;
    const dz = u.mesh.position.z - fromZ;
    const d = Math.sqrt(dx*dx + dz*dz);
    if (d < bestDist) { bestDist = d; best = u; }
  }
  return best;
}

function findNearestPlayerWorker(fromX, fromZ) {
  return findNearestPlayerUnit(fromX, fromZ, u => u.isWorker);
}

function hasDefensesNear(x, z, radius = 12) {
  for (const b of buildings) {
    if (!b || !b.mesh) continue;
    if ((b.owner || 'player') !== 'player') continue;
    if (b.type !== 'turret' && b.type !== 'bunker') continue;
    const dx = b.mesh.position.x - x;
    const dz = b.mesh.position.z - z;
    if (dx*dx + dz*dz < radius * radius) return true;
  }
  return false;
}

function isBotBaseUnderAttack(bot) {
  const threatRadius = 15;
  for (const u of units) {
    if (!u || !u.mesh) continue;
    if (!u.isPlayer) continue;
    if (u.hp <= 0) continue;
    const dx = u.mesh.position.x - bot.baseX;
    const dz = u.mesh.position.z - bot.baseZ;
    if (dx*dx + dz*dz < threatRadius * threatRadius) return true;
  }
  return false;
}

// ============================================================
// ЭКОНОМИКА — ПРИОРИТЕТ КСМ
// ============================================================

function tryBuildEconomy(bot, scene) {
  bot.economyTimer -= 0.5;
  if (bot.economyTimer > 0) return;
  bot.economyTimer = 2;

  // РЕФАЙНЕРИ
  if (bot.cfg.buildRefinery && !bot.refinery) {
    const cost = COSTS.refinery.minerals;
    if (bot.money >= cost) {
      bot.money -= cost;
      bot.refinery = createRefinery(scene, bot.geyser, 'bot');
      bot.refineries.push(bot.refinery);
      window.dispatchEvent(new CustomEvent('bot-build', { detail: { name: 'Рефайнери' } }));
    }
  }

  // КСМ — ПРИОРИТЕТ
  const targetWorkers = bot.cfg.maxWorkers;
  if (bot.workers.length < targetWorkers && bot.money >= COSTS.scv.minerals) {
    bot.money -= COSTS.scv.minerals;
    const mins = (bot.minerals && bot.minerals.amount > 0) ? bot.minerals
      : findNearestMineralPatch(bot.cc.x, bot.cc.z, 20);
    const w2 = createWorker(scene, bot.cc, mins, false);
    w2.onDeliver = (a) => { bot.money += a * bot.moneyMult; };
    w2.onDeliverGas = (a) => { bot.gas += a * bot.gasMult; };
    bot.workers.push(w2);
  }

  // ГАЗ — любой свободный КСМ
  if (bot.refinery) {
    const onGas = bot.workers.filter(w => w.refinery);
    if (onGas.length < 2) {
      const freeWorker = bot.workers.find(w =>
        w && w.mesh && w.hp > 0 && !w.refinery && !w.construction && !w.repairJob
      );
      if (freeWorker) assignWorkerToRefinery(freeWorker, bot.refinery);
    }
  }

  // Рефайнери на экспансиях
  for (const exp of bot.expansions) {
    if (exp.geyser && !exp.refinery && bot.money >= COSTS.refinery.minerals) {
      bot.money -= COSTS.refinery.minerals;
      exp.refinery = createRefinery(scene, exp.geyser, 'bot');
      bot.refineries.push(exp.refinery);
    }
  }
}

// ============================================================
// ПРОИЗВОДСТВО ЗДАНИЙ
// ============================================================

function tryBuildProduction(bot, scene) {
  if (!bot.barracks && bot.money >= COSTS.barracks.minerals) {
    bot.money -= COSTS.barracks.minerals;
    const bx = bot.baseX + (bot.baseX > 0 ? -5 : 5);
    const bz = bot.baseZ + (bot.baseZ > 0 ? -2 : 2);
    bot.barracks = createBarracks(scene, bx, bz, 'bot');
    window.dispatchEvent(new CustomEvent('bot-build', { detail: { name: 'Казарма' } }));
    return;
  }

  if (bot.cfg.buildEngineering && bot.barracks && !bot.engineering &&
      bot.money >= COSTS.engineering.minerals) {
    bot.money -= COSTS.engineering.minerals;
    const ex = bot.baseX + (bot.baseX > 0 ? -8 : 8);
    const ez = bot.baseZ + (bot.baseZ > 0 ? 2 : -2);
    bot.engineering = createEngineering(scene, ex, ez, 'bot');
    window.dispatchEvent(new CustomEvent('bot-build', { detail: { name: 'Инж. комплекс' } }));
    return;
  }

  if (bot.cfg.buildFactory && bot.engineering && !bot.factory &&
      bot.money >= COSTS.factory.minerals && bot.gas >= COSTS.factory.vespene) {
    bot.money -= COSTS.factory.minerals;
    bot.gas   -= COSTS.factory.vespene;
    const fx = bot.baseX + (bot.baseX > 0 ? -2 : 2);
    const fz = bot.baseZ + (bot.baseZ > 0 ? -8 : 8);
    bot.factory = createFactory(scene, fx, fz, 'bot');
    window.dispatchEvent(new CustomEvent('bot-build', { detail: { name: 'Завод' } }));
    return;
  }

  if (bot.cfg.buildStarport && bot.factory && !bot.starport &&
      bot.money >= COSTS.starport.minerals && bot.gas >= COSTS.starport.vespene) {
    bot.money -= COSTS.starport.minerals;
    bot.gas   -= COSTS.starport.vespene;
    const sx = bot.baseX + (bot.baseX > 0 ? 2 : -2);
    const sz = bot.baseZ + (bot.baseZ > 0 ? -8 : 8);
    bot.starport = createStarport(scene, sx, sz, 'bot');
    window.dispatchEvent(new CustomEvent('bot-build', { detail: { name: 'Космопорт' } }));
    return;
  }

  if (bot.cfg.buildTechlab && bot.barracks && !bot.barracks.addonTaken &&
      bot.money >= 100 && bot.gas >= 100) {
    bot.money -= 100;
    bot.gas -= 100;
    bot.barracks.hasTechlab = true;
    bot.barracks.addonTaken = true;
    return;
  }

  if (bot.cfg.buildTechlab && bot.factory && !bot.factory.addonTaken &&
      bot.money >= 100 && bot.gas >= 100) {
    bot.money -= 100;
    bot.gas -= 100;
    bot.factory.hasTechlab = true;
    bot.factory.addonTaken = true;
    return;
  }

  if (bot.cfg.buildTechlab && bot.starport && !bot.starport.addonTaken &&
      bot.money >= 100 && bot.gas >= 100) {
    bot.money -= 100;
    bot.gas -= 100;
    bot.starport.hasTechlab = true;
    bot.starport.addonTaken = true;
    return;
  }
}

// ============================================================
// ОБОРОНА
// ============================================================

function tryBuildDefenses(bot, scene) {
  bot.buildTimer -= 0.5;
  if (bot.buildTimer > 0) return;
  bot.buildTimer = 5;

  const base = bot.cc;
  if (!base || !base.mesh) return;

  if (bot.cfg.buildFactory && !bot.factory) return;
  if (bot.cfg.buildStarport && !bot.starport) return;

  if (bot.cfg.maxTurrets > 0 && bot.turrets.length < bot.cfg.maxTurrets) {
    const cost = COSTS.turret;
    if (bot.money >= cost.minerals + 200) {
      const pos = findFreeSpotAround(base.mesh.position.x, base.mesh.position.z, 4, 7, bot);
      if (pos) {
        bot.money -= cost.minerals;
        const turret = createTurret(scene, pos.x, pos.z, 'bot');
        bot.turrets.push(turret);
        window.dispatchEvent(new CustomEvent('bot-build', { detail: { name: 'Турель' } }));
        return;
      }
    }
  }

  if (bot.cfg.maxBunkers > 0 && bot.bunkers.length < bot.cfg.maxBunkers) {
    const cost = COSTS.bunker;
    if (bot.money >= cost.minerals + 200) {
      const pos = findFreeSpotAround(base.mesh.position.x, base.mesh.position.z, 5, 8, bot);
      if (pos) {
        bot.money -= cost.minerals;
        const bunker = createBunker(scene, pos.x, pos.z, 'bot');
        bot.bunkers.push(bunker);
        window.dispatchEvent(new CustomEvent('bot-build', { detail: { name: 'Бункер' } }));
        return;
      }
    }
  }

  if (bot.cfg.buildSensor && bot.sensors.length < 1 && bot.money >= COSTS.sensor.minerals + 200) {
    const pos = findFreeSpotAround(base.mesh.position.x, base.mesh.position.z, 4, 7, bot);
    if (pos) {
      bot.money -= COSTS.sensor.minerals;
      const sensor = createSensor(scene, pos.x, pos.z, 'bot');
      bot.sensors.push(sensor);
      window.dispatchEvent(new CustomEvent('bot-build', { detail: { name: 'Антенна' } }));
    }
  }
}

function findFreeSpotAround(cx, cz, minR, maxR, bot) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const x = Math.round(cx + Math.cos(angle) * r);
    const z = Math.round(cz + Math.sin(angle) * r);
    if (x < -26 || x > 26 || z < -26 || z > 26) continue;
    let blocked = false;
    const check = (b) => {
      if (!b || !b.mesh) return;
      const dx = Math.abs(b.mesh.position.x - x);
      const dz = Math.abs(b.mesh.position.z - z);
      if (dx < 2.5 && dz < 2.5) blocked = true;
    };
    for (const b of buildings) check(b);
    for (const c of commandCenters) check(c);
    if (bot) {
      for (const t of bot.turrets) check(t);
      for (const b of bot.bunkers) check(b);
      for (const s of bot.sensors) check(s);
    }
    if (!blocked) return { x, z };
  }
  return null;
}

// ============================================================
// ЭКСПАНСИЯ
// ============================================================

function tryExpand(bot, scene) {
  if (bot.expansions.length >= bot.cfg.maxExpansions) return;
  if (bot.money < 500) return;
  if (bot.army.length < 3) return;
  if (bot.cfg.buildFactory && !bot.factory) return;

  const dirs = [
    { dx: 1, dz: 1 }, { dx: -1, dz: 1 }, { dx: 1, dz: -1 }, { dx: -1, dz: -1 },
    { dx: 0, dz: 1 }, { dx: 0, dz: -1 }, { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
  ];

  for (const d of dirs) {
    const nx = bot.baseX + d.dx * 12;
    const nz = bot.baseZ + d.dz * 12;
    if (nx < -24 || nx > 24 || nz < -24 || nz > 24) continue;

    let blocked = false;
    for (const b of buildings) {
      if (!b || !b.mesh) continue;
      if (Math.abs(b.mesh.position.x - nx) < 6 && Math.abs(b.mesh.position.z - nz) < 6) {
        blocked = true; break;
      }
    }
    for (const c of commandCenters) {
      if (!c || !c.mesh) continue;
      if (Math.abs(c.mesh.position.x - nx) < 6 && Math.abs(c.mesh.position.z - nz) < 6) {
        blocked = true; break;
      }
    }
    if (blocked) continue;

    bot.money -= COSTS.cc.minerals;
    const newCC = createCommandCenter(scene, nx, nz, 0xaa4455, 'bot');
    commandCenters.push(newCC);

    const newMins = createMineralPatch(scene, nx + 3, nz);
    const newGeys = createGeyser(scene, nx, nz + 3);

    const w1 = createWorker(scene, newCC, newMins, false, nx + 2);
    w1.onDeliver = (a) => { bot.money += a * bot.moneyMult; };
    w1.onDeliverGas = (a) => { bot.gas += a * bot.gasMult; };
    bot.workers.push(w1);

    const w2 = createWorker(scene, newCC, newMins, false, nx + 2);
    w2.onDeliver = (a) => { bot.money += a * bot.moneyMult; };
    w2.onDeliverGas = (a) => { bot.gas += a * bot.gasMult; };
    bot.workers.push(w2);

    bot.expansions.push({
      cc: newCC, minerals: newMins, geyser: newGeys,
      refinery: null, workers: [w1, w2],
    });

    window.dispatchEvent(new CustomEvent('bot-build', { detail: { name: 'Экспансия' } }));
    return;
  }
}

// ============================================================
// ПРОИЗВОДСТВО ЮНИТОВ
// ============================================================

function tryProduceFromBuilding(bot, building, allowedTypes) {
  if (!building || building.productionQueue.length >= 3) return;
  const comp = bot.cfg.waveComp;
  for (let i = 0; i < comp.length; i++) {
    const wantedType = comp[(bot.waveSpawnIndex + i) % comp.length];
    if (!allowedTypes.includes(wantedType)) continue;
    if ((wantedType === 'marauder' || wantedType === 'ghost') && !building.hasTechlab) continue;
    if ((wantedType === 'tank' || wantedType === 'thor') && !building.hasTechlab) continue;
    if (wantedType === 'battlecruiser' && !building.hasTechlab) continue;

    const cost = COSTS[wantedType];
    if (!cost) continue;
    if (bot.money < cost.minerals || bot.gas < cost.vespene) continue;

    bot.money -= cost.minerals;
    bot.gas   -= cost.vespene;

    const times = { marine: 2.5, medic: 3.0, marauder: 3.5, ghost: 4.5,
      hellion: 3.5, tank: 4.5, thor: 6.5, viking: 4.0, banshee: 4.5, battlecruiser: 8.0 };
    const t = times[wantedType] || 3.0;
    building.productionQueue.push({ type: wantedType, time: t, totalTime: t });
    bot.waveSpawnIndex++;
    return;
  }
}

function tryProduceUnits(bot) {
  if (bot.army.length >= bot.maxArmy) return;

  // ПРИОРИТЕТ: не спамим маринами, пока не построены КСМ
  if (bot.workers.length < bot.cfg.maxWorkers) return;

  const savingForBuilding =
    (bot.cfg.buildFactory && !bot.factory && bot.money < 350) ||
    (bot.cfg.buildStarport && !bot.starport && bot.money < 450) ||
    (bot.cfg.buildEngineering && !bot.engineering && bot.money < 200);

  if (savingForBuilding) {
    if (bot.barracks && bot.money >= 80) {
      tryProduceFromBuilding(bot, bot.barracks, ['marine']);
    }
    return;
  }

  if (bot.barracks) tryProduceFromBuilding(bot, bot.barracks, ['marine', 'medic', 'marauder', 'ghost']);
  if (bot.factory) tryProduceFromBuilding(bot, bot.factory, ['hellion', 'tank', 'thor']);
  if (bot.starport) tryProduceFromBuilding(bot, bot.starport, ['viking', 'banshee', 'battlecruiser']);
}

// ============================================================
// РЕМОНТ
// ============================================================

function tryRepairBuildings(bot, scene) {
  if (!bot.cfg.repairBuildings) return;
  bot.repairTimer -= 0.5;
  if (bot.repairTimer > 0) return;
  bot.repairTimer = 8;

  const damaged = buildings.filter(b => b && b.mesh && b.owner === 'bot' && b.hp < b.maxHp * 0.85);
  if (damaged.length === 0) return;
  const target = damaged[0];

  const freeWorker = bot.workers.find(w =>
    w && w.mesh && w.hp > 0 && !w.construction && !w.repairJob && !w.refinery && w.minerals
  );
  if (!freeWorker) return;

  // Бот платит из своих денег (раньше ремонт бота списывал минералы игрока)
  const pay = (cost) => {
    if (bot.money < cost) return false;
    bot.money -= cost;
    return true;
  };
  if (startRepair(scene, target, freeWorker, { pay })) {
    window.dispatchEvent(new CustomEvent('bot-repair', { detail: { name: target.type } }));
  }
}

function tryBuyUpgrade(bot) {
  if (!bot.cfg.upgrades) return;
  if (!bot.engineering && !bot.armory) return;
  if (bot.cfg.buildFactory && !bot.factory) return;

  bot.upgradeTimer -= 0.5;
  if (bot.upgradeTimer > 0) return;
  bot.upgradeTimer = 8;

  const order = ['upgInfArmor', 'upgInfWeapon', 'upgVehArmor', 'upgVehWeapon'];
  for (const key of order) {
    const field = { upgInfWeapon: 'infantryWeapon', upgInfArmor: 'infantryArmor',
      upgVehWeapon: 'vehicleWeapon', upgVehArmor: 'vehicleArmor' }[key];
    if (botUpgrades[field] >= 5) continue;
    const c = COSTS[key];
    if (bot.money >= c.minerals + 300 && bot.gas >= c.vespene + 100) {
      bot.money -= c.minerals;
      bot.gas -= c.vespene;
      botUpgrades[field]++;
      return;
    }
  }
}

function repairOwnCC(bot) {
  if (!bot.cc || bot.cc.hp <= 0) return;
  if (bot.cc.hp >= bot.cc.maxHp) return;
  const missing = bot.cc.maxHp - bot.cc.hp;
  const healAmount = Math.min(missing, 50);
  const cost = Math.ceil(healAmount * 0.5);
  if (bot.money < cost) return;
  bot.money -= cost;
  bot.cc.hp += healAmount;
  drawBuildingHpBar(bot.cc);
}

// ============================================================
// НАВЕДЕНИЕ
// ============================================================

export function assignBotUnitTarget(unit) {
  if (!unit || !unit.mesh) return;
  const px = unit.mesh.position.x;
  const pz = unit.mesh.position.z;
  const sight = unit.sight || 8;

  const playerUnit = findNearestPlayerUnit(px, pz, u => !u.isWorker);
  if (playerUnit) {
    const d = Math.hypot(playerUnit.mesh.position.x - px, playerUnit.mesh.position.z - pz);
    if (d <= sight) {
      unit.attackTarget = playerUnit;
      unit.target = null;
      unit.autoAttackDisabled = false;
      return;
    }
  }

  const preferTurrets = hasDefensesNear(px, pz, 14);
  const bld = findNearestPlayerBuilding(px, pz, preferTurrets);
  if (bld) {
    unit.attackTarget = bld;
    unit.target = null;
    unit.autoAttackDisabled = false;
  }
}

// ============================================================
// ВОЛНЫ
// ============================================================

// Предупреждение сейчас, атака — через WAVE_WARNING_TIME игровых секунд.
// Раньше тут был setTimeout, и волна приходила даже во время паузы.
function sendWave(bot) {
  window.dispatchEvent(new CustomEvent('bot-wave-prepare', {
    detail: { wave: bot.waveNumber }
  }));
  bot.pendingWaveTimer = WAVE_WARNING_TIME;
}

function launchWave(bot) {
  const attackers = bot.army.filter(u => u && u.mesh && u.hp > 0 && !u.inBunker);
  for (const a of attackers) {
    a.attackTarget = null;
    a.target = null;
    a.autoAttackDisabled = false;
    assignBotUnitTarget(a);
  }
  bot.wave = attackers.slice();

  window.dispatchEvent(new CustomEvent('bot-wave', {
    detail: { wave: bot.waveNumber }
  }));
}

function retreatWave(bot) {
  for (const a of bot.wave) {
    if (!a || !a.mesh || a.hp <= 0) continue;
    a.attackTarget = null;
    a.target = { x: bot.baseX + (Math.random() - 0.5) * 8, y: 0, z: bot.baseZ + (Math.random() - 0.5) * 8 };
    a.autoAttackDisabled = true;
  }
  bot.wave = [];
  bot.attackStarted = false;
  bot.waveTimer = bot.cfg.waveCooldown * 0.7;
}

function sendRaid(bot) {
  if (!bot.cfg.raidWorkers) return;
  const candidates = bot.army.filter(u =>
    u && u.mesh && u.hp > 0 && !bot.wave.includes(u) && !bot.raidSquad.includes(u) &&
    (u.type === 'hellion' || u.type === 'banshee' || u.type === 'viking' || u.type === 'marine')
  ).slice(0, 3);
  if (candidates.length < 2) return;

  for (const a of candidates) {
    a.attackTarget = null;
    a.target = null;
    a.autoAttackDisabled = false;
    const w = findNearestPlayerWorker(a.mesh.position.x, a.mesh.position.z);
    if (w) a.attackTarget = w;
    else {
      const bld = findNearestPlayerBuilding(a.mesh.position.x, a.mesh.position.z);
      if (bld) a.attackTarget = bld;
    }
  }
  bot.raidSquad = candidates.slice();
  bot.raidTimer = 60 + Math.random() * 30;
}

function sendAirRaid(bot) {
  if (!bot.cfg.useAirGroup) return;
  const air = bot.army.filter(u =>
    u && u.mesh && u.hp > 0 && u.isFlying && !bot.wave.includes(u) && !bot.airSquad.includes(u)
  );
  if (air.length < 1) return;

  for (const a of air) {
    a.attackTarget = null;
    a.autoAttackDisabled = false;
    let bestTarget = null, bestDist = -Infinity;
    for (const b of buildings) {
      if (!b || !b.mesh) continue;
      if ((b.owner || 'player') !== 'player') continue;
      if (b.hp <= 0) continue;
      const dx = b.mesh.position.x - bot.baseX;
      const dz = b.mesh.position.z - bot.baseZ;
      const d = Math.sqrt(dx*dx + dz*dz);
      if (d > bestDist) { bestDist = d; bestTarget = b; }
    }
    if (bestTarget) a.attackTarget = bestTarget;
    else assignBotUnitTarget(a);
  }
  bot.airSquad = air.slice();
  bot.airTimer = 50 + Math.random() * 30;
}

// ============================================================
// ГЛАВНЫЙ АПДЕЙТ
// ============================================================

export function updateBot(bot, dt, scene) {
  // Рабочие бота обновляются в общем цикле main.js.
  // Раньше их обновляли ещё и здесь — бот добывал в 2 раза быстрее.

  if (bot.pendingWaveTimer > 0) {
    bot.pendingWaveTimer -= dt;
    if (bot.pendingWaveTimer <= 0) {
      bot.pendingWaveTimer = -1;
      launchWave(bot);
    }
  }

  for (const u of units) {
    if (!u.isPlayer && !u.isWorker && !bot.army.includes(u) && u.owner !== 'player') {
      u.owner = 'bot';
      bot.army.push(u);
    }
  }

  bot.army = bot.army.filter(u => u && u.mesh && u.hp > 0 && !u.inBunker);
  bot.wave = bot.wave.filter(u => u && u.mesh && u.hp > 0);
  bot.raidSquad = bot.raidSquad.filter(u => u && u.mesh && u.hp > 0);
  bot.airSquad = bot.airSquad.filter(u => u && u.mesh && u.hp > 0);
  bot.turrets = bot.turrets.filter(t => t && t.mesh && t.hp > 0);
  bot.bunkers = bot.bunkers.filter(b => b && b.mesh && b.hp > 0);
  bot.sensors = bot.sensors.filter(s => s && s.mesh && s.hp > 0);
  bot.workers = bot.workers.filter(w => w && w.mesh && w.hp > 0 && !w.dead);

  bot.timer -= dt;
  if (bot.timer > 0) return;
  bot.timer = 0.5;

  // Разрушенные здания забываем — бот сможет отстроить их заново
  for (const key of ['barracks', 'factory', 'starport', 'refinery', 'engineering', 'armory']) {
    if (bot[key] && bot[key].hp <= 0) bot[key] = null;
  }

  // Главный КЦ разрушен — переезжаем на живую экспансию, если есть
  if (!bot.cc || bot.cc.hp <= 0) {
    const alive = commandCenters.find(c => c.owner === 'bot' && c.hp > 0);
    if (alive) {
      bot.cc = alive;
      bot.baseX = alive.x;
      bot.baseZ = alive.z;
      const exp = bot.expansions.find(e => e.cc === alive);
      if (exp) { bot.minerals = exp.minerals; bot.geyser = exp.geyser; }
    }
  }
  const ccAlive = !!(bot.cc && bot.cc.hp > 0);

  // Простаивающих рабочих — обратно на минералы
  for (const w of bot.workers) {
    if (w.state === 'idle' && !w.construction && !w.repairJob && !w.moveTarget) {
      const mp = findNearestMineralPatch(w.mesh.position.x, w.mesh.position.z, 25);
      if (mp) orderMineMinerals(w, mp);
    }
  }

  if (ccAlive) {
    repairOwnCC(bot);
    tryBuildEconomy(bot, scene);
    tryBuildProduction(bot, scene);
    tryExpand(bot, scene);
    tryBuildDefenses(bot, scene);
    tryRepairBuildings(bot, scene);
  }
  tryBuyUpgrade(bot);
  tryProduceUnits(bot);

  const baseUnderAttack = isBotBaseUnderAttack(bot);
  if (baseUnderAttack && bot.wave.length > 0) {
    for (const a of bot.wave) {
      if (!a || !a.mesh || a.hp <= 0) continue;
      const nearestEnemy = findNearestPlayerUnit(a.mesh.position.x, a.mesh.position.z);
      if (nearestEnemy) {
        const dx = nearestEnemy.mesh.position.x - bot.baseX;
        const dz = nearestEnemy.mesh.position.z - bot.baseZ;
        if (dx*dx + dz*dz < 15 * 15) {
          a.attackTarget = nearestEnemy;
          a.target = null;
          a.autoAttackDisabled = false;
        }
      }
    }
  }

  if (!bot.attackStarted && bot.army.length >= bot.cfg.waveSize) {
    bot.attackStarted = true;
    bot.waveTimer = bot.cfg.waveCooldown;
    bot.waveNumber++;
    sendWave(bot);
    return;
  }

  if (bot.cfg.retreat && bot.attackStarted && bot.wave.length > 0) {
    const aliveInWave = bot.wave.filter(u => u.hp > 0).length;
    if (aliveInWave <= Math.max(1, Math.floor(bot.cfg.waveSize * 0.3))) {
      retreatWave(bot);
      return;
    }
  }

  if (bot.attackStarted) {
    bot.waveTimer -= 0.5;
    if (bot.waveTimer <= 0 && bot.army.length >= bot.cfg.waveSize) {
      bot.waveNumber++;
      bot.waveTimer = bot.cfg.waveCooldown;
      sendWave(bot);
    }
    for (const a of bot.army) {
      if (a.hp <= 0) continue;
      if (!a.attackTarget || a.attackTarget.hp <= 0) assignBotUnitTarget(a);
    }
  }

  if (bot.cfg.raidWorkers) {
    bot.raidTimer -= 0.5;
    if (bot.raidTimer <= 0) sendRaid(bot);
    for (const a of bot.raidSquad) {
      if (!a || !a.mesh || a.hp <= 0) continue;
      if (!a.attackTarget || a.attackTarget.hp <= 0) {
        const w = findNearestPlayerWorker(a.mesh.position.x, a.mesh.position.z);
        if (w) { a.attackTarget = w; a.autoAttackDisabled = false; }
        else assignBotUnitTarget(a);
      }
    }
  }

  if (bot.cfg.useAirGroup) {
    bot.airTimer -= 0.5;
    if (bot.airTimer <= 0) sendAirRaid(bot);
    for (const a of bot.airSquad) {
      if (!a || !a.mesh || a.hp <= 0) continue;
      if (!a.attackTarget || a.attackTarget.hp <= 0) assignBotUnitTarget(a);
    }
  }
}