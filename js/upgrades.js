// js/upgrades.js
// Уровни улучшений. У игрока и бота они раздельные
// (раньше бот «прокачивал» улучшения игрока).

const VEHICLES = ['hellion', 'tank', 'thor', 'viking', 'banshee', 'battlecruiser'];

export const upgrades = {
  infantryWeapon: 0, infantryArmor: 0,
  vehicleWeapon: 0, vehicleArmor: 0
};

export const botUpgrades = {
  infantryWeapon: 0, infantryArmor: 0,
  vehicleWeapon: 0, vehicleArmor: 0
};

export function isVehicleType(type) {
  return VEHICLES.includes(type);
}

export function getUpgrades(owner = 'player') {
  return owner === 'bot' ? botUpgrades : upgrades;
}

export function getWeaponBonus(type, owner = 'player') {
  const u = getUpgrades(owner);
  const lvl = isVehicleType(type) ? u.vehicleWeapon : u.infantryWeapon;
  return lvl * 2;
}

export function getArmorReduction(type, owner = 'player') {
  const u = getUpgrades(owner);
  const lvl = isVehicleType(type) ? u.vehicleArmor : u.infantryArmor;
  return lvl * 1;
}
