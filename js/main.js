// js/main.js
import * as THREE from 'three';
import { createScene, createCamera, createRenderer, createCommandCenter, createMineralPatch, createGeyser } from './scene.js';
import { createTerrain } from './terrain.js';
import { createDecor } from './decor.js';
import { updateUnits, units, setBuildingsProvider, combatStats, isHiddenFrom } from './units.js';
import { setupControls } from './controls.js';
import { state, createWorker, updateWorker, updateHud, updateArmyHud } from './economy.js';
import { updateBuildings, updateConstructions, checkGarrisonArrival, buildings, commandCenters, updateRepairs, updateSensorRadars } from './build.js';
import { createBot, updateBot } from './bot.js';
import { updatePortrait, updateSelectionRings, selection, updateQueueOnly, pruneSelection } from './selection.js';
import { drawMinimap } from './minimap.js';
import { initFog, tickFog, isVisible, isExplored } from './fog.js';
import { initAudio, playMusic, setMuted, isMuted, suspendAudio, resumeAudio } from './audio.js';
import { checkGameOver, isGameOver } from './gameover.js';
import { initMenu, settings, getSelectedMap, getSelectedDifficulty, tryAutostart } from './menu.js';
import { getMap } from './maps.js';
import { loadAllModels } from './models.js';
import { initGroups } from './groups.js';
import { initPause, isPaused, setGameActive, setSystemPause, openPauseMenu } from './pause.js';
import { startTutorial, updateTutorial, isTutorialDone } from './tutorial.js';
import { trackArmySize, trackResources, onWin, onLoss } from './achievements.js';
import { loadProgress, addWin, addLoss, saveProgress, initCloudSync, flushCloudSave } from './progress.js';
import { applySkinToAllPlayerUnits, tickBuildingParticles } from './skin_apply.js';
import { spawnBossWave } from './bosses.js';
import { completeMission, getCampaignDifficulty, getMissionById } from './campaign.js';
import { initYandex, notifyGameReady, showFullscreenAd, onSystemPause } from './yandex.js';
import { geysers } from './world.js';
import { IS_TOUCH, showAlert } from './ui.js';

export { showAlert };

const MAX_FRAME_DT = 0.1; // после сворачивания вкладки — без «телепортов»

if (IS_TOUCH) document.body.classList.add('touch');

initAudio();
loadProgress();

let gameStarted = false;
let scene, camera, renderer, bot;
let controls = null;
let gameTime = 0;
let mission = null;
let bossSpawned = false;

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

  mission = window._campaignMissionId ? getMissionById(window._campaignMissionId) : null;
  // В кампании сложность бота — сложность кампании (раньше бралась сложность «Схватки»)
  const difficulty = mission ? getCampaignDifficulty() : getSelectedDifficulty();
  const map = getMap(mission ? mission.mapId : getSelectedMap());

  scene = createScene(map);
  createTerrain(scene, map);
  createDecor(scene, map);

  camera = createCamera();
  renderer = createRenderer();

  loadAllModels().then(() => {
    setBuildingsProvider(() => buildings.concat(commandCenters));

    const cc = createCommandCenter(scene, map.playerCC.x, map.playerCC.z, 0x5577aa, 'player');
    const minerals = createMineralPatch(scene, map.playerMins.x, map.playerMins.z);
    const geyser = createGeyser(scene, map.playerGeys.x, map.playerGeys.z);
    cc.minerals = minerals; cc.geyser = geyser;
    commandCenters.push(cc);

    createWorker(scene, cc, minerals, true);

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

    bindBotEvents(map);

    state.mineralsEl = document.getElementById('minerals');
    state.vespeneEl  = document.getElementById('vespene');
    state.armyEl     = document.getElementById('army');
    updateHud();

    initFog(scene);

    controls = setupControls(camera, renderer, scene);
    // База чуть выше центра экрана — на телефоне низ закрыт панелью
    controls.focusOn(map.playerCC.x, map.playerCC.z + (IS_TOUCH ? 3.5 : 2));
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

    applySkinToAllPlayerUnits(scene, units, buildings, commandCenters);
    loading?.classList.add('hidden');
    setGameActive(true);
    animate();

    if (!isTutorialDone()) startTutorial();
  });
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

  window.addEventListener('boss-spawn', (e) => {
    showAlert(`💀 ${e.detail.name} вышел на бой!`, 'danger', 6000);
  });

  window.addEventListener('bot-build', (e) => {
    showAlert(`🏗 Бот строит: ${e.detail.name}`, 'warn', 3000);
  });

  window.addEventListener('bot-raid', () => {
    showAlert('💨 Рейд бота на КСМ!', 'warn', 3000);
  });
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

let booted = false;
function bootMenu() {
  if (booted) return;
  booted = true;
  initMenu(startGame);
  tryAutostart();
  document.getElementById('splash-screen')?.remove();
  notifyGameReady();
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
    if (gameStarted && !isGameOver()) openPauseMenu();
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
  const fogOn = settings.fogEnabled;
  for (const u of units) {
    if (!u || !u.mesh) continue;
    if (u.inBunker) { u.mesh.visible = false; continue; }
    if (u.isPlayer) { u.mesh.visible = true; continue; }
    const pos = u.mesh.position;
    // Невидимок врага видно только при детекции или сразу после выстрела
    u.mesh.visible = (!fogOn || isVisible(pos.x, pos.z)) && !isHiddenFrom(u, 'player');
  }
  for (const list of [buildings, commandCenters]) {
    for (const b of list) {
      if (!b || !b.mesh) continue;
      if ((b.owner || 'player') === 'player' || !fogOn) { b.mesh.visible = true; continue; }
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

function updateWavePanel() {
  const panel = document.getElementById('wave-panel');
  if (!panel || !bot) return;

  const numEl = document.getElementById('wave-number');
  const etaEl = document.getElementById('wave-eta');
  const fillEl = document.getElementById('wave-progress-fill');

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
  setGameActive(false);
  const won = commandCenters.some(c => (c.owner || 'player') === 'player' && c.hp > 0);
  const difficulty = mission ? getCampaignDifficulty() : getSelectedDifficulty();
  if (won) {
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

function animate() {
  requestAnimationFrame(animate);
  if (!clock) clock = new THREE.Clock();
  const dtRaw = Math.min(clock.getDelta(), MAX_FRAME_DT);

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
  updateBot(bot, dt, scene);
  pruneSelection();
  updateSelectionRings(scene);
  controls.updatePathLines(dt);

  animateGeysers(dt);

  if (settings.fogEnabled) tickFog(dt, units, buildings, commandCenters);
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

  if (!isTutorialDone()) {
    updateTutorial({
      hasWorkerSelected: selection.units.some(u => u.isWorker),
      hasMining: selection.units.some(u => u.isWorker && u.state === 'to_minerals'),
      hasBarracks: buildings.some(b => b.type === 'barracks' && b.owner === 'player'),
      hasArmy: units.some(u => u.isPlayer && !u.isWorker)
    });
  }

  trackResources(state.minerals, state.vespene);

  checkGameOver();
  if (isGameOver()) onMatchEnd();

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

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  if (!camera) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
