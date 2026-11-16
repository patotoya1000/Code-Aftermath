// Node types, buildings and scenarios.
export const nodeTypes = {
  tree: { name: 'Tree', yields: 'wood', amount: 35, variance: 10 },
  rock: { name: 'Rock', yields: 'stone', amount: 25, variance: 10 },
};

// Building level is data: later phases add effects per level. `visual` thresholds decide the
// meaningful world state (ruined / damaged / repaired), never one asset per health percent.
// `storage` = capacity per item type. Capacity is POOLED: base stock is one stock per item, and its limit is the sum of the
// `storage` tables of every building that is not ruined. Survivors unload at the nearest such building that accepts the item.
export const buildings = {
  hq: {
    name: 'Headquarters',
    levels: { 1: { maxHealth: 200 }, 2: { maxHealth: 300, storage: { wood: 300, stone: 300, food: 200, water: 200, wheat: 120, bread: 80 } } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 5 }, healthPerAction: 25, ticks: 30 },
    // `upgrade[level]` = what it takes to REACH that level (building must be fully repaired first). A level may override `storage`.
    upgrade: { 2: { cost: { wood: 30, stone: 15 }, ticks: 60 } },
    storage: { wood: 150, stone: 150, food: 100, water: 100, wheat: 60, bread: 40 },
  },
  fence: {
    name: 'Perimeter Fence',
    levels: { 1: { maxHealth: 100 }, 2: { maxHealth: 160 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 5 }, healthPerAction: 25, ticks: 30 },
    upgrade: { 2: { cost: { wood: 20, stone: 10 }, ticks: 50 } },
  },
  tent: {
    name: 'Survivor Tent',
    levels: { 1: { maxHealth: 60 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 3 }, healthPerAction: 20, ticks: 20 },
    storage: { food: 50, water: 50 },
  },
  // A storehouse. While it is ruined it adds nothing; once repaired its `storage` table is added to the pooled capacity and
  // survivors can unload there (R3). Closer to the forest than the HQ, so it shortens trips.
  storage: {
    name: 'Storehouse',
    // Level 2 is a COLD CELLAR: `cold.capacity` units of perishable food (the oldest first) age `factor` times slower. No power needed.
    levels: { 1: { maxHealth: 120 }, 2: { maxHealth: 170, cold: { capacity: 30, factor: 2 } } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 8 }, healthPerAction: 30, ticks: 30 },
    upgrade: { 2: { cost: { wood: 25, stone: 30 }, ticks: 70 } },
    storage: { wood: 100, stone: 100 },
  },
  // O7 water. A DEEP WELL is a renewable source: its `source` table (per level) says how much water the reservoir holds and how fast the
  // aquifer refills it (`recharge`: +amount every `every` ticks at normal weather; rain speeds it up, a heat wave slows it - see the
  // weather table). A ruined well gives and refills nothing. Survivors draw from it with gather("water"); they WAIT at an empty well.
  // `siphon` (level 2+) is the first automation: a tube that moves reservoir water into base stock by itself - but only while a WORKING
  // building that stores water (a repaired water tank, the HQ, a tent) stands within `reach` tiles of the well. The machine tier
  // (a powered pump) arrives with the power phase.
  well: {
    name: 'Deep Well',
    levels: {
      1: { maxHealth: 90, source: { resource: 'water', reservoir: 40, recharge: { every: 24, amount: 1 } } },
      2: { maxHealth: 130, source: { resource: 'water', reservoir: 80, recharge: { every: 16, amount: 1 } }, siphon: { every: 6, amount: 1, reach: 3 } },
    },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 6 }, healthPerAction: 30, ticks: 30 },
    upgrade: { 2: { cost: { wood: 25, stone: 20 }, ticks: 70 } },
  },
  // Water storage. Pooled like every storage table: it adds room for water once it is repaired (the siphon needs one within reach).
  water_tank: {
    name: 'Water Tank',
    levels: { 1: { maxHealth: 100 }, 2: { maxHealth: 150, storage: { water: 240 } } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 6, stone: 4 }, healthPerAction: 30, ticks: 30 },
    upgrade: { 2: { cost: { wood: 20, stone: 20 }, ticks: 50 } },
    storage: { water: 120 },
  },
  // A kitchen: a STATION building. Recipes whose `station` is 'kitchen' (data/recipes.js) can only be cooked at one that is fully
  // repaired and at least at the recipe's `stationLevel`. Higher kitchen levels arrive together with the recipes that need them.
  kitchen: {
    name: 'Kitchen',
    levels: { 1: { maxHealth: 110 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 6, stone: 4 }, healthPerAction: 30, ticks: 30 },
  },
  // I2 world object: the gap in the fence that connects the base to the outside path. `perimeter: true` means the
  // scenario must place it on the fence line (validated) and the renderer leaves that fence cell open.
  gate: {
    name: 'Gate',
    perimeter: true,
    blocks: false, // the opening in the fence: survivors walk through it
    levels: { 1: { maxHealth: 80 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 4 }, healthPerAction: 20, ticks: 20 },
  },
};

const stage1 = {
  name: 'Stage 1 — The Ruined Settlement',
  map: { width: 24, height: 16 },
  stock: { wood: 0, stone: 0, food: 6, water: 6, wheat: 10 }, // wheat is a starting stock until farming exists
  buildings: [
    { id: 'hq', type: 'hq', level: 1, x: 11, y: 7, health: 200 },
    { id: 'fence', type: 'fence', level: 1, x: 11, y: 12, health: 20, bounds: { x1: 6, y1: 3, x2: 16, y2: 12 } },
    { id: 'tent_1', type: 'tent', level: 1, x: 8, y: 6, health: 60 },
    { id: 'storage_1', type: 'storage', level: 1, x: 14, y: 5, health: 15 }, // ruined
    { id: 'gate', type: 'gate', level: 1, x: 16, y: 7, health: 30 },          // damaged, on the east fence line
    { id: 'well', type: 'well', level: 1, x: 13, y: 11, health: 12 },         // ruined; 4 tiles from the HQ, so the siphon cannot reach it
    { id: 'kitchen', type: 'kitchen', level: 1, x: 9, y: 9, health: 15 },    // ruined; repair it, then survivor.cook("bread")
    { id: 'tank', type: 'water_tank', level: 1, x: 15, y: 10, health: 10 },   // ruined; within siphon reach (2 tiles) of the well once repaired
  ],
  // Presentation-only ground: where the forest is and the path that leaves the gate. Zones/paths never affect
  // gameplay; they reach the renderer through the render projection.
  terrain: {
    zones: [{ id: 'forest', label: 'Forest', x1: 18, y1: 2, x2: 23, y2: 13 }],
    paths: [{ id: 'forest_path', cells: [[17, 7], [18, 7], [19, 7]] }],
  },
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

// A survivor who is already worn down: a long job will tire her out unless she looks after herself (policy lesson).
const stage1Weary = structuredClone(stage1);
stage1Weary.name = 'Stage 1 — Worn Down';
stage1Weary.survivors[0].needs = { energy: 30 };

export const scenarios = { stage1, stage1_tired: stage1Tired, stage1_weary: stage1Weary };
