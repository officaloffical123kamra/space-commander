// js/shop.js
import { SKINS, RARITY_COLORS, CASES, rollCase, PLAYER_UNITS, PLAYER_BUILDINGS } from './skins.js';
import { progress, spendMoney, unlockSkin, setActiveSkin, saveProgress, addMoney } from './progress.js';
import { showConfirm, showMessage, showAlert } from './ui.js';
import { showRewardedAd } from './yandex.js';

const AD_REWARD = 250;
let onCloseCb = null;
import { playClick, playSound } from './audio.js';
import { initPreview, showUnitInPreview, refreshPreviewSkin, stopPreview } from './inventory_preview.js';

let currentTab = 'skins';

export function openShop(onClose = null) {
  onCloseCb = onClose;
  let box = document.getElementById('shop-box');
  if (box) box.remove();

  box = document.createElement('div');
  box.id = 'shop-box';
  box.className = 'overlay-screen';
  document.body.appendChild(box);
  renderShop();
}

export function closeShop() {
  stopPreview();
  const box = document.getElementById('shop-box');
  if (box) box.remove();
  if (onCloseCb) onCloseCb();
}

function renderShop() {
  const box = document.getElementById('shop-box');
  if (!box) return;

  const tabs = [
    { id: 'skins', name: '🎨 Скины' },
    { id: 'inventory', name: '🎯 Инвентарь' },
    { id: 'cases', name: '📦 Кейсы' }
  ];

  let html = `<div class="overlay-panel shop-panel">`;

  html += `<h2 style="color:#e0c088;text-align:center;letter-spacing:4px;margin:0 0 10px 0;">МАГАЗИН</h2>`;
  html += `<div style="text-align:center;color:#ffcc44;font-size:16px;margin-bottom:12px;">💰 ${progress.money}</div>`;
  html += `<div style="text-align:center;margin-bottom:16px;"><button id="shop-ad" class="ui-modal-btn primary">📺 +${AD_REWARD}💰 за рекламу</button></div>`;

  html += `<div style="display:flex;gap:8px;margin-bottom:20px;justify-content:center;flex-wrap:wrap;">`;
  for (const t of tabs) {
    const active = currentTab === t.id;
    html += `<button data-tab="${t.id}" style="padding:10px 16px;background:${active ? 'linear-gradient(180deg,rgba(60,45,20,0.9),rgba(30,22,12,1))' : 'transparent'};` +
      `border:1px solid ${active ? '#e0c088' : 'rgba(200,152,72,0.3)'};color:${active ? '#f0d8a8' : '#8a7a55'};` +
      `font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:2px;">${t.name}</button>`;
  }
  html += `</div>`;

  html += `<div id="shop-content" class="scroll-y"></div>`;

  html += `<button id="shop-close" style="margin-top:24px;width:100%;padding:12px;` +
    `background:linear-gradient(180deg,rgba(60,45,20,0.9),rgba(30,22,12,1));` +
    `border:1px solid #c89848;color:#f0d8a8;font-family:inherit;font-size:14px;cursor:pointer;letter-spacing:2px;">Закрыть</button>`;

  html += `</div>`;
  box.innerHTML = html;

  box.querySelectorAll('button[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      playClick();
      stopPreview();
      currentTab = btn.dataset.tab;
      renderShop();
    });
  });

  const closeBtn = document.getElementById('shop-close');
  if (closeBtn) closeBtn.addEventListener('click', () => { playClick(); closeShop(); });

  document.getElementById('shop-ad')?.addEventListener('click', async () => {
    playClick();
    const ok = await showRewardedAd();
    if (ok) {
      addMoney(AD_REWARD);
      showAlert(`+${AD_REWARD}💰`, 'success', 2500);
      renderShop();
    } else {
      showAlert('Реклама не досмотрена', 'warn', 2500);
    }
  });

  if (currentTab === 'skins') renderSkins();
  else if (currentTab === 'inventory') renderInventory();
  else if (currentTab === 'cases') renderCases();
}

