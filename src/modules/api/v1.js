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
    doc: 'Walk to a repaired kitchen and cook a recipe in batches, e.g. survivor.cook("bread", 5). Ingredients (and fuel) come from base stock; the result goes back into it. Stops by itself when `count` batches are done, the next batch cannot be paid for, storage is full or she is too tired. With no count she keeps cooking until one of those happens. See recipes for what each needs.',
    params(args) {
      if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0]) throw bad('cook', 'first argument must be a recipe name like "bread"');
      const count = optInt('cook', 'count', args[1], 1, 100);
      return { recipe: args[0], ...(count !== undefined ? { count } : {}) };
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
  'base.wood, base.stone, base.food, base.water, base.wheat, base.bread   (available amounts in storage, not what survivors carry)',
  'base.perishables   (food that can spoil, oldest first: [{ item, qty, daysLeft, cold }]; spoiled units are lost - eat or protect them)',
  'base.capacity.wood …   (how much the working storage buildings hold in total)',
  'fence, hq, buildings   (id, type, level, health, maxHealth, condition, x, y)',
  'storage_1.cold   (a cold cellar: { capacity, factor, working } - the `capacity` oldest food units age `factor` times slower)',
  'well.water   (the deep well\'s reservoir: { amount, capacity, working, recharge: { every, amount, percent, perDay }, siphon: { status, reach, target } or null })',
  'recipes   (what can be cooked: id -> { name, station, stationLevel, inputs, outputs, ticks, skill, stationWorking, canAfford })',
  'foods   (what survivor.eat() can eat: item -> { restore, rank, available }; the lowest rank is eaten first by default)',
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
