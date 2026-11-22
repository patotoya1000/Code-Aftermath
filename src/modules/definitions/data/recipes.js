// Recipes (docs/game/16). One engine for cooking now and crafting later: a recipe names the STATION building type that makes it, the
// level that station must have, what a batch consumes (`inputs`, taken from base stock), what it makes (`outputs`, added to base
// stock), how long one batch takes and which skill it practises (`minSkill` is the lowest level that may attempt it).
// Ingredients include the fuel (wood). `action` says which learner command makes it: 'cook' (survivor.cook, kitchen) or 'craft'
// (survivor.craft, workshop); the skill must be the one that action's XP award teaches. `power` (optional) = power the station draws
// WHILE a batch is being worked: the grid must serve it or the work waits (a sealing machine, a glass furnace).
export const recipes = {
  bread: { name: 'Bread', station: 'kitchen', stationLevel: 1, inputs: { wheat: 2, water: 1, wood: 1 }, outputs: { bread: 1 }, ticks: 12, skill: 'cooking', minSkill: 0, action: 'cook' },
  // Kitchen level 2: stew from the farm's vegetables. Needs a little practised Cooking (bread teaches it).
  hot_meal: { name: 'Hot meal', station: 'kitchen', stationLevel: 2, inputs: { potato: 1, carrot: 1, water: 1, wood: 1 }, outputs: { hot_meal: 1 }, ticks: 16, skill: 'cooking', minSkill: 1, action: 'cook' },
  // Kitchen level 3: two hot meals sealed in packaging (workshop) by a powered sealer. Never spoils.
  mre: { name: 'MRE', station: 'kitchen', stationLevel: 3, inputs: { hot_meal: 2, packaging: 1 }, outputs: { mre: 1 }, ticks: 20, skill: 'cooking', minSkill: 2, action: 'cook', power: 4 },
  // Workshop recipes (crafting skill).
  packaging: { name: 'Packaging', station: 'workshop', stationLevel: 1, inputs: { wood: 2, stone: 1 }, outputs: { packaging: 2 }, ticks: 10, skill: 'crafting', minSkill: 0, action: 'craft' },
  // O15: fertilizer is spread on a growing plot by survivor.farm(farm, crop, { fertilize: true }); charcoal is generator fuel that lasts 2.5x longer per unit.
  fertilizer: { name: 'Fertilizer', station: 'workshop', stationLevel: 1, inputs: { carrot: 1, wood: 1, water: 1 }, outputs: { fertilizer: 2 }, ticks: 14, skill: 'crafting', minSkill: 0, action: 'craft' },
  charcoal: { name: 'Charcoal', station: 'workshop', stationLevel: 1, inputs: { wood: 4 }, outputs: { charcoal: 3 }, ticks: 18, skill: 'crafting', minSkill: 0, action: 'craft' },
  // O17: a hydroponic plot grows only while it has nutrients; survivor.farm feeds it from base stock (NO_NUTRIENTS when there is none).
  nutrients: { name: 'Nutrients', station: 'workshop', stationLevel: 1, inputs: { fertilizer: 1, water: 2 }, outputs: { nutrients: 2 }, ticks: 12, skill: 'crafting', minSkill: 0, action: 'craft' },
  // Z5 (docs/game/20 sections 4, 9): the loot from sorties feeds the weapon ladder. Weapon recipes mirror `weapons.<id>.craft` (a test keeps them equal); the
  // rifle still waits (Z6c); bullets and the mounted weapons (Z6b) need workshop level 2-3. Ammo is made in batches; `survivor.take` carries it, `survivor.equip` arms her.
  advanced_spear: { name: 'Advanced spear', station: 'workshop', stationLevel: 1, inputs: { wood: 2, scrap: 2, hide: 1 }, outputs: { advanced_spear: 1 }, ticks: 20, skill: 'crafting', minSkill: 1, action: 'craft' },
  bow: { name: 'Bow', station: 'workshop', stationLevel: 1, inputs: { wood: 3, hide: 1, rags: 1 }, outputs: { bow: 1 }, ticks: 20, skill: 'crafting', minSkill: 1, action: 'craft' },
  crossbow: { name: 'Crossbow', station: 'workshop', stationLevel: 2, inputs: { wood: 3, scrap: 3 }, outputs: { crossbow: 1 }, ticks: 30, skill: 'crafting', minSkill: 2, action: 'craft' },
  arrows: { name: 'Arrows', station: 'workshop', stationLevel: 1, inputs: { wood: 2, scrap: 1 }, outputs: { arrows: 8 }, ticks: 10, skill: 'crafting', minSkill: 0, action: 'craft' },
  bolts: { name: 'Bolts', station: 'workshop', stationLevel: 2, inputs: { wood: 1, scrap: 2 }, outputs: { bolts: 6 }, ticks: 14, skill: 'crafting', minSkill: 1, action: 'craft' },
  // Z6b: the mounted weapons (installed on a tower with survivor.mount) mirror their `craft` blocks too; bullets (gland = gunpowder) are the minigun's ammo.
  ballista: { name: 'Ballista', station: 'workshop', stationLevel: 2, inputs: { wood: 6, scrap: 4 }, outputs: { ballista: 1 }, ticks: 40, skill: 'crafting', minSkill: 2, action: 'craft' },
  repeating_crossbow: { name: 'Repeating crossbow', station: 'workshop', stationLevel: 3, inputs: { wood: 4, scrap: 8 }, outputs: { repeating_crossbow: 1 }, ticks: 50, skill: 'crafting', minSkill: 3, action: 'craft' },
  minigun: { name: 'Minigun', station: 'workshop', stationLevel: 3, inputs: { scrap: 16, gland: 2 }, outputs: { minigun: 1 }, ticks: 70, skill: 'crafting', minSkill: 4, action: 'craft' },
  rifle: { name: 'Rifle', station: 'workshop', stationLevel: 3, inputs: { scrap: 6, gland: 1 }, outputs: { rifle: 1 }, ticks: 40, skill: 'crafting', minSkill: 3, action: 'craft' },
  suppressor: { name: 'Suppressor', station: 'workshop', stationLevel: 2, inputs: { scrap: 3, rags: 2 }, outputs: { suppressor: 1 }, ticks: 30, skill: 'crafting', minSkill: 2, action: 'craft' },
  bullets: { name: 'Bullets', station: 'workshop', stationLevel: 3, inputs: { scrap: 2, gland: 1 }, outputs: { bullets: 12 }, ticks: 16, skill: 'crafting', minSkill: 2, action: 'craft' },
  // Bone meal: the better fertilizer (+100 % harvest instead of +50 %); farming works without it.
  bone_meal: { name: 'Bone meal', station: 'workshop', stationLevel: 1, inputs: { bones: 2, water: 1 }, outputs: { bone_meal: 2 }, ticks: 14, skill: 'crafting', minSkill: 0, action: 'craft' },
  // P1/P2 (docs/game/23 section 5). `minHq` (optional) = the headquarters level that opens the recipe (refused with HQ_LEVEL below it). Steel starts at the SMELTER (a separate
  // station from the workshop): ingots from scrap + charcoal; plates are pressed from ingots at the workshop. Blast smelter (level 2) makes ingots in bulk, cheaper per ingot.
  steel_ingot: { name: 'Steel ingot', station: 'smelter', stationLevel: 1, inputs: { scrap: 2, charcoal: 1 }, outputs: { steel_ingot: 1 }, ticks: 40, skill: 'crafting', minSkill: 0, action: 'craft', minHq: 2 },
  steel_ingot_bulk: { name: 'Steel ingots (bulk)', station: 'smelter', stationLevel: 2, inputs: { scrap: 8, charcoal: 4 }, outputs: { steel_ingot: 4 }, ticks: 100, skill: 'crafting', minSkill: 1, action: 'craft', minHq: 2 },
  // Future materials (nothing uses them yet): lead for bullets, iron for weapon upgrades and body armor.
  lead_bar: { name: 'Lead bar', station: 'smelter', stationLevel: 1, inputs: { scrap: 3 }, outputs: { lead_bar: 1 }, ticks: 30, skill: 'crafting', minSkill: 0, action: 'craft', minHq: 2 },
  iron_bar: { name: 'Iron bar', station: 'smelter', stationLevel: 1, inputs: { scrap: 3, charcoal: 1 }, outputs: { iron_bar: 1 }, ticks: 35, skill: 'crafting', minSkill: 0, action: 'craft', minHq: 2 },
  steel_plate: { name: 'Steel plate', station: 'workshop', stationLevel: 2, inputs: { steel_ingot: 2 }, outputs: { steel_plate: 1 }, ticks: 30, skill: 'crafting', minSkill: 1, action: 'craft' },
  hinge_set: { name: 'Hinge set', station: 'workshop', stationLevel: 1, inputs: { scrap: 2, wood: 1 }, outputs: { hinge_set: 1 }, ticks: 20, skill: 'crafting', minSkill: 0, action: 'craft' },
  concrete_block: { name: 'Concrete block', station: 'workshop', stationLevel: 2, inputs: { cement: 2, sand: 3, water: 1 }, outputs: { concrete_block: 1 }, ticks: 40, skill: 'crafting', minSkill: 1, action: 'craft' },
  sandbag: { name: 'Sandbag', station: 'workshop', stationLevel: 1, inputs: { rags: 2, sand: 3 }, outputs: { sandbag: 1 }, ticks: 15, skill: 'crafting', minSkill: 0, action: 'craft' },
  glass: { name: 'Glass', station: 'workshop', stationLevel: 2, inputs: { stone: 4, wood: 2 }, outputs: { glass: 1 }, ticks: 24, skill: 'crafting', minSkill: 1, action: 'craft', power: 8 },
};
