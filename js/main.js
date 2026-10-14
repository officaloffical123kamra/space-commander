// js/main.js
import * as THREE from 'three';
import { createScene, createCamera, createRenderer, createCommandCenter, createMineralPatch, createGeyser } from './scene.js';
import { createTerrain } from './terrain.js';
import { createDecor } from './decor.js';
import { updateUnits, units, setBuildingsProvider, combatStats, isHiddenFrom, makeUnit, drawHpBar } from './units.js';
import { setupControls } from './controls.js';
import { state, createWorker, updateWorker, updateHud, updateArmyHud, getEco } from './economy.js';
import { updateBuildings, updateConstructions, checkGarrisonArrival, buildings, commandCenters, updateRepairs, updateSensorRadars, showHint, createTurret } from './build.js';
import { createBot, updateBot } from './bot.js';
import { updatePortrait, updateSelectionRings, selection, updateQueueOnly, pruneSelection, renderBuildRow } from './selection.js';
import { drawMinimap } from './minimap.js';
import { initFog, tickFog, isVisible, isExplored, setFogVisible } from './fog.js';
import { initAudio, playMusic, playSound, setMuted, isMuted, suspendAudio, resumeAudio } from './audio.js';
import { checkGameOver, isGameOver, forceGameOver, getGameResult, isLocalWin } from './gameover.js';
import { initMenu, settings, getSelectedMap, getSelectedDifficulty, tryAutostart, returnToMenu, startTutorialGame, updateMenuStats } from './menu.js';
import { getMap } from './maps.js';
import { loadAllModels } from './models.js';
import { initGroups } from './groups.js';
import { initPause, isPaused, setGameActive, setSystemPause, openPauseMenu } from './pause.js';
import { startTutorial, updateTutorial, isTutorialDone } from './tutorial.js';
import { getNick, setNick, cleanNick } from './profile.js';
import { storageGet, storageSet } from './storage.js';
import { trackArmySize, trackResources, onWin, onLoss } from './achievements.js';
import { loadProgress, addWin, addLoss, addMoney, progress, saveProgress, initCloudSync, flushCloudSave } from './progress.js';
import { applySkinToAllPlayerUnits, tickBuildingParticles } from './skin_apply.js';
import { spawnBossWave } from './bosses.js';
import { completeMission, getCampaignDifficulty, getMissionById } from './campaign.js';
import { initYandex, notifyGameReady, showFullscreenAd, onSystemPause, getPlayerName } from './yandex.js';
import { geysers } from './world.js';
import { IS_TOUCH, showAlert, showMessage, showConfirm, showPrompt } from './ui.js';
import { session, isNetGame, isSurvivalMode, isFriendly, setRemoteNotify, teamOfCtrl, nameOf } from './session.js';
import { setCommandScene, executeCommand } from './commands.js';
import { initSurvival, updateSurvival, getSurvivalInfo, SURVIVAL_MAP, SURVIVAL_EXTRA, getSurvivalBases, ARENA } from './survival.js';
import { onNet, netSend } from './net.js';
import { sendSnapshot, initGuestView, applySnapshot, tickGuestView, getLastSnapshot } from './netsync.js';

export { showAlert };

const MAX_FRAME_DT = 0.1;   // после сворачивания вкладки — без «телепортов»
const SNAPSHOT_INTERVAL = 0.1; // хост отправляет состояние другу 10 раз в секунду

if (IS_TOUCH) document.body.classList.add('touch');

initAudio();
loadProgress();

let gameStarted = false;
let scene, camera, renderer, bot = null;
let controls = null;
let gameTime = 0;
let mission = null;
let bossSpawned = false;
let snapTimer = 0;
let matchEnded = false;

// ============================================================
// СОЗДАНИЕ МИРА
// ============================================================

function makeBase(pos, minsPos, geysPos, team, ctrl) {
  const mins = createMineralPatch(scene, minsPos.x, minsPos.z);
  const geys = createGeyser(scene, geysPos.x, geysPos.z);
  return { pos, mins, geys, team, ctrl };
}

function spawnBase(base) {
  const cc = createCommandCenter(scene, base.pos.x, base.pos.z, 0x5577aa, base.team, base.ctrl);
  cc.minerals = base.mins;
  cc.geyser = base.geys;
  commandCenters.push(cc);
  createWorker(scene, cc, base.mins, base.team === 'player', null, base.ctrl);
  return cc;
}

