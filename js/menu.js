import { playClick, playMusic, stopMusic, setMusicVolume, setSfxVolume } from './audio.js';
import { MAPS } from './maps.js';
import { initMenu3D, stopMenu3D } from './menu3d.js';
import { loadProgress, progress, checkDaily, saveProgress, flushCloudSave } from './progress.js';
import { openShop } from './shop.js';
import { openAchievements } from './achievements_screen.js';
import { loadAllModels } from './models.js';
import { showAlert, showConfirm, showPrompt, showMatchSetup } from './ui.js';
import { getNick, setNick, cleanNick, getStartRes, setStartRes } from './profile.js';
import { showRewardedAd, isYandexReady } from './yandex.js';
import { session } from './session.js';
import { initLobby, openLobby } from './lobby.js';
import { isSettingsFromPause, returnFromSettings } from './pause.js';
import { storageGet, storageSet, sessionGet, sessionSet, sessionRemove } from './storage.js';
import {
  MISSIONS, getCurrentMission, isMissionUnlocked,
  getCompletedCount, getTotalMissions,
  setCampaignDifficulty, getCampaignDifficulty,
  DIFFICULTY_MULT, getMissionById, completeMission
} from './campaign.js';

export const settings = {
  musicVolume: 35,
  sfxVolume: 70,
  fogEnabled: true,
  gameSpeed: 0.75
};

const AUTOSTART_KEY = 'rts_autostart';

let onStartGame = null;
let selectedMapId = 'classic';
let selectedDifficulty = 'normal';

export function loadSettings() {
  try {
    const raw = storageGet('rts_settings');
    if (raw) {
      const data = JSON.parse(raw);
      if (typeof data.musicVolume === 'number') settings.musicVolume = data.musicVolume;
      if (typeof data.sfxVolume === 'number') settings.sfxVolume = data.sfxVolume;
      if (typeof data.fogEnabled === 'boolean') settings.fogEnabled = data.fogEnabled;
      if (typeof data.gameSpeed === 'number') settings.gameSpeed = Math.max(0.5, Math.min(1.5, data.gameSpeed));
      if (typeof data.selectedMapId === 'string' && MAPS[data.selectedMapId]) {
        selectedMapId = data.selectedMapId;
      }
      if (typeof data.selectedDifficulty === 'string') {
        selectedDifficulty = data.selectedDifficulty;
      }
    }
  } catch (err) {}
  applyAudioSettings();
}

function applyAudioSettings() {
  setMusicVolume(settings.musicVolume / 100);
  setSfxVolume(settings.sfxVolume / 100);
}

function saveSettings() {
  storageSet('rts_settings', JSON.stringify({
    ...settings,
    selectedMapId: selectedMapId,
    selectedDifficulty: selectedDifficulty
  }));
}

export function getSelectedMap() { return selectedMapId; }
export function getSelectedDifficulty() { return selectedDifficulty; }

// ============================================================
// ПЕРЕЗАПУСК / ВЫХОД В МЕНЮ
// Игра одноразовая на загрузку страницы, поэтому перезапуск = перезагрузка
// с пометкой в sessionStorage «сразу начать ту же карту/миссию».
// ============================================================

export async function requestRestart() {
  sessionSet(AUTOSTART_KEY, JSON.stringify({
    mode: session.mode,
    mapId: selectedMapId,
    missionId: window._campaignMissionId || null,
    res: session.startRes
  }));
  await Promise.race([flushCloudSave(), new Promise((r) => setTimeout(r, 1500))]);
  location.reload();
}

export async function returnToMenu() {
  sessionRemove(AUTOSTART_KEY);
  await Promise.race([flushCloudSave(), new Promise((r) => setTimeout(r, 1500))]);
  location.reload();
}

// Вызывается после initMenu. true — игра запущена сразу.
export function tryAutostart() {
  const raw = sessionGet(AUTOSTART_KEY);
  if (!raw) return false;
  sessionRemove(AUTOSTART_KEY);
  try {
    const data = JSON.parse(raw);
    session.startRes = data.res || getStartRes();
    if (data.mode === 'survival') {
      session.mode = 'survival';
      window._campaignMissionId = null;
    } else if (data.missionId && getMissionById(data.missionId)) {
      session.mode = 'campaign';
      window._campaignMissionId = data.missionId;
      selectedMapId = getMissionById(data.missionId).mapId;
    } else {
      session.mode = 'skirmish';
      window._campaignMissionId = null;
      if (MAPS[data.mapId]) selectedMapId = data.mapId;
    }
  } catch (e) {
    return false;
  }
  launchGame();
  return true;
}

function launchGame() {
  stopMusic();
  stopMenu3D();
  hideAllMenus();
  if (onStartGame) onStartGame();
}

