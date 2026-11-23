// Arsenal (doc 20 sections 9, 10, 13). DATA ONLY in phase 1: nothing equips, shoots or builds yet. Every number is a PLACEHOLDER to tune.
//
// Weapons (what a survivor holds, or what a tower mounts):
//   kind      melee | ranged | mounted
//   reach     melee: cells it can hit INCLUDING the fence cell (knife 2 = just across the fence, spear 3 = one cell further)
//   range     ranged / mounted: cells it can shoot (a tower adds its `rangeBonus` to a posted survivor's ranged weapon, never to melee)
//   damage, pierce   damage per hit; `pierce` ignores that much zombie armor (the answer to boomers and tanks)
//   minCombat the lowest Combat skill level that may EQUIP it (survivor.equip); starters need none
//   noise     added to the wave's attention meter per shot (see `noise`); the rifle and the minigun are LOUD
//   ammo      item id spent per shot (null = none). Ammo is CARRIED by the survivor; a mounted weapon has a `hopper` that survivors stock
//   shots     mounted only (default 1): projectiles fired per trigger pull (the dual minigun fires 2 at once, spending 2 ammo)
//   reload    ticks between shots; `power` (mounted only) = grid power drawn only WHILE firing (so batteries matter)
//   minTowerLevel  mounted only: the lowest tower level that can mount it
//   craft     what making it will need (workshop level, combat skill, materials) - the recipes come with the crafting phase
export const weapons = {
  knife:              { name: 'Knife', kind: 'melee', tier: 0, minCombat: 0, starter: true, reach: 2, damage: 3, pierce: 0, noise: 0, ammo: null, reload: 2 },
  spear:              { name: 'Spear', kind: 'melee', tier: 0, minCombat: 0, starter: true, reach: 3, damage: 4, pierce: 0, noise: 0, ammo: null, reload: 3 },
  advanced_spear:     { name: 'Advanced spear', kind: 'melee', tier: 1, minCombat: 0, reach: 3, damage: 6, pierce: 1, noise: 0, ammo: null, reload: 3,
    craft: { station: 'workshop', stationLevel: 1, minSkill: 1, materials: { wood: 2, scrap: 2, hide: 1 } } },
  // R6 (docs/game/24 section 3f): the first weapon forged from iron bars (the mine's iron, smelted): a stronger spear that still ignores a little armor.
  iron_spear:         { name: 'Iron spear', kind: 'melee', tier: 1, minCombat: 1, reach: 3, damage: 8, pierce: 3, noise: 0, ammo: null, reload: 3,
    craft: { station: 'workshop', stationLevel: 2, minSkill: 1, materials: { iron_bar: 2, wood: 2, rags: 1 } } },
  bow:                { name: 'Bow', kind: 'ranged', tier: 2, minCombat: 1, range: 6, damage: 5, pierce: 0, noise: 1, ammo: 'arrows', reload: 3,
    craft: { station: 'workshop', stationLevel: 1, minSkill: 1, materials: { wood: 3, hide: 1, rags: 1 } } },
  crossbow:           { name: 'Crossbow', kind: 'ranged', tier: 3, minCombat: 2, range: 7, damage: 9, pierce: 4, noise: 1, ammo: 'bolts', reload: 6,
    craft: { station: 'workshop', stationLevel: 2, minSkill: 2, materials: { wood: 3, scrap: 3 } } },
  rifle:              { name: 'Rifle', kind: 'ranged', tier: 4, minCombat: 3, range: 10, damage: 14, pierce: 6, noise: 8, ammo: 'bullets', reload: 4,
    craft: { station: 'workshop', stationLevel: 3, minSkill: 3, materials: { scrap: 6, gland: 1 } } },
  ballista:           { name: 'Ballista', kind: 'mounted', tier: 3, minCombat: 2, minTowerLevel: 2, range: 8, damage: 16, pierce: 8, noise: 2, ammo: 'bolts', hopper: 20, reload: 10,
    craft: { station: 'workshop', stationLevel: 2, minSkill: 2, materials: { plank: 4, beam: 1, iron_bar: 2 } } }, // R6: the sawmill's planks and beams plus iron bars (it was wood 6 + scrap 4)
  machine_gun:        { name: 'Machine gun', kind: 'mounted', tier: 4, minCombat: 3, minTowerLevel: 3, range: 9, damage: 8, pierce: 4, noise: 9, ammo: 'bullets', hopper: 120, reload: 2,
    craft: { station: 'workshop', stationLevel: 3, minSkill: 3, materials: { scrap: 10, gland: 1 } } },
  minigun:            { name: 'Minigun', kind: 'mounted', tier: 5, minCombat: 4, minTowerLevel: 4, range: 10, damage: 6, pierce: 3, noise: 12, ammo: 'bullets', hopper: 200, reload: 1, power: 6,
    craft: { station: 'workshop', stationLevel: 3, minSkill: 4, materials: { scrap: 16, gland: 2 } } },
  // `shots` (mounted only, default 1): projectiles per trigger pull - the twin-linked miniguns fire 2 at once, spending 2 ammo and drawing power once.
  dual_minigun:       { name: 'Dual minigun', kind: 'mounted', tier: 6, minCombat: 5, minTowerLevel: 5, range: 11, damage: 6, pierce: 3, shots: 2, noise: 18, ammo: 'bullets', hopper: 300, reload: 1, power: 10,
    craft: { station: 'workshop', stationLevel: 3, minSkill: 5, materials: { scrap: 30, gland: 4 } } },
};