// Ресурсы создаются в одном и том же порядке у хоста и у друга —
// по этому порядку (номеру) они и синхронизируются.
function setupWorld(map) {
  const mode = session.mode;
  const players = session.players;
  const bases = [];
  const addBase = (b, ctrl) => bases.push(makeBase(b.cc, b.mins, b.geys, teamOfCtrl(ctrl), ctrl));

  if (isSurvivalMode()) {
    // Кооператив: у каждого игрока своя база рядом (по порядку мест)
    const layout = getSurvivalBases(players.length);
    players.forEach((c, i) => addBase(layout[i], c));
    for (const m of SURVIVAL_EXTRA.mins) createMineralPatch(scene, m.x, m.z);
    for (const g of SURVIVAL_EXTRA.geys) createGeyser(scene, g.x, g.z);
  } else if (mode === 'pvp' && players.length <= 2) {
    // Один на один — на выбранной карте
    bases.push(makeBase(map.playerCC, map.playerMins, map.playerGeys, 'player', players[0]));
    bases.push(makeBase(map.botCC, map.botMins, map.botGeys, 'bot', players[1]));
    for (const m of map.extraMins || []) createMineralPatch(scene, m.x, m.z);
    for (const g of map.extraGeys || []) createGeyser(scene, g.x, g.z);
  } else if (mode === 'pvp') {
    // 3–4 игрока — арена с четырьмя углами
    players.forEach((c, i) => addBase(ARENA.bases[i], c));
    for (const m of ARENA.extraMins) createMineralPatch(scene, m.x, m.z);
    for (const g of ARENA.extraGeys) createGeyser(scene, g.x, g.z);
  } else {
    // Против бота: база бота создаётся в createBot
    bases.push(makeBase(map.playerCC, map.playerMins, map.playerGeys, 'player', 'p1'));
  }

  // Объекты — только у хоста/в одиночной игре. Друг получит их по сети.
  if (session.role !== 'guest') {
    for (const b of bases) {
      const cc = spawnBase(b);
      // В «Выживании» у каждой базы две стартовые турели
      if (isSurvivalMode()) {
        createTurret(scene, cc.x + 3, cc.z + 4, 'player', b.ctrl);
        createTurret(scene, cc.x - 3, cc.z + 4, 'player', b.ctrl);
      }
    }

    if (mode === 'skirmish' || mode === 'campaign') {
      const difficulty = mission ? getCampaignDifficulty() : getSelectedDifficulty();
      bot = createBot(scene, {
        ccX: map.botCC.x, ccZ: map.botCC.z,
        minsX: map.botMins.x, minsZ: map.botMins.z,
        geysX: map.botGeys.x, geysZ: map.botGeys.z,
        difficulty
      });
      bot.cc.minerals = bot.minerals;
      bot.cc.geyser = bot.geyser;
      commandCenters.push(bot.cc);
      for (const em of map.extraMins || []) createMineralPatch(scene, em.x, em.z);
      for (const eg of map.extraGeys || []) createGeyser(scene, eg.x, eg.z);
    }

    if (isSurvivalMode()) initSurvival(scene, { players: players.length });
  }

  // Камера — между КЦ и минералами, чтобы и база, и добыча были на экране
  const mine = bases.find((b) => b.ctrl === session.localCtrl) || bases[0];
  return { x: (mine.pos.x + mine.mins.x) / 2, z: (mine.pos.z + mine.mins.z) / 2 };
}

