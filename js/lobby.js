// js/lobby.js
// Экран «Игра по сети»: хост создаёт игру, друг присоединяется.
// Работает только при запуске игры через локальный сервер (node tools/serve.mjs).
import { netConnect, netSend, onNet, netClose } from './net.js';
import { session, teamOfCtrl } from './session.js';
import { MAPS } from './maps.js';
import { playClick } from './audio.js';

let onStart = null;
let showScreenFn = null;
let phase = 'choose';
let mode = 'coop';
let mapId = 'classic';
let addresses = [];
let errorText = '';

const MODES = [
  { id: 'coop', icon: '🛡', title: 'Вместе против волн', desc: 'Две базы рядом, враги идут со всех 4 сторон. Сколько волн продержитесь?' },
  { id: 'pvp',  icon: '⚔', title: 'Против друга',       desc: 'У каждого своя база. Побеждает тот, кто разрушит командный центр соперника.' }
];

export function initLobby({ startGame, showScreen }) {
  onStart = startGame;
  showScreenFn = showScreen;

  onNet('hosted', (msg) => {
    addresses = msg.addresses || [];
    phase = 'hosting';
    render();
  });
  onNet('guest-joined', () => {
    if (phase !== 'hosting') return;
    netSend({ t: 'start', mode, mapId });
    launch('host', mode, mapId);
  });
  onNet('joined', () => {
    phase = 'joined';
    render();
  });
  onNet('no-host', () => {
    errorText = 'Друг ещё не создал игру. Пусть он нажмёт «Создать игру», затем попробуйте снова.';
    phase = 'choose';
    render();
  });
  onNet('busy', () => {
    errorText = 'К этой игре уже подключился другой игрок.';
    phase = 'choose';
    render();
  });
  onNet('start', (msg) => {
    if (phase !== 'joined') return;
    launch('guest', msg.mode, msg.mapId);
  });
}

export async function openLobby() {
  errorText = '';
  phase = 'connecting';
  showScreenFn('net-screen');
  render();
  try {
    await netConnect();
    phase = 'choose';
  } catch (e) {
    phase = 'unavailable';
  }
  render();
}

function launch(role, m, map) {
  session.role = role;
  session.mode = m;
  session.mapId = map;
  session.localCtrl = role === 'guest' ? 'p2' : 'p1';
  session.localTeam = teamOfCtrl(session.localCtrl);
  phase = 'playing';
  if (onStart) onStart();
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function button(text, cls, onClick) {
  const b = el('button', 'menu-btn ' + (cls || ''), text);
  b.addEventListener('click', () => { playClick(); onClick(); });
  return b;
}

function render() {
  const box = document.getElementById('net-content');
  if (!box) return;
  box.innerHTML = '';

  if (phase === 'connecting') {
    box.appendChild(el('p', 'net-text', 'Подключение…'));
    box.appendChild(backButton());
    return;
  }

  if (phase === 'unavailable') {
    box.appendChild(el('p', 'net-text',
      'Игра по сети работает, когда игра запущена с компьютера через локальный сервер ' +
      '(команда node tools/serve.mjs). Оба устройства должны быть в одной Wi-Fi сети.'));
    box.appendChild(backButton());
    return;
  }

  if (phase === 'hosting') {
    box.appendChild(el('p', 'net-text', '✅ Игра создана. Ждём друга…'));
    const hint = el('div', 'net-steps');
    hint.appendChild(el('div', '', '1. Друг открывает в браузере:'));
    const list = addresses.length ? addresses : [location.host];
    for (const a of list) hint.appendChild(el('div', 'net-address', 'http://' + a + '/'));
    hint.appendChild(el('div', '', '2. Нажимает «Игра по сети» → «Присоединиться».'));
    hint.appendChild(el('div', '', '3. Игра начнётся сама.'));
    box.appendChild(hint);
    box.appendChild(el('p', 'net-text', '⚠ Игру считает этот компьютер: не сворачивайте окно и не переключайте вкладку, пока играете.'));
    box.appendChild(button('✖ Отмена', '', () => {
      netSend({ t: 'leave' });
      phase = 'choose';
      render();
    }));
    return;
  }

  if (phase === 'joined') {
    box.appendChild(el('p', 'net-text', '✅ Подключено! Игра сейчас начнётся…'));
    return;
  }

  // === Выбор режима ===
  if (errorText) box.appendChild(el('p', 'net-error', errorText));

  const modes = el('div', 'net-modes');
  for (const m of MODES) {
    const card = el('div', 'map-card' + (m.id === mode ? ' selected' : ''));
    card.appendChild(el('div', 'map-name', `${m.icon} ${m.title}`));
    card.appendChild(el('div', 'map-desc', m.desc));
    card.addEventListener('click', () => { playClick(); mode = m.id; render(); });
    modes.appendChild(card);
  }
  box.appendChild(modes);

  if (mode === 'pvp') {
    const maps = el('div', 'diff-block');
    maps.appendChild(el('div', 'diff-title', 'Карта'));
    const row = el('div', 'diff-row');
    for (const id in MAPS) {
      const b = el('button', 'menu-btn diff-btn' + (id === mapId ? ' active' : ''), MAPS[id].name);
      b.addEventListener('click', () => { playClick(); mapId = id; render(); });
      row.appendChild(b);
    }
    maps.appendChild(row);
    box.appendChild(maps);
  }

  const buttons = el('div', 'menu-buttons');
  buttons.appendChild(button('➕ Создать игру', 'primary', () => {
    errorText = '';
    netSend({ t: 'host', mode, mapId });
  }));
  buttons.appendChild(button('🔗 Присоединиться', '', () => {
    errorText = '';
    phase = 'joining';
    render();
    netSend({ t: 'join' });
  }));
  buttons.appendChild(backButton(true));
  box.appendChild(buttons);
}

function backButton(inline = false) {
  const b = button('← Назад', '', () => {
    netSend({ t: 'leave' });
    netClose();
    phase = 'choose';
    showScreenFn('main-menu');
  });
  if (inline) return b;
  const wrap = el('div', 'menu-buttons');
  wrap.appendChild(b);
  return wrap;
}
