// js/audio.js
// Звук на WebAudio:
//  - эффекты декодируются в буферы и могут звучать одновременно;
//  - громкость работает и на iOS (там у <audio> громкость не меняется);
//  - музыка грузится только когда нужна;
//  - звук можно приостановить по причине (свёрнута вкладка, реклама, пауза SDK).
//
// ДОБАВИТЬ СВОЙ ЗВУК: положите файл в папку assets/sounds/ с именем из списка ниже
// (см. также assets/sounds/README.txt). Код менять не нужно: игра сама находит файлы.
// Подходят .mp3, .ogg и .wav. Нет файла — этот звук просто не играет.
import { storageGet, storageSet } from './storage.js';

const UNITS = ['marine', 'marauder', 'ghost', 'medic', 'hellion', 'tank', 'thor', 'viking', 'banshee', 'battlecruiser'];

// ключ в коде -> путь внутри assets/sounds БЕЗ расширения
const SFX_SLOTS = {
  // интерфейс
  ui_click: 'ui/click',
  ui_ready: 'ui/ready',
  ui_error: 'ui/error',
  ui_select: 'ui/select',
  ui_order: 'ui/order',
  ui_build_complete: 'ui/build_complete',
  ui_alert: 'ui/alert',            // тревога: предупреждение о волне, выход босса

  // здания
  explosion: 'buildings/explosion',
  build_start: 'buildings/build_start',
  build_complete: 'buildings/build_complete',
  click_building: 'buildings/click_building',
  cc_ready: 'buildings/cc_ready',
  barracks_ready: 'buildings/barracks_ready',
  factory_ready: 'buildings/factory_ready',
  starport_ready: 'buildings/starport_ready',
  turret_shoot: 'units/turret_shoot',

  // дополнительные события
  wave_start: 'ui/wave_start',     // началась волна врагов
  victory: 'ui/victory',
  defeat: 'ui/defeat',

  // рабочий
  scv_death: 'units/scv_death',
  voice_scv_select: 'voices/scv/select',
  voice_scv_order: 'voices/scv/order'
};

for (const u of UNITS) {
  SFX_SLOTS[`${u}_shoot`] = `units/${u}_shoot`;
  SFX_SLOTS[`${u}_death`] = `units/${u}_death`;
  SFX_SLOTS[`voice_${u}_select`] = `voices/${u}/select`;
  SFX_SLOTS[`voice_${u}_order`] = `voices/${u}/order`;
}
SFX_SLOTS.medic_heal = 'units/medic_heal';

// Если своего файла нет — играем другой звук
const SFX_FALLBACK = {
  turret_shoot: 'tank_shoot',
  wave_start: 'ui_alert',
  ui_select: 'ui_click',
  ui_order: 'ui_click',
  click_building: 'ui_click',
  ui_build_complete: 'ui_ready',
  build_complete: 'ui_ready'
};

const MUSIC_SLOTS = {
  music_menu: 'music/menu',
  music_classic: 'music/classic',
  music_canyon: 'music/canyon',
  music_islands: 'music/islands',
  music_labyrinth: 'music/labyrinth',
  music_survival: 'music/survival',  // режим «Выживание»
  music_battle: 'music/battle'
};
const MUSIC_FALLBACK = {
  music_survival: 'music_labyrinth',
  music_battle: 'music_classic'
};
const DEFAULT_MUSIC = 'music_classic';

const EXT_ORDER = ['.mp3', '.ogg', '.wav'];
const MAX_VOICES = 16;        // одновременно звучащих эффектов
const SAME_SOUND_GAP = 0.06;  // сек — не накладываем один и тот же звук чаще

let ctx = null;
let masterGain = null, sfxGain = null, musicGain = null;
const paths = {};     // ключ -> полный путь к файлу (после чтения списка)
const rawData = {};   // key -> Promise<ArrayBuffer>
const buffers = {};   // key -> AudioBuffer
const decoding = {};
const lastPlayed = {};
let activeVoices = 0;
let indexReady = false;
let pendingMusic = null;

let musicEl = null;
let musicKey = null;
let musicVolume = 0.35;
let sfxVolume = 0.7;
let muted = storageGet('rts_muted') === '1';
const suspendReasons = new Set();

function createContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch (e) {
    ctx = null;
    return null;
  }
  masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.connect(masterGain);
  musicGain = ctx.createGain();
  musicGain.connect(masterGain);
  applyGains();
  for (const key in rawData) decode(key);
  return ctx;
}

function applyGains() {
  if (ctx) {
    masterGain.gain.value = muted ? 0 : 1;
    sfxGain.gain.value = sfxVolume;
    musicGain.gain.value = musicVolume;
  }
  // Без WebAudio регулируем сам элемент
  if (musicEl && !musicEl._viaContext) {
    musicEl.volume = muted ? 0 : musicVolume;
  }
}

function decode(key) {
  if (!ctx || buffers[key] || decoding[key] || !rawData[key]) return;
  decoding[key] = true;
  rawData[key]
    .then((ab) => new Promise((resolve, reject) => {
      // Колбэк-форма — для старых Safari
      ctx.decodeAudioData(ab.slice(0), resolve, reject);
    }))
    .then((buf) => { buffers[key] = buf; })
    .catch(() => {})
    .finally(() => { decoding[key] = false; });
}

// Разблокировка звука по первому касанию/клику (требование браузеров)
function unlock() {
  createContext();
  if (ctx && ctx.state === 'suspended' && suspendReasons.size === 0) {
    ctx.resume().catch(() => {});
  }
  if (musicEl && musicEl.paused && musicKey && suspendReasons.size === 0) {
    musicEl.play().catch(() => {});
  }
}

