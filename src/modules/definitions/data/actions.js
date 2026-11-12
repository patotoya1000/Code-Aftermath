// Action definitions: numbers live here, behaviour lives in the actions module's handlers.
// Each action can declare a `capability` block: minimum attribute/skill levels needed to attempt it.
// When capability is insufficient the action FAILS with FailureReason.CAPABILITY_INSUFFICIENT
// before any resources are reserved.
export const actions = {
  move: {
    handler: 'move', ticksPerTile: 1,
    capability: { attributes: { agility: 1 }, skills: { move: 0 } },
  },
  // gather is a STANDING action: it repeats batches of `amount` (the load per trip, default 5) until a stop reason fires
  // (storage full, nothing left to gather, too tired) or the optional `total` is reached.
  gather: {
    handler: 'gather', ticksPerUnit: 2, defaultAmount: 5, maxAmount: 20, maxTotal: 500, range: 1, ticksPerTile: 1,
    capability: { attributes: { strength: 1, agility: 1 }, skills: { gathering: 0 } },
  },
  rest: { handler: 'rest', defaultTicks: 20, maxTicks: 200, energyPerTick: 2,
    capability: { attributes: { endurance: 1 }, skills: { rest: 0 } },
  },
  eat: { handler: 'consume', item: 'food', need: 'hunger', restore: 30, ticks: 5,
    capability: { attributes: { intelligence: 1 }, skills: { consume: 0 } },
  },
  drink: { handler: 'consume', item: 'water', need: 'thirst', restore: 30, ticks: 3,
    capability: { attributes: { intelligence: 1 }, skills: { consume: 0 } },
  },
  repair: { handler: 'repair', range: 1, ticksPerTile: 1,
    capability: { attributes: { agility: 1, intelligence: 1 }, skills: { repair: 0 } },
  },
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

// Real-time clock. The simulation itself only counts ticks; these numbers tell the UI driver how fast ticks run and
// how fast strategy points come back. 1 tick = 1 simulation step; at 1x speed the game runs `ticksPerSecond` ticks/s.
export const clock = {
  ticksPerSecond: 3,
  speeds: [1, 2, 4],
  maxTicksPerFrame: 30, // safety cap so a slow frame never causes a huge catch-up burst
  strategy: { start: 10, max: 10, regenEvery: 20 }, // each command costs 1; +1 point every `regenEvery` ticks
};
