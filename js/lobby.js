// js/lobby.js
// Экран «Игра по сети» (до 4 игроков): хост создаёт игру, друзья присоединяются,
// хост нажимает «Начать игру». Работает только при запуске игры через локальный сервер
// (node tools/serve.mjs), все устройства должны быть в одной Wi-Fi сети.
import { netConnect, netSend, onNet, netClose } from './net.js';
import { session, teamOfCtrl } from './session.js';
import { MAPS } from './maps.js';
import { playClick } from './audio.js';

let onStart = null;
let showScreenFn = null;
let phase = 'choose';   // connecting | unavailable | choose | hosting | joined | playing
let mode = 'coop';
let mapId = 'classic';
let addresses = [];
let slots = ['p1'];     // кто сейчас в комнате
let mySlot = 'p1';
let errorText = '';

const MODES = [
  { id: 'coop', icon: '🛡', title: 'Вместе против волн', desc: 'До 4 игроков. У каждого своя база рядом, враги идут со всех 4 сторон. Сколько волн продержитесь?' },
  { id: 'pvp',  icon: '⚔', title: 'Друг против друга',  desc: '2 игрока — один на один. 3 игрока — двое против одного. 4 игрока — две команды по двое.' }
];

const PLAYER_NAMES = { p1: 'Игрок 1 (хост)', p2: 'Игрок 2', p3: 'Игрок 3', p4: 'Игрок 4' };
const ALL_SLOTS = ['p1', 'p2', 'p3', 'p4'];

export function initLobby({ startGame, showScreen }) {
  onStart = startGame;
  showScreenFn = showScreen;

  onNet('hosted', (msg) => {
    addresses = msg.addresses || [];
    phase = 'hosting';
    mySlot = 'p1';
    render();
  });
  onNet('players', (msg) => {
    slots = msg.slots || ['p1'];
    if (phase === 'hosting' || phase === 'joined') render();
  });
  onNet('joined', (msg) => {
    mySlot = msg.slot;
    mode = msg.mode || mode;
    mapId = msg.mapId || mapId;
    phase = 'joined';
    render();
  });
  onNet('mode', (msg) => {
    mode = msg.mode || mode;
    mapId = msg.mapId || mapId;
    if (phase === 'joined') render();
  });
  onNet('no-host', () => {
    errorText = 'Игра ещё не создана. Пусть хост нажмёт «Создать игру», затем попробуйте снова.';
    phase = 'choose';
    render();
  });
  onNet('busy', () => {
    errorText = 'Игра уже началась или все 4 места заняты.';
    phase = 'choose';
    render();
  });
  onNet('peer-left', () => {
    // В лобби: хост закрыл игру
    if (phase === 'joined') {
      errorText = 'Хост закрыл игру.';
      phase = 'choose';
      render();
    }
  });
  onNet('start', (msg) => {
    if (phase !== 'joined') return;
    launch('guest', msg.mode, msg.mapId, msg.players || slots);
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

function launch(role, m, map, players) {
  session.role = role;
  session.mode = m;
  session.mapId = map;
  session.players = players.slice();
  session.localCtrl = role === 'guest' ? mySlot : 'p1';
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

function modeInfo() {
  const m = MODES.find((x) => x.id === mode);
  if (!m) return '';
  return `${m.icon} ${m.title}` + (mode === 'pvp' && MAPS[mapId] && slots.length <= 2 ? ` · карта «${MAPS[mapId].name}»` : '');
}

function playersList() {
  const list = el('div', 'net-players');
  for (const s of ALL_SLOTS) {
    const here = slots.includes(s);
    const row = el('div', 'net-player' + (here ? ' here' : ''));
    const you = s === mySlot ? ' — это вы' : '';
    let team = '';
    if (mode === 'pvp' && here) {
      team = slots.indexOf(s) % 2 === 0 ? ' · 🔵 синие' : ' · 🔴 красные';
    }
    row.appendChild(el('span', '', (here ? '✅ ' : '⏳ ') + PLAYER_NAMES[s] + you + team));
    if (!here) row.appendChild(el('span', 'net-wait', 'ждём…'));
    list.appendChild(row);
  }
  return list;
}

function leaveToChoose() {
  netSend({ t: 'leave' });
  phase = 'choose';
  slots = ['p1'];
  render();
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
      '(команда node tools/serve.mjs). Все устройства должны быть в одной Wi-Fi сети.'));
    box.appendChild(backButton());
    return;
  }

  if (phase === 'hosting') {
    box.appendChild(el('p', 'net-text', '✅ Игра создана: ' + modeInfo()));
    const hint = el('div', 'net-steps');
    hint.appendChild(el('div', '', '1. Друзья открывают в браузере (ПК или телефон):'));
    const list = addresses.length ? addresses : [location.host];
    for (const a of list) hint.appendChild(el('div', 'net-address', 'http://' + a + '/'));
    hint.appendChild(el('div', '', '2. Нажимают «Игра по сети» → «Присоединиться».'));
    hint.appendChild(el('div', '', '3. Когда все в сборе — нажмите «Начать игру».'));
    box.appendChild(hint);
    box.appendChild(playersList());
    box.appendChild(el('p', 'net-text', '⚠ Игру считает этот компьютер: не сворачивайте окно и не переключайте вкладку, пока играете.'));

    const buttons = el('div', 'menu-buttons');
    const start = button(`▶ Начать игру (${slots.length}/4)`, 'primary', () => {
      if (slots.length < 2) return;
      netSend({ t: 'start', mode, mapId, players: slots });
      launch('host', mode, mapId, slots);
    });
    if (slots.length < 2) {
      start.disabled = true;
      start.style.opacity = '0.45';
      start.textContent = '▶ Начать игру (ждём друзей…)';
    }
    buttons.appendChild(start);
    buttons.appendChild(button('✖ Отмена', '', leaveToChoose));
    box.appendChild(buttons);
    return;
  }

  if (phase === 'joined') {
    box.appendChild(el('p', 'net-text', '✅ Вы подключены: ' + modeInfo()));
    box.appendChild(playersList());
    box.appendChild(el('p', 'net-text', 'Ждём, пока хост начнёт игру…'));
    const buttons = el('div', 'menu-buttons');
    buttons.appendChild(button('✖ Выйти', '', leaveToChoose));
    box.appendChild(buttons);
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
    maps.appendChild(el('div', 'diff-title', 'Карта (для 2 игроков; для 3–4 — арена с четырьмя углами)'));
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
    slots = ['p1'];
    netSend({ t: 'host', mode, mapId });
  }));
  buttons.appendChild(button('🔗 Присоединиться', '', () => {
    errorText = '';
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