function renderSkins() {
  const content = document.getElementById('shop-content');
  if (!content) return;

  let html = `<div class="grid-auto" style="--min:110px;">`;
  for (const id in SKINS) {
    const s = SKINS[id];
    if (s.shop === false && !progress.skins.includes(id)) continue;

    const owned = progress.skins.includes(id);
    const active = progress.activeSkin === id;
    const rc = RARITY_COLORS[s.rarity] || '#888';
    const previewColor = s.colors ? '#' + s.colors.main.toString(16).padStart(6, '0') : '#5577aa';
    const glow = s.colors && s.colors.glow ? `0 0 30px #${s.colors.glow.toString(16).padStart(6, '0')}` : `0 0 20px ${rc}66`;

    html += `<div data-skin="${id}" style="position:relative;padding:10px;background:linear-gradient(180deg,rgba(35,28,18,0.95),rgba(12,10,8,1));` +
      `border:2px solid ${active ? '#ffcc44' : rc};cursor:pointer;text-align:center;transition:0.2s;">`;
    html += `<div style="width:50px;height:50px;margin:0 auto 8px;background:radial-gradient(circle,${previewColor},#000);` +
      `border-radius:50%;border:1px solid ${rc};box-shadow:${glow};"></div>`;
    html += `<div style="font-weight:bold;color:#e0c088;font-size:11px;">${s.name}</div>`;
    html += `<div style="font-size:9px;color:${rc};margin-top:2px;text-transform:uppercase;">${s.rarity}</div>`;
    if (owned) {
      html += `<div style="font-size:10px;color:${active ? '#ffcc44' : '#7ab84a'};margin-top:4px;font-weight:bold;">${active ? '✓' : 'Куплен'}</div>`;
    } else {
      html += `<div style="font-size:11px;color:#6ca8e0;margin-top:4px;font-weight:bold;">💰 ${s.price}</div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  content.innerHTML = html;

  content.querySelectorAll('div[data-skin]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.skin;
      handleSkinClick(id);
    });
  });
}

function handleSkinClick(id) {
  const s = SKINS[id];
  const owned = progress.skins.includes(id);
  if (owned) {
    playSound('ui_click');
    return;
  }
  if (s.shop === false) {
    playSound('ui_error');
    showMessage('Этот скин можно получить только из кейса!');
    return;
  }
  if (progress.money < s.price) {
    playSound('ui_error');
    showMessage('Недостаточно монет!');
    return;
  }
  confirmBuy(id, s);
}

async function confirmBuy(id, s) {
  if (!await showConfirm(`Купить скин "${s.name}" за ${s.price}💰?\n\nПрименить его можно в Инвентаре к конкретному юниту или зданию.`, { okText: 'Купить' })) return;
  spendMoney(s.price);
  unlockSkin(id);
  playSound('ui_ready');
  renderShop();
}

function renderInventory() {
  const content = document.getElementById('shop-content');
  if (!content) return;

  stopPreview();

  content.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;justify-content:center;">
      <button id="inv-tab-units" style="padding:8px 20px;background:linear-gradient(180deg,rgba(60,45,20,0.9),rgba(30,22,12,1));border:1px solid #e0c088;color:#f0d8a8;font-family:inherit;font-size:12px;cursor:pointer;letter-spacing:2px;">👥 Юниты</button>
      <button id="inv-tab-buildings" style="padding:8px 20px;background:transparent;border:1px solid rgba(200,152,72,0.3);color:#8a7a55;font-family:inherit;font-size:12px;cursor:pointer;letter-spacing:2px;">🏛 Здания</button>
    </div>
    <div class="inv-layout">
      <div id="inv-list" class="scroll-y" style="flex:1;padding-right:6px;"></div>
      <div class="inv-preview" style="flex:1;position:relative;background:radial-gradient(circle at 50% 60%, rgba(40,32,20,0.8), rgba(5,4,3,1));border:1px solid #5a4a35;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <canvas id="inv-canvas" style="width:100%;height:100%;display:block;"></canvas>
        <div id="inv-title" style="position:absolute;bottom:14px;left:0;right:0;text-align:center;color:#e0c088;font-size:14px;letter-spacing:3px;pointer-events:none;">ВЫБЕРИ ЭЛЕМЕНТ</div>
      </div>
    </div>
  `;

  initPreview(document.getElementById('inv-canvas'));

  const renderCategory = (cat) => {
    const listBox = document.getElementById('inv-list');
    const items = cat === 'units' ? PLAYER_UNITS : PLAYER_BUILDINGS;
    const store = (cat === 'units' ? progress.unitSkins : progress.buildingSkins) || {};

    let html = '';
    for (const item of items) {
      const currentSkinId = store[item.id] || '';
      const skinName = currentSkinId ? (SKINS[currentSkinId]?.name || '?') : 'Общий';

      html += `<div data-item="${item.id}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:6px;cursor:pointer;` +
        `background:linear-gradient(180deg,rgba(35,28,18,0.9),rgba(12,10,8,1));` +
        `border:1px solid #5a4a35;transition:0.2s;">` +
        `<span style="font-size:22px;">${item.icon}</span>` +
        `<div style="flex:1;">` +
        `<div style="color:#e0c088;font-weight:bold;font-size:12px;letter-spacing:2px;">${item.name}</div>` +
        `<div style="color:#8a7a55;font-size:10px;">${skinName}</div>` +
        `</div>` +
        `<span style="color:#c89848;font-size:16px;">›</span>` +
        `</div>`;
    }
    listBox.innerHTML = html;

    listBox.querySelectorAll('div[data-item]').forEach(el => {
      el.addEventListener('click', () => {
        const itemId = el.dataset.item;
        playClick();

        listBox.querySelectorAll('div[data-item]').forEach(x => x.style.borderColor = '#5a4a35');
        el.style.borderColor = '#ffcc44';

        showUnitInPreview(itemId);

        const item = items.find(u => u.id === itemId);
        document.getElementById('inv-title').textContent = item.name.toUpperCase();

        expandSkinPicker(el, itemId, cat);
      });
    });

    const first = listBox.querySelector('div[data-item]');
    if (first) first.click();
  };

  document.getElementById('inv-tab-units').addEventListener('click', () => {
    playClick();
    document.getElementById('inv-tab-units').style.background = 'linear-gradient(180deg,rgba(60,45,20,0.9),rgba(30,22,12,1))';
    document.getElementById('inv-tab-units').style.color = '#f0d8a8';
    document.getElementById('inv-tab-units').style.borderColor = '#e0c088';
    document.getElementById('inv-tab-buildings').style.background = 'transparent';
    document.getElementById('inv-tab-buildings').style.color = '#8a7a55';
    document.getElementById('inv-tab-buildings').style.borderColor = 'rgba(200,152,72,0.3)';
    renderCategory('units');
  });

  document.getElementById('inv-tab-buildings').addEventListener('click', () => {
    playClick();
    document.getElementById('inv-tab-buildings').style.background = 'linear-gradient(180deg,rgba(60,45,20,0.9),rgba(30,22,12,1))';
    document.getElementById('inv-tab-buildings').style.color = '#f0d8a8';
    document.getElementById('inv-tab-buildings').style.borderColor = '#e0c088';
    document.getElementById('inv-tab-units').style.background = 'transparent';
    document.getElementById('inv-tab-units').style.color = '#8a7a55';
    document.getElementById('inv-tab-units').style.borderColor = 'rgba(200,152,72,0.3)';
    renderCategory('buildings');
  });

  renderCategory('units');
}

function expandSkinPicker(itemEl, itemId, category = 'units') {
  document.querySelectorAll('.inv-skin-picker').forEach(x => x.remove());

  const store = category === 'units' ? progress.unitSkins : progress.buildingSkins;
  const currentSkinId = (store && store[itemId]) || '';

  const picker = document.createElement('div');
  picker.className = 'inv-skin-picker';
  picker.style.cssText = 'padding:10px;margin-bottom:6px;background:rgba(0,0,0,0.5);' +
    'border:1px solid #c89848;border-left:3px solid #ffcc44;';

  let html = '<div style="color:#8a7a55;font-size:10px;margin-bottom:6px;letter-spacing:2px;">ВЫБЕРИ СКИН:</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';

  const isGlobal = !currentSkinId;
  html += `<div data-item="${itemId}" data-skin="" style="width:38px;height:38px;border-radius:50%;` +
    `background:radial-gradient(circle at 30% 30%, #5577aa, #000);` +
    `border:2px solid ${isGlobal ? '#ffcc44' : '#444'};cursor:pointer;display:flex;align-items:center;` +
    `justify-content:center;font-size:8px;color:#fff;text-shadow:0 0 4px #000;" title="Общий">ОБЩ</div>`;

  for (const skinId of progress.skins) {
    const s = SKINS[skinId];
    if (!s || !s.colors) continue;
    const rc = RARITY_COLORS[s.rarity] || '#888';
    const col = '#' + s.colors.main.toString(16).padStart(6, '0');
    const glowCol = s.colors.glow ? '#' + s.colors.glow.toString(16).padStart(6, '0') : rc;
    const isActive = currentSkinId === skinId;

    html += `<div data-item="${itemId}" data-skin="${skinId}" style="width:38px;height:38px;` +
      `border-radius:50%;background:radial-gradient(circle at 30% 30%, ${col}, #000);` +
      `border:2px solid ${isActive ? '#ffcc44' : rc};box-shadow:0 0 8px ${glowCol};cursor:pointer;" ` +
      `title="${s.name}"></div>`;
  }

  html += '</div>';
  picker.innerHTML = html;

  itemEl.parentNode.insertBefore(picker, itemEl.nextSibling);

  picker.querySelectorAll('div[data-skin]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const skinId = el.dataset.skin;

      if (category === 'units') {
        if (!progress.unitSkins) progress.unitSkins = {};
        if (skinId) progress.unitSkins[itemId] = skinId;
        else delete progress.unitSkins[itemId];
      } else {
        if (!progress.buildingSkins) progress.buildingSkins = {};
        if (skinId) progress.buildingSkins[itemId] = skinId;
        else delete progress.buildingSkins[itemId];
      }

      try {
        localStorage.setItem('rts_progress', JSON.stringify(progress));
      } catch (err) { console.warn('Save error', err); }

      playSound('ui_ready');
      refreshPreviewSkin(itemId);

      const itemRow = document.querySelector(`div[data-item="${itemId}"]`);
      if (itemRow) {
        const skinName = skinId ? (SKINS[skinId]?.name || '?') : 'Общий';
        const sub = itemRow.querySelector('div > div:nth-child(2)');
        if (sub) sub.textContent = skinName;

        const oldPicker = itemRow.nextSibling;
        if (oldPicker && oldPicker.classList && oldPicker.classList.contains('inv-skin-picker')) {
          oldPicker.remove();
        }
        expandSkinPicker(itemRow, itemId, category);
      }
    });
  });
}

