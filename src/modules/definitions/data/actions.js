// Action definitions: numbers live here, behaviour lives in the actions module's handlers.
export const actions = {
  move: { handler: 'move', ticksPerTile: 1 },
  gather: { handler: 'gather', ticksPerUnit: 2, defaultAmount: 5, maxAmount: 20, range: 1, ticksPerTile: 1 },
  rest: { handler: 'rest', defaultTicks: 20, maxTicks: 200, energyPerTick: 2 },
  eat: { handler: 'consume', item: 'food', need: 'hunger', restore: 30, ticks: 5 },
  drink: { handler: 'consume', item: 'water', need: 'thirst', restore: 30, ticks: 3 },
  repair: { handler: 'repair', range: 1, ticksPerTile: 1 },
};

export const needs = {
  max: 100,
  // every N ticks, lose `amount`
  decay: {
    hunger: { every: 20, amount: 1 },
    thirst: { every: 15, amount: 1 },
    energy: { every: 25, amount: 1 },
  },
  starve: { every: 10, damage: 1 }, // health loss while hunger or thirst is 0
  thresholds: { hungry: 30, thirsty: 30, tired: 25 },
  work: { minEnergy: 5, energyEvery: 10 }, // work needs minEnergy to start; costs 1 energy per N work ticks
};
