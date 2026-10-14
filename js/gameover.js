// Экран победы / поражения
import { buildings, commandCenters } from './build.js';
import { units } from './units.js';
import { requestRestart, returnToMenu } from './menu.js';
import { session, isSurvivalMode, isNetGame } from './session.js';

let gameOver = false;
// Итог: { winnerTeam: 'player' | 'bot' | null, title, subtitle }
let result = null;

export function isGameOver() { return gameOver; }
export function getGameResult() { return result; }

function hasCC(team) {
  return commandCenters.some(cc => (cc.owner || 'player') === team && cc.hp > 0);
}

// Проверка на хосте/в одиночной игре
export function checkGameOver(extra = {}) {
  if (gameOver) return;
  if (session.mode === 'tutorial') return; // в обучении конец игры не проверяем

  if (isSurvivalMode()) {
    if (!hasCC('player')) {
      // Волна, на которой база пала, не считается отбитой
      const waves = Math.max(0, (extra.wave || 1) - 1);
      finish({
        winnerTeam: 'bot',
        survival: true,
        title: 'Оборона пала',
        subtitle: `Отбито волн: ${waves}`
      });
    }
    return;
  }

  if (session.mode === 'pvp') {
    if (!hasCC('player')) finish({ winnerTeam: 'bot' });
    else if (!hasCC('bot')) finish({ winnerTeam: 'player' });
    return;
  }

  // Против бота
  if (!hasCC('player')) {
    finish({ winnerTeam: 'bot' });
    return;
  }
  if (!hasCC('bot')) {
    const botBuildings = buildings.filter(b => b.owner === 'bot' && b.hp > 0);
    const botArmy = units.filter(u => !u.isPlayer && !u.isWorker && u.hp > 0);
    if (botBuildings.length === 0 && botArmy.length === 0) finish({ winnerTeam: 'player' });
  }
}

// У друга по сети итог приходит от хоста
export function forceGameOver(res) {
  if (gameOver) return;
  finish(res);
}

function finish(res) {
  gameOver = true;
  result = res;
  const won = res.winnerTeam === session.localTeam;
  if (res.survival) {
    showScreen('defeat', res.title, res.subtitle);
  } else if (won) {
    showScreen('victory', 'Победа!', session.mode === 'pvp' ? 'База друга уничтожена' : 'База противника уничтожена');
  } else {
    showScreen('defeat', 'Поражение', 'Ваш командный центр уничтожен');
  }
}

export function isLocalWin() {
  return !!result && !result.survival && result.winnerTeam === session.localTeam;
}

function showScreen(type, title, subtitle) {
  const box = document.getElementById('gameover');
  if (!box) return;
  box.classList.add('show');
  box.classList.add(type);
  document.getElementById('gameover-title').textContent = title;
  document.getElementById('gameover-subtitle').textContent = subtitle;

  const restart = document.getElementById('gameover-restart');
  // По сети «Играть снова» нельзя — нужно заново собрать игру в лобби
  if (restart) restart.style.display = isNetGame() ? 'none' : '';
  restart?.addEventListener('click', () => requestRestart(), { once: true });
  document.getElementById('gameover-menu')?.addEventListener('click', () => returnToMenu(), { once: true });
}
