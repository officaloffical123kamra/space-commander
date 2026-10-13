// js/pause.js
// Два вида паузы:
//  - пользовательская (кнопка ⏸ / ESC) — показывает меню паузы;
//  - системная (реклама, пауза от платформы Яндекса) — без меню, снимается автоматически.
// Отсюда же сообщаем Яндексу GameplayAPI.start/stop.
import { playClick } from './audio.js';
import { gameplayStart, gameplayStop } from './yandex.js';
import { showConfirm } from './ui.js';
import { flushCloudSave } from './progress.js';

let paused = false;
let gameActive = false;
let settingsFromPause = false;
let initialized = false;
const systemReasons = new Set();

export function isPaused() {
  return paused || systemReasons.size > 0;
}

export function isUserPaused() {
  return paused;
}

// Идёт ли матч (не меню и не экран конца игры)
export function setGameActive(v) {
  gameActive = !!v;
  syncGameplay();
}

export function setSystemPause(reason, value) {
  if (value) systemReasons.add(reason);
  else systemReasons.delete(reason);
  syncGameplay();
}

function syncGameplay() {
  if (gameActive && !isPaused()) gameplayStart();
  else gameplayStop();
}

export function isSettingsFromPause() {
  return settingsFromPause;
}

// Кнопка «Назад» в настройках, открытых из паузы
export function returnFromSettings() {
  settingsFromPause = false;
  document.getElementById('settings-screen')?.classList.add('hidden');
  document.getElementById('pause-screen')?.classList.remove('hidden');
}

export function openPauseMenu() {
  if (!gameActive) return;
  setPaused(true);
}

export function initPause() {
  if (initialized) return;
  initialized = true;

  const pauseScreen = document.getElementById('pause-screen');
  const controlsScreen = document.getElementById('controls-screen');
  const settingsScreen = document.getElementById('settings-screen');

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // ESC уже отменил режим атаки/стройки/выделение — паузу не открываем
    if (e.__rtsHandled) return;
    if (!gameActive) return;
    if (controlsScreen && !controlsScreen.classList.contains('hidden')) {
      controlsScreen.classList.add('hidden');
      pauseScreen?.classList.remove('hidden');
      return;
    }
    if (settingsFromPause && settingsScreen && !settingsScreen.classList.contains('hidden')) {
      returnFromSettings();
      return;
    }
    setPaused(!paused);
  });

  document.getElementById('btn-pause')?.addEventListener('click', () => {
    playClick();
    setPaused(!paused);
  });

  document.getElementById('pause-resume')?.addEventListener('click', () => {
    playClick();
    setPaused(false);
  });

  document.getElementById('pause-settings')?.addEventListener('click', () => {
    playClick();
    settingsFromPause = true;
    pauseScreen?.classList.add('hidden');
    settingsScreen?.classList.remove('hidden');
  });

  document.getElementById('pause-controls')?.addEventListener('click', () => {
    playClick();
    pauseScreen?.classList.add('hidden');
    controlsScreen?.classList.remove('hidden');
  });

  document.getElementById('controls-back')?.addEventListener('click', () => {
    playClick();
    controlsScreen?.classList.add('hidden');
    pauseScreen?.classList.remove('hidden');
  });

  document.getElementById('pause-menu')?.addEventListener('click', async () => {
    playClick();
    const ok = await showConfirm('Выйти в главное меню? Прогресс партии будет потерян.', { okText: 'Выйти' });
    if (!ok) return;
    await Promise.race([flushCloudSave(), new Promise((r) => setTimeout(r, 1500))]);
    location.reload();
  });
}

function setPaused(value) {
  paused = !!value;
  const pauseScreen = document.getElementById('pause-screen');
  const settingsScreen = document.getElementById('settings-screen');
  const controlsScreen = document.getElementById('controls-screen');

  if (paused) {
    pauseScreen?.classList.remove('hidden');
  } else {
    pauseScreen?.classList.add('hidden');
    controlsScreen?.classList.add('hidden');
    if (settingsFromPause) settingsScreen?.classList.add('hidden');
    settingsFromPause = false;
  }
  syncGameplay();
}
