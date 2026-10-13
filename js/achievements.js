// js/achievements.js
import { progress, unlockAchievement } from './progress.js';

export const ACHIEVEMENTS = {
  first_win:      { icon: '🏆', name: 'Первая победа',      desc: 'Выиграть 1 матч' },
  first_loss:     { icon: '💀', name: 'Первое поражение',   desc: 'Проиграть 1 матч' },
  speedrun:       { icon: '⚡', name: 'Скоростной',          desc: 'Выиграть за < 5 минут' },
  no_losses:      { icon: '🛡', name: 'Без потерь',          desc: 'Выиграть, не потеряв юнитов' },
  army_20:        { icon: '👥', name: 'Армия 20/20',         desc: 'Заполнить лимит армии' },
  rich:           { icon: '💰', name: 'Мастер экономики',    desc: 'Накопить 5000 минералов' },
  gas_master:     { icon: '⬢',  name: 'Газовый магнат',     desc: 'Накопить 2000 газа' },
  hard_win:       { icon: '🔥', name: 'Сложный бой',         desc: 'Победить на сложном' },
  insane_win:     { icon: '🧠', name: 'Безумный',            desc: 'Победить на безумном' },
  win_5:          { icon: '⭐', name: 'Ветеран',             desc: '5 побед' },
  win_10:         { icon: '🌟', name: 'Командир',            desc: '10 побед' },
  win_25:         { icon: '💎', name: 'Легенда',             desc: '25 побед' },
  build_all:      { icon: '🏗', name: 'Строитель',           desc: 'Построить все типы зданий' },
  full_army:      { icon: '⚔️', name: 'Полная армия',        desc: '30 юнитов одновременно' },
  fast_build:     { icon: '⏱', name: 'Быстрострой',         desc: 'Построить 5 зданий за 2 минуты' },
};

let builtTypes = new Set();
const buildTimes = [];

function unlock(id) {
  if (unlockAchievement(id)) showPopup(id);
}

export function trackBuildingBuilt(type) {
  builtTypes.add(type);
  if (['cc','barracks','factory','starport','storage','bunker','sensor','turret','engineering','armory'].every(t => builtTypes.has(t))) {
    unlock('build_all');
  }
  // «5 зданий за 2 минуты» — раньше давалось за 5 разных типов за всё время
  const now = performance.now();
  buildTimes.push(now);
  while (buildTimes.length && now - buildTimes[0] > 120000) buildTimes.shift();
  if (buildTimes.length >= 5) unlock('fast_build');
}

export function trackArmySize(size) {
  if (size >= 20) unlock('army_20');
  if (size >= 30) unlock('full_army');
}

export function trackResources(minerals, gas) {
  if (minerals >= 5000) unlock('rich');
  if (gas >= 2000) unlock('gas_master');
}

export function onWin(time, difficulty, lostUnits) {
  if (unlockAchievement('first_win')) showPopup('first_win');
  if (time < 300) if (unlockAchievement('speedrun')) showPopup('speedrun');
  if (lostUnits === 0) if (unlockAchievement('no_losses')) showPopup('no_losses');
  if (difficulty === 'hard') if (unlockAchievement('hard_win')) showPopup('hard_win');
  if (difficulty === 'insane') if (unlockAchievement('insane_win')) showPopup('insane_win');
  if (progress.wins >= 5) if (unlockAchievement('win_5')) showPopup('win_5');
  if (progress.wins >= 10) if (unlockAchievement('win_10')) showPopup('win_10');
  if (progress.wins >= 25) if (unlockAchievement('win_25')) showPopup('win_25');
}

export function onLoss() {
  if (unlockAchievement('first_loss')) showPopup('first_loss');
}

function showPopup(id) {
  const a = ACHIEVEMENTS[id];
  if (!a) return;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;' +
    'background:linear-gradient(180deg,rgba(60,45,20,0.98),rgba(25,18,8,1));' +
    'border:1px solid #c89848;border-left:4px solid #ffcc44;' +
    'padding:14px 20px;color:#f0d8a8;font-family:Consolas,monospace;font-size:14px;' +
    'box-shadow:0 4px 24px rgba(255,204,68,0.4);border-radius:2px;' +
    'animation:slideIn 0.4s ease;';
  el.innerHTML = `<div style="font-size:22px;margin-bottom:4px;">${a.icon}</div>` +
    `<div style="font-weight:bold;color:#ffcc44;">ДОСТИЖЕНИЕ!</div>` +
    `<div>${a.name}</div>` +
    `<div style="font-size:11px;color:#8a7a55;margin-top:4px;">${a.desc}</div>`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.4s, transform 0.4s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(30px)';
    setTimeout(() => el.remove(), 500);
  }, 4000);
}