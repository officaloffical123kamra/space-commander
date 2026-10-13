// Экран победы / поражения
import { buildings, commandCenters } from './build.js';
import { units } from './units.js';
import { requestRestart, returnToMenu } from './menu.js';

let gameOver = false;

export function isGameOver() { return gameOver; }

export function checkGameOver() {
  if (gameOver) return;

  const playerCC = commandCenters.find(cc => (cc.owner || 'player') === 'player' && cc.hp > 0);
  const botCC = commandCenters.find(cc => cc.owner === 'bot' && cc.hp > 0);

  // Поражение: нет КЦ игрока
  if (!playerCC) {
    triggerDefeat();
    return;
  }
  // Победа: у бота нет ни КЦ, ни зданий, ни армии
  if (!botCC) {
    const botBuildings = buildings.filter(b => b.owner === 'bot' && b.hp > 0);
    const botArmy = units.filter(u => !u.isPlayer && !u.isWorker && u.hp > 0);
    if (botBuildings.length === 0 && botArmy.length === 0) {
      triggerVictory();
    }
  }
}

function triggerVictory() {
  if (gameOver) return;
  gameOver = true;
  showScreen('victory', 'Победа!', 'База противника уничтожена');
}

function triggerDefeat() {
  if (gameOver) return;
  gameOver = true;
  showScreen('defeat', 'Поражение', 'Ваш командный центр уничтожен');
}

function showScreen(type, title, subtitle) {
  const box = document.getElementById('gameover');
  if (!box) return;
  box.classList.add('show');
  box.classList.add(type);
  document.getElementById('gameover-title').textContent = title;
  document.getElementById('gameover-subtitle').textContent = subtitle;

  document.getElementById('gameover-restart')?.addEventListener('click', () => requestRestart(), { once: true });
  document.getElementById('gameover-menu')?.addEventListener('click', () => returnToMenu(), { once: true });
}
