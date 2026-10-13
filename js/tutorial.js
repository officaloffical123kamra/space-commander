// js/tutorial.js
import { progress, saveProgress } from './progress.js';
import { storageGet } from './storage.js';
import { inputText } from './ui.js';

const KEY = 'rts_tutorial_done';

const STEPS = [
  {
    text: inputText('Выдели рабочего (КСМ) — ЛЕВОЙ кнопкой мыши',
                    'Коснись рабочего (КСМ), чтобы выделить его'),
    check: (g) => g.hasWorkerSelected
  },
  {
    text: inputText('ПРАВОЙ кнопкой по минералам — рабочий пойдёт добывать',
                    'Теперь коснись минералов — рабочий пойдёт добывать'),
    check: (g) => g.hasMining
  },
  {
    text: 'Выдели КСМ, нажми «Хранилище» внизу и поставь здание, после этого построй казарму',
    check: (g) => g.hasBarracks
  },
  {
    text: 'В казарме производи бойцов и отправь их в бой',
    check: (g) => g.hasArmy
  }
];

export function isTutorialDone() {
  return !!progress.tutorialDone || storageGet(KEY) === '1';
}

export function markTutorialDone() {
  progress.tutorialDone = true;
  saveProgress();
}

let currentStep = 0;
let active = false;
let container = null;

export function startTutorial() {
  if (isTutorialDone()) return;
  active = true;
  currentStep = 0;

  container = document.createElement('div');
  container.id = 'tutorial-box';
  container.innerHTML = `
    <div class="tutorial-title">📘 ОБУЧЕНИЕ</div>
    <div id="tutorial-text"></div>
    <button id="tutorial-skip">Пропустить</button>
  `;
  document.body.appendChild(container);
  document.getElementById('tutorial-text').textContent = STEPS[0].text;
  document.getElementById('tutorial-skip').addEventListener('click', () => {
    markTutorialDone();
    stopTutorial();
  });
}

export function stopTutorial() {
  active = false;
  if (container) { container.remove(); container = null; }
}

export function updateTutorial(state) {
  if (!active || !container) return;
  const step = STEPS[currentStep];
  if (step && step.check(state)) {
    currentStep++;
    if (currentStep >= STEPS.length) {
      markTutorialDone();
      container.innerHTML = '<div class="tutorial-done">✅ Обучение завершено! Удачи в бою!</div>';
      setTimeout(stopTutorial, 2500);
      return;
    }
    document.getElementById('tutorial-text').textContent = STEPS[currentStep].text;
  }
}
