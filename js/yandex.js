// js/yandex.js
// Интеграция с Yandex Games SDK.
// Требования модерации, которые здесь закрываются:
//  - LoadingAPI.ready() — один раз, когда игра готова к взаимодействию;
//  - GameplayAPI.start()/stop() — когда идёт/не идёт геймплей;
//  - на время рекламы игра и звук ставятся на паузу;
//  - события game_api_pause/game_api_resume от платформы;
//  - облачное сохранение прогресса.
let ysdk = null;
let player = null;
let readySent = false;
let gameplayRunning = false;
let lastFullscreenAd = 0;
let isAdShowing = false;
const FULLSCREEN_COOLDOWN = 60000;

const pauseListeners = new Set();

// cb(reason, paused) — вызывается, когда платформа/реклама ставит игру на паузу
export function onSystemPause(cb) {
  pauseListeners.add(cb);
}

function emitPause(reason, paused) {
  for (const cb of pauseListeners) {
    try { cb(reason, paused); } catch (e) {}
  }
}

export function initYandex() {
  if (typeof YaGames === 'undefined') {
    console.log('⚠️ Yandex SDK не найден — работаем локально');
    return Promise.resolve(null);
  }

  const initPromise = YaGames.init()
    .then(async (sdk) => {
      ysdk = sdk;
      try {
        sdk.on('game_api_pause', () => emitPause('sdk', true));
        sdk.on('game_api_resume', () => emitPause('sdk', false));
      } catch (e) {}
      try {
        player = await sdk.getPlayer({ scopes: false });
      } catch (e) {
        console.warn('⚠️ Не удалось получить игрока', e);
      }
      console.log('✅ Yandex SDK OK');
      return sdk;
    })
    .catch((err) => {
      console.warn('⚠️ SDK не загрузился — работаем без него', err && err.message);
      return null;
    });

  // Если SDK отвечает долго — не держим игрока на чёрном экране.
  // Когда init всё-таки завершится, ysdk всё равно заполнится.
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 5000));
  return Promise.race([initPromise, timeout]);
}

export function isYandexReady() {
  return !!ysdk;
}

export function getSDK() {
  return ysdk;
}

// ============================================================
// LOADING / GAMEPLAY API
// ============================================================

export function notifyGameReady() {
  if (readySent || !ysdk) return;
  try {
    ysdk.features.LoadingAPI?.ready();
    readySent = true;
  } catch (e) {}
}

export function gameplayStart() {
  if (gameplayRunning) return;
  gameplayRunning = true;
  try { ysdk?.features?.GameplayAPI?.start(); } catch (e) {}
}

export function gameplayStop() {
  if (!gameplayRunning) return;
  gameplayRunning = false;
  try { ysdk?.features?.GameplayAPI?.stop(); } catch (e) {}
}

// ============================================================
// РЕКЛАМА
// ============================================================

/**
 * Полноэкранная реклама. Promise<boolean> — была ли показана.
 */
export function showFullscreenAd(force = false) {
  return new Promise((resolve) => {
    if (!ysdk || !ysdk.adv || isAdShowing) {
      resolve(false);
      return;
    }
    const now = Date.now();
    if (!force && now - lastFullscreenAd < FULLSCREEN_COOLDOWN) {
      resolve(false);
      return;
    }

    isAdShowing = true;
    let paused = false;
    const finish = (shown) => {
      isAdShowing = false;
      if (paused) emitPause('ad', false);
      if (shown) lastFullscreenAd = Date.now();
      resolve(!!shown);
    };

    try {
      ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: () => { paused = true; emitPause('ad', true); },
          onClose: (wasShown) => finish(wasShown),
          onError: () => finish(false),
          onOffline: () => finish(false)
        }
      });
    } catch (e) {
      finish(false);
    }
  });
}

/**
 * Реклама за награду. Promise<boolean> — досмотрел ли игрок до конца.
 */
export function showRewardedAd() {
  return new Promise((resolve) => {
    if (!ysdk || !ysdk.adv) {
      // Локальная разработка — сразу выдаём награду
      console.log('🎁 [LOCAL] Rewarded ad — награда выдана');
      resolve(true);
      return;
    }
    if (isAdShowing) {
      resolve(false);
      return;
    }

    isAdShowing = true;
    let rewarded = false;
    let paused = false;
    const finish = () => {
      isAdShowing = false;
      if (paused) emitPause('ad', false);
      resolve(rewarded);
    };

    try {
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => { paused = true; emitPause('ad', true); },
          onRewarded: () => { rewarded = true; },
          onClose: finish,
          onError: finish
        }
      });
    } catch (e) {
      finish();
    }
  });
}

// ============================================================
// ОБЛАЧНОЕ СОХРАНЕНИЕ
// ============================================================

export async function saveToCloud(data, flush = false) {
  if (!player) return false;
  try {
    await player.setData({ progress: data }, flush);
    return true;
  } catch (err) {
    console.warn('⚠️ Ошибка облачного сохранения', err);
    return false;
  }
}

export async function loadFromCloud() {
  if (!player) return null;
  try {
    const data = await player.getData(['progress']);
    return (data && data.progress) || null;
  } catch (err) {
    console.warn('⚠️ Ошибка загрузки из облака', err);
    return null;
  }
}

// Имя игрока в Яндексе (если вошёл в аккаунт) — подсказка для ника
export function getPlayerName() {
  try { return (player && player.getName && player.getName()) || ''; } catch (e) { return ''; }
}
