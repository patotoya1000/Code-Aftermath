import { AftermathError, API_VERSION } from '../../kernel/index.js';

// Game API v1: the ONLY bridge between learner code and the simulation. Each command has a documented
// contract; arguments are validated here before they ever become a Command.
const bad = (name, msg) => new AftermathError('INVALID_ARGUMENT', `${name}(): ${msg}`);
const OPTION_KEYS_FORBIDDEN = ['__proto__', 'constructor', 'prototype'];
/** A plain options object like { below: 30 } becomes a fresh object of primitives (nothing from learner code survives). */
function cleanOptions(name, obj) {
  const keys = Object.keys(obj);
  if (keys.length > 6) throw bad(name, 'too many options');
  const out = {};
  for (const k of keys) {
    if (OPTION_KEYS_FORBIDDEN.includes(k)) throw bad(name, `option "${k}" is not allowed`);
    const v = obj[k];
    if (!(typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')) throw bad(name, `option ${k} must be a number, text or true/false`);
    out[k] = v;
  }
  return out;
}
const entityId = (v) => (typeof v === 'string' && v ? v : null);
const noArgs = (name, args) => { if (args.length) throw bad(name, 'takes no arguments'); return {}; };
function optInt(name, label, v, min, max) {
  if (v === undefined) return undefined;
  if (!Number.isInteger(v) || v < min || v > max) throw bad(name, `${label} must be a whole number from ${min} to ${max}`);
  return v;
}

export const COMMANDS = {
  moveTo: {
    type: 'move', signature: 'survivor.moveTo(x, y)  or  survivor.moveTo(entity)',
    doc: 'Walk to a tile, or to a building/resource node/survivor.',
    params(args) {
      if (args.length === 2 && args.every(Number.isInteger)) return { x: args[0], y: args[1] };
      if (args.length === 1 && entityId(args[0])) return { targetId: args[0] };
      throw bad('moveTo', 'use moveTo(x, y) with whole numbers, or moveTo(entity)');
    },
  },
  gather: {
    type: 'gather', signature: 'survivor.gather(resource, load = 5, total)',
    doc: 'Keep gathering that resource in trips: walk to the nearest node, gather `load` (1–20, never more than she can carry), carry it to storage and unload. Stops by itself when storage is full, nothing is left, or the survivor is too tired. Add `total` (1–500) to stop after that many have reached storage. Water comes from a repaired well (survivor.gather("water", 10)): the well refills with time, so she waits at an empty one.',
    params(args) {
      if (args.length < 1 || args.length > 3 || typeof args[0] !== 'string' || !args[0]) throw bad('gather', 'first argument must be a resource name like "wood"');
      const amount = optInt('gather', 'load', args[1], 1, 20);
      const total = optInt('gather', 'total', args[2], 1, 500);
      if (total !== undefined && amount === undefined) throw bad('gather', 'give a load before a total, e.g. gather("wood", 10, 50)');
      return { resource: args[0], ...(amount !== undefined ? { amount } : {}), ...(total !== undefined ? { total } : {}) };
    },
  },
  deposit: { type: 'deposit', signature: 'survivor.deposit()', doc: 'Walk to the nearest working storage building and unload everything she carries into base stock.', params: (args) => noArgs('deposit', args) },
  cook: {
    type: 'cook', signature: 'survivor.cook(recipe, count)',
    doc: 'Walk to a repaired kitchen and cook a recipe in batches, e.g. survivor.cook("bread", 5). Ingredients (and fuel) come from base stock; the result goes back into it. Stops by itself when `count` batches are done, the next batch cannot be paid for, storage is full or she is too tired. With no count she keeps cooking until one of those happens. Kitchen recipes only (bread, hot_meal, mre); the MRE needs power while it is sealed. See recipes for what each needs.',
    params(args) {
      if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0]) throw bad('cook', 'first argument must be a recipe name like "bread"');
      const count = optInt('cook', 'count', args[1], 1, 100);
      return { recipe: args[0], ...(count !== undefined ? { count } : {}) };
    },
  },
  craft: {
    type: 'craft', signature: 'survivor.craft(recipe, count)',
    doc: 'Walk to a repaired workshop and craft a recipe in batches, e.g. survivor.craft("packaging", 5). It works like cook() but for workshop recipes (packaging, glass) and practises Crafting. Some recipes need power while they are worked (see recipes.<name>.power): without it she waits, then stops with NO_POWER. Stops by itself when `count` batches are done, the next batch cannot be paid for, storage is full or she is too tired.',
    params(args) {
      if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0]) throw bad('craft', 'first argument must be a recipe name like "packaging"');
      const count = optInt('craft', 'count', args[1], 1, 100);
      return { recipe: args[0], ...(count !== undefined ? { count } : {}) };
    },
  },
  farm: {
    type: 'farm', options: true, signature: 'survivor.farm(farm, crop, count, { fertilize })',
    doc: 'Work one farm for one crop, e.g. survivor.farm(field_1, "potato"). She harvests what is ripe (and carries it to storage), waters dry plots, and plants empty ones, again and again. Planting spends seeds from base stock (a crop is its own seed), watering spends water; rain waters the plots for free. Add { fertilize: true } (after the optional count) to also spread fertilizer on growing plots while there is some in base stock: +50 % harvest for that plot. She waits at the farm while the crop grows. Stops when `count` plots are harvested, seeds or water run out, storage is full, or she is too tired. The farm must be repaired. See crops and the farm\'s plots (field_1.farm).',
    params(args) {
      const rest = args.slice(2);
      const last = rest.at(-1);
      const hasOptions = last !== null && typeof last === 'object' && !Array.isArray(last);
      const countArg = hasOptions ? rest.slice(0, -1) : rest;
      if (args.length < 2 || args.length > 4 || countArg.length > 1 || !entityId(args[0]) || typeof args[1] !== 'string' || !args[1]) throw bad('farm', 'use farm(field_1, "potato"), farm(field_1, "potato", 4) or farm(field_1, "potato", 4, { fertilize: true })');
      const count = optInt('farm', 'count', countArg[0], 1, 100);
      const o = hasOptions ? cleanOptions('farm', last) : {};
      for (const k of Object.keys(o)) if (k !== 'fertilize') throw bad('farm', `unknown option "${k}" (only fertilize)`);
      if (o.fertilize !== undefined && typeof o.fertilize !== 'boolean') throw bad('farm', 'fertilize must be true or false');
      return { targetId: args[0], crop: args[1], ...(count !== undefined ? { count } : {}), ...(o.fertilize ? { fertilize: true } : {}) };
    },
  },
  rest: {
    type: 'rest', signature: 'survivor.rest(ticks = 20)', doc: 'Rest to recover energy.',
    params(args) {
      if (args.length > 1) throw bad('rest', 'takes at most one argument');
      const ticks = optInt('rest', 'ticks', args[0], 1, 200);
      return ticks === undefined ? {} : { ticks };
    },
  },
  eat: {
    type: 'eat', signature: 'survivor.eat(item)', doc: 'Eat one food from base stock to restore hunger. With no argument she eats the cheapest food in stock first (the default order); name one to choose, e.g. survivor.eat("bread"). See foods for what each restores.',
    params(args) {
      if (args.length > 1) throw bad('eat', 'takes at most one argument, e.g. survivor.eat("bread")');
      if (args.length === 1 && (typeof args[0] !== 'string' || !args[0])) throw bad('eat', 'the food must be a name like "bread"');
      return args.length ? { item: args[0] } : {};
    },
  },
  drink: { type: 'drink', signature: 'survivor.drink()', doc: 'Drink one water from base stock to restore thirst.', params: (args) => noArgs('drink', args) },
  repair: {
    type: 'repair', signature: 'survivor.repair(building)', doc: 'Walk to a building and repair it (costs wood).',
    params(args) {
      if (args.length !== 1 || !entityId(args[0])) throw bad('repair', 'pass a building, e.g. survivor.repair(fence)');
      return { targetId: args[0] };
    },
  },
  upgrade: {
    type: 'upgrade', signature: 'survivor.upgrade(building)', doc: 'Walk to a fully repaired building and raise it one level (costs materials, needs some Repair skill). Check building.upgrade for the cost.',
    params(args) {
      if (args.length !== 1 || !entityId(args[0])) throw bad('upgrade', 'pass a building, e.g. survivor.upgrade(hq)');
      return { targetId: args[0] };
    },
  },
  policy: {
    type: 'policy', instant: true, options: true, signature: 'survivor.policy(name, { below, until, prefer })',
    doc: 'A standing rule: when the need drops below `below`, pause the current job, do it (\"eat\", \"drink\" or \"rest\"), then go back to the job. rest also takes `until` (stop resting at that energy); eat also takes `prefer` (a food to eat first when it is in stock, e.g. \"bread\"). Example: survivor.policy(\"eat\", { below: 30, prefer: \"bread\" }).',
    params(args) {
      if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0]) throw bad('policy', 'first argument must be \"eat\", \"drink\" or \"rest\"');
      const o = typeof args[1] === 'number' ? { below: args[1] } : args[1] ?? {};
      if (typeof o !== 'object') throw bad('policy', 'second argument must be options like { below: 30 }');
      for (const k of Object.keys(o)) if (k !== 'below' && k !== 'until' && k !== 'prefer') throw bad('policy', `unknown option \"${k}\" (use below, until, prefer)`);
      if (o.prefer !== undefined && (typeof o.prefer !== 'string' || !o.prefer)) throw bad('policy', 'prefer must be a food name like \"bread\"');
      const below = optInt('policy', 'below', o.below, 1, 99);
      const until = optInt('policy', 'until', o.until, 2, 100);
      return { action: args[0], ...(below !== undefined ? { below } : {}), ...(until !== undefined ? { until } : {}), ...(o.prefer !== undefined ? { prefer: o.prefer } : {}) };
    },
  },
  clearPolicy: {
    type: 'policy_clear', instant: true, signature: 'survivor.clearPolicy(name)', doc: 'Remove one policy, or all of them when called with no name.',
    params(args) {
      if (args.length > 1 || (args.length === 1 && (typeof args[0] !== 'string' || !args[0]))) throw bad('clearPolicy', 'pass a policy name like \"eat\", or nothing to clear all');
      return args.length ? { action: args[0] } : {};
    },
  },
  on: {
    type: 'hook_register', instant: true, hook: true, signature: 'survivor.on(event, () => { ... })',
    doc: 'React to something: events are \"hungry\", \"thirsty\", \"tired\" (fires when she becomes so) and \"stopped\" (a job ended; the handler gets { reason }). The handler runs later in its own sandbox, sees the world as it is THEN, and may only give commands. Keep it self-contained: it cannot use variables from the code around it.',
    params(args) {
      if (args.length !== 2 || typeof args[0] !== 'string' || typeof args[1] !== 'string') throw bad('on', 'use survivor.on(\"hungry\", () => { survivor.eat(); })');
      return { event: args[0], source: args[1] };
    },
  },
  off: {
    type: 'hook_clear', instant: true, hook: true, signature: 'survivor.off(event)', doc: 'Remove one hook, or all of them with no event.',
    params(args) {
      if (args.length > 1 || (args.length === 1 && typeof args[0] !== 'string')) throw bad('off', 'pass an event name like \"hungry\", or nothing to remove all');
      return args.length ? { event: args[0] } : {};
    },
  },
  // A marker, not an action: it costs nothing and is consumed by the session. By default the FIRST command a program
  // gives a survivor replaces whatever that survivor was doing, and the rest queue behind it. After queue(), even the
  // first command is added to the end of the survivor's queue instead.
  queue: { type: null, marker: true, signature: 'survivor.queue()', doc: 'Add the commands that follow to the END of this survivor\'s queue instead of replacing the current task.', params: (args) => noArgs('queue', args) },
  stop: { type: 'stop', signature: 'survivor.stop()', doc: 'Cancel this survivor\'s queued and running actions.', params: (args) => noArgs('stop', args) },
  collect: {
    type: 'collect', signature: 'survivor.collect(item)',
    doc: 'Go on a sortie: walk to the loot zombies left on the ground (the nearest pile first), pick up what she can carry and storage has room for, carry it to a storage building and unload, and repeat. Add an item name (e.g. \"bones\") to take only that. Only allowed when no wave is on (a cleared wave counts as over); it stops by itself when the loot is gone, storage is full, she is too tired, or the next wave starts. Loot not picked up is gone a day after the wave ended. See threats.loot.',
    params(args) {
      if (args.length > 1 || (args.length === 1 && (typeof args[0] !== 'string' || !args[0]))) throw bad('collect', 'use collect() or collect(\"bones\")');
      return args.length ? { item: args[0] } : {};
    },
  },
  take: {
    type: 'take', signature: 'survivor.take(item, amount)',
    doc: 'Walk to the nearest working storage building that holds an item and take up to `amount` (1–100) of it from base stock into her hands, limited by what is in stock and what she can carry. This is how ammo gets from the store to the wall: survivor.take(\"arrows\", 20). Perishable food cannot be taken. deposit() puts it back.',
    params(args) {
      if (args.length !== 2 || typeof args[0] !== 'string' || !args[0]) throw bad('take', 'use take(\"arrows\", 20)');
      return { item: args[0], amount: optInt('take', 'amount', args[1], 1, 100) };
    },
  },
  equip: {
    type: 'equip', signature: 'survivor.equip(weapon)',
    doc: 'Take a weapon in hand: \"knife\" or \"spear\" at once, a crafted one (\"advanced_spear\", \"bow\", \"crossbow\") from base stock (she walks to the storage that holds it; the weapon she held goes back). Needs the weapon\'s minCombat Combat skill (threats.weapons). A ranged weapon spends the ammo she carries: survivor.take(\"arrows\", 20). survivor.equip(\"suppressor\") fits a crafted suppressor for good (it does not replace the weapon): her personal weapon then makes about half the noise.',
    params(args) {
      if (args.length !== 1 || typeof args[0] !== 'string' || !args[0]) throw bad('equip', 'use equip(\"bow\")');
      return { weapon: args[0] };
    },
  },
  mount: {
    type: 'mount', signature: 'survivor.mount(tower, weapon)',
    doc: 'Install a crafted mounted weapon (\"ballista\", \"repeating_crossbow\", \"minigun\") on a repaired tower: she fetches it from base stock, hauls it to the tower and fits it. It takes one of the tower\'s slots (tower_1.tower.freeSlots), the tower level must be able to hold it (tower_1.tower.mounts) and she needs the weapon\'s minCombat Combat skill. A new mount has an empty hopper: fill it with reload(). A posted survivor crews it and it fires by itself at zombies in range.',
    params(args) {
      if (args.length !== 2 || !entityId(args[0]) || typeof args[1] !== 'string' || !args[1]) throw bad('mount', 'use mount(tower_1, \"ballista\")');
      return { targetId: args[0], weapon: args[1] };
    },
  },
  reload: {
    type: 'reload', signature: 'survivor.reload(tower, ammo, amount)',
    doc: 'Pour ammo she carries into the hopper of the mounted weapon(s) on a tower that use it: survivor.take(\"bolts\", 20); survivor.reload(tower_1, \"bolts\", 20). `amount` is optional (1–200): without it she pours in everything that fits. An empty hopper stops a mounted weapon (tower_1.tower.installed[].status is NO_AMMO).',
    params(args) {
      if (args.length < 2 || args.length > 3 || !entityId(args[0]) || typeof args[1] !== 'string' || !args[1]) throw bad('reload', 'use reload(tower_1, \"bolts\", 20)');
      return { targetId: args[0], item: args[1], ...(args.length === 3 ? { amount: optInt('reload', 'amount', args[2], 1, 200) } : {}) };
    },
  },
  lure: {
    type: 'lure', signature: 'survivor.lure(tower)',
    doc: 'Carry a noise lure (survivor.take(\"noise_lure\", 1); screamers sometimes drop one) to a repaired tower and set it off: one lure is spent, the wave\'s attention meter rises and that tower becomes the loudest, so zombies with nobody outside to chase drift toward it. Too much attention (threats.noise.threshold) calls reinforcements.',
    params(args) {
      if (args.length !== 1 || !entityId(args[0])) throw bad('lure', 'use lure(tower_1)');
      return { targetId: args[0] };
    },
  },
  recruit: {
    type: 'recruit', instant: true, global: true, signature: 'town.recruit(offerId, item)',
    doc: 'Hire a survivor the town offers (read town.offers for the ids, stats and prices) and pay for them from base stock. Name an item the town accepts (town.accepts) to pay with it, e.g. town.recruit("offer_1_2", "bread"); with no item it pays with the first of wheat, potato, carrot, bread, wood, stone, hot meal or MRE that covers the price. It works at once or says why not (no such offer, already hired, no free bed, cannot afford); a refusal costs nothing. The new survivor walks in at the gate with the stats you saw.',
    params(args) {
      if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0]) throw bad('recruit', 'use town.recruit("offer_1_1") or town.recruit("offer_1_1", "bread")');
      if (args.length === 2 && (typeof args[1] !== 'string' || !args[1])) throw bad('recruit', 'the payment must be an item name like "bread"');
      return { offerId: args[0], ...(args.length === 2 ? { item: args[1] } : {}) };
    },
  },
  buy: {
    type: 'buy', instant: true, global: true, signature: 'town.buy(goodsId, qty, item)',
    doc: 'Buy goods from the town train while it is in (read town.train.goods for the ids, what is left and the price per item). `qty` is optional (1 or more, up to what is left). Payment is taken from base stock like town.recruit: with no item named, town.buy("train_1_bow") pays with the first of wheat, potato, carrot, bread, wood, stone, hot meal or MRE that covers the price; name an accepted item as the third argument to choose, e.g. town.buy("train_1_arrows", 10, "bread"). The goods go into base stock (equip a weapon with survivor.equip). It works at once or says why not (no train, sold out, storage full, cannot afford); a refusal costs nothing. Goods not bought when the train leaves are gone.',
    params(args) {
      if (args.length < 1 || args.length > 3 || typeof args[0] !== 'string' || !args[0]) throw bad('buy', 'use town.buy("train_1_bow"), town.buy("train_1_arrows", 10) or town.buy("train_1_arrows", 10, "bread")');
      const qty = optInt('buy', 'qty', args[1], 1, 100);
      if (args.length === 3 && (typeof args[2] !== 'string' || !args[2])) throw bad('buy', 'the payment must be an item name like "bread"');
      return { offerId: args[0], ...(qty !== undefined ? { qty } : {}), ...(args.length === 3 ? { item: args[2] } : {}) };
    },
  },
  scavenge: {
    type: 'scavenge', signature: 'survivor.scavenge(siteId)',
    doc: 'Go on an expedition: walk to the gate and leave for a site (read scavenge.sites for the ids, how long the trip takes, the danger today, how much of the site has recovered and what it should yield). She is away for the site\'s ticks, then comes back at the gate with loot that goes into base stock; a looted site yields little until it has regrown, and a dangerous trip can hurt her (half the loot). While she is away she takes no commands. If a zombie wave starts before she is back she is LOST for good: nothing recalls her, so check board.duskInTicks and board.raids before you send anyone.',
    params(args) {
      if (args.length !== 1 || typeof args[0] !== 'string' || !args[0]) throw bad('scavenge', 'use survivor.scavenge(\"roadside_store\") with a site id from scavenge.sites');
      return { siteId: args[0] };
    },
  },
  attack: {
    type: 'attack', signature: 'survivor.attack(zombie)',
    doc: 'Attack a zombie during an active wave. The survivor moves to weapon range and fires or strikes by the weapon reload speed. Melee weapons never gain tower range bonuses. Running out of ammunition stops with NO_AMMO.',
    params(args) {
      if (args.length !== 1 || !entityId(args[0])) throw bad('attack', 'pass a zombie id, e.g. survivor.attack(zombie_1)');
      return { targetId: args[0] };
    },
  },
  guard: {
    type: 'guard', signature: 'survivor.guard(position)',
    doc: 'Stand guard during an active wave and attack the nearest zombie within the equipped weapon range. An optional building or survivor target makes her move to and hold that position. Guard a repaired watchtower (survivor.guard(tower_1)) to be posted on it: ranged weapons reach further.',
    params(args) {
      if (args.length > 1 || (args.length === 1 && !entityId(args[0]))) throw bad('guard', 'use guard() or guard(building_or_survivor)');
      return args.length ? { targetId: args[0] } : {};
    },
  },
};