// Окно «со скольких ресурсов начать» → запуск матча. false — игрок отменил.
async function setupAndLaunch(title) {
  const res = await showMatchSetup(getStartRes(), { title });
  if (!res) return false;
  session.startRes = setStartRes(res);
  launchGame();
  return true;
}

// Обучение: фиксированные ресурсы, чтобы хватило на всё, что показываем
export function startTutorialGame() {
  session.mode = 'tutorial';
  session.players = ['p1'];
  window._campaignMissionId = null;
  session.startRes = { minerals: 350, vespene: 0 };
  launchGame();
}

// Запуск из лобби (игра по сети) — те же шаги, что и у обычного старта
function launchFromLobby() {
  launchGame();
}

export function initMenu(startGameCallback) {
  onStartGame = startGameCallback;
  loadSettings();
  loadProgress();

  loadAllModels();

  // ?lite в адресе — без 3D-фона меню (для автотестов и слабых устройств)
  if (!location.search.includes('lite')) {
    try { initMenu3D(); } catch (err) {}
  }

  document.getElementById('hud')?.classList.add('hidden');
  document.getElementById('bottom-bar')?.classList.add('hidden');

  const daily = checkDaily();
  if (daily.claimed) {
    setTimeout(() => {
      showAlert(`🎁 Ежедневная награда: +${daily.reward}💰 (серия: ${daily.streak} дн.)`, 'success', 4500);
      updateMenuStats();
    }, 800);
  }

  const statsEl = document.createElement('div');
  statsEl.id = 'menu-stats';
  statsEl.title = 'Нажмите, чтобы сменить ник';
  statsEl.addEventListener('click', async () => {
    const v = await showPrompt('Ваш ник (его увидят друзья в игре по сети):', {
      value: getNick(), okText: 'Сохранить', cancelText: 'Отмена', placeholder: 'Ваш ник'
    });
    if (v === null) return;
    setNick(cleanNick(v) || 'Игрок');
    const input = document.getElementById('net-nick');
    if (input) input.value = getNick();
    updateMenuStats();
  });
  document.body.appendChild(statsEl);
  updateMenuStats();

  // Музыка меню — по первому касанию/клику (браузеры запрещают автозапуск звука)
  let menuMusicStarted = false;
  const startMenuMusic = () => {
    if (menuMusicStarted) return;
    menuMusicStarted = true;
    const menu = document.getElementById('main-menu');
    if (menu && !document.body.classList.contains('in-game')) playMusic('music_menu');
  };
  window.addEventListener('pointerdown', startMenuMusic, { once: true });
  window.addEventListener('keydown', startMenuMusic, { once: true });

  initLobby({ startGame: launchFromLobby, showScreen });

  document.getElementById('menu-tutorial')?.addEventListener('click', () => {
    playClick();
    startTutorialGame();
  });
  document.getElementById('menu-survival')?.addEventListener('click', () => {
    playClick();
    session.mode = 'survival';
    window._campaignMissionId = null;
    setupAndLaunch('Выживание');
  });
  // На Яндекс Играх своего сервера нет — игру по сети не показываем
  const netBtn = document.getElementById('menu-network');
  if (netBtn) {
    if (isYandexReady()) netBtn.classList.add('hidden');
    netBtn.addEventListener('click', () => { playClick(); openLobby(); });
  }

  document.getElementById('menu-play')?.addEventListener('click', () => {
    playClick(); showScreen('campaign-screen'); renderCampaignList();
  });
  document.getElementById('menu-skirmish')?.addEventListener('click', () => {
    playClick(); showScreen('map-screen'); renderMapList();
  });
  document.getElementById('menu-settings')?.addEventListener('click', () => {
    playClick(); showScreen('settings-screen');
  });
  document.getElementById('menu-about')?.addEventListener('click', () => {
    playClick(); showScreen('about-screen');
  });
  document.getElementById('menu-shop')?.addEventListener('click', () => {
    playClick(); openShop(updateMenuStats);
  });
  document.getElementById('menu-achievements')?.addEventListener('click', () => {
    playClick(); openAchievements();
  });

  document.getElementById('campaign-back')?.addEventListener('click', () => {
    playClick(); showScreen('main-menu');
  });
  document.getElementById('map-back')?.addEventListener('click', () => {
    playClick(); saveSettings(); showScreen('main-menu');
  });
  document.getElementById('settings-back')?.addEventListener('click', () => {
    playClick();
    saveSettings();
    // Из паузы — назад в паузу, а не в главное меню поверх игры
    if (isSettingsFromPause()) returnFromSettings();
    else showScreen('main-menu');
  });

  bindSlider('opt-music-volume', 'opt-music-volume-label',
    () => settings.musicVolume,
    (v) => { settings.musicVolume = v; applyAudioSettings(); },
    (v) => v + '%');

  bindSlider('opt-sfx-volume', 'opt-sfx-volume-label',
    () => settings.sfxVolume,
    (v) => { settings.sfxVolume = v; applyAudioSettings(); },
    (v) => v + '%');

  bindSlider('opt-game-speed', 'opt-game-speed-label',
    () => Math.round(settings.gameSpeed * 100),
    (v) => { settings.gameSpeed = v / 100; },
    (v) => (v / 100).toFixed(2) + 'x');

  const fogCheckbox = document.getElementById('opt-fog');
  if (fogCheckbox) {
    fogCheckbox.checked = settings.fogEnabled;
    fogCheckbox.addEventListener('change', () => {
      settings.fogEnabled = fogCheckbox.checked;
      saveSettings();
    });
  }

  document.getElementById('about-back')?.addEventListener('click', () => {
    playClick(); showScreen('main-menu');
  });
}

