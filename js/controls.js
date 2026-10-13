// js/controls.js
// Управление: мышь + клавиатура (ПК) и касания (телефоны/планшеты).
//
// Касания:
//  - тап по своему юниту — выделить (двойной тап — все такие же на экране);
//  - тап по земле/врагу/минералам при выделенных юнитах — приказ (как ПКМ);
//  - тап по своему зданию — выделить его; при выделенном здании тап по земле — точка сбора;
//  - протянуть одним пальцем — двигать камеру; двумя — масштаб;
//  - кнопки на панели: «Армия», «Рабочие», «Рамка», «Сброс».
import * as THREE from 'three';
import { units } from './units.js';
import {
  buildings, commandCenters, canBuildType, getMissingRequirement, canPlaceBuilding, COSTS
} from './build.js';
import { selection, clearSelection, selectUnits, selectBuilding, setActionHandlers } from './selection.js';
import { state } from './economy.js';
import { issue } from './commands.js';
import { isMine, isFriendly } from './session.js';
import { playClick, playSelect, playOrder, playSound, playExplosion } from './audio.js';
import { hasModel, getModel } from './models.js';
import { mineralPatches, geysers } from './world.js';
import { IS_TOUCH, inputText } from './ui.js';

const MAP_LIMIT = 28;
const MAP_SIZE = 60;
const MIN_ZOOM = 8;
const MAX_ZOOM = 40;
const DOUBLE_CLICK_MS = 350;
const TAP_MOVE_PX = 12;
const TOUCH_PICK_RADIUS = 1.6; // мир. ед. — палец толще курсора

