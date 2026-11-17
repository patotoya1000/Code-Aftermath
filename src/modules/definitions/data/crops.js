// Crop definitions for farming (Phase A: field + greenhouse)
// Each crop has a growth cycle, yield, water need, hazard tolerance, and shelf life.
// Growth cycle: empty → planted → growing → ready → harvested
// Perishable crops have shelfLife (days); ageing runs once per day at dawn (O9).
// Yield is units of the crop per plot when harvested.

// Water need: units of water per growth tick (or per plot per full growth cycle)
// Hazard tolerance: 1.0 = fully resistant, 0.0 = fully exposed
// Lower = more vulnerable; greenhouse can block certain hazards

// A crop's `growthTicks` is the total ticks for one full cycle (empty→ready).
// `plotGrowthPerTick` determines how much progress is made each tick.

// The field (L1) has no weather protection; greenhouse (L2) blocks storm/heat/cold.
// Hydroponic (L3) ignores weather but needs electricity + water + nutrients.

// Yield values: units per plot when harvested (before spoilage)
export const crops = {
  // Basic crop: grows in field (L1), exposed to weather, 1.0x yield
  potato: {
    id: 'potato',
    name: 'Potato',
    growthTicks: 600, // 10 in-game days at 1x speed (240 ticks/day)
    waterNeed: 1, // 1 unit water per full growth cycle per plot
    yield: 3, // 3 units per plot when harvested
    hazardTolerance: 0.5, // 50%: exposed to all hazards, reduced growth
    shelfLife: 4, // 4 days until spoilage (O9); oldest eaten first
    plotGrowthPerTick: 1, // progress per tick (total ticks / growthTicks)
    // When harvested, units go into base stock as perishable
  },

  // Another basic crop: grows in field (L1), exposed to weather, 1.0x yield
  carrot: {
    id: 'carrot',
    name: 'Carrot',
    growthTicks: 500, // ~8.3 in-game days
    waterNeed: 1,
    yield: 2,
    hazardTolerance: 0.5,
    shelfLife: 3, // 3 days
    plotGrowthPerTick: 1,
  },

  // Wheat: also used for cooking bread (O8); grows in field
  wheat: {
    id: 'wheat',
    name: 'Wheat',
    growthTicks: 700, // ~11.7 in-game days
    waterNeed: 1,
    yield: 2,
    hazardTolerance: 0.5,
    shelfLife: 0, // wheat never spoils (like canned food)
    plotGrowthPerTick: 1,
  },
}

// ---------------------------------------------------------------------------
// Building definitions: field (L1), greenhouse (L2), hydroponic (L3)
// These are added to `definitions/data/buildings.js` via the `buildings` export merge.
// ---------------------------------------------------------------------------

// Field (L1): open ground, no weather protection
// - Crops grow at normal rate but are exposed to weather hazards
// - hazardTolerance reduces effective growth speed
// - Yield is as defined in crop data

// Greenhouse (L2): blocks storm/heat/cold; clear/rain still pass through
// - Growth speed: ~1.5× field (faster because protected from hazards)
// - Yield: ~1.5× field
// - Still needs water; still subject to weather (clear/rain pass through)

export const buildingTypes = {
  field: {
    name: 'Field',
    level: 1,
    maxHealth: 100,
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    // No storage; field is just ground where plots are placed.
    // `blocks` = false: survivors CAN walk through field tiles (they are just ground).
    // The field itself has no blocking behavior; only buildings/fence block.
    blocks: false,
    // Repair data
    repair: { cost: { wood: 3 }, healthPerAction: 20, ticks: 15 },
    // No upgrade path from field alone; greenhouse is built adjacent/upgraded
    // but field stays as L1 floor type.
  },

  greenhouse: {
    name: 'Greenhouse',
    level: 2,
    maxHealth: 120,
    visual: { ruinedBelow: 0.25, damagedBelow: 0.6 },
    // Blocks storm/heat/cold; clear and rain pass through (plants still get water)
    // `blocks` = true: survivors cannot walk through greenhouse structure
    blocks: true,
    // Growth multiplier: crops grow 1.5× faster inside a greenhouse
    growthMultiplier: 1.5,
    // Yield multiplier: 1.5× field yield
    yieldMultiplier: 1.5,
    // Still needs water, but hazardTolerance from crop is effectively 1.0 (blocked)
    // inside a greenhouse, all hazards are blocked (clear/rain still allow water)
    // Effectively, inside greenhouse: hazardTolerance = 1.0 (full protection)
    repair: { cost: { wood: 5, stone: 3 }, healthPerAction: 30, ticks: 25 },
    // Upgrade path: can upgrade to hydroponic (L3)
    upgrade: { 3: { cost: { wood: 10, stone: 8, glass: 15 }, ticks: 40 } },
  },

  // Hydroponic (L3): ignores weather, needs electricity + water + nutrients
  // Design-only for now; code structure planned but not implemented in Phase A.
  // Will be added later when power phase begins.
}