/** Documented, learner-readable read surface (kept next to the commands so docs can't drift). */
export const READ_SURFACE = [
  'survivor.needs.health / hunger / thirst / energy / morale',
  'survivor.conditions   (e.g. ["hungry","tired"])',
  'survivor.x, survivor.y, survivor.direction, survivor.task, survivor.lastTask   (why the survivor stopped: { type, status, reason, gathered })',
  'survivor.hooks   (event names, e.g. ["hungry"])',
  'survivor.policies   (e.g. { eat: { below: 30 } })',
  'survivor.skillProgress   (per skill: { level, xp, next } - skills grow by practice)',
  'survivor.attributes, survivor.skills, survivor.traits, survivor.inventory   (what she carries)',
  'survivor.carry   ({ load, capacity } in weight units)',
  'survivors   (array of all survivors)',
  'base.wood, base.stone, base.food, base.water, base.wheat, base.bread, base.potato, base.carrot, base.hot_meal, base.mre, base.packaging, base.glass, base.fertilizer, base.charcoal   (available amounts in storage, not what survivors carry)',
  'base.perishables   (food that can spoil, oldest first: [{ item, qty, daysLeft, cold }]; spoiled units are lost - eat or protect them)',
  'base.capacity.wood …   (how much the working storage buildings hold in total)',
  'fence, hq, buildings   (id, type, level, health, maxHealth, condition, x, y)',
  'storage_1.cold   (cold storage: { capacity, factor, working } - the `capacity` oldest food units age `factor` times slower; a freezer (level 3) also has needsPower and powered, and only works while powered)',
  'power   (the grid this tick: { produced, demand, balance, ok, stored, capacity, sun, producers, working } - produced includes power taken from batteries; stored/capacity are the battery bank; sun is the daylight % reaching solar panels)',
  'generator_1.power   (a generator or solar panel: { role, kind, output, producing, status, working, fuel: { item, every, burnLeft, inStock } or null }; a freezer: { role: "consumer", use, powered, status, working }; a battery: { role: "storage", capacity, rate, charge, status, working })',
  'tower_1.tower   (a watchtower: { level, name, slots, freeSlots, rangeBonus, mounts: what it can hold, installed: [{ weapon, name, ammo, hopper, hopperMax, range, damage, reload, power?, status, operator }] mounted weapons, working, posted: [survivor ids] } - a survivor standing next to a working tower (within its slots) is posted: her ranged weapon reaches rangeBonus cells further; the first posted survivors crew the installed mounted weapons (operator), which fire by themselves; status is READY | RELOADING | IDLE | NO_AMMO | NO_OPERATOR | NO_POWER | BROKEN)',
  'well.water   (the deep well\'s reservoir: { amount, capacity, working, recharge: { every, amount, percent, perDay }, siphon: { status, reach, target } or null })',
  'recipes   (what can be cooked or crafted: id -> { name, action: "cook" | "craft", station, stationLevel, inputs, outputs, ticks, skill, power, stationWorking, canAfford })',
  'foods   (what survivor.eat() can eat: item -> { restore, rank, available }; the lowest rank is eaten first by default)',
  'crops   (what can be planted: id -> { name, growthTicks, seeds, yield, hazards, inStock })',
  'field_1.farm   (a farm: { working, sheltered, growth, yield, plots: [{ id, crop, stage: "empty" | "growing" | "ready", percent, water, dry, damage, ready }] })',
  'events   (risk events: { upcoming: [{ day, inDays, id, name, kind, harm }] scheduled soon - the schedule is public, prepare for it; history: [{ day, id, name, outcome, detail }] what has happened })',
  'town   (the town behind the wall: { open, day, opensOnDay, nextBoardInDays, survivors, beds, freeBeds, accepts: item -> { value, inStock }, offers: [{ id, name, attributes, skills, traits, worth, price: item -> units, train, hired, canAfford }] (train: true = came on the train), train: { present, nextArrivalDay, arrivesInDays, leavesInDays, visit, goods: [{ id, item, name, qty, left, worth, price: item -> units, canAfford }] }, history } - offers are public and fixed per seed and day; hire with town.recruit(offerId, item?))',
  'scavenge   (expeditions: { open, opensOnDay, day, sites: [{ id, name, ticks (away), danger, dangerToday (more on a raid day), regrowDays, recoveryPercent (100 = untouched, low = looted recently), lastLootedDay, yield: item -> [min, max] at full recovery, expected: the same scaled by recovery, awayNow }], away: [{ survivorId, siteId, returnTick, returnsInTicks, danger }], lost: [{ id, name, day, siteId }] survivors lost outside during a wave, history: [{ day, survivorId, siteId, outcome: \"clean\" | \"hurt\" | \"empty\", loot, recoveryPercent }] } - a survivor who is away has survivor.status \"away\" and takes no commands until she returns)',
  'board   (everything coming or open: { day, duskInTicks (0 at night), raids: [{ day, inDays, strength }], bosses: [{ day, inDays, boss }], events: [{ day, inDays, id, name }], train: { present, arrivesInDays, leavesInDays }, sites: [{ id, name, ticks, dangerToday, recoveryPercent }], away })',
  'threats   (night raids: { zombies: type -> { name, role, threat, health, damage, speed, armor, firstDay, behaviour? }, bosses: [{ day, inDays, boss, name, escorts }] fixed milestones 4 days ahead, weapons: id -> { name, kind, reach | range, damage, pierce, noise, ammo, reload, craft }, towers: level -> { name, slots, rangeBonus, mounts }, noise: { threshold, reinforceEvery, reinforceCap, decayPerTick, attention (the noise of the wave now), loudest (tower id or null), reinforced (extra zombies it has drawn) }, waveRules, defense: { value, fence } (a rating only), wave: { active, day, gateClosed, breached, wallDamage, remaining, zombies: [{ id, type, x, y, state }] } while a wave is on, loot: { sortieOpen, piles: [{ id, item, qty, x, y, daysLeft }] } zombie loot on the ground (daysLeft = dawns until it is gone, null while its wave is on), upcoming: [{ day, inDays, strength, composition }] public 2 days ahead, history: [{ day, strength, defense, outcome, fenceDamage, lost }] } - a raid starts at dusk as a wave of zombies: the gate closes, they walk to the wall (or to a survivor OUTSIDE it) and hit it until dawn; keep everyone inside before dusk)',
  'nodes   (resource nodes: id, type, resource, amount, x, y)',
  'every building and node is also available by its id: gate, tent_1, storage_1, tree_1 …',
  'world.width, world.height, tick',
  'world.time   ({ day, hour, minute, isNight, season, seasonDay, year })',
  'world.weather   ("clear", "rain", "storm", "heatwave" or "cold"), world.weatherInfo   ({ name, rainfall, hazard })',
  'world.forecast   (the next 7 days, today first: [{ day, inDays, season, weather }] - the calendar is public, plan with it)',
  'world.nextChange   (when the weather next changes: { weather, day, inDays, inTicks })',
  'world.calendar   (this season: { name, days: [{ day, seasonDay, weather, today }] })',
];

