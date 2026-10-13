import { units, isHiddenFrom } from './units.js';
import { buildings, commandCenters } from './build.js';
import { isVisible, getFogCanvas } from './fog.js';
import { settings } from './menu.js';

const MAP_SIZE = 60;
const MINIMAP_PX = 200;

let ctx = null;

export function drawMinimap(camera) {
  const canvas = document.getElementById('minimap');
  if (!canvas) return;
  if (!ctx) ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a1420';
  ctx.fillRect(0, 0, MINIMAP_PX, MINIMAP_PX);

  ctx.strokeStyle = '#1a2a3a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const p = (i / 6) * MINIMAP_PX;
    ctx.moveTo(p, 0); ctx.lineTo(p, MINIMAP_PX);
    ctx.moveTo(0, p); ctx.lineTo(MINIMAP_PX, p);
  }
  ctx.stroke();

  const toPx = (v) => ((v + MAP_SIZE / 2) / MAP_SIZE) * MINIMAP_PX;
  const fogOn = settings.fogEnabled;
  const seen = (x, z) => !fogOn || isVisible(x, z);

  // Туман: одна отрисовка готового холста вместо 3600 прямоугольников
  const fog = fogOn ? getFogCanvas() : null;
  if (fog) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fog, 0, 0, MINIMAP_PX, MINIMAP_PX);
  }

  for (const b of buildings) {
    if (!b.mesh || b.hp <= 0) continue;
    const isPlayerB = (b.owner || 'player') === 'player';
    const pos = b.mesh.position;
    if (!isPlayerB && !seen(pos.x, pos.z)) continue;
    ctx.fillStyle = isPlayerB
      ? (b.type === 'refinery' ? '#22aa55' : '#5577aa')
      : '#aa4455';
    const size = 6;
    ctx.fillRect(toPx(pos.x) - size / 2, toPx(pos.z) - size / 2, size, size);
  }
  for (const cc of commandCenters) {
    if (!cc.mesh || cc.hp <= 0) continue;
    const isPlayerCC = (cc.owner || 'player') === 'player';
    const pos = cc.mesh.position;
    if (!isPlayerCC && !seen(pos.x, pos.z)) continue;
    ctx.fillStyle = isPlayerCC ? '#5577aa' : '#aa4455';
    const size = 8;
    ctx.fillRect(toPx(pos.x) - size / 2, toPx(pos.z) - size / 2, size, size);
  }

  for (const u of units) {
    if (!u || !u.mesh || u.inBunker) continue;
    const pos = u.mesh.position;
    if (!u.isPlayer && (!seen(pos.x, pos.z) || isHiddenFrom(u, 'player'))) continue;
    ctx.fillStyle = u.isPlayer ? '#44aaff' : '#ff4444';
    const size = u.isBoss ? 6 : 3;
    ctx.fillRect(toPx(pos.x) - size / 2, toPx(pos.z) - size / 2, size, size);
  }

  // Рамка камеры
  const camX = camera.position.x;
  const camZ = camera.position.z - 5;
  const viewSize = camera.position.y * 1.2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  const rx = toPx(camX - viewSize / 2);
  const rz = toPx(camZ - viewSize / 2);
  const rw = (viewSize / MAP_SIZE) * MINIMAP_PX;
  ctx.strokeRect(rx, rz, rw, rw);
}
