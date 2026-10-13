// js/progress.js
import { storageGet, storageSet } from './storage.js';
import { saveToCloud, loadFromCloud } from './yandex.js';

const KEY = 'rts_progress';
const CLOUD_SAVE_DELAY = 3000;

export const progress = {
  wins: 0,
  losses: 0,
  money: 0,
  bestTime: null,
  bestDifficulty: null,
  achievements: [],
  skins: ['default'],
  activeSkin: 'default',
  unitSkins: {},
  buildingSkins: {},
  lastDaily: null,
  dailyStreak: 0,
  tutorialDone: false,
  savedAt: 0
};

function ensureDefaults() {
  if (!Array.isArray(progress.achievements)) progress.achievements = [];
  if (!Array.isArray(progress.skins)) progress.skins = ['default'];
  if (!progress.skins.includes('default')) progress.skins.unshift('default');
  if (!progress.unitSkins || typeof progress.unitSkins !== 'object') progress.unitSkins = {};
  if (!progress.buildingSkins || typeof progress.buildingSkins !== 'object') progress.buildingSkins = {};
  if (typeof progress.money !== 'number' || !isFinite(progress.money)) progress.money = 0;
  if (!progress.campaign || !Array.isArray(progress.campaign.completed)) {
    progress.campaign = { completed: [], difficulty: (progress.campaign && progress.campaign.difficulty) || 'normal' };
  }
}

export function loadProgress() {
  try {
    const raw = storageGet(KEY);
    if (raw) Object.assign(progress, JSON.parse(raw));
  } catch (e) {}
  ensureDefaults();
}

let cloudTimer = null;

export function saveProgress() {
  progress.savedAt = Date.now();
  try {
    storageSet(KEY, JSON.stringify(progress));
  } catch (e) {}
  // В облако — с задержкой, чтобы не упираться в лимиты SDK
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => {
    cloudTimer = null;
    saveToCloud(JSON.parse(JSON.stringify(progress)));
  }, CLOUD_SAVE_DELAY);
}

// Немедленно отправить сохранение в облако (перед перезагрузкой/сворачиванием)
export function flushCloudSave() {
  if (cloudTimer) {
    clearTimeout(cloudTimer);
    cloudTimer = null;
  }
  return saveToCloud(JSON.parse(JSON.stringify(progress)), true);
}

// Подтянуть сохранение из облака Яндекса. Берём более свежее.
export async function initCloudSync() {
  loadProgress();
  const cloud = await loadFromCloud();
  if (cloud && typeof cloud === 'object' && (cloud.savedAt || 0) > (progress.savedAt || 0)) {
    Object.assign(progress, cloud);
    ensureDefaults();
    try { storageSet(KEY, JSON.stringify(progress)); } catch (e) {}
  }
}

export function addWin(time, difficulty) {
  progress.wins++;
  progress.money += 100 + (difficulty === 'hard' ? 150 : difficulty === 'insane' ? 300 : 0);
  if (!progress.bestTime || time < progress.bestTime) progress.bestTime = time;
  if (!progress.bestDifficulty || difficulty === 'insane') progress.bestDifficulty = difficulty;
  saveProgress();
}

export function addLoss() {
  progress.losses++;
  progress.money += 25;
  saveProgress();
}

export function unlockAchievement(id) {
  if (progress.achievements.includes(id)) return false;
  progress.achievements.push(id);
  saveProgress();
  return true;
}

export function addMoney(amount) {
  progress.money += amount;
  saveProgress();
}

export function spendMoney(amount) {
  if (progress.money < amount) return false;
  progress.money -= amount;
  saveProgress();
  return true;
}

export function unlockSkin(id) {
  if (progress.skins.includes(id)) return false;
  progress.skins.push(id);
  saveProgress();
  return true;
}

export function setActiveSkin(id) {
  if (!progress.skins.includes(id)) return false;
  progress.activeSkin = id;
  saveProgress();
  return true;
}

export function checkDaily() {
  const today = new Date().toISOString().slice(0, 10);
  if (progress.lastDaily === today) return { claimed: false };
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (progress.lastDaily === yesterday) {
    progress.dailyStreak++;
  } else {
    progress.dailyStreak = 1;
  }
  progress.lastDaily = today;
  const reward = 200 + (progress.dailyStreak - 1) * 100;
  progress.money += reward;
  saveProgress();
  return { claimed: true, reward, streak: progress.dailyStreak };
}

ensureDefaults();