/**
 * Validate a call coming out of the sandbox and normalise arguments to plain JSON.
 * Entities (objects with a string `id`) are replaced by their id.
 */
export function normalizeCall(name, args) {
  const cmd = Object.prototype.hasOwnProperty.call(COMMANDS, name) ? COMMANDS[name] : null;
  if (!cmd) throw new AftermathError('UNKNOWN_COMMAND', `survivor.${name}() is not part of the Game API v${API_VERSION}`);
  const isOpts = (v) => cmd.options === true && v && typeof v === 'object' && !Array.isArray(v) && typeof v.id !== 'string';
  const wire = args.map((v) => (v && typeof v === 'object' && typeof v.id === 'string' ? v.id : isOpts(v) ? cleanOptions(name, v) : v));
  for (const v of wire) {
    const t = typeof v;
    if (!(v === undefined || t === 'number' || t === 'string' || t === 'boolean' || (cmd.options === true && t === 'object' && v !== null && !Array.isArray(v)))) throw bad(name, 'arguments must be numbers, text, or game objects');
  }
  while (wire.length && wire[wire.length - 1] === undefined) wire.pop();
  cmd.params(wire); // throws on bad arguments
  return { name, args: wire };
}

/** Command Builder: wire call → versioned Command the simulation accepts. */
export const isInstant = (name) => Object.prototype.hasOwnProperty.call(COMMANDS, name) && COMMANDS[name].instant === true;
export const isHook = (name) => Object.prototype.hasOwnProperty.call(COMMANDS, name) && COMMANDS[name].hook === true;
export const isMarker = (name) => Object.prototype.hasOwnProperty.call(COMMANDS, name) && COMMANDS[name].marker === true;

export function buildCommand(actorId, call) {
  if (isMarker(call.name)) throw new AftermathError('NOT_A_COMMAND', `survivor.${call.name}() is a marker, not a command`);
  const norm = normalizeCall(call.name, call.args ?? []);
  return { apiVersion: API_VERSION, type: COMMANDS[norm.name].type, actorId, params: COMMANDS[norm.name].params(norm.args) };
}

export const describeApi = () => ({
  version: API_VERSION,
  commands: Object.entries(COMMANDS).map(([name, c]) => ({ name, signature: c.signature, doc: c.doc })),
  reads: READ_SURFACE,
});