function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  document.body.classList.add('in-game');

  document.getElementById('hud')?.classList.remove('hidden');
  document.getElementById('bottom-bar')?.classList.remove('hidden');
  document.getElementById('wave-panel')?.classList.remove('hidden');
  document.getElementById('touch-toolbar')?.classList.remove('hidden');
  const loading = document.getElementById('loading');
  loading?.classList.remove('hidden');

  if (session.mode === 'campaign' && window._campaignMissionId) {
    mission = getMissionById(window._campaignMissionId);
  }

  let map;
  session.noFog = session.mode === 'tutorial';
  if (isSurvivalMode()) map = SURVIVAL_MAP;
  else if (session.mode === 'tutorial') map = getMap('classic');
  else if (session.mode === 'pvp') map = getMap(session.mapId);
  else map = getMap(mission ? mission.mapId : getSelectedMap());

  scene = createScene(map);
  createTerrain(scene, map);
  createDecor(scene, map);

  camera = createCamera();
  renderer = createRenderer();

  loadAllModels().then(() => {
    setBuildingsProvider(() => buildings.concat(commandCenters));
    setCommandScene(scene);

    const home = setupWorld(map);
    applyStartResources();
    // В обучении рабочий сначала стоит без дела — игрок сам отправит его добывать
    if (session.mode === 'tutorial') {
      for (const u of units) if (u.isWorker && u.ctrl === 'p1') { u.state = 'idle'; u.minerals = null; }
    }

    if (bot) bindBotEvents(map);
    bindSurvivalEvents();
    if (isNetGame()) buildPlayersBar();
    if (isNetGame()) bindNetEvents();
    if (session.role === 'guest') initGuestView(scene);

    state.mineralsEl = document.getElementById('minerals');
    state.vespeneEl  = document.getElementById('vespene');
    state.armyEl     = document.getElementById('army');
    updateHud();

    initFog(scene);

    controls = setupControls(camera, renderer, scene);
    // База чуть выше центра экрана — на телефоне низ закрыт панелью
    controls.focusOn(home.x, home.z + (IS_TOUCH ? 1.5 : 0.5));
    // Отладка/автотесты: доступ к камере только с ?debug в адресе
    if (location.search.includes('debug')) window.__game = { camera, scene, renderer };
    initGroups(camera);
    initPause();

    const btnSound = document.getElementById('btn-sound');
    if (btnSound) {
      const syncBtn = () => {
        btnSound.textContent = isMuted() ? '🔇' : '🔊';
        btnSound.classList.toggle('muted', isMuted());
      };
      syncBtn();
      btnSound.addEventListener('click', () => { setMuted(!isMuted()); syncBtn(); });
    }

    // Игрок уже нажал кнопку старта — звук разрешён, включаем сразу
    playMusic(map.music || 'music_classic');

    if (mission) showAlert(`Миссия ${mission.id}: ${mission.name}`, 'info', 4000);
    if (isSurvivalMode()) showAlert('🛡 Стройте оборону! Первая волна скоро.', 'info', 5000);
    if (session.mode === 'pvp') {
      showAlert(session.localCtrl === 'p1' ? '⚔ Вы — синие. Разрушьте базу друга!' : '⚔ Разрушьте базу друга!', 'info', 5000);
    }

    applySkinToAllPlayerUnits(scene, units, buildings, commandCenters);
    loading?.classList.add('hidden');
    setGameActive(true);
    animate();

    if (session.mode === 'tutorial') {
      startTutorial({
        spawnEnemies: spawnTutorialEnemies,
        finish: onTutorialFinished,
        skip: () => {
          showAlert('Обучение пропущено. Его можно пройти в главном меню: «📘 Обучение».', 'info', 5000);
        }
      });
    }
  });
}

// Туман войны: настройка игрока, но не в обучении
function fogActive() {
  return !!settings.fogEnabled && !session.noFog;
}

// Стартовые ресурсы матча (окно настройки перед стартом; по умолчанию 150 минералов, 0 газа)
function applyStartResources() {
  const res = session.startRes || { minerals: 150, vespene: 0 };
  for (const c of session.players) {
    const eco = getEco(c);
    if (eco) { eco.minerals = res.minerals; eco.vespene = res.vespene; }
  }
}

// ============================================================
// ОБУЧЕНИЕ
// ============================================================
let tutorialEnemiesSpawned = false;

function spawnTutorialEnemies() {
  if (tutorialEnemiesSpawned) return;
  tutorialEnemiesSpawned = true;
  const spots = [{ x: -6, z: -6 }, { x: -4, z: -9 }, { x: -9, z: -4 }];
  for (const p of spots) {
    const u = makeUnit(scene, p.x, p.z, 'marine', false, 'marine', 'ai');
    // Слабые враги: чтобы победить смог даже новичок
    u.maxHp = 45; u.hp = 45; u.attack = 4; u.baseData.attack = 4;
    drawHpBar(u);
  }
  if (controls) controls.focusOn(-7, -7);
  showAlert('👀 Враги у центра карты (красные)', 'warn', 4000);
}

