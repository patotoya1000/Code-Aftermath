// Action definitions: numbers live here, behaviour lives in the actions module's handlers.
// Each action can declare a `capability` block: minimum attribute/skill levels needed to attempt it.
// When capability is insufficient the action FAILS with FailureReason.CAPABILITY_INSUFFICIENT
// before any resources are reserved.
export const actions = {
  move: {
    handler: 'move', ticksPerTile: 1,
    capability: { attributes: { agility: 1 }, skills: { move: 0 } },
  },
  // gather is a STANDING action: it repeats TRIPS (walk to a node, gather `amount` - the load per trip, default 5, capped by what the
  // survivor can carry - walk to storage, unload) until a stop reason fires (storage full, nothing left to gather, too tired)
  // or the optional `total` is reached. `unloadTicks` is how long unloading at storage takes.
  gather: {
    handler: 'gather', ticksPerUnit: 2, defaultAmount: 5, maxAmount: 20, maxTotal: 500, range: 1, ticksPerTile: 1, unloadTicks: 2,
    capability: { attributes: { strength: 1, agility: 1 }, skills: { gathering: 0 } },
  },
  // deposit: walk to the nearest working storage building that accepts what is carried, unload (`unloadTicks`), repeat for
  // anything that building does not take. gather does this by itself after every trip; learners call it to empty a survivor
  // that was stopped or interrupted while carrying.
  deposit: { handler: 'deposit', range: 1, ticksPerTile: 1, unloadTicks: 2,
    capability: { attributes: { strength: 1, agility: 1 }, skills: {} },
  },
  // upgrade: walk to a fully repaired building and raise it one level (cost/time come from the building's `upgrade` table).
  // Needs a little practised Repair skill: advanced work unlocks through experience, not through a level counter.
  upgrade: { handler: 'upgrade', range: 1, ticksPerTile: 1,
    capability: { attributes: { agility: 1, intelligence: 1, strength: 1 }, skills: { repair: 1 } },
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

// Needs policies (R4a): a standing rule "when this need drops below X, do this action". A policy INTERRUPTS the survivor's
// current job, runs the action, then RESUMES the job. All numbers are data. `retryEvery`: after a policy could not run
// (e.g. no food in stock) it waits this many ticks before trying again, so a blocked policy never spams the world.
export const policies = {
  eat:   { need: 'hunger', action: 'eat',   below: { min: 1, max: 99, default: 30 }, retryEvery: 10 },
  drink: { need: 'thirst', action: 'drink', below: { min: 1, max: 99, default: 30 }, retryEvery: 10 },
  rest:  { need: 'energy', action: 'rest',  below: { min: 1, max: 99, default: 25 }, until: { min: 2, max: 100, default: 70 }, retryEvery: 10 },
};

// Learner event hooks (R4b): survivor.on(event, fn). `events` says what each name listens for; `limits` keep hooks cheap and safe
// (a handler runs in the sandbox Worker like any learner code, may only issue commands, and each command costs a strategy point).
export const hooks = {
  events: {
    hungry: { on: 'condition', condition: 'hungry' },   // fires when she BECOMES hungry
    thirsty: { on: 'condition', condition: 'thirsty' },
    tired: { on: 'condition', condition: 'tired' },
    stopped: { on: 'stopped' },                         // a job ended by itself (task.stopped) or failed (action.failed); the handler gets { reason }
  },
  limits: { perSurvivor: 4, maxSourceChars: 600, maxCommands: 5, cooldownTicks: 10 },
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
