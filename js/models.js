import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const cache = {};
const loader = new GLTFLoader();

const MODEL_PATHS = {
  cc:            'assets/models/cc.glb',
  barracks:      'assets/models/barracks.glb',
  factory:       'assets/models/factory.glb',
  starport:      'assets/models/starport.glb',
  storage:       'assets/models/storage.glb',
  bunker:        'assets/models/bunker.glb',
  sensor:        'assets/models/sensor.glb',
  turret:        'assets/models/turret.glb',
  engineering:   'assets/models/engineering.glb',
  armory:        'assets/models/armory.glb',
  refinery:      'assets/models/refinery.glb',
  scv:           'assets/models/scv.glb',
  marine:        'assets/models/marine.glb',
  marauder:      'assets/models/marauder.glb',
  ghost:         'assets/models/ghost.glb',
  medic:         'assets/models/medic.glb',
  hellion:       'assets/models/hellion.glb',
  tank:          'assets/models/tank.glb',
  thor:          'assets/models/thor.glb',
  viking:        'assets/models/viking.glb',
  banshee:       'assets/models/banshee.glb',
  battlecruiser: 'assets/models/battlecruiser.glb'
};

function loadOne(key, url) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        cache[key] = gltf.scene;
        resolve({ key, ok: true });
      },
      undefined,
      () => {
        cache[key] = null;
        resolve({ key, ok: false });
      }
    );
  });
}

// Модели грузятся один раз: меню и старт матча используют один и тот же промис
let loadPromise = null;

export function loadAllModels() {
  if (!loadPromise) loadPromise = doLoadAllModels();
  return loadPromise;
}

async function doLoadAllModels() {
  const promises = [];
  for (const key in MODEL_PATHS) {
    promises.push(loadOne(key, MODEL_PATHS[key]));
  }
  const results = await Promise.all(promises);
  const loaded = results.filter(r => r.ok).map(r => r.key);
  const missing = results.filter(r => !r.ok).map(r => r.key);
  if (missing.length) console.warn('⚪ Нет файлов моделей (будут кубы):', missing);
  return { loaded, missing };
}

export function getModel(key, targetSize = null) {
  const original = cache[key];
  if (!original) return null;

  const clone = original.clone(true);

  if (targetSize) {
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = targetSize / maxDim;
      clone.scale.set(scale, scale, scale);
    }
    const box2 = new THREE.Box3().setFromObject(clone);
    clone.position.y -= box2.min.y;
  }

  return clone;
}

export function hasModel(key) {
  return !!cache[key];
}