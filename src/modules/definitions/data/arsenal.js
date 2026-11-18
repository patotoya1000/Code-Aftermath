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
//   reload    ticks between shots; `power` (mounted only) = grid power drawn only WHILE firing (so batteries matter)
//   minTowerLevel  mounted only: the lowest tower level that can mount it
//   craft     what making it will need (workshop level, combat skill, materials) - the recipes come with the crafting phase
export const weapons = {
  knife:              { name: 'Knife', kind: 'melee', tier: 0, minCombat: 0, starter: true, reach: 2, damage: 3, pierce: 0, noise: 0, ammo: null, reload: 2 },
  spear:              { name: 'Spear', kind: 'melee', tier: 0, minCombat: 0, starter: true, reach: 3, damage: 4, pierce: 0, noise: 0, ammo: null, reload: 3 },
  advanced_spear:     { name: 'Advanced spear', kind: 'melee', tier: 1, minCombat: 0, reach: 3, damage: 6, pierce: 1, noise: 0, ammo: null, reload: 3,
    craft: { station: 'workshop', stationLevel: 1, minSkill: 1, materials: { wood: 2, scrap: 2, hide: 1 } } },
  bow:                { name: 'Bow', kind: 'ranged', tier: 2, minCombat: 1, range: 6, damage: 5, pierce: 0, noise: 1, ammo: 'arrows', reload: 3,
    craft: { station: 'workshop', stationLevel: 1, minSkill: 1, materials: { wood: 3, hide: 1, rags: 1 } } },
  crossbow:           { name: 'Crossbow', kind: 'ranged', tier: 3, minCombat: 2, range: 7, damage: 9, pierce: 4, noise: 1, ammo: 'bolts', reload: 6,
    craft: { station: 'workshop', stationLevel: 2, minSkill: 2, materials: { wood: 3, scrap: 3 } } },
  rifle:              { name: 'Rifle', kind: 'ranged', tier: 4, minCombat: 3, range: 10, damage: 14, pierce: 6, noise: 8, ammo: 'bullets', reload: 4,
    craft: { station: 'workshop', stationLevel: 3, minSkill: 3, materials: { scrap: 6, gland: 1 } } },
  ballista:           { name: 'Ballista', kind: 'mounted', tier: 3, minCombat: 2, minTowerLevel: 2, range: 8, damage: 16, pierce: 8, noise: 2, ammo: 'bolts', hopper: 20, reload: 10,
    craft: { station: 'workshop', stationLevel: 2, minSkill: 2, materials: { wood: 6, scrap: 4 } } },
  repeating_crossbow: { name: 'Repeating crossbow', kind: 'mounted', tier: 4, minCombat: 3, minTowerLevel: 3, range: 8, damage: 8, pierce: 5, noise: 2, ammo: 'bolts', hopper: 40, reload: 2,
    craft: { station: 'workshop', stationLevel: 3, minSkill: 3, materials: { wood: 4, scrap: 8 } } },
  minigun:            { name: 'Minigun', kind: 'mounted', tier: 5, minCombat: 4, minTowerLevel: 3, range: 9, damage: 6, pierce: 3, noise: 12, ammo: 'bullets', hopper: 200, reload: 1, power: 6,
    craft: { station: 'workshop', stationLevel: 3, minSkill: 4, materials: { scrap: 16, gland: 2 } } },
};

// Towers (doc 20 section 10): separate defensive posts on the fence line (like the gate); the fence keeps its own level. Placement, repair and upgrade
// come in a later phase (they start as ruins, like every building). Each slot holds EITHER one posted survivor OR one mounted weapon (operated by a
// posted survivor). `rangeBonus` is added to a posted survivor's RANGED weapon; `mounts` lists the mounted weapons the level can hold.
export const towers = {
  1: { name: 'Lookout', maxHealth: 60, slots: 1, rangeBonus: 1, mounts: [] },
  2: { name: 'Guard tower', maxHealth: 100, slots: 2, rangeBonus: 2, mounts: ['ballista'] },
  3: { name: 'Fortified tower', maxHealth: 160, slots: 2, rangeBonus: 3, mounts: ['ballista', 'repeating_crossbow', 'minigun'] },
};

// Noise (doc 20 section 13.3): every shot adds the weapon's `noise` to the wave's ATTENTION meter, which falls by `decayPerTick`. Above `threshold`, one
// reinforcement zombie per `reinforceEvery` points of excess (at most `reinforceCap` per wave, counted against the wave cap like screamer calls).
// `driftToLoudest`: zombies drift toward the loudest tower (bait). A suppressor cuts a personal weapon's noise by `suppressorPercent`.
export const noise = { decayPerTick: 1, threshold: 40, reinforceEvery: 20, reinforceCap: 4, driftToLoudest: true, suppressorPercent: 50 };
