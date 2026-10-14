// js/ui.js
// Общие UI-утилиты: определение тач-устройства, модальные окна
// (вместо alert/confirm — они запрещены/ломаются в iframe Яндекс Игр) и уведомления.

export const IS_TOUCH = (() => {
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
    return navigator.maxTouchPoints > 0 && !window.matchMedia('(hover: hover)').matches;
  } catch (e) {
    return false;
  }
})();

// Подпись действия: на ПК — кнопка мыши, на телефоне — касание
export function inputText(desktop, touch) {
  return IS_TOUCH ? touch : desktop;
}

function openModal(text, buttons) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ui-modal';

    const box = document.createElement('div');
    box.className = 'ui-modal-box';

    const msg = document.createElement('div');
    msg.className = 'ui-modal-text';
    msg.textContent = text;
    box.appendChild(msg);

    const row = document.createElement('div');
    row.className = 'ui-modal-buttons';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'ui-modal-btn' + (b.primary ? ' primary' : '');
      btn.textContent = b.text;
      btn.addEventListener('click', () => {
        overlay.remove();
        resolve(b.value);
      });
      row.appendChild(btn);
    }
    box.appendChild(row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}

export function showConfirm(text, { okText = 'Да', cancelText = 'Отмена' } = {}) {
  return openModal(text, [
    { text: cancelText, value: false },
    { text: okText, value: true, primary: true }
  ]);
}

export function showMessage(text, { okText = 'OK' } = {}) {
  return openModal(text, [{ text: okText, value: true, primary: true }]);
}

export function showAlert(text, type = 'info', duration = 3000) {
  let container = document.getElementById('alert-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'alert-container';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = 'alert alert-' + type;
  el.textContent = text;
  container.appendChild(el);

  // На маленьком экране не копим уведомления
  while (container.children.length > (IS_TOUCH ? 3 : 6)) {
    container.firstChild.remove();
  }

  setTimeout(() => {
    el.classList.add('alert-out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ============================================================
// Окно ввода текста (ник и т.п.) — вместо prompt(), который запрещён в iframe Яндекса
// ============================================================
export function showPrompt(text, { value = '', okText = 'OK', cancelText = null, placeholder = '', maxLength = 16 } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ui-modal';
    const box = document.createElement('div');
    box.className = 'ui-modal-box';

    const msg = document.createElement('div');
    msg.className = 'ui-modal-text';
    msg.textContent = text;
    box.appendChild(msg);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ui-modal-input';
    input.maxLength = maxLength;
    input.placeholder = placeholder;
    input.value = value;
    input.autocomplete = 'off';
    box.appendChild(input);

    const row = document.createElement('div');
    row.className = 'ui-modal-buttons';
    const done = (v) => { overlay.remove(); resolve(v); };
    if (cancelText) {
      const cancel = document.createElement('button');
      cancel.className = 'ui-modal-btn';
      cancel.textContent = cancelText;
      cancel.addEventListener('click', () => done(null));
      row.appendChild(cancel);
    }
    const ok = document.createElement('button');
    ok.className = 'ui-modal-btn primary';
    ok.textContent = okText;
    ok.addEventListener('click', () => done(input.value));
    row.appendChild(ok);
    box.appendChild(row);

    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // чтобы клавиши ввода не управляли игрой
      if (e.key === 'Enter') done(input.value);
    });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => { try { input.focus(); input.select(); } catch (e) {} }, 50);
  });
}

// ============================================================
// Ползунки стартовых ресурсов (для окна настройки матча и для лобби)
// values: { minerals, vespene } — изменяется на месте, onChange(values) вызывается при правках
// ============================================================
const PRESETS = [
  { label: 'Стандарт', minerals: 150, vespene: 0 },
  { label: 'Больше', minerals: 500, vespene: 200 },
  { label: 'Много', minerals: 1000, vespene: 500 },
  { label: 'Максимум', minerals: 2000, vespene: 1000 }
];

export function buildResourceSliders(values, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'res-setup';

  const makeRow = (label, key, max, icon) => {
    const row = document.createElement('div');
    row.className = 'res-row';
    const lab = document.createElement('div');
    lab.className = 'res-label';
    lab.textContent = `${icon} ${label}`;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(max);
    slider.step = '50';
    slider.value = String(values[key]);
    const val = document.createElement('div');
    val.className = 'res-value';
    val.textContent = values[key];
    slider.addEventListener('input', () => {
      values[key] = parseInt(slider.value, 10);
      val.textContent = values[key];
      if (onChange) onChange(values);
    });
    row.append(lab, slider, val);
    row._sync = () => { slider.value = String(values[key]); val.textContent = values[key]; };
    return row;
  };

  const rowM = makeRow('Минералы', 'minerals', 2000, '◆');
  const rowV = makeRow('Газ (веспен)', 'vespene', 1000, '⬢');

  const presets = document.createElement('div');
  presets.className = 'res-presets';
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-modal-btn res-preset';
    b.textContent = p.label;
    b.title = `${p.minerals} ◆ / ${p.vespene} ⬢`;
    b.addEventListener('click', () => {
      values.minerals = p.minerals;
      values.vespene = p.vespene;
      rowM._sync(); rowV._sync();
      if (onChange) onChange(values);
    });
    presets.appendChild(b);
  }

  wrap.append(rowM, rowV, presets);
  return wrap;
}

// Окно «Настройка матча»: стартовые ресурсы. Возвращает {minerals, vespene} или null (отмена).
export function showMatchSetup(initial, { title = 'Настройка матча' } = {}) {
  return new Promise((resolve) => {
    const values = { minerals: initial.minerals, vespene: initial.vespene };
    const overlay = document.createElement('div');
    overlay.className = 'ui-modal';
    const box = document.createElement('div');
    box.className = 'ui-modal-box wide';

    const head = document.createElement('div');
    head.className = 'ui-modal-title';
    head.textContent = title;
    const sub = document.createElement('div');
    sub.className = 'ui-modal-text small';
    sub.textContent = 'С какими ресурсами начнёте матч. Стандарт — 150 минералов и 0 газа. Можно поднять до 2000 минералов и 1000 газа.';

    const sliders = buildResourceSliders(values);

    const row = document.createElement('div');
    row.className = 'ui-modal-buttons';
    const cancel = document.createElement('button');
    cancel.className = 'ui-modal-btn';
    cancel.textContent = 'Отмена';
    cancel.addEventListener('click', () => { overlay.remove(); resolve(null); });
    const go = document.createElement('button');
    go.className = 'ui-modal-btn primary';
    go.textContent = '▶ Начать';
    go.addEventListener('click', () => { overlay.remove(); resolve({ ...values }); });
    row.append(cancel, go);

    box.append(head, sub, sliders, row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}
