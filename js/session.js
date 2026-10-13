// js/session.js
// Кто играет и в каком режиме.
//
// Команда (team) — сторона в бою: 'player' или 'bot'. По ней работают бой, туман, победа.
// Управляющий (ctrl) — кто отдаёт приказы и платит: 'p1' (хост/одиночная игра),
// 'p2' (друг по сети) или 'ai' (бот/волны).
//   Кооператив: p1 и p2 оба в команде 'player'.
//   Против друга: p2 играет за команду 'bot' (бот при этом выключен).

export const session = {
  mode: 'skirmish',   // 'skirmish' | 'campaign' | 'survival' | 'coop' | 'pvp'
  role: 'local',      // 'local' | 'host' | 'guest'
  localCtrl: 'p1',
  localTeam: 'player',
  actor: null         // чей приказ сейчас выполняется (для подсказок по сети)
};

export function isNetGame() {
  return session.role !== 'local';
}

export function isSurvivalMode() {
  return session.mode === 'survival' || session.mode === 'coop';
}

export function teamOf(o) {
  if (!o) return null;
  if (o.isUnit) return o.isPlayer ? 'player' : 'bot';
  return o.owner || 'player';
}

export function ctrlOf(o) {
  if (!o) return null;
  if (o.ctrl) return o.ctrl;
  return teamOf(o) === 'player' ? 'p1' : 'ai';
}

export function teamOfCtrl(ctrl) {
  if (ctrl === 'p1') return 'player';
  if (ctrl === 'p2') return session.mode === 'pvp' ? 'bot' : 'player';
  return 'bot';
}

export function isMine(o) {
  return ctrlOf(o) === session.localCtrl;
}

export function isFriendly(o) {
  return teamOf(o) === session.localTeam;
}

// Оттенок модели глазами локального игрока: свои — без оттенка,
// союзник — зелёный, враг — красный.
export function tintFor(team, ctrl) {
  if (ctrl === session.localCtrl) return null;
  if (team === session.localTeam) return 0x33bb66;
  return 0xaa3333;
}

// На хосте подсказки/звуки для игрока 2 уходят ему по сети
let remoteNotify = null;
export function setRemoteNotify(fn) {
  remoteNotify = fn;
}

// true — сообщение отправлено другу и показывать его локально не нужно
export function routeToRemote(kind, payload) {
  if (session.role === 'host' && session.actor && session.actor !== session.localCtrl) {
    if (remoteNotify) remoteNotify(session.actor, kind, payload);
    return true;
  }
  if (session.actor === 'ai') return true; // боту подсказки не нужны
  return false;
}

export function withActor(ctrl, fn) {
  const prev = session.actor;
  session.actor = ctrl;
  try {
    return fn();
  } finally {
    session.actor = prev;
  }
}
