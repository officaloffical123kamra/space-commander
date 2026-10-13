// js/commands.js
// Приказы игроков. Интерфейс (controls.js) не меняет юнитов напрямую, а отдаёт приказ:
//  - в одиночной игре и у хоста приказ выполняется сразу;
//  - у друга по сети приказ уходит на компьютер хоста и выполняется там.
// Хост проверяет, что юниты и здания действительно принадлежат тому, кто приказывает.
import { toggleSiege, toggleTransform, useSuperShot } from './units.js';
import {
  startConstruction, cancelConstruction, startRepair, cancelRepair, repairs,
  queueUnit, queueScv, buyAddon, buyUpgrade, orderGarrison, ungarrisonAll
} from './build.js';
import { orderMove, orderMineMinerals, orderMineGas } from './economy.js';
import { mineralPatches, geysers } from './world.js';
import { getById } from './ids.js';
import { session, ctrlOf, teamOf, teamOfCtrl, withActor } from './session.js';
import { netSend } from './net.js';

let scene = null;
export function setCommandScene(s) {
  scene = s;
}

// Отдать приказ от имени локального игрока
export function issue(cmd) {
  if (session.role === 'guest') {
    netSend({ t: 'cmd', cmd });
    return;
  }
  executeCommand(cmd, session.localCtrl);
}

export function executeCommand(cmd, ctrl) {
  if (!cmd || !scene) return;
  withActor(ctrl, () => run(cmd, ctrl));
}

function ownUnits(ids, ctrl) {
  const out = [];
  for (const id of ids || []) {
    const u = getById(id);
    if (u && u.isUnit && !u.dead && u.hp > 0 && ctrlOf(u) === ctrl) out.push(u);
  }
  return out;
}

function ownBuilding(id, ctrl) {
  const b = getById(id);
  return b && !b.isUnit && b.hp > 0 && ctrlOf(b) === ctrl ? b : null;
}

function aliveTarget(id) {
  const t = getById(id);
  return t && t.hp > 0 && !t.dead ? t : null;
}

const free = (u) => !u.inBunker && !u.construction && !u.repairJob;
const fighter = (u) => !u.isWorker && !u.isHealer && !u.inBunker;

function run(cmd, ctrl) {
  switch (cmd.c) {
    case 'move':
      for (const u of ownUnits(cmd.ids, ctrl)) {
        if (!free(u)) continue;
        if (u.isWorker) orderMove(u, cmd.x, cmd.z);
        else {
          u.attackTarget = null;
          u.goingToBunker = null;
          u.target = { x: cmd.x, y: 0, z: cmd.z };
          u.autoAttackDisabled = true;
        }
      }
      break;

    case 'attackMove':
      for (const u of ownUnits(cmd.ids, ctrl)) {
        if (!fighter(u)) continue;
        u.attackTarget = null;
        u.goingToBunker = null;
        u.target = { x: cmd.x, y: 0, z: cmd.z };
        u.autoAttackDisabled = false;
      }
      break;

    case 'attack': {
      const t = aliveTarget(cmd.target);
      if (!t || teamOf(t) === teamOfCtrl(ctrl)) break;
      for (const u of ownUnits(cmd.ids, ctrl)) {
        if (!fighter(u) || u.attack <= 0) continue;
        u.attackTarget = t;
        u.target = null;
        u.goingToBunker = null;
        u.autoAttackDisabled = false;
      }
      break;
    }

    case 'stop':
      for (const u of ownUnits(cmd.ids, ctrl)) {
        u.target = null;
        u.attackTarget = null;
        u.goingToBunker = null;
        u.autoAttackDisabled = false;
        if (u.isWorker && !u.construction && !u.repairJob) u.moveTarget = null;
      }
      break;

    case 'siege':
      for (const u of ownUnits(cmd.ids, ctrl)) if (u.canSiege) toggleSiege(u);
      break;

    case 'transform':
      for (const u of ownUnits(cmd.ids, ctrl)) if (u.canTransform) toggleTransform(u);
      break;

    case 'superShot': {
      const t = aliveTarget(cmd.target);
      if (!t || teamOf(t) === teamOfCtrl(ctrl)) break;
      for (const u of ownUnits(cmd.ids, ctrl)) if (u.superShot) useSuperShot(scene, u, t);
      break;
    }

    case 'mine': {
      const mp = mineralPatches[cmd.patch];
      if (!mp || mp.amount <= 0) break;
      for (const u of ownUnits(cmd.ids, ctrl)) if (u.isWorker && free(u)) orderMineMinerals(u, mp);
      break;
    }

    case 'gas': {
      const r = ownBuilding(cmd.refinery, ctrl);
      if (!r || r.type !== 'refinery') break;
      for (const u of ownUnits(cmd.ids, ctrl)) if (u.isWorker && free(u)) orderMineGas(u, r);
      break;
    }

    case 'garrison': {
      const b = ownBuilding(cmd.bunker, ctrl);
      if (!b || b.type !== 'bunker') break;
      for (const u of ownUnits(cmd.ids, ctrl)) {
        if (fighter(u) && !u.goingToBunker) orderGarrison(scene, b, u);
      }
      break;
    }

    case 'ungarrison': {
      const b = ownBuilding(cmd.bunker, ctrl);
      if (b && b.type === 'bunker') ungarrisonAll(scene, b);
      break;
    }

    case 'build': {
      const [w] = ownUnits([cmd.worker], ctrl);
      if (!w || !w.isWorker || w.construction || w.repairJob) break;
      if (cmd.btype === 'refinery') {
        const g = geysers[cmd.geyser];
        if (g) startConstruction(scene, 'refinery', g.x, g.z, w);
      } else {
        startConstruction(scene, cmd.btype, cmd.x, cmd.z, w);
      }
      break;
    }

    case 'repair': {
      const [w] = ownUnits([cmd.worker], ctrl);
      const b = aliveTarget(cmd.building);
      if (w && b && !b.isUnit && teamOf(b) === teamOfCtrl(ctrl)) startRepair(scene, b, w);
      break;
    }

    case 'cancelRepair': {
      const [w] = ownUnits([cmd.worker], ctrl);
      if (w && w.repairJob) {
        const job = w.repairJob;
        cancelRepair(job);
        const idx = repairs.indexOf(job);
        if (idx >= 0) repairs.splice(idx, 1);
      }
      break;
    }

    case 'cancelConstruction': {
      const [w] = ownUnits([cmd.worker], ctrl);
      if (w && w.construction) cancelConstruction(scene, w.construction);
      break;
    }

    case 'produce': {
      const b = ownBuilding(cmd.building, ctrl);
      if (!b) break;
      if (cmd.utype === 'scv') { if (b.type === 'cc') queueScv(scene, b); }
      else queueUnit(b, cmd.utype);
      break;
    }

    case 'addon': {
      const b = ownBuilding(cmd.building, ctrl);
      if (b) buyAddon(scene, b, cmd.atype);
      break;
    }

    case 'upgrade':
      buyUpgrade(cmd.utype, ctrl);
      break;

    case 'rally': {
      const b = ownBuilding(cmd.building, ctrl);
      if (b) b.rallyPoint = { x: cmd.x, z: cmd.z };
      break;
    }
  }
}
