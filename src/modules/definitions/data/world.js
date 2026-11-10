// Node types, buildings and scenarios.
export const nodeTypes = {
  tree: { name: 'Tree', yields: 'wood', amount: 35, variance: 10 },
  rock: { name: 'Rock', yields: 'stone', amount: 25, variance: 10 },
};

// Building level is data: later phases add effects per level. `visual` thresholds decide the
// meaningful world state (ruined / damaged / repaired), never one asset per health percent.
// `storage` = max capacity per item type. Leave undefined for buildings without storage.
export const buildings = {
  hq: {
    name: 'Headquarters',
    levels: { 1: { maxHealth: 200 }, 2: { maxHealth: 300 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 5 }, healthPerAction: 25, ticks: 30 },
    storage: { wood: 150, stone: 150, food: 100, water: 100 },
  },
  fence: {
    name: 'Perimeter Fence',
    levels: { 1: { maxHealth: 100 }, 2: { maxHealth: 160 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 5 }, healthPerAction: 25, ticks: 30 },
  },
  tent: {
    name: 'Survivor Tent',
    levels: { 1: { maxHealth: 60 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 3 }, healthPerAction: 20, ticks: 20 },
    storage: { food: 50, water: 50 },
  },
};

const stage1 = {
  name: 'Stage 1 — The Ruined Settlement',
  map: { width: 24, height: 16 },
  stock: { wood: 0, stone: 0, food: 6, water: 6 },
  buildings: [
    { id: 'hq', type: 'hq', level: 1, x: 11, y: 7, health: 200 },
    { id: 'fence', type: 'fence', level: 1, x: 11, y: 12, health: 20, bounds: { x1: 6, y1: 3, x2: 16, y2: 12 } },
    { id: 'tent_1', type: 'tent', level: 1, x: 8, y: 6, health: 60 },
  ],
  nodes: [
    { id: 'tree_1', type: 'tree', x: 20, y: 4 },
    { id: 'tree_2', type: 'tree', x: 20, y: 7 },
    { id: 'tree_3', type: 'tree', x: 21, y: 11 },
    { id: 'rock_1', type: 'rock', x: 3, y: 13 },
  ],
  survivors: [{ id: 'survivor_1', template: 'rookie', name: 'Mara', x: 11, y: 9 }],
};

// A very tired survivor: teaches "check your needs before working".
const stage1Tired = structuredClone(stage1);
stage1Tired.name = 'Stage 1 — Exhausted';
stage1Tired.survivors[0].needs = { energy: 3 };

export const scenarios = { stage1, stage1_tired: stage1Tired };
