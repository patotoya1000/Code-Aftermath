// Threats. Design: docs/game/20-zombies-waves-loot-design.md (decided 2026-11-18). Phase 1 = DATA ONLY for the new types: nothing walks on the map yet,
// raids are still resolved abstractly at dusk against the base's defence. Every number is a PLACEHOLDER to tune.
//
//   role        the design name: common | runner | boomer | thrower | screamer | tank (ids keep the O19 names: walker = common, brute = tank)
//   threat      how much of a raid's strength budget one zombie costs (a raid's strength is spent on zombies)
//   weight      relative chance of being picked while a raid is composed
//   firstDay    the first calendar day the type can appear in a raid (so the answers to it - weapons - arrive about when it does)
//   health, damage, speed   stat block for the later combat phase (damage 0 = does not hit; boomer/thrower/screamer act through `behaviour`)
//   armor       FLAT damage reduction per hit (damage - armor, at least 0); a weapon's `pierce` ignores armor
//   behaviour   the special rule: rush (Z7a, runner: `vanguard` = spawns BEFORE the rest of the wave so it arrives first, `attackEveryTicks` = its own faster hit rhythm instead of waveRules.attackEveryTicks), siege (Z7e, tank: `stepTicks` = it moves one cell every N ticks (slower than any walker), `attackEveryTicks` = its slow hit rhythm, `wallMultiplier` = its hit on a wall is multiplied BEFORE wall armor), explode (radius, damage to fence segments and survivors inside; an exploded boomer drops NO loot),
//               throw (ranged hit on wall segments, leaves rubble outside), scream (calls extra zombies, capped and counted against the wave)
export const zombies = {
  walker: { name: 'Walker', role: 'common', threat: 2, weight: 6, firstDay: 6, health: 10, damage: 2, speed: 1, armor: 0 },
  runner: { name: 'Runner', role: 'runner', threat: 3, weight: 3, firstDay: 9, health: 6, damage: 3, speed: 2, armor: 0,
    behaviour: { type: 'rush', vanguard: true, attackEveryTicks: 5 } },
  boomer: { name: 'Boomer', role: 'boomer', threat: 5, weight: 2, firstDay: 12, health: 14, damage: 0, speed: 1, armor: 3,
    behaviour: { type: 'explode', radius: 2, fenceDamage: 12, survivorDamage: 8 } },
  thrower: { name: 'Thrower', role: 'thrower', threat: 5, weight: 2, firstDay: 15, health: 8, damage: 0, speed: 1, armor: 0,
    behaviour: { type: 'throw', range: 5, damage: 4, everyTicks: 6, rubble: 1 } },
  screamer: { name: 'Screamer', role: 'screamer', threat: 4, weight: 2, firstDay: 18, health: 6, damage: 0, speed: 1, armor: 0,
    behaviour: { type: 'scream', cooldownTicks: 30, summons: 3, waveCap: 6 } },
  brute: { name: 'Brute', role: 'tank', threat: 8, weight: 1, firstDay: 21, health: 30, damage: 6, speed: 1, armor: 2,
    behaviour: { type: 'siege', stepTicks: 4, attackEveryTicks: 12, wallMultiplier: 2 } },
};

// Bosses are NOT picked from a raid's random budget: a FIXED milestone (learners can see it coming and plan). First on `firstDay`, then every `everyDays`,
// announced `warnDays` ahead (longer than a normal raid). `escorts` come with it; the boss drops its loot table (the top-tier unlock).
export const bosses = {
  horde_king: { name: 'Horde King', health: 400, damage: 20, speed: 1, armor: 5, escorts: { walker: 6, brute: 1 },
    // Z7f: a boss is a slow siege zombie (like the tank, heavier) that ENRAGES once at half health: `phases[i]` fires when health falls to `belowPercent` % or less,
    // `set` overrides fields of its behaviour from then on, `summons` walkers join the wave's spawn queue (not counted against a screamer's cap).
    behaviour: { type: 'siege', stepTicks: 4, attackEveryTicks: 14, wallMultiplier: 3 },
    phases: [{ name: 'Enraged', belowPercent: 50, set: { stepTicks: 2, attackEveryTicks: 8 }, summons: 3 }] },
};
export const bossSchedule = { boss: 'horde_king', firstDay: 25, everyDays: 10, warnDays: 4 };

