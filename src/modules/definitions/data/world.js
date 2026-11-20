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
    levels: { 1: { maxHealth: 200 }, 2: { maxHealth: 300, storage: { wood: 300, stone: 300, food: 200, water: 200, wheat: 120, bread: 80, potato: 80, carrot: 80, hot_meal: 40, mre: 60, packaging: 60, glass: 40, fertilizer: 60, charcoal: 80, nutrients: 60, bone_meal: 40, advanced_spear: 4, bow: 4, crossbow: 4, rifle: 4, suppressor: 4, ballista: 2, repeating_crossbow: 2, minigun: 2, arrows: 60, bolts: 60, bullets: 60, bones: 40, hide: 30, rags: 40, scrap: 40, gland: 20, noise_lure: 10, boss_core: 5 } } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    // PA-5: the HQ is a 3x3 building. The scenario's (x, y) is its DOOR cell (bottom middle); `footprint` is the rectangle it occupies,
    // relative to the door: x/y = offset of its top-left cell, w/h = size. Every footprint cell blocks walking; survivors still walk to the door.
    footprint: { x: -1, y: -2, w: 3, h: 3 },
    repair: { cost: { wood: 5 }, healthPerAction: 25, ticks: 30 },
    // `upgrade[level]` = what it takes to REACH that level (building must be fully repaired first). A level may override `storage`.
    upgrade: { 2: { cost: { wood: 30, stone: 15 }, ticks: 60 } },
    storage: { wood: 150, stone: 150, food: 100, water: 100, wheat: 60, bread: 40, potato: 40, carrot: 40, hot_meal: 20, mre: 30, packaging: 30, glass: 20, fertilizer: 30, charcoal: 40, nutrients: 30, bone_meal: 30, advanced_spear: 3, bow: 3, crossbow: 3, rifle: 3, suppressor: 2, ballista: 1, repeating_crossbow: 1, minigun: 1, arrows: 40, bolts: 40, bullets: 40, bones: 30, hide: 20, rags: 30, scrap: 30, gland: 10, noise_lure: 5, boss_core: 3 },
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
    // Level 3 is a FREEZER (O11): bigger and colder, but `power.use` means it only protects food while the grid powers it (see the power module).
    levels: { 1: { maxHealth: 120 }, 2: { maxHealth: 170, cold: { capacity: 30, factor: 2 } }, 3: { name: 'Freezer Storehouse', maxHealth: 220, cold: { capacity: 60, factor: 5 }, power: { use: 6 } } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 8 }, healthPerAction: 30, ticks: 30 },
    upgrade: { 2: { cost: { wood: 25, stone: 30 }, ticks: 70 }, 3: { cost: { wood: 30, stone: 40 }, ticks: 90 } },
    storage: { wood: 100, stone: 100 },
  },
  // O7 water. A DEEP WELL is a renewable source: its `source` table (per level) says how much water the reservoir holds and how fast the
  // aquifer refills it (`recharge`: +amount every `every` ticks at normal weather; rain speeds it up, a heat wave slows it - see the
  // weather table). A ruined well gives and refills nothing. Survivors draw from it with gather("water"); they WAIT at an empty well.
  // `siphon` (level 2+) is the first automation: a tube that moves reservoir water into base stock by itself - but only while a WORKING
  // building that stores water (a repaired water tank, the HQ, a tent) stands within `reach` tiles of the well. The machine tier
  // (level 3, a powered pump) draws power from the grid.
  well: {
    name: 'Deep Well',
    levels: {
      1: { maxHealth: 90, source: { resource: 'water', reservoir: 40, recharge: { every: 24, amount: 1 } } },
      2: { maxHealth: 130, source: { resource: 'water', reservoir: 80, recharge: { every: 16, amount: 1 } }, siphon: { every: 6, amount: 1, reach: 3 } },
      // O16 machine tier: a Pump House. A bigger, faster aquifer and a pump (the siphon table, 3x faster, longer reach) that only runs while
      // the grid powers it (`power.use`, drawn all the time like the freezer). Unpowered it pumps nothing: status NO_POWER.
      3: { name: 'Pump House', maxHealth: 180, source: { resource: 'water', reservoir: 160, recharge: { every: 10, amount: 1 } }, siphon: { every: 2, amount: 1, reach: 4 }, power: { use: 3 } },
    },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 6 }, healthPerAction: 30, ticks: 30 },
    upgrade: { 2: { cost: { wood: 25, stone: 20 }, ticks: 70 }, 3: { cost: { wood: 30, stone: 30, packaging: 6 }, ticks: 90 } }, // level 3 needs workshop packaging (pipe seals)
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
  // O12: level 2 (a proper stove: hot meals) and level 3 (a sealing machine: the MRE, which draws power while it works - see recipe.power).
  kitchen: {
    name: 'Kitchen',
    levels: { 1: { maxHealth: 110 }, 2: { name: 'Stove Kitchen', maxHealth: 150 }, 3: { name: 'Field Kitchen', maxHealth: 190 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 6, stone: 4 }, healthPerAction: 30, ticks: 30 },
    upgrade: { 2: { cost: { wood: 20, stone: 20 }, ticks: 60 }, 3: { cost: { wood: 25, stone: 30 }, ticks: 80 } },
  },
  // O12: a workshop is the crafting STATION (recipes with station 'workshop'). Level 2 adds the furnace (glass, which draws power while it works).
  workshop: {
    name: 'Workshop',
    levels: { 1: { maxHealth: 120 }, 2: { name: 'Forge Workshop', maxHealth: 170 }, 3: { name: 'Armory', maxHealth: 220 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 8, stone: 6 }, healthPerAction: 30, ticks: 30 },
    // Z6b: level 3 (the Armory) unlocks the heavy recipes (bullets, repeating crossbow, minigun). Its upgrade is paid partly in scrap from zombie loot.
    upgrade: { 2: { cost: { wood: 25, stone: 30 }, ticks: 70 }, 3: { cost: { wood: 30, stone: 40, scrap: 12 }, ticks: 90 } },
  },
  // O11 power (docs/game/16). A level's `power` table is either a PRODUCER (`output`, plus `fuel` for a generator or `solar: true` for a panel)
  // or a CONSUMER (`use`). The grid is one number per tick: produced vs demanded. Demand is met by solar first (free, but only in daylight and
  // scaled by the weather's `solar` %), then by generators in id order, which burn one `fuel.item` from base stock per `fuel.every` ticks
  // and only while something needs them. Consumers are served in id order; one that cannot be powered stops working (a freezer stops cooling).
  generator: {
    name: 'Generator',
    levels: {
      1: { maxHealth: 110, power: { output: 10, fuel: { item: 'wood', every: 20, better: { item: 'charcoal', every: 50 } } } },
      2: { name: 'Advanced Generator', maxHealth: 160, power: { output: 24, fuel: { item: 'wood', every: 40, better: { item: 'charcoal', every: 100 } } } }, // more output per fuel; charcoal (workshop) lasts 2.5x longer per unit
    },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 6, stone: 4 }, healthPerAction: 30, ticks: 30 },
    upgrade: { 2: { cost: { wood: 20, stone: 25 }, ticks: 70 } },
  },
  // The fuel-free path: output follows daylight and weather (night = 0), so it needs planning around the forecast.
  solar_panel: {
    name: 'Solar Panel',
    levels: { 1: { maxHealth: 80, power: { output: 8, solar: true } } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 4, stone: 6 }, healthPerAction: 25, ticks: 30 },
  },
  // O13 battery: keeps surplus power for later. `store` = { capacity (units), rate (max units charged or discharged per tick) }. It discharges before
  // any generator burns fuel, and charges only from surplus generation (solar by day, a running generator with spare output).
  battery: {
    name: 'Battery Bank',
    levels: { 1: { maxHealth: 90, power: { store: { capacity: 80, rate: 8 } } }, 2: { name: 'Large Battery Bank', maxHealth: 130, power: { store: { capacity: 200, rate: 14 } } } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 5, stone: 6 }, healthPerAction: 25, ticks: 30 },
    upgrade: { 2: { cost: { wood: 15, stone: 25 }, ticks: 70 } },
  },
  // Z6 (docs/game/20 section 10): a watchtower standing just inside the wall. Its levels, names and health mirror `towers` in arsenal.js (a validation
  // keeps them equal). A survivor standing next to a tower that is not ruined (and within its `slots`) is POSTED on it: her RANGED weapon reaches
  // `towers[level].rangeBonus` cells further. Like every building it starts as a ruin, is repaired, then upgraded.
  tower: {
    name: 'Watchtower',
    levels: { 1: { name: 'Lookout', maxHealth: 60 }, 2: { name: 'Guard tower', maxHealth: 100 }, 3: { name: 'Fortified tower', maxHealth: 160 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 6 }, healthPerAction: 20, ticks: 25 },
    upgrade: { 2: { cost: { wood: 20, stone: 15 }, ticks: 60 }, 3: { cost: { wood: 25, stone: 40 }, ticks: 90 } },
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
  // O10 farming (docs/game/16). ONE building whose level is the tier: level 1 = FIELD (open ground, exposed to weather hazards),
  // level 2 = GREENHOUSE (blocks storm / heat / cold, grows faster, yields more). `farm` per level: `plots` (how many plots the farm
  // has), `growth` (% growth speed), `yield` (% of each crop's yield) and `shelter` (true = no hazard damage). Hydroponics (level 3,
  // needs power) arrives with the power phase. Like every building it starts as a ruin in the scenario: repair it, then plant.
  // A farm does not block walking (the door cell is the field's edge).
  field: {
    name: 'Field',
    levels: {
      1: { maxHealth: 100, farm: { plots: 4, growth: 100, yield: 100, shelter: false } },
      2: { name: 'Greenhouse', maxHealth: 150, farm: { plots: 6, growth: 150, yield: 150, shelter: true } },
      // O13: level 3 = HYDROPONIC farm. Indoors (no weather at all, rain does not water it), the fastest and richest tier, but it only grows while the
      // grid powers it (`power.use`, drawn all the time like the freezer). Unpowered it holds its crops. Still hand-watered; nutrients (fertilizer) come later.
      3: { name: 'Hydroponic Farm', maxHealth: 200, farm: { plots: 8, growth: 200, yield: 250, shelter: true, indoor: true, nutrients: true }, power: { use: 5 } }, // O17: also needs a nutrient solution (a plot without nutrients does not grow)
    },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    blocks: false,
    repair: { cost: { wood: 4 }, healthPerAction: 25, ticks: 20 },
    upgrade: { 2: { cost: { wood: 20, stone: 15 }, ticks: 60 }, 3: { cost: { wood: 15, stone: 15, glass: 12 }, ticks: 90 } }, // level 3 needs workshop glass
  },
};

