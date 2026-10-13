// js/storage.js
// Безопасная обёртка над localStorage. В iframe Яндекс Игр (особенно Safari)
// доступ к localStorage может бросать исключение — тогда храним в памяти.
const memory = {};

export function storageGet(key) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch (e) {}
  return key in memory ? memory[key] : null;
}

export function storageSet(key, value) {
  memory[key] = String(value);
  try { localStorage.setItem(key, String(value)); } catch (e) {}
}

export function storageRemove(key) {
  delete memory[key];
  try { localStorage.removeItem(key); } catch (e) {}
}

export function sessionGet(key) {
  try { return sessionStorage.getItem(key); } catch (e) { return null; }
}

export function sessionSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch (e) {}
}

export function sessionRemove(key) {
  try { sessionStorage.removeItem(key); } catch (e) {}
}
