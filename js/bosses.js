// js/bosses.js
import * as THREE from 'three';
import { units, makeHpBar, drawHpBar } from './units.js';
import { getHeight } from './terrain.js';
import { hasModel, getModel } from './models.js';
import { playSound } from './audio.js';

export const BOSS_PRESETS = {
  titan: {
    name: 'ТИТАН',
    hp: 3000,
    attack: 80,
    attackRange: 5.5,
    attackSpeed: 1.5,
    speed: 1.2,
    size: 2.8,
    sight: 14,
    color: 0xff2200,
    glow: 0xff4400,
    isBoss: true,
    isFlying: false,
  },
  hydra: {
    name: 'ГИДРА',
    hp: 2000,
    attack: 60,
    attackRange: 6.5,
    attackSpeed: 1.2,
    speed: 1.6,
    size: 2.2,
    sight: 13,
    color: 0x00ff88,
    glow: 0x00ff88,
    isBoss: true,
    isFlying: true,
  },
  ark: {
    name: 'КОВЧЕГ',
    hp: 5000,
    attack: 120,
    attackRange: 7.0,
    attackSpeed: 2.0,
    speed: 0.8,
    size: 3.5,
    sight: 15,
    color: 0xffcc44,
    glow: 0xffaa00,
    isBoss: true,
    isFlying: false,
  }
};

export function spawnBoss(scene, x, z, bossType = 'titan', owner = 'bot', options = {}) {
  const preset = BOSS_PRESETS[bossType];
  if (!preset) return null;

  const size = preset.size;
  let mesh;

  if (hasModel('thor')) {
    mesh = getModel('thor', size * 1.2);
    // Свои материалы с оттенком босса. Раньше босс делил материалы
    // с кэшем моделей, и его вспышки перекрашивали Торов игрока.
    mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        if (child.material.color) child.material.color.lerp(new THREE.Color(preset.color), 0.45);
      }
    });
  } else {
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.7, 16, 12),
      new THREE.MeshStandardMaterial({
        color: preset.color,
        emissive: preset.glow,
        emissiveIntensity: 0.8,
        roughness: 0.3,
        metalness: 0.7
      })
    );
  }

  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(size * 1.1, 16, 12),
    new THREE.MeshBasicMaterial({
      color: preset.glow,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
      depthWrite: false
    })
  );
  aura.userData.isParticle = true;
  mesh.add(aura);

  const groundH = preset.isFlying ? 0 : getHeight(x, z);
  const baseY = preset.isFlying ? 2.5 : groundH + size / 2;
  mesh.position.set(x, baseY, z);
  scene.add(mesh);

  const hpBar = makeHpBar();
  hpBar.position.y = size + 0.6;
  hpBar.scale.set(2.5, 0.35, 1);
  mesh.add(hpBar);

  const hp = Math.round(preset.hp * (options.hpMult || 1));

  const boss = {
    isUnit: true,
    mesh,
    hpBar,
    type: bossType,
    name: options.name || preset.name,
    owner,
    target: null,
    attackTarget: null,
    hp,
    maxHp: hp,
    attack: preset.attack,
    attackRange: preset.attackRange,
    attackCooldown: 0,
    attackSpeed: preset.attackSpeed,
    speed: preset.speed,
    sight: preset.sight,
    isPlayer: owner === 'player',
    isWorker: false,
    isBoss: true,
    inBunker: null,
    goingToBunker: null,
    autoAttackDisabled: false,
    isFlying: preset.isFlying,
    baseY: baseY,
    size: size,
    baseScale: mesh.scale.clone(),
    canSiege: false,
    sieged: false,
    canTransform: false,
    inAirForm: preset.isFlying,
    isInvisible: false,
    revealTimer: 0,
    isHealer: false,
    flashTimer: 0,
    damageFlashTimer: 0,
    retargetTimer: 0,
    walkPhase: 0,
    recoilTimer: 0,
    baseData: {
      attack: preset.attack,
      attackRange: preset.attackRange,
      attackSpeed: preset.attackSpeed,
      speed: preset.speed,
      isFlying: preset.isFlying,
      baseY: baseY,
      sight: preset.sight,
      yawOffset: Math.PI  // модель Тора смотрит в -Z, как и остальные юниты
    }
  };

  drawHpBar(boss);
  units.push(boss);
  return boss;
}

/**
 * Призвать босса.
 * bossType — если не задан, выбирается по номеру волны.
 */
export function spawnBossWave(scene, waveNumber, targetX, targetZ, options = {}) {
  let bossType = options.bossType;
  if (!bossType) {
    if (waveNumber >= 10) bossType = 'ark';
    else if (waveNumber >= 7) bossType = 'hydra';
    else bossType = 'titan';
  }

  const boss = spawnBoss(scene, targetX, targetZ, bossType, 'bot', options);
  if (boss) {
    boss.target = { x: targetX, y: 0, z: targetZ };
    playSound('ui_alert');
    window.dispatchEvent(new CustomEvent('boss-spawn', {
      detail: { name: boss.name }
    }));
  }
  return boss;
}
