// Scavenge expeditions (W3, docs/game/21 section 6). A survivor leaves through the gate for a SITE on the far side of the wall, is away for a number of
// ticks and comes back with loot - or is hurt on the way, or, if a zombie wave starts while she is out, does not come back at all (survivors outside
// during a wave are the first victims; nothing recalls them: bringing them in before dusk is the learner's job).
// v1 is RESOLVED FROM RULES: she is not walked tile by tile on a second map. Everything below is a PURE function of (seed, survivor, departure tick, site)
// and of the site's saved recovery, so a replay or a save cannot disagree with the original run.
//
//   startDay          no expeditions before this calendar day (a calm start)
//   raidDayDanger     extra danger percent on a day that has a raid (or a boss) scheduled: the nearest sites are the easiest to reach but the most dangerous at dusk
//   hurtLootPercent   how much of the loot a hurt survivor brings back
//   hurtDamage        health lost when she is hurt (never below 1: an ambush hurts, only a wave or hunger can finish her)
//   needsPer10Ticks   what being away costs: needs lost per 10 ticks away (needs do NOT decay while she is gone, this is paid on her return; never below 0)
//   minRecovery       a site that was just looted still yields at least this percent
//   historyLimit      how many returns are remembered in state
//   stash             R2 (docs/game/24): a CAMP STASH at a remote site. `survivor.stash(site, rounds?, { camp }?)` works the site for 1..rounds.max rounds in ONE trip and leaves
//                     the haul in the site's stash instead of carrying it home; `survivor.retrieve(site)` hauls it back later. Fields: capPerSite (units held per site, all items
//                     together; overflow is lost), deepFromTicks (a site this many ticks away or more is DEEP), lossPercent { near, deep, protected } (share of every item a raid
//                     night takes, rounded up; `protected` replaces both when the stash is camped), rounds { max, ticks (each extra round adds this), falloffPercent (each later
//                     round yields this much less) }, campTicks (pitching a camp adds this to the trip), haulTripPercent (a retrieve run takes this share of the site's ticks: no
//                     searching, no fighting, a known road). Retrieve is limited by what she can carry (survivor carry capacity) and by base storage room; the rest stays in the stash.
//   sites             id -> { name, ticks (away from the gate to the gate again), danger (percent), regrowDays (days a looted site takes to recover fully),
//                     yield (item -> [min, max] at full recovery) }
// Every number is a PLACEHOLDER to tune in a playtest. A day has 240 ticks and daylight is about 120 of them, so the far sites are nearly a full day.
export const scavenge = {
  startDay: 2,
  raidDayDanger: 25,
  hurtLootPercent: 50,
  hurtDamage: 25,
  needsPer10Ticks: { hunger: 2, thirst: 3, energy: 3 },
  minRecovery: 10,
  historyLimit: 10,
  stash: { capPerSite: 60, deepFromTicks: 90, lossPercent: { near: 30, deep: 50, protected: 10 }, rounds: { max: 3, ticks: 30, falloffPercent: 25 }, campTicks: 20, haulTripPercent: 80 },
  sites: {
    roadside_store: { name: 'Roadside store', ticks: 40, danger: 10, regrowDays: 2, yield: { rags: [2, 5], packaging: [1, 3], potato: [1, 3] } },
    old_farmhouse: { name: 'Old farmhouse', ticks: 60, danger: 15, regrowDays: 3, yield: { wheat: [3, 8], potato: [2, 5], carrot: [2, 5] } },
    junkyard: { name: 'Junkyard', ticks: 80, danger: 25, regrowDays: 4, yield: { scrap: [4, 9], rags: [1, 3] } },
    // P1 (docs/game/23 section 5): the fortress materials. Sand and cement are heavy, so carry limits and storage room decide how much of a trip comes home.
    construction_site: { name: 'Construction site', ticks: 70, danger: 20, regrowDays: 4, yield: { cement: [3, 8], sand: [6, 14], scrap: [2, 5] } },
    // `region` (optional, default 'front') says which MAP SCREEN lists the site: the FRONT road, the FOREST (north road, far and slow) or the QUARRY (south road, heavy loads).
    quarry: { name: 'Quarry', region: 'quarry', ticks: 50, danger: 15, regrowDays: 3, yield: { sand: [8, 18], stone: [6, 12] } },
    deep_quarry: { name: 'Deep quarry', region: 'quarry', ticks: 90, danger: 25, regrowDays: 5, yield: { stone: [14, 26], sand: [4, 8] } },
    forest_edge: { name: 'Forest edge', region: 'forest', ticks: 70, danger: 10, regrowDays: 2, yield: { wood: [14, 26] } },
    deep_forest: { name: 'Deep forest', region: 'forest', ticks: 130, danger: 30, regrowDays: 4, yield: { wood: [32, 52], hide: [1, 3] } },
    hardware_depot: { name: 'Hardware depot', ticks: 90, danger: 30, regrowDays: 5, yield: { hinge_set: [2, 5], scrap: [4, 9] } },
    army_depot: { name: 'Army depot', ticks: 110, danger: 40, regrowDays: 7, yield: { arrows: [6, 14], bolts: [4, 10], bullets: [3, 8], scrap: [2, 5] } },
  },
};
