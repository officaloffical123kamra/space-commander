export const MAPS = {
  classic: {
    id: 'classic',
    name: 'Классика',
    desc: 'Базы по углам. Сбалансированно.',
    biome: 'grass',
    music: 'music_classic',
    playerCC:    { x: -22, z: -22 },
    playerMins:  { x: -22, z: -17 },
    playerGeys:  { x: -18, z: -22 },
    botCC:       { x: 22,  z: 22 },
    botMins:     { x: 22,  z: 27 },
    botGeys:     { x: 18,  z: 22 },
    extraMins: [
      { x: 18,  z: -18 },
      { x: -18, z: 18 }
    ],
    extraGeys: [
      { x: 22,  z: -14 },
      { x: -22, z: 14 }
    ],
    peaks: []
  },

  canyon: {
    id: 'canyon',
    name: 'Каньон',
    desc: 'Две базы по краям.',
    biome: 'desert',
    music: 'music_canyon',
    playerCC:    { x: -22, z: 0 },
    playerMins:  { x: -27, z: 0 },
    playerGeys:  { x: -22, z: -5 },
    botCC:       { x: 22,  z: 0 },
    botMins:     { x: 27,  z: 0 },
    botGeys:     { x: 22,  z: 5 },
    extraMins: [
      { x: 0, z: -22 },
      { x: 0, z: 22 }
    ],
    extraGeys: [
      { x: -6, z: -20 },
      { x: 6,  z: 20 }
    ],
    peaks: []
  },

  islands: {
    id: 'islands',
    name: 'Острова',
    desc: 'Базы по углам, центр открыт.',
    biome: 'snow',
    music: 'music_islands',
    playerCC:    { x: -22, z: -22 },
    playerMins:  { x: -22, z: -17 },
    playerGeys:  { x: -18, z: -22 },
    botCC:       { x: 22,  z: 22 },
    botMins:     { x: 22,  z: 27 },
    botGeys:     { x: 18,  z: 22 },
    extraMins: [
      { x: 0, z: 0 }
    ],
    extraGeys: [
      { x: 8, z: 8 }
    ],
    peaks: []
  },

  labyrinth: {
    id: 'labyrinth',
    name: 'Открытая',
    desc: 'Простая карта, много места.',
    biome: 'lava',
    music: 'music_labyrinth',
    playerCC:    { x: -22, z: 0 },
    playerMins:  { x: -27, z: 0 },
    playerGeys:  { x: -22, z: -5 },
    botCC:       { x: 22,  z: 0 },
    botMins:     { x: 27,  z: 0 },
    botGeys:     { x: 22,  z: 5 },
    extraMins: [
      { x: 0, z: -20 },
      { x: 0, z: 20 }
    ],
    extraGeys: [
      { x: -8, z: -20 },
      { x: 8,  z: 20 }
    ],
    peaks: []
  }
};

export const BIOMES = {
  grass:  { ground: 0x4a7a32, low: 0x3a6a22, mid: 0x5a8a42, high: 0x6a9a52, fog: 0x2a4a20, ambient: 0xf0ffd8, rockColor: 0x8a8a80, chasm: 0x2a3a20 },
  snow:   { ground: 0xc0ccd8, low: 0xa8b8c8, mid: 0xc8d4e0, high: 0xe0e8f0, fog: 0x6a7a8a, ambient: 0xffffff, rockColor: 0xa0b0c0, chasm: 0x8a98a8 },
  desert: { ground: 0xc8b088, low: 0xb8a078, mid: 0xd0b890, high: 0xdcc098, fog: 0x7a6a4a, ambient: 0xffffff, rockColor: 0xc0a888, chasm: 0xa89070 },
  lava:   { ground: 0xa84838, low: 0x983828, mid: 0xb85848, high: 0xc86858, fog: 0x7a3838, ambient: 0xffd0b0, rockColor: 0x806060, chasm: 0x8a3838 }
};

export function getBiome(map) {
  return BIOMES[map.biome] || BIOMES.grass;
}

export function getMap(id) {
  return MAPS[id] || MAPS.classic;
}