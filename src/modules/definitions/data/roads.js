// Road camps and road danger (R7, docs/game/24 section 3g). The FOREST road (north) and the QUARRY road (south) are long and dangerous. A ROAD CAMP building (`buildings.road_camp`:
// ruin -> repair -> upgrade like any station) shortens them, guards what is stashed along them and makes runs on them safer. A camp's per-level numbers live on the building
// level (`camp: { roadTicksPercent, dangerCutPercent, stashLossPercent }`); only the rules that are not per level live here.
//
//   camp                  the building type that serves the roads (one camp serves every road region)
//   minHq                 the headquarters level that opens the camp's effects (below it a repaired camp does nothing; the view says why)
//   regions               which site regions count as ROADS (a camp helps only there; the FRONT sites are close to the wall and unchanged)
//   loadedRaidDayDanger   extra danger points on a LOADED run (retrieve) along a road on a day with a raid or a boss due: a full cart on the road at dusk is the best target
//
// What a working camp does, per its level (all PLACEHOLDERS to tune in a playtest):
//   roadTicksPercent      a trip to a road site takes this share of its travel ticks (scavenge, stash and retrieve; the extra rounds and the camp-pitching time are not travel)
//   dangerCutPercent      the run's danger percent is cut by this much (fewer hurt survivors, fewer dropped loads)
//   stashLossPercent      a raid night takes at most this share of a stash at a road site (the "guard"); never worse than the normal near / deep / camped share
// Motor vehicles are LOUD: `vehicles.types[].noisePercent` makes the run's danger that much higher (data/vehicles.js). A site with no danger stays calm.
export const roads = {
  camp: 'road_camp',
  minHq: 2,
  regions: ['forest', 'quarry'],
  loadedRaidDayDanger: 15,
};