// Wave rules (doc 20 sections 2 and 7). `recall: 'learner'`: the simulation never pulls survivors inside, forgetting one outside loses them first.
// The gate closes (becomes a wall piece with its own health) while a wave is active; sorties for loot are only possible after the wave is cleared;
// loot lies on the ground until `lootLingerDays` dawns after the wave is cleared.
//   Z2 (entities, no combat yet): a wave spawns at DUSK on one map edge, one zombie every `spawnEveryTicks`; a zombie moves one tile every
//   floor(`zombieStepTicks` / speed) ticks, and hits the wall it stands against every `attackEveryTicks`, for (its damage - wall armor), where wall
//   armor = `wallArmorPerLevel` x the fence/gate level (so upgrading the fence makes weak zombies harmless). Nobody can kill a zombie until Z3, so
//   survivors of the wave retreat at DAWN, when the wave is resolved: breached (a wall reached 0 health) loses `breached.lootPercent` % of the food.
export const waveRules = {
  outsideFirst: true, recall: 'learner', gateClosesDuringWave: true, sortieOnlyAfterClear: true, lootLingerDays: 1,
  spawnEveryTicks: 3, zombieStepTicks: 2, attackEveryTicks: 8, wallArmorPerLevel: 1,
};

// Loot (doc 20 section 4): the zombie TYPE decides what drops; chancePercent per entry. `requires: 'not_exploded'` = nothing drops if the zombie
// exploded on the fence (killed before contact, a boomer drops its gland). Every item must exist in the items table.
export const lootTables = {
  walker: [{ item: 'bones', min: 1, max: 2, chancePercent: 70 }, { item: 'rags', min: 1, max: 2, chancePercent: 60 }],
  runner: [{ item: 'hide', min: 1, max: 2, chancePercent: 70 }, { item: 'bones', min: 1, max: 1, chancePercent: 40 }],
  boomer: [{ item: 'gland', min: 1, max: 1, chancePercent: 100, requires: 'not_exploded' }],
  thrower: [{ item: 'scrap', min: 1, max: 3, chancePercent: 80 }],
  screamer: [{ item: 'rags', min: 1, max: 1, chancePercent: 60 }, { item: 'noise_lure', min: 1, max: 1, chancePercent: 25 }],
  brute: [{ item: 'bones', min: 2, max: 4, chancePercent: 100 }, { item: 'hide', min: 2, max: 3, chancePercent: 80 }],
  horde_king: [{ item: 'boss_core', min: 1, max: 1, chancePercent: 100 }, { item: 'gland', min: 2, max: 3, chancePercent: 100 }],
};

// A raid MAY come on a day at dusk (pure function of seed + day, public `warnDays` ahead, like risk events).
//   startDay / chancePercent     calm start; chance that a day has a raid
//   strengthBase + perDay x (day - startDay), +- variancePercent    the raid's strength budget
//   defence: an informational rating (`perLevel` x the fence's level, scaled by its condition: repaired 100 %, damaged `damagedPercent` %, ruined 0).
//            Since Z2 it no longer decides the outcome - the zombies' real hits on the wall do.
//   breached: (a wall was destroyed during the wave) `lootPercent` % of the listed AVAILABLE items is looted at dawn
export const raidSchedule = {
  startDay: 6, chancePercent: 30, warnDays: 2, historyLimit: 10,
  strengthBase: 10, strengthPerDay: 2, variancePercent: 20,
  defense: { perLevel: 15, damagedPercent: 50 },
  breached: { lootPercent: 25, loot: ['food', 'water', 'wheat', 'bread', 'potato', 'carrot', 'hot_meal', 'mre'] },
};
