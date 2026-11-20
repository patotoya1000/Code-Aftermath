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
  // or the optional `total` is reached. `unloadTicks` is how long unloading at storage takes. At an empty RENEWABLE source (a well) she
  // waits up to `waitTicks` ticks for the next water to seep in before she gives up with NO_TARGET.
  gather: {
    handler: 'gather', ticksPerUnit: 2, defaultAmount: 5, maxAmount: 20, maxTotal: 500, range: 1, ticksPerTile: 1, unloadTicks: 2, waitTicks: 120,
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
  // cook is a STANDING action (docs/game/16): walk to a repaired station building, then make `count` batches of a recipe one after
  // another (inputs come from base stock and are reserved per batch, outputs go straight into base stock) until the count is done or
  // a stop reason fires (NO_INGREDIENTS, STORAGE_FULL, EXHAUSTED). With no count she keeps cooking until one of those happens (capped at maxCount).
  cook: { handler: 'cook', skill: 'cooking', range: 1, ticksPerTile: 1, maxCount: 100, powerWaitTicks: 90,
    capability: { attributes: { agility: 1, intelligence: 1 }, skills: { cooking: 0 } },
  },
  // craft (O12) is the workshop twin of cook: the same standing batch job (same handler), for recipes whose `action` is 'craft'. It practises the Crafting skill.
  craft: { handler: 'cook', skill: 'crafting', range: 1, ticksPerTile: 1, maxCount: 100, powerWaitTicks: 90,
    capability: { attributes: { agility: 1, strength: 1 }, skills: { crafting: 0 } },
  },
  rest: { handler: 'rest', defaultTicks: 20, maxTicks: 200, energyPerTick: 2,
    capability: { attributes: { endurance: 1 }, skills: { rest: 0 } },
  },
  // eat / drink: `items` is what can be consumed - `restore` points of the need, `rank` = the default order (lowest rank first, so the
  // cheapest food goes first). A learner can ask for one by name: survivor.eat("bread").
  eat: { handler: 'consume', need: 'hunger', ticks: 5, items: { food: { restore: 30, rank: 1 }, bread: { restore: 40, rank: 2 }, carrot: { restore: 12, rank: 3 }, potato: { restore: 18, rank: 4 }, hot_meal: { restore: 60, rank: 5 }, mre: { restore: 100, rank: 6 } },
    capability: { attributes: { intelligence: 1 }, skills: { consume: 0 } },
  },
  drink: { handler: 'consume', need: 'thirst', ticks: 3, items: { water: { restore: 30, rank: 1 } },
    capability: { attributes: { intelligence: 1 }, skills: { consume: 0 } },
  },
  repair: { handler: 'repair', range: 1, ticksPerTile: 1,
    capability: { attributes: { agility: 1, intelligence: 1 }, skills: { repair: 0 } },
  },
  // farm (O10, docs/game/16) is a STANDING action made of CHORES at one farm building: harvest what is ripe, water what is dry, plant what
  // is empty - in that order - for ONE crop, until a stop reason fires. `chore` = work ticks per chore (before skill). A harvest is
  // carried to storage and unloaded like a gather trip. When nothing needs doing yet but the crop is still growing she WAITS at the
  // farm (up to `waitTicks`, then stops with NOTHING_TO_DO). `count` (optional) = how many plots to harvest before stopping.
  farm: { handler: 'farm', range: 1, ticksPerTile: 1, unloadTicks: 2, maxCount: 100, waitTicks: 480, chore: { plant: 6, water: 4, nourish: 4, fertilize: 4, harvest: 8 },
    capability: { attributes: { strength: 1, agility: 1 }, skills: { farming: 0 } },
  },
  // Combat (Z3): attack is explicit, standing guard is an automatic defence posture.
  attack: { handler: 'combat', skill: 'combat', range: 1, ticksPerTile: 1,
    capability: { attributes: { agility: 1, strength: 1 }, skills: { combat: 0 } } },
  guard: { handler: 'guard', range: 1, ticksPerTile: 1,
    capability: { attributes: { agility: 1, strength: 1 }, skills: { combat: 0 } } },
  // collect (Z4, docs/game/20 section 4) is the SORTIE: a STANDING action like gather, but its draw points are the loot piles zombies left on the
  // ground. She walks to the nearest pile, picks up what she can carry AND what storage has room for (`ticksPerUnit` per unit), walks it to the nearest
  // working storage building that takes it and unloads (`unloadTicks`), and repeats. Allowed only when no wave is on (a wave that is cleared counts as
  // over), and it stops by itself when the next wave starts. Loot not picked up is gone `waveRules.lootLingerDays` dawns after the wave ended.
  collect: { handler: 'collect', range: 1, ticksPerTile: 1, ticksPerUnit: 1, unloadTicks: 2,
    capability: { attributes: { strength: 1, agility: 1 }, skills: { gathering: 0 } },
  },
  // scavenge (W3, docs/game/21 section 6): walk to the gate and LEAVE for a site. The action completes the moment she departs (stop reason DEPARTED); she is then
  // away (`survivor.status 'away'`, shown by the `scavenge` read) until the simulation brings her back with loot. See data/scavenge.js.
  scavenge: { handler: 'scavenge', range: 0, ticksPerTile: 1,
    capability: { attributes: { strength: 1, agility: 1 }, skills: {} },
  },
  // equip (Z5): put a weapon in her hands. A crafted weapon is taken from base stock (she walks to the storage that holds it); the weapon she held goes back
  // into stock (a starter weapon is never stocked, it can always be picked up again). It needs a minimum Combat skill (`weapons.<id>.minCombat`).
  equip: { handler: 'equip', range: 1, ticksPerTile: 1, ticks: 2,
    capability: { attributes: { agility: 1 }, skills: {} },
  },
  // lure (Z8): carry a noise lure to a tower and set it off (`ticks` of work next to it). One lure is spent; see `noise.lure` for the noise it makes.
  lure: { handler: 'lure', range: 1, ticksPerTile: 1, ticks: 3,
    capability: { attributes: { agility: 1 }, skills: {} },
  },
  // take (Z4, "ammo is carried by the survivor"): walk to the nearest working storage building that holds an item and move up to `amount` of it from base
  // stock into her hands (`ticks` of work), limited by what base stock has and what she can carry. It is how ammo gets from the store to the wall.
  // Perishable food cannot be taken (its age would reset when it is put back). `deposit()` puts it back.
  take: { handler: 'take', range: 1, ticksPerTile: 1, ticks: 2, maxAmount: 100,
    capability: { attributes: { strength: 1, agility: 1 }, skills: {} },
  },
  // mount (Z6b, docs/game/20 section 20): install a crafted MOUNTED weapon (ballista, repeating crossbow, minigun) on a repaired tower. She walks to the storage that
  // holds it, picks it up (`ticks`), hauls it to the tower (hauling needs no carry capacity) and fits it (`installTicks`). The unit is reserved from stock when the job is
  // accepted and leaves stock only when it is installed. A mount takes one of the tower's slots and needs Combat skill `weapons.<id>.minCombat`.
  mount: { handler: 'mount', range: 1, ticksPerTile: 1, ticks: 3, installTicks: 6,
    capability: { attributes: { agility: 1, strength: 1 }, skills: {} },
  },
  // reload (Z6b): carry ammo to a tower and pour it into the hopper of the mounted weapon(s) that use it (`ticks` of work at the tower). Ammo comes from her hands (survivor.take).
  reload: { handler: 'reload', range: 1, ticksPerTile: 1, ticks: 2, maxAmount: 200,
    capability: { attributes: { agility: 1 }, skills: {} },
  },
};

// Needs policies (R4a): a standing rule "when this need drops below X, do this action". A policy INTERRUPTS the survivor's
// current job, runs the action, then RESUMES the job. All numbers are data. `retryEvery`: after a policy could not run
// (e.g. no food in stock) it waits this many ticks before trying again, so a blocked policy never spams the world.
export const policies = {
  // `prefer`: the policy may name which of the action's `items` to eat first ("prefer" is soft: if it is out of stock she eats the default).
  eat:   { need: 'hunger', action: 'eat',   below: { min: 1, max: 99, default: 30 }, retryEvery: 10, prefer: true },
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