// Body armor (R6, docs/game/24 section 3f). Worn in the survivor's `equipment.armor` slot (one piece, taken with survivor.equip like a weapon: a crafted item from base stock, the one she wore
// goes back). Every point of `reduction` is taken off EACH hit a zombie lands on her (melee, a thrown object, a boomer's blast); a hit that did damage still does at least 1.
//   minCombat  the lowest Combat skill that may wear it      craft  workshop recipe (mirrored in data/recipes.js, a test keeps them equal)
export const armors = {
  iron_vest:  { name: 'Iron vest', tier: 1, minCombat: 0, reduction: 2, craft: { station: 'workshop', stationLevel: 2, minSkill: 1, materials: { iron_bar: 4, rags: 2, hide: 1 } } },
  steel_vest: { name: 'Steel vest', tier: 2, minCombat: 1, reduction: 4, craft: { station: 'workshop', stationLevel: 3, minSkill: 3, materials: { iron_bar: 2, steel_plate: 3, hide: 2 } } },
};

// Towers (doc 20 section 10; the 5-level ladder is the user's Watchtower spec, doc 25 - the range grows EVERY level, for posted shooters (`rangeBonus`) and for the mount each level unlocks): separate defensive posts on the fence line (like the gate); the fence keeps its own level. Placement, repair and upgrade
// come in a later phase (they start as ruins, like every building). Each slot holds EITHER one posted survivor OR one mounted weapon (operated by a
// posted survivor). `rangeBonus` is added to a posted survivor's RANGED weapon; `mounts` lists the mounted weapons the level can hold.
export const towers = {
  1: { name: 'Survivor Lookout', maxHealth: 60, slots: 1, rangeBonus: 1, mounts: [] },
  2: { name: 'Repeater Ballista Tower', maxHealth: 100, slots: 2, rangeBonus: 2, mounts: ['ballista'] },
  3: { name: 'Machine Gun Tower', maxHealth: 160, slots: 2, rangeBonus: 3, mounts: ['ballista', 'machine_gun'] },
  4: { name: 'Minigun Tower', maxHealth: 240, slots: 2, rangeBonus: 4, mounts: ['ballista', 'machine_gun', 'minigun'] },
  5: { name: 'Dual Minigun Fortress', maxHealth: 360, slots: 3, rangeBonus: 5, mounts: ['ballista', 'machine_gun', 'minigun', 'dual_minigun'] },
};

// Noise (doc 20 section 13.3): every shot adds the weapon's `noise` to the wave's ATTENTION meter, which falls by `decayPerTick`. Above `threshold`, one
// reinforcement zombie per `reinforceEvery` points of excess (at most `reinforceCap` per wave, counted against the wave cap like screamer calls).
// `driftToLoudest`: zombies drift toward the loudest tower (bait). A suppressor cuts a personal weapon's noise by `suppressorPercent`.
// Z8: a screamer's scream adds `scream` and a boomer's blast `explosion` to the attention meter; a set-off noise lure adds `lure.attention` to it and `lure.tower` to ONE tower's noise.
export const noise = { decayPerTick: 1, threshold: 40, reinforceEvery: 20, reinforceCap: 4, driftToLoudest: true, suppressorPercent: 50,
  scream: 10, explosion: 15, lure: { attention: 20, tower: 15 } };
