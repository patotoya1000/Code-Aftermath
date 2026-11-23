// R4 (docs/game/24): the MINING STATION. A building of its own on the outpost map; survivors dig ore by hand with survivor.mine(ore, rounds?).
// The station opens when the headquarters reaches `minHq` (refusal HQ_LEVEL below it). A ROUND = one stint of work: walk to the station, dig `ticks`
// (before skill), bring `yield` units of ore (times the station level's `yieldPercent` and her output modifier) into base stock. Every finished round
// teaches Mining. Each round also rolls a CAVE-IN from a hash (pure function of seed + survivor + tick): the round is lost and she is hurt.
// Level 3 (the powered drill) works only on ticks when the grid serves its `power` (like a powered recipe); level data lives on the building
// (`buildings.mining_station.levels[n].mine`). Smelting the ore into bars is ordinary smelter recipes (data/recipes.js).
export const mining = {
  station: 'mining_station',
  minHq: 3,
  minHealth: 25,       // a cave-in that leaves her below this much health stops the job (TOO_HURT); she cannot start a job below it either
  powerWaitTicks: 90,  // a powered drill that waits this long for the grid stops the job with NO_POWER
  caveIn: {
    percent: { 1: 10, 2: 6, 3: 4 }, // chance per finished round, by station level (the rail cart shores the tunnel; the drill's rig is safest)
    skillPercent: 1,                // each Mining level takes this many points off, never below `floorPercent`
    floorPercent: 1,
    damage: 15,                     // health lost, never below 1
  },
  ores: {
    iron_ore: { name: 'Iron ore', item: 'iron_ore', ticks: 24, yield: 2, minSkill: 0 },
    lead_ore: { name: 'Lead ore', item: 'lead_ore', ticks: 24, yield: 2, minSkill: 0 },
    coal:     { name: 'Coal',     item: 'coal',     ticks: 18, yield: 3, minSkill: 0 },
  },
};
