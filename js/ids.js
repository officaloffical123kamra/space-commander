// js/ids.js
// Уникальные номера юнитов и зданий — чтобы приказы и состояние
// можно было передавать по сети.
let nextId = 1;
const byId = new Map();

export function assignId(o, id = null) {
  if (o.id != null) byId.delete(o.id);
  o.id = id != null ? id : nextId++;
  byId.set(o.id, o);
  return o;
}

export function getById(id) {
  return byId.get(id) || null;
}

export function forgetId(o) {
  if (o && o.id != null && byId.get(o.id) === o) byId.delete(o.id);
}
