// ---------------------------------------------------------------------------
// Building types added for farming (Phase A)
// ---------------------------------------------------------------------------
// field: L1 open ground. Crops grow here but are exposed to weather hazards.
// greenhouse: L2 blocks storm/heat/cold; clear/rain still pass through; growth faster.

// Field (L1): open ground where crops are planted
export const field = {
  name: 'Field',
  level: 1,
  maxHealth: 100,
  visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
  // Field is just ground; survivors can walk through it.
  // Crops are placed as plots on field tiles; field itself has no blocking behavior.
  blocks: false,
  // Repair data: simple repair with wood
  repair: { cost: { wood: 3 }, healthPerAction: 20, ticks: 15 },
  // No upgrade table from field alone; greenhouse is built adjacent.
  // The field stays L1; greenhouse can be built (level 2) on adjacent tiles.
};

// Greenhouse (L2): blocks storm/heat/cold; clear/rain pass through
// Growth is 1.5× faster; yield is 1.5× field yield.
// All hazards are blocked inside; clear/rain still allow water.
export const greenhouse = {
  name: 'Greenhouse',
  level: 2,
  maxHealth: 120,
  visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
  blocks: true, // survivors cannot walk through greenhouse structure
  // Growth/production bonuses from being protected from hazards
  growthMultiplier: 1.5,
  yieldMultiplier: 1.5,
  // Repair data: requires wood + stone
  repair: { cost: { wood: 5, stone: 3 }, healthPerAction: 30, ticks: 25 },
  // Upgrade path: can upgrade to hydroponic (L3) when power phase begins
  upgrade: { 3: { cost: { wood: 10, stone: 8, glass: 15 }, ticks: 40 } },
};

// ---------------------------------------------------------------------------
// O7 water. A DEEP WELL is a renewable source: its `source` table (per level) says how much water the reservoir holds and how fast the
// aquifer refills it (`recharge`: +amount every `every` ticks at normal weather; rain speeds it up, a heat wave slows it - see the
// weather table). A ruined well gives and refills nothing. Survivors draw from it with gather("water"); they WAIT at an empty well.
// `siphon` (level 2+) is the first automation: a tube that moves reservoir water into base stock by itself - but only while a WORKING
// building that stores water (a repaired water tank, the HQ, a tent) stands within `reach` tiles of the well. The machine tier
// (a powered pump) arrives with the power phase.
export const well = {
  name: 'Deep Well',
  levels: {
    1: { maxHealth: 90, source: { resource: 'water', reservoir: 40, recharge: { every: 24, amount: 1 } } },
    2: { maxHealth: 130, source: { resource: 'water', reservoir: 80, recharge: { every: 16, amount: 1 } }, siphon: { every: 6, amount: 1, reach: 3 } } },
  visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
  repair: { cost: { wood: 8 }, healthPerAction: 30, ticks: 30 },
  // (the siphon reach and status logic lives in src/modules/water/index.js)
};

// ---------------------------------------------------------------------------
// Stage 1 — The Ruined Settlement
// ---------------------------------------------------------------------------
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