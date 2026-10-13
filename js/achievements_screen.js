// js/achievements_screen.js
import { ACHIEVEMENTS } from './achievements.js';
import { progress } from './progress.js';
import { playClick } from './audio.js';

export function openAchievements() {
  let box = document.getElementById('ach-box');
  if (box) box.remove();

  box = document.createElement('div');
  box.id = 'ach-box';
  box.className = 'overlay-screen';

  let html = `<div class="overlay-panel scroll-y" style="max-width:800px;">`;

  html += `<h2 style="color:#e0c088;text-align:center;letter-spacing:4px;margin:0 0 10px 0;">ДОСТИЖЕНИЯ</h2>`;
  html += `<div style="text-align:center;color:#ffcc44;font-size:14px;margin-bottom:24px;">🏅 ${progress.achievements.length} / ${Object.keys(ACHIEVEMENTS).length}</div>`;

  html += `<div class="grid-auto" style="--min:240px;">`;
  for (const id in ACHIEVEMENTS) {
    const a = ACHIEVEMENTS[id];
    const unlocked = progress.achievements.includes(id);
    const color = unlocked ? '#ffcc44' : '#3a3a3a';
    const textColor = unlocked ? '#e0c088' : '#5a5a5a';
    html += `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;` +
      `background:linear-gradient(180deg,rgba(35,28,18,0.95),rgba(12,10,8,1));` +
      `border:1px solid ${unlocked ? '#c89848' : '#333'};` +
      `opacity:${unlocked ? 1 : 0.45};">` +
      `<div style="font-size:28px;filter:${unlocked ? 'drop-shadow(0 0 8px #ffcc44)' : 'grayscale(1)'};">${a.icon}</div>` +
      `<div style="flex:1;">` +
      `<div style="font-weight:bold;color:${textColor};font-size:13px;">${a.name}</div>` +
      `<div style="font-size:11px;color:#7a6a50;margin-top:3px;">${a.desc}</div>` +
      `</div>` +
      `<div style="font-size:18px;color:${color};">${unlocked ? '✓' : '🔒'}</div>` +
      `</div>`;
  }
  html += `</div>`;

  html += `<button id="ach-close" style="margin-top:24px;width:100%;padding:12px;` +
    `background:linear-gradient(180deg,rgba(60,45,20,0.9),rgba(30,22,12,1));` +
    `border:1px solid #c89848;color:#f0d8a8;font-family:inherit;font-size:14px;cursor:pointer;letter-spacing:2px;">Закрыть</button>`;

  html += `</div>`;
  box.innerHTML = html;
  document.body.appendChild(box);

  document.getElementById('ach-close').addEventListener('click', () => {
    playClick();
    box.remove();
  });
}