// js/selection.js
import * as THREE from 'three';
import { availableUnits, upgrades, COSTS, getWeaponBonus, getArmorReduction, canBuildType, getMissingRequirement, BUILDING_NAMES } from './build.js';
import { inputText } from './ui.js';
import { session, isMine, isFriendly, teamOf } from './session.js';
import { getUpgrades } from './upgrades.js';
import { playClick } from './audio.js';

export const selection = { units: [], building: null };

const rings = [];
let buildingRing = null;
let mineralRing = null;
let gasRing = null;
let buildTab = 'main';

function getRing(index, color = 0x44ff44) {
  if (!rings[index]) {
    const ringGeo = new THREE.RingGeometry(0.55, 0.7, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    rings[index] = { mesh: ring, mat: ringMat };
  }
  return rings[index];
}
function getBuildingRing() {
  if (!buildingRing) {
    const ringGeo = new THREE.RingGeometry(1.8, 2.1, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    buildingRing = { mesh: ring, mat: ringMat };
  }
  return buildingRing;
}
function getMineralRing() {
  if (!mineralRing) {
    const ringGeo = new THREE.RingGeometry(1.5, 1.9, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x4ea6ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    mineralRing = { mesh: ring, mat: ringMat };
  }
  return mineralRing;
}
function getGasRing() {
  if (!gasRing) {
    const ringGeo = new THREE.RingGeometry(1.3, 1.7, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x44ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    gasRing = { mesh: ring, mat: ringMat };
  }
  return gasRing;
}

export function hideAllRings() {
  for (const r of rings) if (r) r.mesh.visible = false;
  if (buildingRing) buildingRing.mesh.visible = false;
  if (mineralRing) mineralRing.mesh.visible = false;
  if (gasRing) gasRing.mesh.visible = false;
}

export function updateSelectionRings(scene) {
  hideAllRings();
  let i = 0;
  for (const u of selection.units) {
    if (u.inBunker) { i++; continue; }
    const ring = getRing(i, u.isWorker ? 0x44ddff : 0x44ff44);
    if (!ring.mesh.parent) scene.add(ring.mesh);
    ring.mesh.position.set(u.mesh.position.x, 0.05, u.mesh.position.z);
    ring.mesh.visible = true;
    const t = performance.now() * 0.005;
    ring.mat.opacity = 0.6 + Math.sin(t) * 0.3;
    i++;
  }
  if (selection.building) {
    const br = getBuildingRing();
    if (!br.mesh.parent) scene.add(br.mesh);
    br.mesh.position.set(selection.building.mesh.position.x, 0.06, selection.building.mesh.position.z);
    br.mesh.visible = true;
    const t = performance.now() * 0.004;
    br.mat.opacity = 0.5 + Math.sin(t) * 0.35;
  }
  let mineralsHL = null, gasHL = null;
  for (const u of selection.units) {
    if (!u.isWorker) continue;
    if (u.refinery) gasHL = u.refinery;
    else if (u.minerals) mineralsHL = u.minerals;
    if (gasHL || mineralsHL) break;
  }
  if (mineralsHL) {
    const mr = getMineralRing();
    if (!mr.mesh.parent) scene.add(mr.mesh);
    mr.mesh.position.set(mineralsHL.x, 0.05, mineralsHL.z);
    mr.mesh.visible = true;
    const t = performance.now() * 0.005;
    mr.mat.opacity = 0.5 + Math.sin(t) * 0.4;
  }
  if (gasHL) {
    const gr = getGasRing();
    if (!gr.mesh.parent) scene.add(gr.mesh);
    const px = gasHL.mesh ? gasHL.mesh.position.x : gasHL.x;
    const pz = gasHL.mesh ? gasHL.mesh.position.z : gasHL.z;
    gr.mesh.position.set(px, 0.05, pz);
    gr.mesh.visible = true;
    const t = performance.now() * 0.005;
    gr.mat.opacity = 0.5 + Math.sin(t) * 0.4;
  }
}

// Убрать из выделения погибших юнитов и разрушенные здания
export function pruneSelection() {
  let changed = false;
  if (selection.units.length) {
    const alive = selection.units.filter(u => u && u.mesh && u.hp > 0 && !u.dead);
    if (alive.length !== selection.units.length) {
      selection.units = alive;
      changed = true;
    }
  }
  if (selection.building && selection.building.hp <= 0) {
    selection.building = null;
    changed = true;
  }
  if (changed) {
    updatePortrait(); updateCombatPanel(); updateActionsPanel();
  }
}

export function clearSelection() {
  selection.units = []; selection.building = null;
  updatePortrait(); updateCombatPanel(); updateActionsPanel();
}
export function selectUnits(list) {
  selection.units = list.slice(); selection.building = null;
  updatePortrait(); updateCombatPanel(); updateActionsPanel();
}
export function selectBuilding(b) {
  selection.units = []; selection.building = b;
  updatePortrait(); updateCombatPanel(); updateActionsPanel();
}

export function updatePortrait() {
  const nameEl = document.getElementById('portrait-name');
  const hpFill = document.getElementById('portrait-hp-fill');
  const hpText = document.getElementById('portrait-hp-text');
  const hintEl = document.getElementById('portrait-hint');
  const iconEl = document.getElementById('portrait-icon');
  if (!nameEl) return;
  if (hintEl) hintEl.textContent = '';

  const ICONS = {
    scv: '👷', marine: '🪖', marauder: '🔫', ghost: '👻', medic: '⛑',
    hellion: '🔥', tank: '💥', thor: '⚡', viking: '✈️', banshee: '🛸',
    battlecruiser: '🚀', cc: '🏛', barracks: '🏭', factory: '⚙️',
    starport: '🚀', refinery: '⬢', storage: '📦', bunker: '🛡',
    sensor: '📡', turret: '🔫', engineering: '🔧', armory: '⚔️'
  };

  if (selection.units.length === 0 && !selection.building) {
    nameEl.textContent = 'Ничего не выбрано';
    hpFill.style.width = '100%'; hpFill.style.background = '#444'; hpText.textContent = '';
    if (iconEl) iconEl.textContent = '❔';
    return;
  }
  if (selection.building) {
    const b = selection.building;
    let txt = BUILDING_NAMES[b.type] || b.type;
    if (!isFriendly(b)) txt = 'Враг: ' + txt;
    else if (!isMine(b)) txt = 'Союзник: ' + txt;
    if (b.hasReactor) txt += ' [+Реактор]';
    if (b.hasTechlab) txt += ' [+Тех-лаб]';
    if (b.type === 'bunker') txt += ` (${b.garrison.length}/${b.maxGarrison})`;
    nameEl.textContent = txt;
    if (iconEl) iconEl.textContent = ICONS[b.type] || '🏢';
    const ratio = Math.max(0, b.hp / b.maxHp);
    hpFill.style.width = (ratio * 100) + '%';
    hpFill.style.background = ratio > 0.5 ? '#44dd44' : ratio > 0.25 ? '#ddaa22' : '#dd3333';
    hpText.textContent = `${Math.ceil(b.hp)} / ${b.maxHp}`;
    return;
  }
  if (selection.units.length === 1) {
    const u = selection.units[0];
    let role = u.isWorker ? 'Рабочий' : (u.name || u.type || 'Боец');
    if (u.sieged) role += ' (осада)';
    if (u.canTransform) role += u.inAirForm ? ' ✈' : ' 🚗';
    if (u.isInvisible) role += ' 👻';
    if (u.inBunker) role += ' (в бункере)';
    if (u.construction) role += ' (строит)';
    if (u.repairJob) role += ' (ремонт)';
    nameEl.textContent = role;
    if (iconEl) iconEl.textContent = ICONS[u.type] || '🪖';
    const ratio = Math.max(0, u.hp / u.maxHp);
    hpFill.style.width = (ratio * 100) + '%';
    hpFill.style.background = ratio > 0.5 ? '#44dd44' : ratio > 0.25 ? '#ddaa22' : '#dd3333';
    hpText.textContent = `${Math.max(0, Math.ceil(u.hp))} / ${u.maxHp}`;
    if (hintEl) {
      if (u.isWorker) hintEl.textContent = `⚙${u.speed} ⛏`;
      else if (u.isHealer) hintEl.textContent = `⚕+${u.healAmount} R${u.healRange}`;
      else hintEl.textContent = `🔫${u.attack} 🎯${u.attackRange} ⚡${u.attackSpeed} 👣${u.speed}`;
    }
  } else {
    nameEl.textContent = `Выбрано: ${selection.units.length}`;
    if (iconEl) iconEl.textContent = '👥';
    const totalHp = selection.units.reduce((s, u) => s + Math.max(0, u.hp), 0);
    const totalMax = selection.units.reduce((s, u) => s + u.maxHp, 0);
    const ratio = totalMax > 0 ? totalHp / totalMax : 0;
    hpFill.style.width = (ratio * 100) + '%';
    hpFill.style.background = ratio > 0.5 ? '#44dd44' : ratio > 0.25 ? '#ddaa22' : '#dd3333';
    hpText.textContent = `${Math.ceil(totalHp)} / ${totalMax}`;
  }
}

let actionHandlers = {};
export function setActionHandlers(handlers) {
  actionHandlers = handlers;
  const combatRow = document.getElementById('combat-row');
  if (combatRow && !combatRow.dataset.bound) {
    combatRow.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'attack') actionHandlers.attack?.();
      else if (a === 'stop') actionHandlers.stop?.();
      else if (a === 'siege') actionHandlers.siege?.();
      else if (a === 'transform') actionHandlers.transform?.();
      else if (a === 'repair') actionHandlers.repair?.();
      else if (a === 'mineHint') actionHandlers.mineHint?.();
      else if (a === 'superShot') actionHandlers.superShot?.();
    });
    combatRow.dataset.bound = '1';
  }
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(t => t.addEventListener('click', () => {
    buildTab = t.dataset.tab;
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    renderBuildRow();
  }));
  updateCombatPanel();
  updateActionsPanel();
  renderBuildRow();
}

export function updateCombatPanel() {
  const label = document.getElementById('combat-label');
  const row = document.getElementById('combat-row');
  if (!label || !row) return;
  row.innerHTML = '';

  if (selection.units.length === 0) {
    label.textContent = 'Бой';
    const info = document.createElement('div');
    info.style.color = '#667'; info.style.fontSize = '12px'; info.style.padding = '8px 4px';
    info.textContent = selection.building ? 'Выбрано здание' : 'Выберите любое войско';
    row.appendChild(info);
    return;
  }

  const hasCombat = selection.units.some(u => !u.isWorker && !u.isHealer && !u.inBunker);
  const hasSiege = selection.units.some(u => u.canSiege && !u.inBunker);
  const hasTransform = selection.units.some(u => u.canTransform && !u.inBunker);
  const hasWorker = selection.units.some(u => u.isWorker && !u.inBunker);
  const hasGhost = selection.units.some(u => u.superShot && !u.inBunker);

  if (hasWorker && !hasCombat && !hasGhost) {
    label.textContent = 'Рабочий';

    const repairingWorker = selection.units.find(u => u.isWorker && u.repairJob);
    if (repairingWorker) {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.dataset.cancelRepair = '1';
      btn.innerHTML = `<div class="btn-icon">❌</div><div class="btn-label">Отменить ремонт</div><div class="btn-cost">${inputText('ESC', '')}</div>`;
      btn.addEventListener('click', () => {
        actionHandlers.cancelRepair?.(repairingWorker.repairJob);
      });
      row.appendChild(btn);
      return;
    }

    row.appendChild(makeBtn('🔧', 'Чинить', inputText('ЛКМ', ''), 'repair'));
    row.appendChild(makeBtn('⛏', 'Добывать', inputText('ПКМ', ''), 'mineHint'));
    return;
  }

  label.textContent = 'Бой';
  if (hasCombat || hasGhost) {
    row.appendChild(makeBtn('🎯', 'Атака', 'Q', 'attack'));
    row.appendChild(makeBtn('🛑', 'Стоп', 'S', 'stop'));
  }
  if (hasSiege) row.appendChild(makeBtn('🛡', 'Осада', 'T', 'siege'));
  if (hasTransform) row.appendChild(makeBtn('🔄', 'Форма', 'V', 'transform'));
  if (hasGhost) row.appendChild(makeBtn('💥', 'Super-shot', 'X', 'superShot'));
  if (hasWorker) row.appendChild(makeBtn('🔧', 'Чинить', inputText('ЛКМ', ''), 'repair'));
}

function makeBtn(icon, label, cost, action) {
  const btn = document.createElement('button');
  btn.className = 'action-btn';
  btn.dataset.action = action;
  btn.innerHTML = `<div class="btn-icon">${icon}</div><div class="btn-label">${label}</div><div class="btn-cost">${inputText(cost, '')}</div>`;
  return btn;
}

const BUILD_MAIN = [
  { id: 'cc',        icon: '🏛', label: 'КЦ',        cost: '400 ◆' },
  { id: 'barracks',  icon: '🏭', label: 'Казарма',   cost: '100 ◆' },
  { id: 'refinery',  icon: '⬢',  label: 'Рефайнери', cost: '75 ◆' },
  { id: 'factory',   icon: '⚙️', label: 'Завод',     cost: '150◆100⬢' },
  { id: 'starport',  icon: '🚀', label: 'Космопорт', cost: '150◆100⬢' },
  { id: 'storage',   icon: '📦', label: 'Хранилище', cost: '100 ◆' }
];
const BUILD_EXTRA = [
  { id: 'bunker',      icon: '🛡', label: 'Бункер',    cost: '100 ◆' },
  { id: 'sensor',      icon: '📡', label: 'Антенна',   cost: '125◆ 50⬢' },
  { id: 'turret',      icon: '🔫', label: 'Туррель',   cost: '100 ◆' },
  { id: 'engineering', icon: '🔧', label: 'Инж. комп.',cost: '125 ◆' },
  { id: 'armory',      icon: '⚔️', label: 'Арсенал',   cost: '150◆100⬢' }
];

export function renderBuildRow() {
  const row = document.getElementById('build-row');
  if (!row) return;
  row.innerHTML = '';
  const list = buildTab === 'main' ? BUILD_MAIN : BUILD_EXTRA;
  for (const item of list) {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.dataset.build = item.id;

    const available = canBuildType(item.id);

    btn.innerHTML = `<div class="btn-icon">${item.icon}</div><div class="btn-label">${item.label}</div><div class="btn-cost">${item.cost}</div>`;

    if (!available) {
      btn.style.opacity = '0.35';
      btn.style.cursor = 'not-allowed';
      btn.style.borderColor = '#552222';
      const missing = getMissingRequirement(item.id);
      btn.title = `Требуется: ${missing}`;

      btn.addEventListener('click', () => {
        playClick();
        const hint = document.getElementById('hint');
        if (hint) {
          hint.textContent = `Требуется: ${missing}`;
          hint.classList.add('show');
          setTimeout(() => hint.classList.remove('show'), 2000);
        }
      });
    } else {
      btn.addEventListener('click', () => actionHandlers.build?.(item.id));
    }

    row.appendChild(btn);
  }
}

const UNIT_INFO = {
  scv:      { icon: '👷', label: 'КСМ',     cost: '50◆' },
  marine:   { icon: '🪖', label: 'Боец',    cost: '50◆' },
  marauder: { icon: '🔫', label: 'Мародёр', cost: '75◆ 25⬢' },
  ghost:    { icon: '👻', label: 'Призрак', cost: '100◆ 50⬢' },
  medic:    { icon: '⛑',  label: 'Медик',   cost: '75◆' },
  hellion:  { icon: '🔥', label: 'Гелион',  cost: '100◆' },
  tank:     { icon: '💥', label: 'Танк',    cost: '150◆ 100⬢' },
  thor:     { icon: '⚡', label: 'Тор',     cost: '300◆ 200⬢' },
  viking:   { icon: '✈️', label: 'Викинг',  cost: '125◆ 75⬢' },
  banshee:  { icon: '🛸', label: 'Банши',   cost: '150◆ 100⬢' },
  battlecruiser: { icon: '🚀', label: 'Крейсер', cost: '400◆ 300⬢' }
};

export function updateActionsPanel() {
  const label = document.getElementById('context-label');
  const row = document.getElementById('context-row');
  const buildPanel = document.getElementById('build-panel');
  if (!row || !label || !buildPanel) return;
  row.innerHTML = '';

  const hasWorker = selection.units.some(u => u.isWorker);
  if (hasWorker) buildPanel.classList.remove('hidden');
  else buildPanel.classList.add('hidden');

  // === КСМ занят (стройка или ремонт) — всегда показываем кнопку отмены ===
  const busyWorker = selection.units.find(u => u.isWorker && (u.construction || u.repairJob));
  if (busyWorker) {
    if (busyWorker.construction) {
      label.textContent = 'Рабочий (строит)';
      const info = document.createElement('div');
      info.style.color = '#8ac';
      info.style.fontSize = '12px';
      info.style.padding = '8px 4px';
      info.textContent = `Строит: ${BUILDING_NAMES[busyWorker.construction.type] || busyWorker.construction.type}. Отменить?`;
      row.appendChild(info);

      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.dataset.cancel = '1';
      btn.innerHTML = `<div class="btn-icon">❌</div><div class="btn-label">Отменить</div><div class="btn-cost">${inputText('ESC', '')}</div>`;
      btn.addEventListener('click', () => {
        actionHandlers.cancelConstruction?.(busyWorker.construction);
      });
      row.appendChild(btn);
    } else if (busyWorker.repairJob) {
      label.textContent = 'Рабочий (ремонт)';
      const b = busyWorker.repairJob.building;
      const info = document.createElement('div');
      info.style.color = '#ffaa22';
      info.style.fontSize = '12px';
      info.style.padding = '8px 4px';
      const pct = Math.round(Math.max(0, Math.min(1, b.hp / b.maxHp)) * 100);
      info.textContent = `🔧 ${BUILDING_NAMES[b.type] || b.type} — ${pct}% (${Math.ceil(b.hp)} / ${b.maxHp})`;
      row.appendChild(info);

      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.innerHTML = `<div class="btn-icon">❌</div><div class="btn-label">Отменить</div><div class="btn-cost">${inputText('ESC', '')}</div>`;
      btn.addEventListener('click', () => {
        actionHandlers.cancelRepair?.(busyWorker.repairJob);
      });
      row.appendChild(btn);
    }
    return;
  }

  if (selection.units.length === 0 && !selection.building) {
    label.textContent = 'Действия'; return;
  }

  if (selection.building) {
    const b = selection.building;
    if (!isMine(b)) { label.textContent = isFriendly(b) ? 'Здание союзника' : 'Здание врага'; return; }

    if (b.type === 'cc') {
      label.textContent = 'Командный центр';
      row.appendChild(makeProduceBtn('👷', 'КСМ', '50◆', 'scv', b));
      renderProductionQueue(row, b);
      return;
    }
    if (b.type === 'barracks' || b.type === 'factory' || b.type === 'starport') {
      label.textContent = 'Производство';
      const list = availableUnits(b);
      for (const t of list) {
        const info = UNIT_INFO[t];
        row.appendChild(makeProduceBtn(info.icon, info.label, info.cost, t, b));
      }
      renderProductionQueue(row, b);

      const div = document.createElement('div');
      div.style.width = '100%'; div.style.height = '1px'; div.style.background = '#223'; div.style.margin = '4px 0';
      row.appendChild(div);
      if (b.addonTaken) {
        const info = document.createElement('div');
        info.style.color = '#8a8'; info.style.fontSize = '12px'; info.style.padding = '6px';
        info.textContent = b.hasReactor ? '✅ Реактор установлен' : '✅ Тех-лаб установлен';
        row.appendChild(info);
      } else {
        row.appendChild(makeAddonBtn('🧪', 'Реактор', '50◆ 50⬢', 'reactor', b));
        row.appendChild(makeAddonBtn('🔬', 'Тех-лаб', '100◆ 100⬢', 'techlab', b));
      }
      return;
    }
    if (b.type === 'engineering') {
      label.textContent = `Инж. комплекс — Апгрейды (до 5)`;
      const myUpg = getUpgrades(session.localTeam);
      row.appendChild(makeUpgBtn('🔫', 'Оружие пехоты', myUpg.infantryWeapon, 'upgInfWeapon'));
      row.appendChild(makeUpgBtn('🛡', 'Броня пехоты',  myUpg.infantryArmor,  'upgInfArmor'));
      return;
    }
    if (b.type === 'armory') {
      label.textContent = `Арсенал — Апгрейды техники (до 5)`;
      const myUpg = getUpgrades(session.localTeam);
      row.appendChild(makeUpgBtn('🔫', 'Оружие техники', myUpg.vehicleWeapon, 'upgVehWeapon'));
      row.appendChild(makeUpgBtn('🛡', 'Броня техники',  myUpg.vehicleArmor,  'upgVehArmor'));
      return;
    }
    if (b.type === 'bunker') {
      label.textContent = `Бункер (${b.garrison.length}/${b.maxGarrison})`;
      const info = document.createElement('div');
      info.style.cssText = 'font-size:12px;color:#cde;padding:6px;width:100%;';
      if (b.garrison.length === 0) {
        info.textContent = inputText('Выделите бойцов и ПКМ по бункеру', 'Выделите бойцов и коснитесь бункера');
      } else {
        info.innerHTML = 'Внутри: ' + b.garrison.map(g => g.name || 'юнит').join(', ');
      }
      row.appendChild(info);
      if (b.garrison.length > 0) {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.innerHTML = `<div class="btn-icon">📤</div><div class="btn-label">Высадить</div><div class="btn-cost">всех</div>`;
        btn.addEventListener('click', () => actionHandlers.ungarrison?.(b));
        row.appendChild(btn);
      }
      return;
    }
    if (b.type === 'sensor') {
      label.textContent = `📡 Антенна — обзор ${b.sight}`;
      const info = document.createElement('div');
      info.style.cssText = 'font-size:12px;color:#8df;padding:6px;width:100%;';
      info.innerHTML = `
        <div>📡 Радиус обзора: <b>${b.sight}</b></div>
        <div>👻 Детект невидимок: <b>${b.detectorRadius || b.sight}</b></div>
        <div style="color:#8a7a55;font-size:11px;margin-top:4px;">Вижу призраков и банши в радиусе</div>
      `;
      row.appendChild(info);
      return;
    }
    label.textContent = 'Здание';
    return;
  }

  if (selection.units.length === 1) {
    const u = selection.units[0];
    label.textContent = u.isWorker ? 'Рабочий (КСМ)' : (u.name || 'Юнит');
    const card = document.createElement('div');
    card.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;color:#cde;padding:4px 8px;background:rgba(0,0,0,0.3);border-radius:4px;width:100%;';

    if (u.isWorker) {
      card.innerHTML = `
        <div>❤ HP: ${Math.ceil(u.hp)} / ${u.maxHp}</div>
        <div>⚙ Скорость: ${u.speed}</div>
        <div>⛏ Добыча: минералы / газ</div>
        <div>🏗 Строит и ремонтирует</div>
      `;
    } else if (u.isHealer) {
      card.innerHTML = `
        <div>❤ HP: ${Math.ceil(u.hp)} / ${u.maxHp}</div>
        <div>⚕ Лечение: +${u.healAmount} HP каждые ${u.healCooldown}s</div>
        <div>🎯 Радиус лечения: ${u.healRange}</div>
        <div>⚙ Скорость: ${u.speed}</div>
      `;
    } else {
      const team = teamOf(u);
      const upg = getUpgrades(team);
      const wBonus = getWeaponBonus(u.type, team);
      const aBonus = getArmorReduction(u.type, team);
      const isVehicle = ['hellion','tank','thor','viking','banshee','battlecruiser'].includes(u.type);
      const lvlW = isVehicle ? upg.vehicleWeapon : upg.infantryWeapon;
      const lvlA = isVehicle ? upg.vehicleArmor  : upg.infantryArmor;

      card.innerHTML = `
        <div>❤ HP: ${Math.ceil(u.hp)} / ${u.maxHp}</div>
        <div>🔫 Урон: ${u.attack} <span style="color:#4ea6ff">(+${wBonus} = ${u.attack + wBonus})</span></div>
        <div>🛡 Броня: −${aBonus} вх. урона</div>
        <div>🎯 Дальность: ${u.attackRange}</div>
        <div>⚡ Скорость атаки: ${u.attackSpeed}s</div>
        <div>👣 Скорость: ${u.speed}${u.sieged ? ' (осада)' : ''}${u.isFlying ? ' ✈' : ''}</div>
        <div>🔬 Апгрейды: оружие ур.${lvlW}, броня ур.${lvlA}</div>
        ${u.isInvisible ? '<div>👻 Невидим</div>' : ''}
        ${u.superShot ? `<div>💥 Super-shot: ${u.superShot.damage} урона, дальность ${u.superShot.range}</div>` : ''}
        ${u.canSiege ? `<div>🛡 Осадный: +${u.siegeData.attack - u.baseData.attack} урона</div>` : ''}
        ${u.canTransform ? `<div>🔄 Трансформация: ${u.inAirForm ? 'воздух' : 'земля'}</div>` : ''}
        ${u.inBunker ? '<div>🛡 В бункере</div>' : ''}
      `;
    }
    row.appendChild(card);
    return;
  }

  label.textContent = `Выбрано: ${selection.units.length}`;
  const info = document.createElement('div');
  info.style.cssText = 'font-size:12px;color:#8ac;padding:8px;';
  const totalHp = selection.units.reduce((s,u)=>s+Math.max(0,u.hp),0);
  const totalMax = selection.units.reduce((s,u)=>s+u.maxHp,0);
  info.innerHTML = `❤ Суммарное HP: ${Math.ceil(totalHp)} / ${totalMax}`;
  row.appendChild(info);
}

function renderProductionQueue(row, building) {
  if (!building.productionQueue || building.productionQueue.length === 0) return;

  const queueEl = document.createElement('div');
  queueEl.id = 'production-queue';

  const maxShow = 5;
  for (let i = 0; i < Math.min(building.productionQueue.length, maxShow); i++) {
    const job = building.productionQueue[i];
    const info = UNIT_INFO[job.type] || { icon: '❔', label: '?' };

    const slot = document.createElement('div');
    slot.className = 'prod-slot';

    const progress = 1 - (job.time / (job.totalTime || job.time || 1));
    slot.innerHTML = `
      <span class="prod-index">${i + 1}</span>
      <span>${info.icon}</span>
      <div class="prod-progress" style="width: ${Math.max(0, Math.min(100, progress * 100))}%"></div>
    `;
    queueEl.appendChild(slot);
  }

  if (building.productionQueue.length > maxShow) {
    const more = document.createElement('div');
    more.className = 'prod-slot';
    more.style.fontSize = '12px';
    more.textContent = `+${building.productionQueue.length - maxShow}`;
    queueEl.appendChild(more);
  }

  row.appendChild(queueEl);
}

function makeProduceBtn(icon, label, cost, type, building) {
  const btn = document.createElement('button');
  btn.className = 'action-btn';
  btn.dataset.produce = type;
  btn.innerHTML = `<div class="btn-icon">${icon}</div><div class="btn-label">${label}</div><div class="btn-cost">${cost}</div>`;
  btn.addEventListener('click', () => actionHandlers.produce?.(type, building));
  return btn;
}
function makeAddonBtn(icon, label, cost, type, building) {
  const btn = document.createElement('button');
  btn.className = 'action-btn';
  btn.innerHTML = `<div class="btn-icon">${icon}</div><div class="btn-label">${label}</div><div class="btn-cost">${cost}</div>`;
  btn.addEventListener('click', () => actionHandlers.addon?.(type, building));
  return btn;
}
function makeUpgBtn(icon, label, level, upgType) {
  const btn = document.createElement('button');
  btn.className = 'action-btn';
  const cost = COSTS[upgType];
  const costStr = `Ур. ${level}/5 — ${cost.minerals}◆ ${cost.vespene}⬢`;
  btn.innerHTML = `<div class="btn-icon">${icon}</div><div class="btn-label">${label}</div><div class="btn-cost">${costStr}</div>`;
  btn.addEventListener('click', () => {
    actionHandlers.upgrade?.(upgType);
    updateActionsPanel();
  });
  return btn;
}

export function updateQueueOnly() {
  const b = selection.building;
  if (!b || !b.productionQueue) return;

  const queueEl = document.getElementById('production-queue');

  if (!queueEl) {
    if (b.productionQueue.length > 0) updateActionsPanel();
    return;
  }

  if (b.productionQueue.length === 0) {
    queueEl.remove();
    return;
  }

  const maxShow = 5;
  const slots = queueEl.querySelectorAll('.prod-slot');

  for (let i = 0; i < slots.length; i++) {
    if (i >= maxShow || i >= b.productionQueue.length) {
      slots[i].remove();
      continue;
    }
    const job = b.productionQueue[i];
    const info = UNIT_INFO[job.type] || { icon: '❔' };
    const progress = 1 - (job.time / (job.totalTime || job.time || 1));
    const iconSpan = slots[i].querySelector('span:nth-child(2)');
    const progBar = slots[i].querySelector('.prod-progress');
    if (iconSpan) iconSpan.textContent = info.icon;
    if (progBar) progBar.style.width = Math.max(0, Math.min(100, progress * 100)) + '%';
  }

  for (let i = slots.length; i < Math.min(b.productionQueue.length, maxShow); i++) {
    const job = b.productionQueue[i];
    const info = UNIT_INFO[job.type] || { icon: '❔' };
    const slot = document.createElement('div');
    slot.className = 'prod-slot';
    const progress = 1 - (job.time / (job.totalTime || job.time || 1));
    slot.innerHTML = `
      <span class="prod-index">${i + 1}</span>
      <span>${info.icon}</span>
      <div class="prod-progress" style="width: ${Math.max(0, Math.min(100, progress * 100))}%"></div>
    `;
    queueEl.appendChild(slot);
  }
}