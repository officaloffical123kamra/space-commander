// js/audio.js
// Звук на WebAudio:
//  - эффекты декодируются в буферы и могут звучать одновременно;
//  - громкость работает и на iOS (там у <audio> громкость не меняется);
//  - музыка грузится только когда нужна (раньше при старте качались все 38 МБ);
//  - звук можно приостановить по причине (свёрнута вкладка, реклама, пауза SDK).
import { storageGet, storageSet } from './storage.js';

// Только файлы, которые реально есть в assets/sounds.
// Чтобы добавить звук — положите файл и допишите строку сюда
// (например voice_marauder_select — путь к voices/marauder/select.mp3).
const SFX = {
  ui_click:            'assets/sounds/ui/click.mp3',
  ui_ready:            'assets/sounds/ui/ready.mp3',
  ui_error:            'assets/sounds/ui/error.mp3',

  marine_shoot:        'assets/sounds/units/marine_shoot.mp3',
  ghost_shoot:         'assets/sounds/units/ghost_shoot.mp3',
  tank_shoot:          'assets/sounds/units/tank_shoot.mp3',
  turret_shoot:        'assets/sounds/units/tank_shoot.mp3',

  marine_death:        'assets/sounds/units/marine_death.mp3',
  ghost_death:         'assets/sounds/units/ghost_death.mp3',
  tank_death:          'assets/sounds/units/tank_death.mp3',

  voice_marine_select: 'assets/sounds/voices/marine/select.mp3',
  voice_marine_order:  'assets/sounds/voices/marine/order.mp3',
  voice_ghost_select:  'assets/sounds/voices/ghost/select.mp3',
  voice_tank_select:   'assets/sounds/voices/tank/select.mp3'
};

const MUSIC = {
  music_menu:      'assets/sounds/music/menu.mp3',
  music_classic:   'assets/sounds/music/classic.mp3',
  music_canyon:    'assets/sounds/music/canyon.mp3',
  music_islands:   'assets/sounds/music/islands.mp3',
  music_labyrinth: 'assets/sounds/music/labyrinth.mp3'
};
const MUSIC_FALLBACK = 'music_classic';

const MAX_VOICES = 16;        // одновременно звучащих эффектов
const SAME_SOUND_GAP = 0.06;  // сек — не накладываем один и тот же звук чаще

let ctx = null;
let masterGain = null, sfxGain = null, musicGain = null;
const rawData = {};   // key -> Promise<ArrayBuffer>
const buffers = {};   // key -> AudioBuffer
const decoding = {};
const lastPlayed = {};
let activeVoices = 0;

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

export function initAudio() {
  for (const key in SFX) {
    rawData[key] = fetch(SFX[key])
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('404'))));
    rawData[key].catch(() => {});
  }
  const opts = { capture: true, passive: true };
  window.addEventListener('pointerdown', unlock, opts);
  window.addEventListener('touchend', unlock, opts);
  window.addEventListener('keydown', unlock, opts);
}

export function playSound(key, volume = null) {
  if (muted || suspendReasons.size > 0) return;
  if (!ctx || ctx.state !== 'running') return;
  const buf = buffers[key];
  if (!buf) { decode(key); return; }

  const now = ctx.currentTime;
  if (lastPlayed[key] && now - lastPlayed[key] < SAME_SOUND_GAP) return;
  if (activeVoices >= MAX_VOICES) return;
  lastPlayed[key] = now;

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

export function playMusic(key = MUSIC_FALLBACK) {
  if (!MUSIC[key]) key = MUSIC_FALLBACK;
  if (musicKey === key && musicEl) {
    if (musicEl.paused && suspendReasons.size === 0) musicEl.play().catch(() => {});
    return;
  }
  stopMusic();
  musicKey = key;

  const el = new Audio();
  el.src = MUSIC[key];
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