function tutorialInfo() {
  const mine = (u) => u.ctrl === 'p1' && u.hp > 0;
  return {
    workerSelected: selection.units.some((u) => u.isWorker),
    workerMining: units.some((u) => mine(u) && u.isWorker && (u.state === 'mining' || u.state === 'to_cc')),
    storage: buildings.some((b) => b.type === 'storage' && b.ctrl === 'p1' && b.hp > 0),
    barracks: buildings.some((b) => b.type === 'barracks' && b.ctrl === 'p1' && b.hp > 0),
    marines: units.filter((u) => mine(u) && u.type === 'marine').length,
    enemiesSpawned: tutorialEnemiesSpawned,
    enemies: units.filter((u) => !u.isPlayer && !u.isWorker && u.hp > 0).length
  };
}

async function onTutorialFinished(reward) {
  const text = '🎉 Обучение пройдено!\n\nТеперь вы умеете добывать минералы, строить здания, обучать бойцов и побеждать врагов.' +
    (reward ? `\n\nНаграда: +${reward}💰` : '');
  const toMenu = await showConfirm(text, { okText: 'В главное меню', cancelText: 'Продолжить играть' });
  updateMenuStats();
  if (toMenu) returnToMenu();
}

// ============================================================
// СОБЫТИЯ
// ============================================================

// Уведомление себе и (у хоста) всем друзьям. sound — звук тревоги.
function announce(text, type = 'info', duration = 3000, sound = null) {
  showAlert(text, type, duration);
  if (sound) playSound(sound);
  if (session.role === 'host') netSend({ t: 'note', kind: 'alert', payload: { text, type, duration, sound } });
}

function bossOptionsForMission(m) {
  // «БОСС: Титан» → имя «ТИТАН»; финальные миссии — Ковчег
  const name = (m.name.split(':')[1] || '').trim().toUpperCase() || undefined;
  const mapIndex = ['classic', 'canyon', 'islands', 'labyrinth'].indexOf(m.mapId);
  const bossType = m.missionNumber === 10 ? 'ark' : (mapIndex % 2 === 0 ? 'titan' : 'hydra');
  const hpMult = 1 + Math.max(0, mapIndex) * 0.25;
  return { name, bossType, hpMult };
}

function bindBotEvents(map) {
  window.addEventListener('bot-wave', (e) => {
    showAlert(`⚠️ Атака бота! Волна ${e.detail.wave}`, 'danger');
    const spawnX = map.botCC.x - 5;
    const spawnZ = map.botCC.z - 5;

    if (mission && mission.isBoss) {
      // В миссии с боссом он выходит с первой волной
      if (!bossSpawned) {
        bossSpawned = true;
        spawnBossWave(scene, e.detail.wave, spawnX, spawnZ, bossOptionsForMission(mission));
      }
    } else if (e.detail.wave % 5 === 0) {
      spawnBossWave(scene, e.detail.wave, spawnX, spawnZ);
    }
  });

  window.addEventListener('bot-wave-prepare', (e) => {
    showAlert(`⚠️ Волна ${e.detail.wave} через 5 секунд!`, 'danger', 5000);
  });

  window.addEventListener('bot-build', (e) => {
    showAlert(`🏗 Бот строит: ${e.detail.name}`, 'warn', 3000);
  });

  window.addEventListener('bot-raid', () => {
    showAlert('💨 Рейд бота на КСМ!', 'warn', 3000);
  });
}

function bindSurvivalEvents() {
  window.addEventListener('boss-spawn', (e) => {
    announce(`💀 ${e.detail.name} вышел на бой!`, 'danger', 6000, 'ui_alert');
  });
  window.addEventListener('survival-wave-prepare', (e) => {
    announce(`⚠️ Волна ${e.detail.wave} через 5 секунд!`, 'danger', 5000, 'ui_alert');
  });
  window.addEventListener('survival-wave', (e) => {
    announce(`⚔ Волна ${e.detail.wave}: ${e.detail.count} врагов с ${e.detail.sides.join(', ')}`, 'danger', 4500, 'wave_start');
  });
}

