// js/skins.js
export const SKINS = {
  // === Обычные ===
  default:   { name: 'Стандарт',     price: 0,    colors: null,                                                     rarity: 'common',    shop: true,  unitsOnly: false },
  blue:      { name: 'Синий',        price: 500,  colors: { main: 0x3366ff, accent: 0x88aaff },                      rarity: 'common',    shop: true,  unitsOnly: false },
  red:       { name: 'Красный',      price: 500,  colors: { main: 0xcc3333, accent: 0xff8888 },                      rarity: 'common',    shop: true,  unitsOnly: false },
  green:     { name: 'Зелёный',      price: 500,  colors: { main: 0x33aa44, accent: 0x88ee88 },                      rarity: 'common',    shop: true,  unitsOnly: false },
  brown:     { name: 'Коричневый',   price: 500,  colors: { main: 0x8b5a2b, accent: 0xc89848 },                      rarity: 'common',    shop: true,  unitsOnly: false },
  gray:      { name: 'Серый',        price: 400,  colors: { main: 0x888888, accent: 0xcccccc },                      rarity: 'common',    shop: true,  unitsOnly: false },
  yellow:    { name: 'Жёлтый',       price: 500,  colors: { main: 0xdddd33, accent: 0xffff88 },                      rarity: 'common',    shop: true,  unitsOnly: false },

  // === Редкие ===
  purple:    { name: 'Фиолетовый',   price: 1500, colors: { main: 0x9944cc, accent: 0xdd88ff },                      rarity: 'rare',      shop: true,  unitsOnly: false },
  orange:    { name: 'Оранжевый',    price: 1500, colors: { main: 0xff8833, accent: 0xffcc88 },                      rarity: 'rare',      shop: true,  unitsOnly: false },
  cyan:      { name: 'Циан',         price: 1500, colors: { main: 0x22cccc, accent: 0x88ffee },                      rarity: 'rare',      shop: true,  unitsOnly: false },
  lime:      { name: 'Лайм',         price: 1200, colors: { main: 0xaadd22, accent: 0xddff88 },                      rarity: 'rare',      shop: true,  unitsOnly: false },
  teal:      { name: 'Бирюза',       price: 1200, colors: { main: 0x228888, accent: 0x66cccc },                      rarity: 'rare',      shop: true,  unitsOnly: false },

  // === Эпические ===
  gold:      { name: 'Золотой',      price: 3000, colors: { main: 0xffcc44, accent: 0xfff0a0, glow: 0xffcc44 },      rarity: 'epic',      shop: true,  unitsOnly: false },
  silver:    { name: 'Серебряный',   price: 3000, colors: { main: 0xccccdd, accent: 0xffffff, glow: 0xaaccff },      rarity: 'epic',      shop: true,  unitsOnly: false },
  pink:      { name: 'Розовый',      price: 3000, colors: { main: 0xff66aa, accent: 0xffaacc, glow: 0xff88cc },      rarity: 'epic',      shop: true,  unitsOnly: false },
  crimson:   { name: 'Багровый',     price: 2500, colors: { main: 0x990033, accent: 0xff3388, glow: 0xff2255 },      rarity: 'epic',      shop: true,  unitsOnly: false },
  azure:     { name: 'Лазурный',     price: 2500, colors: { main: 0x2288dd, accent: 0x88ddff, glow: 0x44aaff },      rarity: 'epic',      shop: true,  unitsOnly: false },

  // === Легендарные — из кейсов, красят и юнитов, и здания ===
  gradient:  { name: 'Градиент',     price: 0, colors: { main: 0xff3366, accent: 0x33ffcc, glow: 0xffffff },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'rainbow' },
  rainbow:   { name: 'Радуга',       price: 0, colors: { main: 0xff00ff, accent: 0x00ffff, glow: 0xffffff },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'rainbow' },
  neon:      { name: 'Неон',         price: 0, colors: { main: 0x00ff88, accent: 0xffff00, glow: 0x00ff88 },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'spark' },
  plasma:    { name: 'Плазма',       price: 0, colors: { main: 0x8800ff, accent: 0x00ddff, glow: 0xaa66ff },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'spark' },
  inferno:   { name: 'Инферно',      price: 0, colors: { main: 0xff2200, accent: 0xffaa00, glow: 0xff4400 },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'fire' },
  ice:       { name: 'Лёд',          price: 0, colors: { main: 0x88ddff, accent: 0xffffff, glow: 0x88ddff },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'snow' },
  void:      { name: 'Пустота',      price: 0, colors: { main: 0x220033, accent: 0xaa00ff, glow: 0x6600cc },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'void' },
  toxic:     { name: 'Токсин',       price: 0, colors: { main: 0x88ff00, accent: 0xddff44, glow: 0x88ff00 },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'bubble' },
  dragon:    { name: 'Дракон',       price: 0, colors: { main: 0xcc0022, accent: 0xffcc00, glow: 0xff2200 },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'fire' },
  galaxy:    { name: 'Галактика',    price: 0, colors: { main: 0x4422aa, accent: 0xff88dd, glow: 0x8844ff },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'stars' },
  error:     { name: 'ERROR',        price: 0, colors: { main: 0xff00ff, accent: 0x00ff00, glow: 0xff00ff },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'glitch' },
  glitch:    { name: 'Глитч',        price: 0, colors: { main: 0x00ffff, accent: 0xff0088, glow: 0x00ffff },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'glitch' },
  matrix:    { name: 'Матрица',      price: 0, colors: { main: 0x00ff00, accent: 0x88ff88, glow: 0x00ff00 },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'digital' },
  blood:     { name: 'Кровь',        price: 0, colors: { main: 0x660000, accent: 0xff0000, glow: 0xff0000 },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'blood' },
  cosmic:    { name: 'Космос',       price: 0, colors: { main: 0x110022, accent: 0xffffff, glow: 0x8844ff },  rarity: 'legendary', shop: false, unitsOnly: false, particles: 'stars' }
};

