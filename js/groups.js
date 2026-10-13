// js/groups.js
import { selection, selectUnits } from './selection.js';

const GROUPS = {}; // { '1': [unit, unit, ...], '2': [...] }
let lastPressTime = 0;
let lastGroupKey = null;
const DOUBLE_CLICK_MS = 350;

export function initGroups(camera) {
  window.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key < '1' || key > '9') return;

    // Ctrl + цифра — сохранить группу
    if (e.ctrlKey) {
      e.preventDefault();
      saveGroup(key);
      return;
    }

    // Обычная цифра — выделить группу / двойной клик — камера
    const now = performance.now();
    const isDouble = (key === lastGroupKey) && (now - lastPressTime < DOUBLE_CLICK_MS);

    if (isDouble) {
      focusCameraOnGroup(key, camera);
      lastGroupKey = null;
      lastPressTime = 0;
    } else {
      selectGroup(key);
      lastGroupKey = key;
      lastPressTime = now;
    }
  });
}

function saveGroup(key) {
  const units = selection.units.filter(u => u && u.mesh);
  if (units.length === 0) {
    console.log(`Группа ${key} не сохранена — пусто`);
    return;
  }
  GROUPS[key] = units.slice();
  console.log(`Группа ${key} сохранена: ${units.length} юнитов`);
  // Показать подсказку игроку
  const hint = document.getElementById('hint');
  if (hint) {
    hint.textContent = `Группа ${key}: ${units.length} юнитов`;
    hint.classList.add('show');
    setTimeout(() => hint.classList.remove('show'), 1200);
  }
}

function selectGroup(key) {
  const group = GROUPS[key];
  if (!group || group.length === 0) return;
  // Убираем мёртвых
  const alive = group.filter(u => u && u.mesh && u.hp > 0 && !u.inBunker);
  GROUPS[key] = alive;
  if (alive.length === 0) return;
  selectUnits(alive);
}

function focusCameraOnGroup(key, camera) {
  const group = GROUPS[key];
  if (!group || group.length === 0) return;
  let sx = 0, sz = 0, count = 0;
  for (const u of group) {
    if (!u || !u.mesh) continue;
    sx += u.mesh.position.x;
    sz += u.mesh.position.z;
    count++;
  }
  if (count === 0) return;
  const cx = sx / count;
  const cz = sz / count;
  camera.position.x = cx;
  camera.position.z = cz + 5;
}