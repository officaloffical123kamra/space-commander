// js/tutorial.js
// Обучение: отдельный режим «📘 Обучение». Пошаговый урок:
// выделить рабочего → добыча минералов → хранилище → казарма → 3 бойца → победить врагов.
// Шаги проверяются автоматически; нужные кнопки подсвечиваются.
import { progress, saveProgress, addMoney } from './progress.js';
import { storageGet } from './storage.js';
import { inputText } from './ui.js';

const LEGACY_KEY = 'rts_tutorial_done';
export const TUTORIAL_REWARD = 100;

export function isTutorialDone() {
  return !!progress.tutorialDone || storageGet(LEGACY_KEY) === '1';
}

export function markTutorialDone() {
  progress.tutorialDone = true;
  saveProgress();
}

// g — состояние игры (считает main.js), st — память шага
function buildSteps() {
  return [
    {
      title: 'Выделите рабочего',
      text: inputText(
        'Это ваш рабочий (КСМ). Нажмите на него ЛЕВОЙ кнопкой мыши.',
        'Это ваш рабочий (КСМ). Коснитесь его пальцем.'
      ),
      check: (g) => g.workerSelected
    },
    {
      title: 'Добывайте минералы',
      text: inputText(
        'Теперь нажмите ПРАВОЙ кнопкой мыши на голубые кристаллы — рабочий пойдёт добывать минералы ◆.',
        'Теперь коснитесь голубых кристаллов — рабочий пойдёт добывать минералы ◆.'
      ),
      check: (g, st) => { if (g.workerMining) st.mined = true; return !!st.mined; }
    },
    {
      title: 'Постройте Хранилище',
      text: 'Выделите рабочего и нажмите кнопку «Хранилище» внизу, затем выберите место для здания. ' +
        'Хранилище увеличивает лимит армии. Стоит 100 ◆. Подождите, пока рабочий достроит.',
      glow: ['[data-build="storage"]'],
      check: (g) => g.storage
    },
    {
      title: 'Постройте Казарму',
      text: 'Так же постройте «Казарму» (100 ◆) — в ней обучают бойцов. Она открывается после Хранилища.',
      glow: ['[data-build="barracks"]'],
      check: (g) => g.barracks
    },
    {
      title: 'Обучите 3 бойцов',
      text: inputText(
        'Нажмите на казарму, затем 3 раза на кнопку «Боец» (50 ◆ за каждого). Не хватает минералов — подождите, рабочий их добывает.',
        'Коснитесь казармы, затем 3 раза кнопки «Боец» (50 ◆ за каждого). Не хватает минералов — подождите, рабочий их добывает.'
      ),
      glow: ['[data-produce="marine"]'],
      check: (g) => g.marines >= 3
    },
    {
      title: 'Победите врагов',
      text: inputText(
        'Появились враги — они красные, камера показывает их. Выделите бойцов рамкой (зажмите ЛКМ и потяните) и нажмите ПРАВОЙ кнопкой на врага. Бойцы сами атакуют.',
        'Появились враги — они красные, камера показывает их. Нажмите «Армия» справа, затем коснитесь врага. Бойцы сами атакуют.'
      ),
      glow: ['#tb-army'],
      onEnter: (api) => api.spawnEnemies(),
      check: (g) => g.enemiesSpawned && g.enemies === 0
    }
  ];
}

let steps = [];
let index = 0;
let active = false;
let finished = false;
let box = null;
let api = null;
const memory = [];

export function isTutorialActive() { return active; }

export function startTutorial(tutorialApi) {
  api = tutorialApi;
  steps = buildSteps();
  index = 0;
  finished = false;
  active = true;
  memory.length = 0;
  for (let i = 0; i < steps.length; i++) memory.push({});

  box = document.createElement('div');
  box.id = 'tutorial-box';
  document.body.appendChild(box);
  render();
}

export function stopTutorial() {
  active = false;
  clearGlow();
  if (box) { box.remove(); box = null; }
}

function clearGlow() {
  document.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
}

function applyGlow() {
  clearGlow();
  const step = steps[index];
  if (!step || !step.glow) return;
  for (const sel of step.glow) document.querySelectorAll(sel).forEach((e) => e.classList.add('tut-glow'));
}

function render() {
  if (!box) return;
  const step = steps[index];
  if (!step) return;
  const dots = steps.map((_, i) => `<span class="tut-dot ${i < index ? 'done' : i === index ? 'now' : ''}"></span>`).join('');
  box.innerHTML = `
    <div class="tutorial-title">📘 ОБУЧЕНИЕ · шаг ${index + 1} из ${steps.length}</div>
    <div class="tut-dots">${dots}</div>
    <div class="tut-step-title"></div>
    <div id="tutorial-text"></div>
    <button id="tutorial-skip">Пропустить обучение</button>
  `;
  box.querySelector('.tut-step-title').textContent = step.title;
  document.getElementById('tutorial-text').textContent = step.text;
  document.getElementById('tutorial-skip').addEventListener('click', () => {
    stopTutorial();
    if (api && api.skip) api.skip();
  });
}

// Вызывается каждый кадр
export function updateTutorial(g) {
  if (!active || finished || !box) return;
  let advanced = false;
  while (index < steps.length && steps[index].check(g, memory[index])) {
    index++;
    advanced = true;
    if (index < steps.length && steps[index].onEnter) steps[index].onEnter(api);
  }
  if (index >= steps.length) {
    finished = true;
    clearGlow();
    let reward = 0;
    if (!isTutorialDone()) { reward = TUTORIAL_REWARD; addMoney(reward); }
    markTutorialDone();
    box.innerHTML = '<div class="tutorial-done">✅ Обучение пройдено!</div>';
    setTimeout(() => { stopTutorial(); }, 1500);
    if (api && api.finish) api.finish(reward);
    return;
  }
  if (advanced) render();
  applyGlow();
}
