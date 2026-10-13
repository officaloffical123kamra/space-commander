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