function bindSlider(id, labelId, get, set, format) {
  const slider = document.getElementById(id);
  const label = document.getElementById(labelId);
  if (!slider) return;
  slider.value = get();
  if (label) label.textContent = format(get());
  slider.addEventListener('input', () => {
    const v = parseInt(slider.value, 10);
    set(v);
    if (label) label.textContent = format(v);
  });
  slider.addEventListener('change', saveSettings);
}

export function updateMenuStats() {
  const statsEl = document.getElementById('menu-stats');
  if (!statsEl) return;
  const nick = getNick();
  statsEl.textContent = (nick ? `👤 ${nick}   ` : '') + `🏆 ${progress.wins}   💀 ${progress.losses}   💰 ${progress.money}`;
}

const DIFFS = [
  { id: 'easy',   label: '🟢 Лёгкий',   desc: 'Для первого раза' },
  { id: 'normal', label: '🟡 Обычный',  desc: 'Стандарт' },
  { id: 'hard',   label: '🟠 Сложный',  desc: 'Быстрые волны' },
  { id: 'insane', label: '🔴 Безумный', desc: 'Только для мазохистов' }
];

function makeDiffBlock(title) {
  const diffBlock = document.createElement('div');
  diffBlock.className = 'diff-block';
  diffBlock.innerHTML = `<div class="diff-title">${title}</div>`;
  const diffRow = document.createElement('div');
  diffRow.className = 'diff-row';
  diffBlock.appendChild(diffRow);
  return { diffBlock, diffRow };
}