// Какие файлы реально есть: сервер/сборка отдаёт список assets/sounds/index.json.
// Если списка нет — пробуем стандартные имена .mp3 (несуществующие тихо пропускаются).
function loadIndex() {
  return fetch('assets/sounds/index.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no index'))))
    .then((files) => {
      const byBase = {};
      for (const f of files) {
        const dot = f.lastIndexOf('.');
        const base = f.slice(0, dot);
        const ext = f.slice(dot).toLowerCase();
        if (!byBase[base] || EXT_ORDER.indexOf(ext) < EXT_ORDER.indexOf(byBase[base].ext)) {
          byBase[base] = { ext, file: f };
        }
      }
      return (slot) => (byBase[slot] ? 'assets/sounds/' + byBase[slot].file : null);
    })
    .catch(() => (slot) => 'assets/sounds/' + slot + '.mp3');
}

export function initAudio() {
  loadIndex().then((resolve) => {
    for (const key in SFX_SLOTS) {
      const p = resolve(SFX_SLOTS[key]);
      if (p) paths[key] = p;
    }
    for (const key in MUSIC_SLOTS) {
      const p = resolve(MUSIC_SLOTS[key]);
      if (p) paths[key] = p;
    }
    for (const key in SFX_SLOTS) {
      if (!paths[key]) continue;
      rawData[key] = fetch(paths[key])
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('404'))));
      rawData[key].catch(() => {});
    }
    indexReady = true;
    if (ctx) for (const key in rawData) decode(key);
    if (pendingMusic) {
      const k = pendingMusic;
      pendingMusic = null;
      playMusic(k);
    }
  });

  const opts = { capture: true, passive: true };
  window.addEventListener('pointerdown', unlock, opts);
  window.addEventListener('touchend', unlock, opts);
  window.addEventListener('keydown', unlock, opts);
}

export function playSound(key, volume = null) {
  if (muted || suspendReasons.size > 0) return;
  if (!ctx || ctx.state !== 'running') return;
  let k = key;
  if (!buffers[k] && !rawData[k] && SFX_FALLBACK[k]) k = SFX_FALLBACK[k];
  const buf = buffers[k];
  if (!buf) { decode(k); return; }

  const now = ctx.currentTime;
  if (lastPlayed[k] && now - lastPlayed[k] < SAME_SOUND_GAP) return;
  if (activeVoices >= MAX_VOICES) return;
  lastPlayed[k] = now;

  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = volume !== null ? volume : 1;
    src.connect(g);
    g.connect(sfxGain);
    activeVoices++;
    src.onended = () => { activeVoices--; };
    src.start();
  } catch (e) {}
}

function musicPath(key) {
  let k = key;
  for (let i = 0; i < 3 && k; i++) {
    if (paths[k]) return { key: k, path: paths[k] };
    k = MUSIC_FALLBACK[k];
  }
  return paths[DEFAULT_MUSIC] ? { key: DEFAULT_MUSIC, path: paths[DEFAULT_MUSIC] } : null;
}

export function playMusic(key = DEFAULT_MUSIC) {
  if (!indexReady) { pendingMusic = key; return; }
  const found = musicPath(key);
  if (!found) return;
  if (musicKey === found.key && musicEl) {
    if (musicEl.paused && suspendReasons.size === 0) musicEl.play().catch(() => {});
    return;
  }
  stopMusic();
  musicKey = found.key;

  const el = new Audio();
  el.src = found.path;
  el.loop = true;
  el.preload = 'auto';
  musicEl = el;

  createContext();
  if (ctx) {
    try {
      const node = ctx.createMediaElementSource(el);
      node.connect(musicGain);
      el._viaContext = true;
    } catch (e) {
      el._viaContext = false;
    }
  }
  applyGains();

  if (suspendReasons.size === 0) el.play().catch(() => {});
}

export function stopMusic() {
  pendingMusic = null;
  if (musicEl) {
    musicEl.pause();
    musicEl.removeAttribute('src');
    try { musicEl.load(); } catch (e) {}
  }
  musicEl = null;
  musicKey = null;
}

export function setMuted(v) {
  muted = !!v;
  storageSet('rts_muted', muted ? '1' : '0');
  applyGains();
}
export function isMuted() { return muted; }

export function setSfxVolume(v) {
  sfxVolume = Math.max(0, Math.min(1, v));
  applyGains();
}
export function setMusicVolume(v) {
  musicVolume = Math.max(0, Math.min(1, v));
  applyGains();
}

// Приостановить весь звук. Возобновится, когда снимут все причины.
export function suspendAudio(reason) {
  suspendReasons.add(reason);
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  if (musicEl) musicEl.pause();
}

export function resumeAudio(reason) {
  suspendReasons.delete(reason);
  if (suspendReasons.size > 0) return;
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (musicEl && musicKey) musicEl.play().catch(() => {});
}

export const pauseAllAudio  = () => suspendAudio('manual');
export const resumeAllAudio = () => resumeAudio('manual');

export const playClick          = () => playSound('ui_click');
export const playReady          = () => playSound('ui_ready');
export const playError          = () => playSound('ui_error');
export const playSelect         = () => playSound('ui_select');
export const playOrder          = () => playSound('ui_order');
export const playBuildComplete  = () => playSound('ui_build_complete');
export const playAlert          = () => playSound('ui_alert');
export const playExplosion      = () => playSound('explosion');