// Полоска с игроками вверху экрана: ник и цвет (вы / союзник / соперник)
function buildPlayersBar() {
  let bar = document.getElementById('players-bar');
  if (bar) bar.remove();
  bar = document.createElement('div');
  bar.id = 'players-bar';
  for (const c of session.players) {
    const chip = document.createElement('span');
    const mine = c === session.localCtrl;
    const ally = teamOfCtrl(c) === session.localTeam;
    chip.className = 'pchip ' + (mine ? 'me' : ally ? 'ally' : 'enemy');
    chip.dataset.ctrl = c;
    chip.textContent = '● ' + nameOf(c) + (mine ? ' (вы)' : '');
    bar.appendChild(chip);
  }
  document.body.appendChild(bar);
}

function markPlayerLeft(ctrl) {
  document.querySelector(`#players-bar .pchip[data-ctrl="${ctrl}"]`)?.classList.add('off');
}

function bindNetEvents() {
  if (session.role === 'host') {
    // msg.from проставляет сервер — подделать чужое место нельзя
    onNet('cmd', (msg) => {
      if (session.players.includes(msg.from)) executeCommand(msg.cmd, msg.from);
    });
    setRemoteNotify((ctrl, kind, payload) => netSend({ t: 'note', kind, payload, to: ctrl }));
    onNet('peer-left', (msg) => {
      announce(`⚠️ ${nameOf(msg.slot)} отключился`, 'danger', 8000);
      markPlayerLeft(msg.slot);
      netSend({ t: 'note', kind: 'left', payload: msg.slot });
    });
    onNet('closed', () => showAlert('⚠️ Связь с сервером потеряна', 'danger', 8000));
  } else {
    onNet('snap', (snap) => {
      if (applySnapshot(snap)) renderBuildRow();
      if (snap.over && !isGameOver()) forceGameOver(snap.over);
    });
    onNet('note', (msg) => {
      if (msg.kind === 'hint') showHint(msg.payload);
      else if (msg.kind === 'sound') playSound(msg.payload);
      else if (msg.kind === 'left') markPlayerLeft(msg.payload);
      else if (msg.kind === 'alert') {
        showAlert(msg.payload.text, msg.payload.type, msg.payload.duration);
        if (msg.payload.sound) playSound(msg.payload.sound);
      }
    });
    const lost = (text) => {
      if (isGameOver()) return;
      showMessage(text, { okText: 'В меню' }).then(() => returnToMenu());
    };
    onNet('peer-left', () => lost(`${nameOf('p1')} (хост) вышел из игры.`));
    onNet('closed', () => lost('Связь с компьютером хоста потеряна.'));
  }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

let booted = false;
function bootMenu() {
  if (booted) return;
  booted = true;
  initMenu(startGame);
  const autostarted = tryAutostart();
  document.getElementById('splash-screen')?.remove();
  notifyGameReady();
  if (!autostarted) onboard();
}

// Первый запуск: спрашиваем ник и предлагаем пройти обучение
async function onboard() {
  if (!getNick()) {
    const v = await showPrompt('Добро пожаловать! Как вас зовут? Этот ник увидят друзья в игре по сети.', {
      value: getPlayerName(), okText: 'Продолжить', placeholder: 'Ваш ник'
    });
    setNick(cleanNick(v) || 'Игрок');
    const input = document.getElementById('net-nick');
    if (input) input.value = getNick();
    updateMenuStats();
  }
  if (!isTutorialDone() && !storageGet('rts_tut_offered')) {
    storageSet('rts_tut_offered', '1');
    const yes = await showConfirm(
      'Вы здесь впервые? Пройдите короткое обучение (около 3 минут): научитесь добывать минералы, строить здания, обучать бойцов и побеждать врагов.',
      { okText: 'Пройти обучение', cancelText: 'Пропустить' }
    );
    if (yes) startTutorialGame();
  }
}

// Реклама и пауза от платформы: стоп игре и звуку
onSystemPause((reason, paused) => {
  setSystemPause(reason, paused);
  if (paused) suspendAudio(reason);
  else resumeAudio(reason);
});

initYandex()
  .then(() => initCloudSync())
  .catch(() => {})
  .finally(bootMenu);

// Свернули вкладку/приложение: глушим звук, ставим паузу, сохраняемся
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    suspendAudio('hidden');
    if (gameStarted && !isGameOver() && !isNetGame()) openPauseMenu();
    flushCloudSave();
  } else {
    resumeAudio('hidden');
  }
});