function renderCases() {
  const content = document.getElementById('shop-content');
  if (!content) return;

  let html = `<div class="grid-auto" style="--min:140px;">`;
  for (const c of CASES) {
    const maxRarity = c.pool.reduce((best, id) => {
      const s = SKINS[id];
      if (!s) return best;
      const order = { common: 0, rare: 1, epic: 2, legendary: 3 };
      return order[s.rarity] > order[best] ? s.rarity : best;
    }, 'common');
    const border = RARITY_COLORS[maxRarity];

    html += `<div data-case="${c.id}" style="padding:16px 12px;background:linear-gradient(180deg,rgba(35,28,18,0.95),rgba(12,10,8,1));` +
      `border:2px solid ${border};cursor:pointer;text-align:center;transition:0.2s;">`;
    html += `<div style="font-size:36px;margin-bottom:8px;filter:drop-shadow(0 0 12px ${border});">📦</div>`;
    html += `<div style="font-weight:bold;color:#e0c088;font-size:12px;">${c.name}</div>`;
    html += `<div style="font-size:10px;color:#8a7a55;margin:4px 0;">${c.desc}</div>`;
    html += `<div style="font-size:15px;color:#ffcc44;font-weight:bold;margin-top:6px;">💰 ${c.price}</div>`;
    html += `</div>`;
  }
  html += `</div>`;

  content.innerHTML = html;

  content.querySelectorAll('div[data-case]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.case;
      openCase(id);
    });
  });
}

