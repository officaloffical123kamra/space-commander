// js/world.js
// Общие списки объектов мира. Вынесены в отдельный модуль без зависимостей,
// чтобы любые модули могли их читать без циклических импортов.

export const buildings = [];
export const commandCenters = [];
export const constructions = [];
export const repairs = [];

export const mineralPatches = [];
export const geysers = [];

// Ближайшее поле минералов, в котором ещё что-то осталось
export function findNearestMineralPatch(x, z, maxDist = Infinity) {
  let best = null, bestDist = maxDist;
  for (const mp of mineralPatches) {
    if (!mp || mp.amount <= 0) continue;
    const d = Math.hypot(mp.x - x, mp.z - z);
    if (d < bestDist) { bestDist = d; best = mp; }
  }
  return best;
}

export function findNearestGeyser(x, z, maxDist = Infinity) {
  let best = null, bestDist = maxDist;
  for (const g of geysers) {
    if (!g) continue;
    const d = Math.hypot(g.x - x, g.z - z);
    if (d < bestDist) { bestDist = d; best = g; }
  }
  return best;
}

// Ближайший живой командный центр владельца
export function findNearestCC(x, z, owner) {
  let best = null, bestDist = Infinity;
  for (const cc of commandCenters) {
    if (!cc || cc.hp <= 0) continue;
    if ((cc.owner || 'player') !== owner) continue;
    const d = Math.hypot(cc.x - x, cc.z - z);
    if (d < bestDist) { bestDist = d; best = cc; }
  }
  return best;
}
