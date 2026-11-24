// Vehicles (R5, docs/game/24 section 3e). A vehicle is a MULTIPLIER on a retrieve run: `survivor.retrieve(site, { vehicle: "hand_cart" })` hauls the stash home with more
// carry capacity and in fewer ticks. Vehicles are not items: the GARAGE building (`buildings.garage`) is what you own, and its level says which vehicles it can field
// (Cart Shed = hand cart, Motor Pool = + motor cart, Truck Garage = + truck). One vehicle of each kind: while a survivor is away with it, nobody else can take it.
//
//   garage          the building type that fields the vehicles (a ruin in every scenario: repair it, then upgrade it, like every station)
//   minHq           the headquarters level that opens vehicle runs at all (refusal HQ_LEVEL, nothing changes)
//   fuelItems       what a motorised run burns, in order of preference (the first one base stock can pay for in full)
//   types           id -> { name, garageLevel (the garage level that fields it),
//                           carryPercent (her carry capacity on this run, percent: 200 = twice what she can carry on foot),
//                           ticksPercent (the run takes this share of the normal haul time, percent; never below 1 tick),
//                           fuel (units of fuel paid from base stock when she LEAVES; 0 = none, nothing is refunded if she is lost),
//                           noisePercent (R7: an engine is LOUD - the run's danger is this much higher, percent of the danger itself; 0 = silent; a calm site stays calm) }
// Every number is a PLACEHOLDER to tune in a playtest. A hurt survivor still drops part of the load (scavenge.hurtLootPercent), vehicle or not.
export const vehicles = {
  garage: 'garage',
  minHq: 2,
  fuelItems: ['coal', 'charcoal'],
  types: {
    hand_cart: { name: 'Hand cart', garageLevel: 1, carryPercent: 200, ticksPercent: 90, fuel: 0, noisePercent: 0 },
    motor_cart: { name: 'Motor cart', garageLevel: 2, carryPercent: 400, ticksPercent: 60, fuel: 1, noisePercent: 25 },
    truck: { name: 'Truck', garageLevel: 3, carryPercent: 800, ticksPercent: 40, fuel: 3, noisePercent: 50 },
  },
};