function openCase(caseId) {
  const c = CASES.find(x => x.id === caseId);
  if (!c) return;

  const unique = [...new Set(c.pool)];

  const info = document.createElement('div');
  info.id = 'case-info';
  info.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.94);z-index:2900;' +
    'display:flex;align-items:center;justify-content:center;font-family:Consolas,monospace;';

  const skinList = unique.map(id => {
    const s = SKINS[id];
    const rc = RARITY_COLORS[s.rarity] || '#888';
    const col = s.colors ? '#' + s.colors.main.toString(16).padStart(6, '0') : '#5577aa';
    const glowCol = s.colors && s.colors.glow ? '#' + s.colors.glow.toString(16).padStart(6, '0') : rc;

    return `<div style="position:relative;width:60px;height:60px;border-radius:50%;` +
      `background:radial-gradient(circle at 30% 30%, ${col}, #000 90%);` +
      `border:2px solid ${rc};box-shadow:0 0 14px ${glowCol}, inset 0 0 10px rgba(0,0,0,0.8);` +
      `display:flex;align-items:center;justify-content:center;cursor:help;" ` +
      `title="${s.name} (${s.rarity})">` +
      `<span style="font-size:9px;color:${rc};font-weight:bold;text-shadow:0 0 6px #000;">${s.name.slice(0,6)}</span>` +
      `</div>`;
  }).join('');

  const oddsBar = Object.entries(c.odds)
    .filter(([_, v]) => v > 0)
    .map(([k, v]) => {
      const rc = RARITY_COLORS[k];
      return `<div style="flex:${v};position:relative;">` +
        `<div style="height:8px;background:${rc};box-shadow:0 0 12px ${rc};border-radius:4px;"></div>` +
        `<div style="text-align:center;font-size:10px;color:${rc};margin-top:4px;font-weight:bold;">` +
        `${k.toUpperCase()} ${v}%</div></div>`;
    }).join('');

  info.innerHTML =
    '<div style="background:linear-gradient(135deg,rgba(35,28,18,0.99) 0%,rgba(15,10,6,1) 50%,rgba(25,18,10,1) 100%);' +
      'border:2px solid #c89848;border-radius:6px;padding:24px 20px;width:min(560px,94vw);max-height:92vh;overflow-y:auto;color:#d4c898;' +
      'box-shadow:0 0 100px rgba(200,152,72,0.5), inset 0 0 60px rgba(0,0,0,0.6);' +
      'position:relative;">' +

      '<div style="position:absolute;top:8px;left:8px;right:8px;height:2px;background:linear-gradient(90deg,transparent,#c89848,transparent);opacity:0.6;"></div>' +
      '<div style="position:absolute;bottom:8px;left:8px;right:8px;height:2px;background:linear-gradient(90deg,transparent,#c89848,transparent);opacity:0.6;"></div>' +

      '<div style="font-size:52px;text-align:center;margin-bottom:6px;' +
        'filter:drop-shadow(0 0 24px #ffcc44);">📦</div>' +

      '<h3 style="color:#e0c088;text-align:center;letter-spacing:5px;margin:0 0 8px 0;' +
        'text-shadow:0 0 20px rgba(200,152,72,0.8);font-size:18px;">' + c.name + '</h3>' +

      '<div style="text-align:center;color:#8a7a55;font-size:11px;margin-bottom:14px;letter-spacing:1px;">' +
        c.desc + '</div>' +

      '<div style="text-align:center;font-size:22px;font-weight:bold;margin-bottom:20px;' +
        'background:linear-gradient(90deg,#ffcc44,#fff0a0,#ffcc44);' +
        '-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;' +
        'filter:drop-shadow(0 0 12px rgba(255,204,68,0.6));">💰 ' + c.price + '</div>' +

      '<div style="margin-bottom:18px;">' +
        '<div style="color:#e0c088;font-size:10px;margin-bottom:8px;letter-spacing:3px;' +
          'text-align:center;font-weight:bold;">ШАНС ВЫПАДЕНИЯ</div>' +
        '<div style="display:flex;gap:6px;">' + oddsBar + '</div>' +
      '</div>' +

      '<div style="margin-bottom:20px;">' +
        '<div style="color:#e0c088;font-size:10px;margin-bottom:10px;letter-spacing:3px;' +
          'text-align:center;font-weight:bold;">СОДЕРЖИМОЕ (' + unique.length + ' скинов)</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:500px;margin:0 auto;">' +
          skinList +
        '</div>' +
      '</div>' +

      '<div style="display:flex;gap:10px;">' +
        '<button id="case-open" style="flex:2;padding:14px;' +
          'background:linear-gradient(180deg,#8a6828 0%,#5a4418 50%,#3a2a10 100%);' +
          'border:1px solid #ffcc44;border-radius:4px;color:#fff8d8;font-family:inherit;' +
          'font-size:15px;font-weight:bold;cursor:pointer;letter-spacing:3px;' +
          'box-shadow:0 0 20px rgba(255,204,68,0.4), inset 0 1px 0 rgba(255,255,255,0.2);' +
          'text-shadow:0 0 8px #ffcc44;">🎲 ОТКРЫТЬ</button>' +
        '<button id="case-cancel" style="flex:1;padding:14px;' +
          'background:transparent;border:1px solid #5a4a35;border-radius:4px;' +
          'color:#8a7a55;font-family:inherit;font-size:13px;cursor:pointer;letter-spacing:2px;">ОТМЕНА</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(info);

  document.getElementById('case-cancel').addEventListener('click', () => {
    playClick();
    info.remove();
  });

  document.getElementById('case-open').addEventListener('click', () => {
    playClick();
    info.remove();

    if (progress.money < c.price) {
      playSound('ui_error');
      showMessage('Недостаточно монет!');
      return;
    }
    spendMoney(c.price);

    const rolled = rollCase(caseId);
    showRoulette(c.pool, rolled, () => {
      const isNew = !progress.skins.includes(rolled);
      unlockSkin(rolled);
      playSound('ui_ready');
      showCaseResult(rolled, isNew);
      renderShop();
    });
  });
}

