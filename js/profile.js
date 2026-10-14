// js/profile.js
// Профиль игрока: ник и стартовые ресурсы матча (запоминаются между запусками).
import { storageGet, storageSet } from './storage.js';

const NICK_KEY = 'rts_nick';
const RES_KEY = 'rts_startres';

export const START_MINERALS_DEFAULT = 150;
export const START_VESPENE_DEFAULT = 0;
export const START_MINERALS_MAX = 2000;
export const START_VESPENE_MAX = 1000;

export function cleanNick(raw) {
  return String(raw || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
}

export function getNick() {
  return cleanNick(storageGet(NICK_KEY));
}

export function setNick(nick) {
  storageSet(NICK_KEY, cleanNick(nick));
}

const clamp = (v, max) => Math.max(0, Math.min(max, Math.round((Number(v) || 0) / 50) * 50));

export function getStartRes() {
  try {
    const raw = storageGet(RES_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return {
        minerals: clamp(d.minerals, START_MINERALS_MAX),
        vespene: clamp(d.vespene, START_VESPENE_MAX)
      };
    }
  } catch (e) {}
  return { minerals: START_MINERALS_DEFAULT, vespene: START_VESPENE_DEFAULT };
}

export function setStartRes(res) {
  const clean = {
    minerals: clamp(res.minerals, START_MINERALS_MAX),
    vespene: clamp(res.vespene, START_VESPENE_MAX)
  };
  storageSet(RES_KEY, JSON.stringify(clean));
  return clean;
}