// Запрет контекстного меню и жестов масштабирования страницы (iOS)
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

let portraitTimer = 0;
let queueTimer = 0;
let skinTimer = 0;
let clock = null;
let geyserTime = 0;

function applyFogVisibility() {
  const fogOn = fogActive();
  for (const u of units) {
    if (!u || !u.mesh) continue;
    if (u.inBunker) { u.mesh.visible = false; continue; }
    if (isFriendly(u)) { u.mesh.visible = true; continue; }
    const pos = u.mesh.position;
    // Невидимок врага видно только при детекции или сразу после выстрела
    u.mesh.visible = (!fogOn || isVisible(pos.x, pos.z)) && !isHiddenFrom(u, session.localTeam);
  }
  for (const list of [buildings, commandCenters]) {
    for (const b of list) {
      if (!b || !b.mesh) continue;
      if (isFriendly(b) || !fogOn) { b.mesh.visible = true; continue; }
      const pos = b.mesh.position;
      b.mesh.visible = isExplored(pos.x, pos.z) || isVisible(pos.x, pos.z);
    }
  }
}

function animateGeysers(dt) {
  geyserTime += dt;
  for (const g of geysers) {
    if (!g || !g.bubbles || g._removed) continue;
    for (const bubble of g.bubbles) {
      const ud = bubble.userData;
      const t = (geyserTime * ud.speed + ud.offset) % 3;
      if (t < 0.3) {
        bubble.visible = false;
      } else {
        bubble.visible = true;
        const p = (t - 0.3) / 2.7;
        bubble.position.y = 0.3 + p * ud.maxY;
        bubble.scale.setScalar(1 - p * 0.7);
        bubble.material.opacity = 0.6 * (1 - p);
        bubble.position.x = ud.baseX + Math.sin(geyserTime * 2 + ud.offset) * 0.1;
        bubble.position.z = ud.baseZ + Math.cos(geyserTime * 2 + ud.offset) * 0.1;
      }
    }
  }
}

function currentWaveInfo() {
  if (session.role === 'guest') {
    const snap = getLastSnapshot();
    return snap ? snap.wave : null;
  }
  return getSurvivalInfo();
}

function updateWavePanel() {
  const panel = document.getElementById('wave-panel');
  if (!panel) return;

  const numEl = document.getElementById('wave-number');
  const etaEl = document.getElementById('wave-eta');
  const fillEl = document.getElementById('wave-progress-fill');

  if (isSurvivalMode()) {
    const info = currentWaveInfo();
    if (!info) return;
    if (numEl) numEl.textContent = info.wave;
    if (etaEl) etaEl.textContent = `${info.eta} сек · врагов: ${info.alive}`;
    if (fillEl) fillEl.style.width = Math.max(0, Math.min(100, 100 - info.eta * 2.5)) + '%';
    panel.classList.toggle('warning', info.eta <= 5);
    return;
  }

  if (session.mode === 'pvp' || !bot) {
    panel.classList.add('hidden');
    return;
  }

  if (numEl) numEl.textContent = bot.waveNumber;

  if (!bot.attackStarted) {
    if (etaEl) etaEl.textContent = `сбор армии (${bot.army.length}/${bot.cfg.waveSize})`;
    if (fillEl) fillEl.style.width = Math.min(100, (bot.army.length / bot.cfg.waveSize) * 100) + '%';
    panel.classList.remove('warning');
    return;
  }

  const eta = Math.max(0, Math.floor(bot.waveTimer));
  if (etaEl) etaEl.textContent = eta + ' сек';
  if (fillEl) {
    const total = bot.cfg.waveCooldown;
    const p = total > 0 ? Math.max(0, Math.min(1, 1 - eta / total)) : 0;
    fillEl.style.width = (p * 100) + '%';
  }
  panel.classList.toggle('warning', eta <= 5);
}