const stage1 = {
  name: 'Stage 1 — The Ruined Settlement',
  map: { width: 24, height: 16 },
  stock: { wood: 0, stone: 0, food: 6, water: 6, wheat: 10, potato: 4, carrot: 4 }, // wheat/potato/carrot are the first seeds (and food) of the farm
  buildings: [
    { id: 'hq', type: 'hq', level: 1, x: 11, y: 7, health: 200 },
    { id: 'fence', type: 'fence', level: 1, x: 11, y: 12, health: 20, bounds: { x1: 6, y1: 3, x2: 16, y2: 12 } },
    { id: 'tent_1', type: 'tent', level: 1, x: 8, y: 6, health: 60 },
    { id: 'storage_1', type: 'storage', level: 1, x: 14, y: 5, health: 15 }, // ruined
    { id: 'gate', type: 'gate', level: 1, x: 16, y: 7, health: 30 },          // damaged, on the east fence line
    { id: 'well', type: 'well', level: 1, x: 13, y: 11, health: 12 },         // ruined; 4 tiles from the HQ, so the siphon cannot reach it
    { id: 'kitchen', type: 'kitchen', level: 1, x: 9, y: 9, health: 15 },    // ruined; repair it, then survivor.cook("bread")
    { id: 'field_1', type: 'field', level: 1, x: 8, y: 4, health: 12 },       // ruined; repair it, then survivor.farm(field_1, "potato")
    { id: 'workshop_1', type: 'workshop', level: 1, x: 9, y: 11, health: 12 }, // ruined; repair it, then survivor.craft("packaging", 5)
    { id: 'tank', type: 'water_tank', level: 1, x: 15, y: 10, health: 10 },   // ruined; within siphon reach (2 tiles) of the well once repaired
    { id: 'generator_1', type: 'generator', level: 1, x: 13, y: 9, health: 12 }, // ruined; burns wood while something needs power (the freezer)
    { id: 'battery_1', type: 'battery', level: 1, x: 7, y: 9, health: 10 },     // ruined; stores surplus solar / generator power
    { id: 'tower_1', type: 'tower', level: 1, x: 15, y: 4, health: 8 },            // ruined watchtower inside the north-east corner; repair it, then survivor.guard(tower_1)
    { id: 'solar_1', type: 'solar_panel', level: 1, x: 7, y: 11, health: 10 },    // ruined; free power in daylight only
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

// W2 (docs/game/21 section 5): the same settlement behind a LINE wall - one column at x = 16 running the whole map height, with the gate in it.
// Inside = west of the line; the wave always spawns on the east edge; there is no way around the wall. Everything else is stage 1 unchanged.
const stage1Line = structuredClone(stage1);
stage1Line.name = 'Stage 1 — The Long Wall';
stage1Line.buildings.find((b) => b.id === 'fence').bounds = { x1: 16, y1: 0, x2: 16, y2: 15, shape: 'line' };
stage1Line.buildings.find((b) => b.id === 'fence').x = 16;
stage1Line.buildings.find((b) => b.id === 'fence').y = 12;

// The LONG map (docs/game/21 sections 3 and 5): the stage-1 settlement shifted 6 cells east on a 40x16 map, behind a line wall at x = 22 with the gate at (22,7).
// West of the wall = the outpost (22 cells: the settlement plus room to grow), east = the front (17 cells of road, forest and the wave's walk-in from x = 39).
// Every building keeps the SAME distance to the wall as in stage 1 (hq, towers, tank, storage), so nothing about the rules changes - only the room around them.
const stage1Long = structuredClone(stage1);
stage1Long.name = 'Stage 1 — The Long Wall (40x16)';
stage1Long.map = { width: 40, height: 16 };
const SHIFT = 6;
for (const b of stage1Long.buildings) b.x += SHIFT;
for (const n of stage1Long.nodes) n.x += SHIFT;
for (const sv of stage1Long.survivors) sv.x += SHIFT;
const longFence = stage1Long.buildings.find((b) => b.id === 'fence');
longFence.bounds = { x1: 22, y1: 0, x2: 22, y2: 15, shape: 'line' };
longFence.x = 22; longFence.y = 12;
stage1Long.terrain = {
  zones: [{ id: 'forest', label: 'Forest', x1: 29, y1: 1, x2: 39, y2: 14 }],
  paths: [{ id: 'forest_path', cells: [[23, 7], [24, 7], [25, 7], [26, 7], [27, 7], [28, 7]] }],
};
stage1Long.nodes.push({ id: 'tree_4', type: 'tree', x: 31, y: 3 }, { id: 'tree_5', type: 'tree', x: 33, y: 9 });

export const scenarios = { stage1, stage1_tired: stage1Tired, stage1_weary: stage1Weary, stage1_line: stage1Line, stage1_long: stage1Long };