export const RARITY_COLORS = {
  common:    '#8a8a80',
  rare:      '#4488ff',
  epic:      '#aa44ff',
  legendary: '#ffaa22'
};

export const CASES = [
  { id: 'starter', name: 'Стартовый', price: 300, desc: 'Только обычные цвета',
    pool: ['gray', 'blue', 'red', 'green', 'brown', 'yellow'],
    odds: { common: 100, rare: 0, epic: 0, legendary: 0 } },
  { id: 'basic', name: 'Базовый', price: 800, desc: 'Обычные + шанс на редкий',
    pool: ['blue', 'red', 'green', 'brown', 'gray', 'yellow', 'purple', 'lime'],
    odds: { common: 80, rare: 20, epic: 0, legendary: 0 } },
  { id: 'rare', name: 'Редкий', price: 2000, desc: 'Много редких, шанс на эпик',
    pool: ['purple', 'orange', 'cyan', 'lime', 'teal', 'gold', 'crimson'],
    odds: { common: 10, rare: 60, epic: 30, legendary: 0 } },
  { id: 'epic', name: 'Эпический', price: 3500, desc: 'Только эпики',
    pool: ['gold', 'silver', 'pink', 'crimson', 'azure'],
    odds: { common: 0, rare: 0, epic: 100, legendary: 0 } },
  { id: 'units', name: 'Юнит-кейс', price: 4000, desc: 'Легендарные скины для ЮНИТОВ',
    pool: ['neon', 'matrix', 'toxic', 'ice', 'glitch', 'error', 'plasma', 'blood'],
    odds: { common: 0, rare: 0, epic: 20, legendary: 80 } },
  { id: 'premium', name: 'Премиум', price: 5000, desc: 'Эпики + легендарки',
    pool: ['gold', 'silver', 'pink', 'neon', 'ice', 'plasma', 'glitch', 'matrix'],
    odds: { common: 0, rare: 0, epic: 50, legendary: 50 } },
  { id: 'cosmic', name: 'Космический', price: 7500, desc: 'Только легендарные',
    pool: ['galaxy', 'cosmic', 'void', 'dragon', 'inferno', 'rainbow', 'gradient'],
    odds: { common: 0, rare: 0, epic: 0, legendary: 100 } },
  { id: 'god', name: 'БОЖЕСТВЕННЫЙ', price: 15000, desc: 'Все ЛЕГЕНДАРНЫЕ',
    pool: ['gradient', 'rainbow', 'neon', 'plasma', 'inferno', 'ice', 'void', 'toxic', 'dragon', 'galaxy', 'error', 'glitch', 'matrix', 'blood', 'cosmic'],
    odds: { common: 0, rare: 0, epic: 0, legendary: 100 } }
];

export const PLAYER_UNITS = [
  { id: 'scv',           name: 'КСМ',       icon: '👷' },
  { id: 'marine',        name: 'Боец',      icon: '🪖' },
  { id: 'marauder',      name: 'Мародёр',   icon: '🔫' },
  { id: 'ghost',         name: 'Призрак',   icon: '👻' },
  { id: 'medic',         name: 'Медик',     icon: '⛑' },
  { id: 'hellion',       name: 'Гелион',    icon: '🔥' },
  { id: 'tank',          name: 'Танк',      icon: '💥' },
  { id: 'thor',          name: 'Тор',       icon: '⚡' },
  { id: 'viking',        name: 'Викинг',    icon: '✈️' },
  { id: 'banshee',       name: 'Банши',     icon: '🛸' },
  { id: 'battlecruiser', name: 'Крейсер',   icon: '🚀' }
];

export const PLAYER_BUILDINGS = [
  { id: 'cc',          name: 'Командный центр', icon: '🏛' },
  { id: 'barracks',    name: 'Казарма',         icon: '🏭' },
  { id: 'factory',     name: 'Завод',           icon: '⚙️' },
  { id: 'starport',    name: 'Космопорт',       icon: '🚀' },
  { id: 'storage',     name: 'Хранилище',       icon: '📦' },
  { id: 'bunker',      name: 'Бункер',          icon: '🛡' },
  { id: 'sensor',      name: 'Антенна',         icon: '📡' },
  { id: 'turret',      name: 'Туррель',         icon: '🔫' },
  { id: 'engineering', name: 'Инж. комплекс',   icon: '🔧' },
  { id: 'armory',      name: 'Арсенал',         icon: '⚔️' },
  { id: 'refinery',    name: 'Рефайнери',       icon: '⬢' }
];

export function rollCase(caseId) {
  const c = CASES.find(x => x.id === caseId);
  if (!c) return null;
  return c.pool[Math.floor(Math.random() * c.pool.length)];
}