export function setupControls(camera, renderer, scene) {
  const canvas = renderer.domElement;
  const keys = {};
  let buildMode = null;
  let attackMode = false;
  let repairMode = false;
  let snipeMode = false;
  let boxMode = false;

  let ghostMesh = null;
  let rallyGhost = null;

  let lastClickTime = 0;
  let lastClickUnit = null;

  const hintEl = document.getElementById('hint');
  const selBox = document.getElementById('selection-box');

  // ============================================================
  // ПРИЗРАК ЗДАНИЯ
  // ============================================================

  function createGhost(type) {
    removeGhost();
    let mesh;
    if (hasModel(type)) {
      mesh = getModel(type, 2.4);
    } else {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshStandardMaterial({ color: 0x66ff66 })
      );
      mesh.position.y = 1;
    }
    mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.55;
        child.material.depthWrite = false;
        child.material._origColor = child.material.color.clone();
      }
    });
    mesh.rotation.y = Math.PI;
    scene.add(mesh);
    ghostMesh = mesh;
  }

  const _ghostColor = new THREE.Color();
  function updateGhostPosition(worldPos, type) {
    if (!ghostMesh) return;
    const gridX = Math.round(worldPos.x);
    const gridZ = Math.round(worldPos.z);
    ghostMesh.position.x = gridX;
    ghostMesh.position.z = gridZ;

    const valid = canPlaceBuilding(scene, type, gridX, gridZ);
    _ghostColor.setHex(valid ? 0x44ff44 : 0xff3333);

    ghostMesh.traverse((child) => {
      const m = child.material;
      if (child.isMesh && m && m._origColor) {
        m.color.copy(m._origColor).lerp(_ghostColor, 0.75);
        if (m.emissive) {
          m.emissive.copy(_ghostColor);
          m.emissiveIntensity = 0.5;
        }
      }
    });
  }

  function removeGhost() {
    if (ghostMesh) {
      scene.remove(ghostMesh);
      ghostMesh = null;
    }
  }

  function showRallyFlag(x, z) {
    removeRallyFlag();
    const geo = new THREE.ConeGeometry(0.2, 0.5, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.set(x, 0.5, z);
    cone.rotation.x = Math.PI;
    scene.add(cone);
    rallyGhost = cone;
  }
  function removeRallyFlag() {
    if (rallyGhost) {
      scene.remove(rallyGhost);
      rallyGhost.geometry.dispose();
      rallyGhost.material.dispose();
      rallyGhost = null;
    }
  }

  // ============================================================
  // ЛИНИИ ПУТИ
  // ============================================================

  const pathLines = [];
  function drawPathLine(from, to, color = 0x66ff66) {
    if (pathLines.length > 40) return;
    const f = new THREE.Vector3(from.x, 0.1, from.z);
    const t = new THREE.Vector3(to.x, 0.1, to.z);
    const geo = new THREE.BufferGeometry().setFromPoints([f, t]);
    const mat = new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    scene.add(line);
    pathLines.push({ line, life: 1.5 });
  }
  function updatePathLines(dt) {
    for (let i = pathLines.length - 1; i >= 0; i--) {
      pathLines[i].life -= dt;
      pathLines[i].line.material.opacity = Math.max(0, pathLines[i].life / 1.5) * 0.9;
      if (pathLines[i].life <= 0) {
        scene.remove(pathLines[i].line);
        pathLines[i].line.geometry.dispose();
        pathLines[i].line.material.dispose();
        pathLines.splice(i, 1);
      }
    }
  }

  // ============================================================
  // ЛУЧИ / ВЫБОР ОБЪЕКТОВ
  // ============================================================

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function setRay(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  }

  function groundAt(clientX, clientY) {
    setRay(clientX, clientY);
    const hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null;
  }

  function isOwn(b) {
    return !!b && isMine(b);
  }

  function findOwner(obj, list) {
    const map = new Map();
    for (const item of list) if (item && item.mesh) map.set(item.mesh, item);
    let node = obj;
    while (node) {
      const found = map.get(node);
      if (found) return found;
      node = node.parent;
    }
    return null;
  }

  // Юнит под точкой экрана. На тач-экране — ещё и ближайший к пальцу.
  function pickUnit(clientX, clientY, filter = null) {
    setRay(clientX, clientY);
    const candidates = units.filter(u => u.mesh && u.mesh.visible && u.hp > 0 && (!filter || filter(u)));
    const hits = raycaster.intersectObjects(candidates.map(u => u.mesh), true);
    for (const h of hits) {
      if (h.object.isSprite) continue;
      const u = findOwner(h.object, candidates);
      if (u) return u;
    }
    if (!IS_TOUCH) return null;

    const g = groundAt(clientX, clientY);
    if (!g) return null;
    let best = null;
    let bestD = TOUCH_PICK_RADIUS * (camera.position.y / 18);
    for (const u of candidates) {
      let d = Math.hypot(u.mesh.position.x - g.x, u.mesh.position.z - g.z);
      // У друга по сети модель плавно догоняет реальную позицию — учитываем обе
      if (u._net) d = Math.min(d, Math.hypot(u._net.x - g.x, u._net.z - g.z));
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  function pickBuilding(clientX, clientY) {
    setRay(clientX, clientY);
    const list = [...buildings, ...commandCenters].filter(b => b.mesh && b.hp > 0 && b.mesh.visible);
    const hits = raycaster.intersectObjects(list.map(b => b.mesh), true);
    for (const h of hits) {
      if (h.object.isSprite) continue;
      const b = findOwner(h.object, list);
      if (b) return b;
    }
    return null;
  }

  function isUnitOnScreen(u) {
    const v = new THREE.Vector3().copy(u.mesh.position).project(camera);
    return v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1 && v.z >= -1 && v.z <= 1;
  }

  // ============================================================
  // ПОДСКАЗКИ И РЕЖИМЫ
  // ============================================================

  let hintTimer = null;
  function showHintLocal(t, ms = 1500) {
    if (!hintEl) return;
    hintEl.textContent = t;
    hintEl.classList.add('show');
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.remove('show'), ms);
  }
  function showModeHint(t) {
    if (!hintEl) return;
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    hintEl.textContent = t;
    hintEl.classList.add('show');
  }
  function hideHint() {
    if (hintEl) hintEl.classList.remove('show');
  }

  function anyMode() {
    return !!(buildMode || attackMode || repairMode || snipeMode || boxMode);
  }

  function syncModeUI() {
    document.body.classList.toggle('mode-active', anyMode());
    document.getElementById('tb-box')?.classList.toggle('active', boxMode);
  }

  function enterAttackMode() {
    cancelAllModes();
    attackMode = true;
    document.body.classList.add('attack-mode');
    showModeHint(inputText('Атака (Q): ЛКМ по цели', 'Атака: коснитесь цели или точки'));
    syncModeUI();
  }
  function cancelAttackMode() {
    attackMode = false;
    document.body.classList.remove('attack-mode');
  }

  function enterSnipeMode() {
    if (!selection.units.some(u => u.superShot)) return;
    cancelAllModes();
    snipeMode = true;
    showModeHint(inputText('Super-shot: ЛКМ по врагу', 'Super-shot: коснитесь врага'));
    syncModeUI();
  }

  function enterRepairMode() {
    const worker = selection.units.find(u => u.isWorker && !u.construction && !u.repairJob);
    if (!worker) { showHintLocal('Нет свободного КСМ для ремонта'); return; }
    cancelAllModes();
    repairMode = true;
    showModeHint(inputText('Ремонт: ЛКМ по своему зданию', 'Ремонт: коснитесь своего здания'));
    syncModeUI();
  }

  const BUILD_HINTS = {
    barracks: 'казармы', factory: 'завода', starport: 'космопорта', storage: 'хранилища',
    bunker: 'бункера', sensor: 'антенны', turret: 'туррели', engineering: 'инженерного комплекса',
    armory: 'арсенала', cc: 'командного центра'
  };

  function startBuildMode(type) {
    cancelAllModes();
    buildMode = type;
    if (type !== 'refinery') {
      createGhost(type);
      // На телефоне сразу показываем здание в центре экрана
      const c = groundAt(innerWidth / 2, innerHeight / 2);
      if (c) updateGhostPosition(c, type);
    }
    if (type === 'refinery') {
      showModeHint(inputText('Кликните по гейзеру', 'Коснитесь гейзера'));
    } else {
      showModeHint(inputText(
        `Место для ${BUILD_HINTS[type] || 'здания'} (ЛКМ)`,
        `Место для ${BUILD_HINTS[type] || 'здания'}: ведите пальцем и отпустите`
      ));
    }
    syncModeUI();
  }

  function cancelAllModes() {
    buildMode = null;
    removeGhost();
    cancelAttackMode();
    repairMode = false;
    snipeMode = false;
    boxMode = false;
    hideHint();
    syncModeUI();
  }

  const ids = (list) => list.map((u) => u.id);

  function stopSelected() {
    if (selection.units.length) issue({ c: 'stop', ids: ids(selection.units) });
  }

  function siegeSelected() {
    const list = selection.units.filter((u) => u.canSiege);
    if (list.length) issue({ c: 'siege', ids: ids(list) });
  }

  function transformSelected() {
    const list = selection.units.filter((u) => u.canTransform);
    if (list.length) issue({ c: 'transform', ids: ids(list) });
  }

  // ============================================================
  // КНОПКИ ПАНЕЛИ ДЕЙСТВИЙ
  // ============================================================

  setActionHandlers({
    attack: () => { if (selection.units.length > 0) enterAttackMode(); },
    stop: stopSelected,
    siege: siegeSelected,
    transform: transformSelected,
    mineHint: () => showHintLocal(inputText('ПКМ по минералам или рефайнери', 'Коснитесь минералов или рефайнери')),
    superShot: enterSnipeMode,
    repair: enterRepairMode,
    cancelRepair: (repair) => {
      playClick();
      if (repair && repair.worker) issue({ c: 'cancelRepair', worker: repair.worker.id });
    },
    produce: (type, building) => {
      playClick();
      issue({ c: 'produce', building: building.id, utype: type });
    },
    addon: (type, building) => {
      playClick();
      if (building.addonTaken) { showHintLocal('Уже есть пристройка'); return; }
      issue({ c: 'addon', building: building.id, atype: type });
      // Панель обновится, когда пристройка появится
      setTimeout(() => { if (selection.building === building) selectBuilding(building); }, 250);
    },
    build: (type) => {
      playClick();
      if (!selection.units.some(u => u.isWorker)) { showHintLocal('Сначала выделите КСМ'); return; }
      if (!canBuildType(type)) {
        showHintLocal(`Требуется: ${getMissingRequirement(type)}`);
        return;
      }
      startBuildMode(type);
    },
    upgrade: (upgType) => {
      playClick();
      issue({ c: 'upgrade', utype: upgType });
    },
    ungarrison: (bunker) => {
      playClick();
      issue({ c: 'ungarrison', bunker: bunker.id });
      showHintLocal('Юниты высажены');
    },
    cancelConstruction: (construction) => {
      playClick();
      playExplosion();
      if (construction && construction.scv) issue({ c: 'cancelConstruction', worker: construction.scv.id });
      clearSelection();
    }
  });

  // ============================================================
  // ДЕЙСТВИЯ: режимы, выделение, приказы
  // ============================================================

  // ЛКМ/тап в активном режиме. true — режим обработал нажатие.
  function handleModeClick(clientX, clientY) {
    if (snipeMode) {
      const target = pickUnit(clientX, clientY, u => !isFriendly(u));
      if (target) {
        const ghosts = selection.units.filter((u) => u.superShot);
        const inRange = ghosts.some((u) => u.mesh.position.distanceTo(target.mesh.position) <= u.superShot.range);
        if (!inRange) showHintLocal('Цель слишком далеко для super-shot');
        else issue({ c: 'superShot', ids: ids(ghosts), target: target.id });
      }
      snipeMode = false;
      hideHint();
      syncModeUI();
      return true;
    }

    if (repairMode) {
      repairMode = false;
      hideHint();
      syncModeUI();
      const b = pickBuilding(clientX, clientY);
      if (!b || !isOwn(b)) { showHintLocal(inputText('Кликните по своему зданию', 'Коснитесь своего здания')); return true; }
      if (b.hp >= b.maxHp) { showHintLocal('Здание не требует ремонта'); return true; }
      const worker = selection.units.find(u => u.isWorker && !u.construction && !u.repairJob);
      if (!worker) { showHintLocal('Нет свободного КСМ'); return true; }
      if (state.minerals < 1) { showHintLocal('Мало минералов'); return true; }
      issue({ c: 'repair', worker: worker.id, building: b.id });
      showHintLocal('КСМ идёт ремонтировать');
      playSound('build_start');
      return true;
    }

    if (attackMode) {
      const targetUnit = pickUnit(clientX, clientY, u => !isFriendly(u));
      const targetBld = targetUnit ? null : pickBuilding(clientX, clientY);
      const enemyBld = targetBld && !isFriendly(targetBld) ? targetBld : null;
      const hit = groundAt(clientX, clientY);
      const fighters = selection.units.filter((u) => !u.isWorker && !u.inBunker && !u.isHealer);
      if (fighters.length) {
        const t = targetUnit || enemyBld;
        if (t) issue({ c: 'attack', ids: ids(fighters), target: t.id });
        else if (hit) {
          issue({ c: 'attackMove', ids: ids(fighters), x: hit.x, z: hit.z });
          for (const u of fighters) drawPathLine(u.mesh.position, hit, 0xff4444);
        }
        playSound('voice_' + fighters[0].type + '_order');
      }
      cancelAttackMode();
      hideHint();
      syncModeUI();
      return true;
    }

    if (buildMode) {
      const hit = groundAt(clientX, clientY);
      if (!hit) return true;
      const worker = selection.units.find(u => u.isWorker && !u.construction && !u.repairJob)
        || selection.units.find(u => u.isWorker);
      if (!worker) { showHintLocal('Нужен КСМ'); cancelAllModes(); return true; }

      const gridX = Math.round(hit.x);
      const gridZ = Math.round(hit.z);

      if (buildMode === 'refinery') {
        let closest = null, bestDist = IS_TOUCH ? 4 : 3;
        for (const g of geysers) {
          const d = Math.hypot(g.x - hit.x, g.z - hit.z);
          if (d < bestDist) { bestDist = d; closest = g; }
        }
        if (!closest) { showHintLocal(inputText('Наведите на гейзер', 'Коснитесь гейзера')); return true; }
        if (!canPlaceBuilding(scene, 'refinery', closest.x, closest.z)) { showHintLocal('Гейзер уже занят'); return true; }
        if (!canAffordLocal('refinery')) { showHintLocal('Мало ресурсов'); return true; }
        issue({ c: 'build', worker: worker.id, btype: 'refinery', geyser: geysers.indexOf(closest) });
        cancelAllModes();
        playSound('build_start');
        return true;
      }

      if (!canPlaceBuilding(scene, buildMode, gridX, gridZ)) {
        showHintLocal('Здесь нельзя строить');
        return true;
      }
      if (!canAffordLocal(buildMode)) { showHintLocal('Мало ресурсов'); return true; }
      issue({ c: 'build', worker: worker.id, btype: buildMode, x: gridX, z: gridZ });
      cancelAllModes();
      showHintLocal('КСМ строит...');
      playSound('build_start');
      return true;
    }

    return false;
  }

  function canAffordLocal(type) {
    const c = COSTS[type];
    return !c || (state.minerals >= c.minerals && state.vespene >= c.vespene);
  }

  // Выбор объекта под точкой (ЛКМ-клик / тап)
  function selectAt(clientX, clientY) {
    const picked = pickUnit(clientX, clientY);
    if (picked && isMine(picked)) {
      const now = performance.now();
      const isDouble = picked === lastClickUnit && now - lastClickTime < DOUBLE_CLICK_MS;
      if (isDouble) {
        const sameType = units.filter(u =>
          u && u.mesh && u.hp > 0 && !u.inBunker && isMine(u) &&
          u.type === picked.type && isUnitOnScreen(u)
        );
        selectUnits(sameType);
        lastClickUnit = null;
        lastClickTime = 0;
      } else {
        selectUnits([picked]);
        lastClickUnit = picked;
        lastClickTime = now;
      }
      removeRallyFlag();
      playSelect();
      playSound('voice_' + picked.type + '_select');
      return true;
    }

    const b = pickBuilding(clientX, clientY);
    if (b) {
      playClick();
      playSound('click_building');
      selectBuilding(b);
      if (b.rallyPoint && isOwn(b)) showRallyFlag(b.rallyPoint.x, b.rallyPoint.z);
      else removeRallyFlag();
      return true;
    }
    return false;
  }

  // Приказ выделенным (ПКМ / тап при выделении)
  function issueCommand(clientX, clientY) {
    const hit = groundAt(clientX, clientY);

    // Выделено своё здание — ставим точку сбора
    if (selection.building && isOwn(selection.building) && hit) {
      const b = selection.building;
      if (['cc', 'barracks', 'factory', 'starport'].includes(b.type)) {
        issue({ c: 'rally', building: b.id, x: hit.x, z: hit.z });
        b.rallyPoint = { x: hit.x, z: hit.z };
        showRallyFlag(hit.x, hit.z);
        showHintLocal('Точка сбора установлена');
        playOrder();
      }
      return;
    }

    if (selection.units.length === 0) return;
    playOrder();

    // Своё здание: рефайнери — газ, бункер — гарнизон, иначе — идти к нему
    const bld = pickBuilding(clientX, clientY);
    if (bld && isOwn(bld)) {
      const workers = selection.units.filter((u) => u.isWorker);
      if (bld.type === 'refinery' && workers.length) {
        issue({ c: 'gas', ids: ids(workers), refinery: bld.id });
        return;
      }
      if (bld.type === 'bunker') {
        const fighters = selection.units.filter(u => !u.isWorker && !u.isHealer && !u.inBunker && !u.goingToBunker);
        if (fighters.length) {
          issue({ c: 'garrison', ids: ids(fighters), bunker: bld.id });
          showHintLocal(`Идут в бункер: ${Math.min(fighters.length, 4)}`);
          return;
        }
      }
      const pos = bld.mesh.position;
      issue({ c: 'move', ids: ids(selection.units), x: pos.x, z: pos.z });
      for (const u of selection.units) drawPathLine(u.mesh.position, pos, 0x66ff66);
      return;
    }

    // Враг — атаковать
    const enemy = pickUnit(clientX, clientY, u => !isFriendly(u)) || (bld && !isFriendly(bld) ? bld : null);
    if (enemy) {
      const fighters = selection.units.filter((u) => !u.isWorker && !u.inBunker && !u.isHealer);
      if (fighters.length) {
        issue({ c: 'attack', ids: ids(fighters), target: enemy.id });
        playSound('voice_' + fighters[0].type + '_order');
      }
      return;
    }

    if (!hit) return;

    let mineralHit = null;
    for (const mp of mineralPatches) {
      if (mp.amount <= 0) continue;
      if (Math.hypot(mp.x - hit.x, mp.z - hit.z) < 2.5) { mineralHit = mp; break; }
    }

    const movers = selection.units.filter((u) => !u.inBunker && !u.construction && !u.repairJob);
    if (!movers.length) return;
    const workers = movers.filter((u) => u.isWorker);
    if (mineralHit && workers.length) {
      issue({ c: 'mine', ids: ids(workers), patch: mineralPatches.indexOf(mineralHit) });
      const others = movers.filter((u) => !u.isWorker);
      if (others.length) issue({ c: 'move', ids: ids(others), x: hit.x, z: hit.z });
    } else {
      issue({ c: 'move', ids: ids(movers), x: hit.x, z: hit.z });
    }
    playSound('voice_' + movers[0].type + '_order');
    for (const u of movers) drawPathLine(u.mesh.position, hit, 0x66ff66);
  }

  function boxSelect(x1, y1, x2, y2) {
    const rect = canvas.getBoundingClientRect();
    const picked = [];
    const v = new THREE.Vector3();
    for (const u of units) {
      if (!isMine(u) || u.inBunker || u.hp <= 0) continue;
      v.copy(u.mesh.position).project(camera);
      const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width;
      const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
      if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) picked.push(u);
    }
    // Рамкой по смешанной группе — берём бойцов, рабочих только если бойцов нет
    const fighters = picked.filter(u => !u.isWorker);
    const result = fighters.length ? fighters : picked;
    if (result.length > 0) {
      selectUnits(result);
      removeRallyFlag();
      playSelect();
      if (result.length === 1) playSound('voice_' + result[0].type + '_select');
    } else {
      clearSelection();
    }
  }

  function drawSelBox(x0, y0, x1, y1) {
    if (!selBox) return;
    selBox.style.left = Math.min(x0, x1) + 'px';
    selBox.style.top = Math.min(y0, y1) + 'px';
    selBox.style.width = Math.abs(x1 - x0) + 'px';
    selBox.style.height = Math.abs(y1 - y0) + 'px';
    selBox.classList.add('show');
  }

  function clampCamera() {
    camera.position.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, camera.position.x));
    camera.position.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT + 5, camera.position.z));
    camera.position.y = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.position.y));
  }

  // ============================================================
  // КЛАВИАТУРА
  // ============================================================

  function isTypingTarget(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
      e.preventDefault(); return;
    }
    if (isTypingTarget(e)) return;
    const k = e.key.toLowerCase();
    keys[k] = true;

    if (e.key === 'Escape') {
      let handled = anyMode();
      for (const u of selection.units) {
        if (u.isWorker && u.construction) {
          playExplosion();
          issue({ c: 'cancelConstruction', worker: u.id });
          handled = true;
        }
        if (u.repairJob) {
          issue({ c: 'cancelRepair', worker: u.id });
          handled = true;
        }
      }
      if (selection.units.length || selection.building) handled = true;
      cancelAllModes();
      removeRallyFlag();
      clearSelection();
      // Отменили что-то — меню паузы не открываем (pause.js проверяет флаг)
      if (handled) e.__rtsHandled = true;
      return;
    }
    if (k === 'q' || k === 'й') { if (selection.units.length > 0) enterAttackMode(); }
    if (k === 't' || k === 'е') siegeSelected();
    if (k === 'v' || k === 'м') transformSelected();
    if ((k === 's' || k === 'ы') && selection.units.length > 0) stopSelected();
    if (k === 'x' || k === 'ч') enterSnipeMode();
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Если окно потеряло фокус с зажатой клавишей — не «залипаем»
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
  });

  // ============================================================
  // МЫШЬ
  // ============================================================

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.position.y += e.deltaY * 0.02;
    clampCamera();
  }, { passive: false });

  let mouseDownPos = null;
  let mouseDownTime = 0;

  window.addEventListener('mousemove', (e) => {
    const cursor = document.getElementById('attack-cursor');
    if (cursor && attackMode) { cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px'; }

    if (buildMode && ghostMesh) {
      const hit = groundAt(e.clientX, e.clientY);
      if (hit) updateGhostPosition(hit, buildMode);
    }

    if (mouseDownPos) drawSelBox(mouseDownPos.x, mouseDownPos.y, e.clientX, e.clientY);
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      if (handleModeClick(e.clientX, e.clientY)) return;
      mouseDownPos = { x: e.clientX, y: e.clientY };
      mouseDownTime = performance.now();
      drawSelBox(e.clientX, e.clientY, e.clientX, e.clientY);
      return;
    }
    if (e.button === 2) {
      if (anyMode()) { cancelAllModes(); return; }
      issueCommand(e.clientX, e.clientY);
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !mouseDownPos) return;
    const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
    const time = performance.now() - mouseDownTime;
    selBox?.classList.remove('show');

    if (dist < 5 && time < 400) {
      if (!selectAt(e.clientX, e.clientY)) {
        removeRallyFlag();
        clearSelection();
      }
    } else {
      boxSelect(
        Math.min(mouseDownPos.x, e.clientX), Math.min(mouseDownPos.y, e.clientY),
        Math.max(mouseDownPos.x, e.clientX), Math.max(mouseDownPos.y, e.clientY)
      );
    }
    mouseDownPos = null;
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ============================================================
  // КАСАНИЯ
  // ============================================================

  let touch = null; // { mode, sx, sy, lx, ly, time, startDist, startZoom, midX, midY }

  function touchDist(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  function panBy(fromX, fromY, toX, toY) {
    const a = groundAt(fromX, fromY);
    const b = groundAt(toX, toY);
    if (!a || !b) return;
    camera.position.x += a.x - b.x;
    camera.position.z += a.z - b.z;
    clampCamera();
  }

  // Тап без режима: выбрать своё / отдать приказ / сбросить
  function handleTap(x, y) {
    if (handleModeClick(x, y)) return;

    const ownUnit = pickUnit(x, y, u => isMine(u));
    if (ownUnit) { selectAt(x, y); return; }

    if (selection.units.length > 0) {
      const bld = pickBuilding(x, y);
      const hasWorker = selection.units.some(u => u.isWorker);
      const hasFighter = selection.units.some(u => !u.isWorker && !u.isHealer);
      const special = bld && isOwn(bld) &&
        ((bld.type === 'refinery' && hasWorker) || (bld.type === 'bunker' && hasFighter));
      if (bld && isOwn(bld) && !special) {
        selectAt(x, y);
        return;
      }
      issueCommand(x, y);
      return;
    }

    if (selectAt(x, y)) return;

    if (selection.building && isOwn(selection.building) &&
        ['cc', 'barracks', 'factory', 'starport'].includes(selection.building.type)) {
      issueCommand(x, y);
      return;
    }

    removeRallyFlag();
    clearSelection();
  }

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length >= 2) {
      const [t1, t2] = e.touches;
      selBox?.classList.remove('show');
      touch = {
        mode: 'pinch',
        startDist: touchDist(t1, t2) || 1,
        startZoom: camera.position.y,
        midX: (t1.clientX + t2.clientX) / 2,
        midY: (t1.clientY + t2.clientY) / 2
      };
      return;
    }
    const t = e.touches[0];
    touch = { mode: 'pending', sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY, time: performance.now() };
    if (buildMode && buildMode !== 'refinery') {
      touch.mode = 'build';
      const hit = groundAt(t.clientX, t.clientY);
      if (hit) updateGhostPosition(hit, buildMode);
    } else if (boxMode) {
      touch.mode = 'box';
      drawSelBox(t.clientX, t.clientY, t.clientX, t.clientY);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!touch) return;

    if (touch.mode === 'pinch' && e.touches.length >= 2) {
      const [t1, t2] = e.touches;
      const d = touchDist(t1, t2) || 1;
      camera.position.y = touch.startZoom * (touch.startDist / d);
      const mx = (t1.clientX + t2.clientX) / 2;
      const my = (t1.clientY + t2.clientY) / 2;
      panBy(touch.midX, touch.midY, mx, my);
      touch.midX = mx; touch.midY = my;
      clampCamera();
      return;
    }

    const t = e.touches[0];
    if (!t) return;
    const x = t.clientX, y = t.clientY;

    if (touch.mode === 'build') {
      const hit = groundAt(x, y);
      if (hit) updateGhostPosition(hit, buildMode);
    } else if (touch.mode === 'box') {
      drawSelBox(touch.sx, touch.sy, x, y);
    } else if (touch.mode === 'pending' || touch.mode === 'pan') {
      if (touch.mode === 'pending' && Math.hypot(x - touch.sx, y - touch.sy) > TAP_MOVE_PX) {
        touch.mode = 'pan';
      }
      if (touch.mode === 'pan') panBy(touch.lx, touch.ly, x, y);
    }
    touch.lx = x;
    touch.ly = y;
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!touch) return;

    if (touch.mode === 'pinch') {
      // Отпустили один палец из двух — продолжаем как перетаскивание, без рывка
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touch = { mode: 'pan', sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY, time: performance.now() };
      } else if (e.touches.length === 0) {
        touch = null;
      }
      return;
    }

    if (touch.mode === 'build') {
      handleModeClick(touch.lx, touch.ly);
    } else if (touch.mode === 'box') {
      selBox?.classList.remove('show');
      boxMode = false;
      syncModeUI();
      boxSelect(
        Math.min(touch.sx, touch.lx), Math.min(touch.sy, touch.ly),
        Math.max(touch.sx, touch.lx), Math.max(touch.sy, touch.ly)
      );
    } else if (touch.mode === 'pending') {
      handleTap(touch.lx, touch.ly);
    }
    touch = null;
  }, { passive: false });

  canvas.addEventListener('touchcancel', () => {
    touch = null;
    selBox?.classList.remove('show');
  });

  // ============================================================
  // ТАЧ-ПАНЕЛЬ
  // ============================================================

  function bindTool(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      playClick();
      fn();
    });
  }

  bindTool('tb-army', () => {
    cancelAllModes();
    const army = units.filter(u => isMine(u) && !u.isWorker && !u.inBunker && u.hp > 0);
    if (army.length) { selectUnits(army); removeRallyFlag(); }
    else showHintLocal('Нет боевых юнитов');
  });

  bindTool('tb-workers', () => {
    cancelAllModes();
    const workers = units.filter(u => isMine(u) && u.isWorker && u.hp > 0);
    const idle = workers.filter(u => u.state === 'idle' && !u.moveTarget && !u.construction && !u.repairJob);
    const list = idle.length ? idle : workers;
    if (list.length) {
      selectUnits(list);
      removeRallyFlag();
      if (idle.length) showHintLocal(`Свободные рабочие: ${idle.length}`);
    }
  });

  bindTool('tb-box', () => {
    const wasOn = boxMode;
    cancelAllModes();
    boxMode = !wasOn;
    if (boxMode) showModeHint('Проведите пальцем, чтобы выделить рамкой');
    syncModeUI();
  });

  bindTool('tb-deselect', () => {
    if (anyMode()) { cancelAllModes(); return; }
    removeRallyFlag();
    clearSelection();
  });

  // ============================================================
  // МИНИКАРТА (мышь и палец, с перетаскиванием)
  // ============================================================

  const minimapCanvas = document.getElementById('minimap');
  if (minimapCanvas) {
    let dragging = false;
    const jump = (e) => {
      const rect = minimapCanvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      camera.position.x = px * MAP_SIZE - MAP_SIZE / 2;
      camera.position.z = py * MAP_SIZE - MAP_SIZE / 2 + 5;
      clampCamera();
    };
    minimapCanvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      try { minimapCanvas.setPointerCapture(e.pointerId); } catch (err) {}
      jump(e);
    });
    minimapCanvas.addEventListener('pointermove', (e) => { if (dragging) jump(e); });
    const stop = () => { dragging = false; };
    minimapCanvas.addEventListener('pointerup', stop);
    minimapCanvas.addEventListener('pointercancel', stop);
  }

  return {
    updateCamera(dt) {
      // Скорость клавиатурной прокрутки не зависит от скорости игры
      const speed = 15 * dt;
      if (keys['w'] || keys['ц'] || keys['arrowup'])    camera.position.z -= speed;
      if (keys['s'] || keys['ы'] || keys['arrowdown'])  { if (!selection.units.length) camera.position.z += speed; }
      if (keys['arrowdown'] && selection.units.length)  camera.position.z += speed;
      if (keys['a'] || keys['ф'] || keys['arrowleft'])  camera.position.x -= speed;
      if (keys['d'] || keys['в'] || keys['arrowright']) camera.position.x += speed;
      clampCamera();
      camera.lookAt(camera.position.x, 0, camera.position.z - 5);
    },
    focusOn(x, z) {
      camera.position.x = x;
      camera.position.z = z + 5;
      clampCamera();
      camera.lookAt(camera.position.x, 0, camera.position.z - 5);
    },
    updatePathLines(dt) { updatePathLines(dt); }
  };
}