function showRoulette(pool, winner, onDone) {
  const el = document.createElement('div');
  el.id = 'roulette-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:3000;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'font-family:Consolas,monospace;';

  el.innerHTML =
    '<div style="color:#ffcc44;font-size:22px;letter-spacing:6px;margin-bottom:24px;">ОТКРЫТИЕ КЕЙСА</div>' +
    '<div id="roulette-window" style="position:relative;width:min(600px,92vw);height:140px;' +
      'background:linear-gradient(180deg,rgba(15,12,8,0.95),rgba(5,4,3,1));' +
      'border:2px solid #c89848;overflow:hidden;box-shadow:0 0 40px rgba(200,152,72,0.5);">' +
      '<div id="roulette-track" style="display:flex;align-items:center;height:100%;' +
        'transition:transform 4s cubic-bezier(0.15,0.85,0.25,1);"></div>' +
      '<div style="position:absolute;left:50%;top:0;bottom:0;width:3px;background:#ffcc44;' +
        'transform:translateX(-50%);box-shadow:0 0 20px #ffcc44;z-index:2;"></div>' +
    '</div>' +
    '<div style="color:#8a7a55;font-size:13px;margin-top:20px;">Удачи!</div>';
  document.body.appendChild(el);

  const track = document.getElementById('roulette-track');

  const ITEMS = 60;
  const WINNER_INDEX = 50;
  const items = [];
  for (let i = 0; i < ITEMS; i++) {
    let skinId;
    if (i === WINNER_INDEX) skinId = winner;
    else skinId = pool[Math.floor(Math.random() * pool.length)];
    items.push(skinId);
  }

  let html = '';
  for (const id of items) {
    const s = SKINS[id];
    const rc = RARITY_COLORS[s.rarity] || '#888';
    const previewColor = s.colors ? '#' + s.colors.main.toString(16).padStart(6, '0') : '#5577aa';
    const glow = s.colors && s.colors.glow ? `0 0 30px #${s.colors.glow.toString(16).padStart(6, '0')}` : `0 0 25px ${rc}88`;
    html += '<div style="flex:0 0 120px;height:120px;margin:10px 0;display:flex;align-items:center;justify-content:center;' +
      'border-right:1px solid rgba(200,152,72,0.15);">' +
      '<div style="width:80px;height:80px;background:radial-gradient(circle,' + previewColor + ',#000);' +
      'border-radius:50%;border:2px solid ' + rc + ';box-shadow:' + glow + ';' +
      'display:flex;align-items:center;justify-content:center;font-size:32px;">📦</div></div>';
  }
  track.innerHTML = html;

  const ITEM_W = 120;
  const half = (document.getElementById('roulette-window')?.clientWidth || 600) / 2;
  const targetOffset = (WINNER_INDEX * ITEM_W) + (ITEM_W / 2) - half;
  const jitter = (Math.random() - 0.5) * (ITEM_W - 40);

  requestAnimationFrame(() => {
    setTimeout(() => {
      track.style.transform = 'translateX(' + (-targetOffset + jitter) + 'px)';
    }, 50);
  });

  setTimeout(() => {
    onDone();
  }, 4500);
}

