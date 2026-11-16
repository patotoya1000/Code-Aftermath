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
    doc: 'Keep gathering that resource in trips: walk to the nearest node, gather `load` (1–20, never more than she can carry), carry it to storage and unload. Stops by itself when storage is full, nothing is left, or the survivor is too tired. Add `total` (1–500) to stop after that many have reached storage.',
    params(args) {
      if (args.length < 1 || args.length > 3 || typeof args[0] !== 'string' || !args[0]) throw bad('gather', 'first argument must be a resource name like "wood"');
      const amount = optInt('gather', 'load', args[1], 1, 20);
      const total = optInt('gather', 'total', args[2], 1, 500);
      if (total !== undefined && amount === undefined) throw bad('gather', 'give a load before a total, e.g. gather("wood", 10, 50)');
      return { resource: args[0], ...(amount !== undefined ? { amount } : {}), ...(total !== undefined ? { total } : {}) };
    },
  },
  deposit: { type: 'deposit', signature: 'survivor.deposit()', doc: 'Walk to the nearest working storage building and unload everything she carries into base stock.', params: (args) => noArgs('deposit', args) },
  rest: {
    type: 'rest', signature: 'survivor.rest(ticks = 20)', doc: 'Rest to recover energy.',
    params(args) {
      if (args.length > 1) throw bad('rest', 'takes at most one argument');
      const ticks = optInt('rest', 'ticks', args[0], 1, 200);
      return ticks === undefined ? {} : { ticks };
    },
  },
  eat: { type: 'eat', signature: 'survivor.eat()', doc: 'Eat one food from base stock to restore hunger.', params: (args) => noArgs('eat', args) },
  drink: { type: 'drink', signature: 'survivor.drink()', doc: 'Drink one water from base stock to restore thirst.', params: (args) => noArgs('drink', args) },
  repair: {
    type: 'repair', signature: 'survivor.repair(building)', doc: 'Walk to a building and repair it (costs wood).',
    params(args) {
      if (args.length !== 1 || !entityId(args[0])) throw bad('repair', 'pass a building, e.g. survivor.repair(fence)');
      return { targetId: args[0] };
    },
  },
  policy: {
    type: 'policy', instant: true, options: true, signature: 'survivor.policy(name, { below, until })',
    doc: 'A standing rule: when the need drops below `below`, pause the current job, do it (\"eat\", \"drink\" or \"rest\"), then go back to the job. rest also takes `until` (stop resting at that energy). Example: survivor.policy(\"eat\", { below: 30 }).',
    params(args) {
      if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0]) throw bad('policy', 'first argument must be \"eat\", \"drink\" or \"rest\"');
      const o = typeof args[1] === 'number' ? { below: args[1] } : args[1] ?? {};
      if (typeof o !== 'object') throw bad('policy', 'second argument must be options like { below: 30 }');
      for (const k of Object.keys(o)) if (k !== 'below' && k !== 'until') throw bad('policy', `unknown option \"${k}\" (use below, until)`);
      const below = optInt('policy', 'below', o.below, 1, 99);
      const until = optInt('policy', 'until', o.until, 2, 100);
      return { action: args[0], ...(below !== undefined ? { below } : {}), ...(until !== undefined ? { until } : {}) };
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
  'survivor.attributes, survivor.skills, survivor.traits, survivor.inventory   (what she carries)',
  'survivor.carry   ({ load, capacity } in weight units)',
  'survivors   (array of all survivors)',
  'base.wood, base.stone, base.food, base.water   (available amounts in storage, not what survivors carry)',
  'base.capacity.wood …   (how much the working storage buildings hold in total)',
  'fence, hq, buildings   (id, type, level, health, maxHealth, condition, x, y)',
  'nodes   (resource nodes: id, type, resource, amount, x, y)',
  'every building and node is also available by its id: gate, tent_1, storage_1, tree_1 …',
  'world.width, world.height, tick',
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
