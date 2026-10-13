// js/campaign.js
import { progress, saveProgress } from './progress.js';

// 40 миссий: 4 карты × 10 миссий
// mиссии 1-10 → classic, 11-20 → canyon, 21-30 → islands, 31-40 → labyrinth
export const MISSIONS = [];

const MAP_ROTATION = ['classic', 'canyon', 'islands', 'labyrinth'];

const MISSION_NAMES = {
  classic:   ['Первая высадка', 'Разведка', 'Захват руды', 'Стройка', 'БОСС: Титан', 'Оборона', 'Контратака', 'Прорыв', 'Осада', 'ФИНАЛ: Ковчег'],
  canyon:    ['Пустынный конвой', 'Жара', 'Перехват', 'Песчаная буря', 'БОСС: Гидра', 'Засада', 'Дюны', 'Миражи', 'Погоня', 'ФИНАЛ: Скорпион'],
  islands:   ['Снежный десант', 'Ледяной ветер', 'Северный форпост', 'Метель', 'БОСС: Йети', 'Дрейф', 'Ледник', 'Полярная ночь', 'Лавина', 'ФИНАЛ: Кракен'],
  labyrinth: ['Огненный путь', 'Пепел', 'Лавовые поля', 'Магма', 'БОСС: Инферно', 'Кратер', 'Геенна', 'Пекло', 'Вулкан', 'ФИНАЛ: Дьявол']
};

const DIFFICULTY_MULT = {
  easy: 1.0,
  normal: 1.5,
  hard: 2.5,
  insane: 4.0
};

// Строим 40 миссий
let idx = 0;
for (let mapIdx = 0; mapIdx < 4; mapIdx++) {
  const mapId = MAP_ROTATION[mapIdx];
  const names = MISSION_NAMES[mapId];
  for (let i = 0; i < 10; i++) {
    idx++;
    const isBoss = (i + 1) % 5 === 0;
    MISSIONS.push({
      id: idx,
      mapId,
      missionNumber: i + 1,
      name: names[i],
      isBoss,
      baseReward: 100 + idx * 20
    });
  }
}

// Прогресс кампании
if (!progress.campaign) {
  progress.campaign = {
    completed: [],        // массив id пройденных миссий
    difficulty: 'normal'  // текущая сложность
  };
}

export function getCurrentMission() {
  // Первая непройденная
  for (const m of MISSIONS) {
    if (!progress.campaign.completed.includes(m.id)) return m;
  }
  return MISSIONS[MISSIONS.length - 1];
}

export function getMissionById(id) {
  return MISSIONS.find(m => m.id === id);
}

export function isMissionUnlocked(id) {
  if (id === 1) return true;
  return progress.campaign.completed.includes(id - 1);
}

export function completeMission(id, difficulty) {
  if (!progress.campaign.completed.includes(id)) {
    progress.campaign.completed.push(id);
  }
  const mission = getMissionById(id);
  if (!mission) return 0;

  const mult = DIFFICULTY_MULT[difficulty] || 1;
  const reward = Math.floor(mission.baseReward * mult);
  progress.money += reward;

  // Ежедневный стрик — уже есть в progress.js
  saveProgress();
  return reward;
}

export function setCampaignDifficulty(diff) {
  progress.campaign.difficulty = diff;
  saveProgress();
}

export function getCampaignDifficulty() {
  return progress.campaign.difficulty || 'normal';
}

export function getCompletedCount() {
  return progress.campaign.completed.length;
}

export function getTotalMissions() {
  return MISSIONS.length;
}

export { DIFFICULTY_MULT };