function showCaseResult(skinId, isNew) {
  const s = SKINS[skinId];
  const rc = RARITY_COLORS[s.rarity] || '#888';
  const previewColor = s.colors ? '#' + s.colors.main.toString(16).padStart(6, '0') : '#5577aa';
  const glow = s.colors && s.colors.glow ? '#' + s.colors.glow.toString(16).padStart(6, '0') : rc;

  const overlay = document.getElementById('roulette-overlay');
  if (overlay) {
    overlay.style.transition = 'opacity 0.4s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 400);
  }

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:3100;' +
    'display:flex;align-items:center;justify-content:center;font-family:Consolas,monospace;';
  el.innerHTML =
    '<div style="text-align:center;padding:30px 24px;max-width:92vw;border:2px solid ' + rc + ';' +
    'background:linear-gradient(180deg,rgba(25,20,14,0.99),rgba(8,6,5,1));' +
    'box-shadow:0 0 80px ' + glow + ';">' +
    '<div style="font-size:24px;color:' + rc + ';letter-spacing:4px;margin-bottom:20px;">' + s.rarity.toUpperCase() + '</div>' +
    '<div style="width:120px;height:120px;margin:0 auto 20px;background:radial-gradient(circle,' + previewColor + ',#000);' +
    'border-radius:50%;border:3px solid ' + rc + ';box-shadow:0 0 60px ' + glow + ';"></div>' +
    '<div style="font-size:28px;color:#f0d8a8;font-weight:bold;">' + s.name + '</div>' +
    '<div style="margin-top:20px;color:#8a7a55;font-size:13px;">' + (isNew ? '✨ Новый скин добавлен в коллекцию!' : 'Скин уже был в коллекции') + '</div>' +
    '</div>';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}