function makeDiffButton(label, sub, active, onClick) {
  const btn = document.createElement('button');
  btn.className = 'menu-btn diff-btn' + (active ? ' active' : '');
  btn.innerHTML = `<div>${label}</div><div class="diff-sub">${sub}</div>`;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderMapList() {
  const list = document.getElementById('map-list');
  if (!list) return;
  list.innerHTML = '';

  const { diffBlock, diffRow } = makeDiffBlock('Сложность бота');
  for (const d of DIFFS) {
    diffRow.appendChild(makeDiffButton(d.label, d.desc, d.id === selectedDifficulty, () => {
      playClick();
      selectedDifficulty = d.id;
      saveSettings();
      renderMapList();
    }));
  }
  list.appendChild(diffBlock);

  for (const id in MAPS) {
    const map = MAPS[id];
    const card = document.createElement('div');
    card.className = 'map-card' + (id === selectedMapId ? ' selected' : '');

    const preview = document.createElement('div');
    preview.className = 'map-preview';
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 130;
    preview.appendChild(canvas);
    card.appendChild(preview);

    const name = document.createElement('div');
    name.className = 'map-name';
    name.textContent = map.name;
    card.appendChild(name);

    const desc = document.createElement('div');
    desc.className = 'map-desc';
    desc.textContent = map.desc;
    card.appendChild(desc);

    const start = document.createElement('div');
    start.className = 'map-start';
    start.textContent = '▶ Играть';
    card.appendChild(start);

    card.addEventListener('click', () => {
      playClick();
      selectedMapId = id;
      saveSettings();
      session.mode = 'skirmish';
      window._campaignMissionId = null;
      setupAndLaunch(map.name);
    });

    list.appendChild(card);
    drawMapPreview(canvas, map);
  }
}

const DIFFS_C = [
  { id: 'easy',   label: '🟢 Лёгкий' },
  { id: 'normal', label: '🟡 Обычный' },
  { id: 'hard',   label: '🟠 Сложный' },
  { id: 'insane', label: '🔴 Безумный' }
];

function renderCampaignList() {
  const list = document.getElementById('campaign-list');
  if (!list) return;
  list.innerHTML = '';

  const currentDiff = getCampaignDifficulty();
  const { diffBlock, diffRow } = makeDiffBlock('Сложность (награда × коэффициент)');
  for (const d of DIFFS_C) {
    diffRow.appendChild(makeDiffButton(d.label, '×' + DIFFICULTY_MULT[d.id], d.id === currentDiff, () => {
      playClick();
      setCampaignDifficulty(d.id);
      renderCampaignList();
    }));
  }
  list.appendChild(diffBlock);

  const current = getCurrentMission();
  const startId = Math.max(1, current.id - 2);
  const endId = Math.min(MISSIONS.length, current.id + 3);

  const info = document.createElement('div');
  info.className = 'campaign-info';
  info.textContent = `ПРОЙДЕНО: ${getCompletedCount()} / ${getTotalMissions()}`;
  list.appendChild(info);

  for (let id = startId; id <= endId; id++) {
    const m = getMissionById(id);
    const unlocked = isMissionUnlocked(id);
    const done = progress.campaign.completed.includes(id);

    const card = document.createElement('div');
    card.className = 'map-card' + (id === current.id ? ' selected' : '');
    if (!unlocked) card.style.opacity = '0.4';
    if (done) card.style.borderColor = '#7ab84a';

    const preview = document.createElement('div');
    preview.className = 'map-preview';
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 130;
    preview.appendChild(canvas);
    card.appendChild(preview);

    const name = document.createElement('div');
    name.className = 'map-name';
    name.textContent = `${id}. ${m.name}`;
    card.appendChild(name);

    const desc = document.createElement('div');
    desc.className = 'map-desc';
    const mult = DIFFICULTY_MULT[currentDiff] || 1;
    const reward = Math.floor(m.baseReward * mult);
    desc.textContent = [`💰 ${reward}`, m.isBoss ? '👹 БОСС' : '', done ? '✅ Пройдено' : '']
      .filter(Boolean).join('   ');
    card.appendChild(desc);

    const start = document.createElement('div');
    start.className = 'map-start';
    if (done) start.textContent = '▶ ПРОЙТИ СНОВА';
    else if (unlocked) start.textContent = '▶ ИГРАТЬ';
    else start.textContent = '🔒 Закрыто';
    card.appendChild(start);

    if (unlocked) {
      card.addEventListener('click', () => {
        playClick();
        window._campaignMissionId = id;
        selectedMapId = m.mapId;
        saveSettings();
        session.mode = 'campaign';
        setupAndLaunch(`Миссия ${id}: ${m.name}`);
      });
    }

    // Пропуск миссии — за просмотр рекламы
    if (unlocked && !done) {
      const skipBtn = document.createElement('div');
      skipBtn.className = 'map-start map-skip';
      skipBtn.textContent = '📺 ПРОПУСТИТЬ ЗА РЕКЛАМУ';
      skipBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        playClick();
        const ok = await showConfirm(`Пропустить миссию ${id}? Нужно посмотреть рекламу до конца.`, { okText: 'Смотреть' });
        if (!ok) return;
        const rewarded = await showRewardedAd();
        if (!rewarded) {
          showAlert('Реклама не досмотрена — миссия не пропущена', 'warn', 3000);
          return;
        }
        const r = completeMission(id, getCampaignDifficulty());
        showAlert(`⏭ Миссия ${id} пропущена! +${r}💰`, 'success', 3000);
        updateMenuStats();
        renderCampaignList();
      });
      card.appendChild(skipBtn);
    }

    list.appendChild(card);
    const map = MAPS[m.mapId] || MAPS.classic;
    drawMapPreview(canvas, map);
  }
}

function drawMapPreview(canvas, map) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const MAP_SIZE = 60;
  const toX = (x) => ((x + MAP_SIZE / 2) / MAP_SIZE) * W;
  const toY = (z) => ((z + MAP_SIZE / 2) / MAP_SIZE) * H;

  ctx.fillStyle = '#0a1420';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#5577aa';
  ctx.fillRect(toX(map.playerCC.x) - 8, toY(map.playerCC.z) - 8, 16, 16);
  ctx.fillStyle = '#4ea6ff';
  ctx.beginPath(); ctx.arc(toX(map.playerMins.x), toY(map.playerMins.z), 4, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#aa4455';
  ctx.fillRect(toX(map.botCC.x) - 8, toY(map.botCC.z) - 8, 16, 16);
  ctx.fillStyle = '#4ea6ff';
  ctx.beginPath(); ctx.arc(toX(map.botMins.x), toY(map.botMins.z), 4, 0, Math.PI * 2); ctx.fill();
}

export function showScreen(id) {
  document.querySelectorAll('.menu-screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

export function hideAllMenus() {
  document.querySelectorAll('.menu-screen').forEach(s => s.classList.add('hidden'));
  const statsEl = document.getElementById('menu-stats');
  if (statsEl) statsEl.remove();
}

// Сохранить прогресс сразу (используется перед уходом со страницы)
export function saveAll() {
  saveSettings();
  saveProgress();
}
