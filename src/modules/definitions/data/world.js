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
    levels: { 1: { maxHealth: 200 }, 2: { maxHealth: 300, storage: { wood: 300, stone: 300, food: 200, water: 200, wheat: 120, bread: 80, potato: 80, carrot: 80, hot_meal: 40, mre: 60, packaging: 60, glass: 40, fertilizer: 60, charcoal: 80, nutrients: 60, bone_meal: 40, advanced_spear: 4, bow: 4, crossbow: 4, rifle: 4, suppressor: 4, ballista: 2, machine_gun: 2, minigun: 2, dual_minigun: 1, arrows: 60, bolts: 60, bullets: 60, bones: 40, hide: 30, rags: 40, scrap: 40, gland: 20, noise_lure: 10, boss_core: 5 } } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    // PA-5: the HQ is a 3x3 building. The scenario's (x, y) is its DOOR cell (bottom middle); `footprint` is the rectangle it occupies,
    // relative to the door: x/y = offset of its top-left cell, w/h = size. Every footprint cell blocks walking; survivors still walk to the door.
    footprint: { x: -1, y: -2, w: 3, h: 3 },
    repair: { cost: { wood: 5 }, healthPerAction: 25, ticks: 30 },
    // `upgrade[level]` = what it takes to REACH that level (building must be fully repaired first). A level may override `storage`.
    // P0 (docs/game/23 section 3): the HQ is the ceiling for every wall, gate and strip build (`minHq` on an upgrade = the HQ level it needs). Levels 3-4 are defined below the table.
    upgrade: { 2: { cost: { wood: 30, stone: 15 }, ticks: 60 }, 3: { cost: { wood: 40, stone: 40, steel_plate: 8 }, ticks: 90 }, 4: { cost: { concrete_block: 20, steel_plate: 16, boss_core: 1 }, ticks: 120 } },
    storage: { wood: 150, stone: 150, food: 100, water: 100, wheat: 60, bread: 40, potato: 40, carrot: 40, hot_meal: 20, mre: 30, packaging: 30, glass: 20, fertilizer: 30, charcoal: 40, nutrients: 30, bone_meal: 30, advanced_spear: 3, bow: 3, crossbow: 3, rifle: 3, suppressor: 2, ballista: 1, machine_gun: 1, minigun: 1, dual_minigun: 1, arrows: 40, bolts: 40, bullets: 40, bones: 30, hide: 20, rags: 30, scrap: 30, gland: 10, noise_lure: 5, boss_core: 3 },
  },
  fence: {
    name: 'Perimeter Fence',
    // P3 (docs/game/23 section 2): the wall ladder. `armor` is subtracted from every zombie wall hit (levels without it fall back to waveRules.wallArmorPerLevel x level);
    // a level's own `repair` table replaces the building's (heavier walls take heavier repairs). Each upgrade needs the HQ level in `minHq`.
    levels: {
      1: { maxHealth: 100, armor: 1 },
      2: { maxHealth: 160, armor: 2 },
      3: { name: 'Stone Wall', maxHealth: 320, armor: 3, repair: { cost: { wood: 6, stone: 6 }, healthPerAction: 40, ticks: 30 } },
      4: { name: 'Concrete Wall', maxHealth: 600, armor: 5, repair: { cost: { stone: 8, cement: 2 }, healthPerAction: 60, ticks: 30 } },
      5: { name: 'Reinforced Concrete Wall', maxHealth: 1000, armor: 7, repair: { cost: { stone: 10, cement: 4 }, healthPerAction: 90, ticks: 30 } },
    },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 5 }, healthPerAction: 25, ticks: 30 },
    upgrade: {
      2: { cost: { wood: 20, stone: 10 }, ticks: 50, minHq: 1 },
      3: { cost: { wood: 30, stone: 20, cement: 10 }, ticks: 80, minHq: 2 },
      4: { cost: { concrete_block: 12, steel_plate: 6 }, ticks: 110, minHq: 3 },
      5: { cost: { concrete_block: 16, steel_plate: 12, boss_core: 1 }, ticks: 150, minHq: 4 },
    },
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
    // Z6b: level 3 (the Armory) unlocks the heavy recipes (bullets, machine gun, minigun, dual minigun). Its upgrade is paid partly in scrap from zombie loot.
    upgrade: { 2: { cost: { wood: 25, stone: 30 }, ticks: 70 }, 3: { cost: { wood: 30, stone: 40, scrap: 12 }, ticks: 90 } },
  },
  // P2 (docs/game/23 section 5): the SMELTER is a station of its own (not the workshop). Ruin -> repair -> upgrade like any station. Level 1 melts scrap + charcoal into steel
  // ingots one at a time; level 2 (the Blast Smelter) adds the bulk recipe. Recipes with `minHq` stay closed until the HQ reaches that level. Powered smelting waits for P6.
  smelter: {
    name: 'Smelter',
    levels: { 1: { maxHealth: 110 }, 2: { name: 'Blast Smelter', maxHealth: 160 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 6, stone: 8 }, healthPerAction: 30, ticks: 30 },
    upgrade: { 2: { cost: { wood: 25, stone: 35, scrap: 10 }, ticks: 80, minHq: 3 } },
  },
  // R3 (docs/game/24): the SAWMILL is a station of its own. Ruin -> repair -> upgrade like any station. Level 1 saws wood (logs) into planks; level 2 (the Beam Mill,
  // HQ 3) squares planks into beams. Its recipes carry `minHq: 2`: the sawmill opens when the headquarters reaches level 2. Powered sawing waits for a later pass.
  sawmill: {
    name: 'Sawmill',
    levels: { 1: { maxHealth: 110 }, 2: { name: 'Beam Mill', maxHealth: 160 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 8, stone: 4 }, healthPerAction: 30, ticks: 30 },
    upgrade: { 2: { cost: { wood: 20, stone: 20, scrap: 6 }, ticks: 70, minHq: 3 } },
  },
  // R4 (docs/game/24): the MINING STATION is a building of its own. Ruin -> repair -> upgrade like any station, and its work (survivor.mine) opens when the headquarters
  // reaches `mining.minHq` (3). Level 1 digs by hand; level 2 (the Rail Cart) brings more ore per round and shores the tunnel (see data/mining.js caveIn); level 3 (the Powered
  // Drill, HQ 4) brings the most and draws `mine.power` from the grid while a round is worked. Rules and numbers: data/mining.js.
  mining_station: {
    name: 'Mining Station',
    levels: {
      1: { maxHealth: 120, mine: { yieldPercent: 100 } },
      2: { name: 'Rail Cart Mine', maxHealth: 170, mine: { yieldPercent: 200 } },
      3: { name: 'Powered Drill', maxHealth: 230, mine: { yieldPercent: 300, power: 8 } },
    },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 10, stone: 8 }, healthPerAction: 30, ticks: 30 },
    upgrade: { 2: { cost: { wood: 25, stone: 30, scrap: 8 }, ticks: 80, minHq: 3 }, 3: { cost: { wood: 20, stone: 40, scrap: 20, steel_plate: 4 }, ticks: 110, minHq: 4 } },
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
    levels: { 1: { name: 'Survivor Lookout', maxHealth: 60 }, 2: { name: 'Repeater Ballista Tower', maxHealth: 100 }, 3: { name: 'Machine Gun Tower', maxHealth: 160 }, 4: { name: 'Minigun Tower', maxHealth: 240 }, 5: { name: 'Dual Minigun Fortress', maxHealth: 360 } },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 6 }, healthPerAction: 20, ticks: 25 },
    upgrade: { 2: { cost: { wood: 20, stone: 15 }, ticks: 60 }, 3: { cost: { wood: 25, stone: 40 }, ticks: 90 }, 4: { cost: { stone: 50, scrap: 20 }, ticks: 110 }, 5: { cost: { stone: 70, scrap: 40, gland: 4 }, ticks: 140 } },
  },
  // I2 world object: the gap in the fence that connects the base to the outside path. `perimeter: true` means the
  // scenario must place it on the fence line (validated) and the renderer leaves that fence cell open.
  gate: {
    name: 'Gate',
    perimeter: true,
    blocks: false, // the opening in the fence: survivors walk through it
    // P3 (docs/game/23 section 2): the gate has its OWN ladder - moving parts, so hinge sets and steel plate, never cement. Level 5 (the airlock) is data only until P7
    // (no power draw and no sortie-during-wave rule yet).
    levels: {
      1: { name: 'Plank Gate', maxHealth: 80, armor: 1 },
      2: { name: 'Braced Gate', maxHealth: 130, armor: 2 },
      3: { name: 'Iron-Banded Gate', maxHealth: 250, armor: 3, repair: { cost: { wood: 4, scrap: 2 }, healthPerAction: 30, ticks: 20 } },
      4: { name: 'Steel Gate', maxHealth: 480, armor: 5, repair: { cost: { scrap: 4 }, healthPerAction: 50, ticks: 20 } },
      5: { name: 'Airlock Gate', maxHealth: 800, armor: 7, repair: { cost: { scrap: 6 }, healthPerAction: 80, ticks: 20 } },
    },
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    repair: { cost: { wood: 4 }, healthPerAction: 20, ticks: 20 },
    upgrade: {
      2: { cost: { wood: 15, hinge_set: 4 }, ticks: 60, minHq: 1 },
      3: { cost: { steel_plate: 6, hinge_set: 4 }, ticks: 90, minHq: 2 },
      4: { cost: { steel_plate: 12, hinge_set: 6 }, ticks: 120, minHq: 3 },
      5: { cost: { steel_plate: 16, hinge_set: 8, boss_core: 1 }, ticks: 160, minHq: 4 },
    },
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

// P0/P1: HQ levels 3-4 and room for the fortress materials. A level's `storage` table REPLACES the one below it (see the upgrade handler), so each higher HQ table is the
// previous one grown by a factor plus the new goods. Level 1 holds a little of the new goods so early loot is not turned away.
{
  const hq = buildings.hq;
  const grow = (t, k) => Object.fromEntries(Object.entries(t).map(([item, n]) => [item, Math.ceil(n * k)]));
  Object.assign(hq.storage, { sand: 20, cement: 10, steel_ingot: 10, steel_plate: 6, concrete_block: 6, hinge_set: 6, sandbag: 10, lead_bar: 10, iron_bar: 10, plank: 20, beam: 10, iron_ore: 20, lead_ore: 20, coal: 30 });
  Object.assign(hq.levels[2].storage, { sand: 60, cement: 30, steel_ingot: 30, steel_plate: 20, concrete_block: 20, hinge_set: 20, sandbag: 30, lead_bar: 30, iron_bar: 30, plank: 60, beam: 30, iron_ore: 60, lead_ore: 60, coal: 90 });
  hq.levels[3] = { name: 'Command Post', maxHealth: 450, storage: grow(hq.levels[2].storage, 1.5) };
  hq.levels[4] = { name: 'Fortress Headquarters', maxHealth: 650, storage: grow(hq.levels[3].storage, 1.4) };
}

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
    { id: 'smelter_1', type: 'smelter', level: 1, x: 11, y: 10, health: 10 },     // ruined (P2); repair it, then (HQ level 2) survivor.craft("steel_ingot", 5)
    { id: 'sawmill_1', type: 'sawmill', level: 1, x: 9, y: 13, health: 10 },       // ruined (R3); repair it, then (HQ level 2) survivor.craft("plank", 5)
    { id: 'mining_1', type: 'mining_station', level: 1, x: 7, y: 7, health: 10 },    // ruined (R4); repair it, then (HQ level 3) survivor.mine("iron_ore")
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

// The OUTPOST map (painted backdrop assets/backdrops/outpost.jpg, 1600x640 = the 40x16 grid at 40 px per cell): the same 40x16 grid, but the wall is the
// line at x = 12 (the first black stain on the road: the picture's scorch mark is where the old barricade was blown open) with the gate at (12,6) on the road,
// so the settlement is the strip behind it (12 columns, 3 more than the first layout, so the buildings are no longer packed together) and the rest of the
// map is the outside. Inside (x 0-11, the road rows 6-7 stay clear): hq top, tower_1 beside the wall, the other buildings spread north and south of the road.
// Outside: four bands of trees and rocks, kept off the two dirt tracks (x 24-28 north of the road, x 27-34 south of it) and off the other black stains
// (x 17-22, rows 4-5 and 8-10). The road itself is part of the picture (no `paths`); the screen-edge arrows sit on its centre line (`roadY`).
// Every building keeps its stage-1 distance to the wall (tower 1, storage 2, tank 1); only the room changes.
const outpost = structuredClone(stage1);
outpost.name = 'Stage 1 — The Outpost (painted map)';
outpost.map = { width: 40, height: 16 };
const place = (id, x, y) => { const b = outpost.buildings.find((q) => q.id === id); b.x = x; b.y = y; };
const WALL_X = 12;
const outFence = outpost.buildings.find((b) => b.id === 'fence');
outFence.bounds = { x1: WALL_X, y1: 0, x2: WALL_X, y2: 15, shape: 'line' };
outFence.x = WALL_X; outFence.y = 12;
for (const [id, x, y] of [
  ['hq', 6, 3], ['tower_1', WALL_X - 1, 3], ['storage_1', WALL_X - 2, 4], ['gate', WALL_X, 6],   // north of the road: hq (3x3 above its door), tower and storage by the wall
  ['kitchen', 2, 1], ['field_1', 2, 4], ['tent_1', 4, 4],
  ['workshop_1', 2, 10], ['generator_1', 5, 10], ['battery_1', 2, 13], ['solar_1', 5, 13], ['smelter_1', 8, 10], ['sawmill_1', 7, 13], ['mining_1', 10, 9],   // south of the road
  ['well', 9, 14], ['tank', WALL_X - 1, 13],                                                       // tank stays 2 east / 1 north of the well (siphon reach)
]) place(id, x, y);
outpost.survivors[0].x = 6; outpost.survivors[0].y = 5;
outpost.terrain = { zones: [], paths: [], backdrop: 'outpost', roadY: 6.7 };
// Trees and rocks right of the wall (every third node is a rock). Edit these rows to grow, thin or move a band.
const BANDS = [
  [[14, 1], [17, 1], [20, 1], [23, 1], [30, 1], [33, 1], [36, 1]],
  [[14, 3], [17, 3], [20, 2], [31, 3], [34, 3], [37, 4]],
  [[15, 9], [24, 8], [26, 9], [36, 9], [37, 8]],
  [[14, 12], [17, 12], [20, 12], [23, 12], [25, 12], [35, 11], [37, 11]],
];
outpost.nodes = [];
{ let t = 0; let r = 0; let i = 0;
  for (const [x, y] of BANDS.flat()) outpost.nodes.push(i++ % 3 === 2 ? { id: `rock_${++r}`, type: 'rock', x, y } : { id: `tree_${++t}`, type: 'tree', x, y }); }

export const scenarios = { stage1, stage1_tired: stage1Tired, stage1_weary: stage1Weary, stage1_line: stage1Line, stage1_long: stage1Long, stage1_outpost: outpost };
