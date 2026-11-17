// Crops (O10, docs/game/16). A crop is an ITEM (see items.js) that can also be planted: planting spends `seeds` units of it from base
// stock, harvesting gives `yield` units back (scaled by the farm level and by weather damage). Everything is whole numbers.
//
//   growthTicks   work-free growing time at 100 % speed (a day is 240 ticks). A field grows at 100 %, a greenhouse at 150 %.
//   seeds         units of the crop spent to plant one plot.
//   yield         units per plot at harvest on a level-1 field (a greenhouse yields more: see the building's `farm.yield`).
//   hazards       % of the crop lost for each HAZARD DAY of that kind that finds it unsheltered (`storm`, `heat`, `cold`; see the
//                 weather table). A missing kind means the crop shrugs it off. Sheltered farms (greenhouse) take no hazard damage.
//
// Water is not per crop: a dry plot does not grow. Rain waters every plot; otherwise a survivor waters it (`farming.water`).
export const crops = {
  wheat:  { name: 'Wheat',  growthTicks: 720, seeds: 1, yield: 4, hazards: { storm: 40, cold: 50 } },
  potato: { name: 'Potato', growthTicks: 480, seeds: 1, yield: 3, hazards: { storm: 25, heat: 30 } },
  carrot: { name: 'Carrot', growthTicks: 360, seeds: 1, yield: 3, hazards: { heat: 40, cold: 25 } },
};

// Watering. One unit of water keeps a plot growing for `ticksPerWater` ticks; a plot holds at most `cap` ticks of water. Growing uses
// one tick of water per tick. Rain fills a plot to `cap` for free (greenhouse roofs let rain through).
export const farming = {
  ticksPerWater: 120,
  cap: 240,
  maxDamage: 90, // a plot never loses more than this % of its harvest to weather
};