function onMatchEnd() {
  if (matchEnded) return;
  matchEnded = true;
  setGameActive(false);
  const res = getGameResult();
  playSound(res && !res.survival && isLocalWin() ? 'victory' : 'defeat');

  if (res && res.survival) {
    const waves = Math.max(0, (currentWaveInfo()?.wave || 1) - 1);
    const reward = waves * 20;
    if (reward > 0) addMoney(reward);
    if (session.mode === 'survival' && waves > (progress.survivalBest || 0)) {
      progress.survivalBest = waves;
      saveProgress();
      showAlert(`🏆 Новый рекорд: ${waves} волн! +${reward}💰`, 'success', 6000);
    } else if (reward > 0) {
      showAlert(`+${reward}💰 за отбитые волны`, 'success', 5000);
    }
  } else if (isLocalWin()) {
    const difficulty = mission ? getCampaignDifficulty() : getSelectedDifficulty();
    addWin(gameTime, difficulty);
    onWin(gameTime, difficulty, combatStats.playerUnitsLost);
    if (mission) {
      const reward = completeMission(mission.id, getCampaignDifficulty());
      showAlert(`🎉 Миссия ${mission.id} пройдена! +${reward}💰`, 'success', 5000);
    }
  } else {
    addLoss();
    onLoss();
  }
  saveProgress();
  // Межуровневая реклама — в естественной паузе, на экране итогов
  showFullscreenAd();
}

function updateHudTimers(dtRaw) {
  portraitTimer += dtRaw;
  if (portraitTimer > 0.1) {
    portraitTimer = 0;
    updatePortrait();
    drawMinimap(camera);
    updateArmyHud();
    trackArmySize(state.armyUsed);
    updateWavePanel();
  }

  queueTimer += dtRaw;
  if (queueTimer > 0.2) {
    queueTimer = 0;
    updateQueueOnly();
  }
}

function updateVisuals(dt) {
  animateGeysers(dt);
  const fog = fogActive();
  setFogVisible(fog);
  if (fog) tickFog(dt, units, buildings, commandCenters);
  applyFogVisibility();

  skinTimer += dt;
  if (skinTimer > 2) {
    skinTimer = 0;
    applySkinToAllPlayerUnits(scene, units, buildings, commandCenters);
  }
  tickBuildingParticles(buildings, commandCenters, dt);

  const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.05;
  for (const u of units) {
    if (!u || !u.isBoss || !u.mesh || u.hp <= 0) continue;
    if (u.baseScale) u.mesh.scale.copy(u.baseScale).multiplyScalar(pulse);
  }
}

// У друга: только показ и интерфейс, вся игра считается у хоста
function animateGuest(dtRaw) {
  gameTime += dtRaw;
  tickGuestView(dtRaw);
  controls.updateCamera(dtRaw);
  pruneSelection();
  updateSelectionRings(scene);
  controls.updatePathLines(dtRaw);
  updateVisuals(dtRaw);
  if (isGameOver()) onMatchEnd();
  updateHudTimers(dtRaw);
  renderer.render(scene, camera);
}

function animate() {
  requestAnimationFrame(animate);
  if (!clock) clock = new THREE.Clock();
  const dtRaw = Math.min(clock.getDelta(), MAX_FRAME_DT);

  if (session.role === 'guest') {
    animateGuest(dtRaw);
    return;
  }

  if (isGameOver() || isPaused()) {
    renderer.render(scene, camera);
    return;
  }

  const dt = dtRaw * (settings.gameSpeed || 0.75);
  gameTime += dt;

  controls.updateCamera(dtRaw);
  updateUnits(scene, dt);

  for (const u of units) {
    if (u.isWorker) updateWorker(u, dt);
  }

  updateBuildings(scene, dt);
  updateConstructions(scene, dt);
  updateRepairs(scene, dt);
  updateSensorRadars(dt);
  checkGarrisonArrival();
  if (bot) updateBot(bot, dt, scene);
  if (isSurvivalMode()) updateSurvival(dt);
  pruneSelection();
  updateSelectionRings(scene);
  controls.updatePathLines(dt);

  updateVisuals(dt);

  if (session.mode === 'tutorial') updateTutorial(tutorialInfo());

  trackResources(state.minerals, state.vespene);

  checkGameOver(getSurvivalInfo() || {});

  if (session.role === 'host') {
    snapTimer += dtRaw;
    if (snapTimer >= SNAPSHOT_INTERVAL || isGameOver()) {
      snapTimer = 0;
      sendSnapshot({ wave: getSurvivalInfo(), over: isGameOver() ? getGameResult() : null });
    }
  }

  if (isGameOver()) onMatchEnd();

  updateHudTimers(dtRaw);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  if (!camera) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
