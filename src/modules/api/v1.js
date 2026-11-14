import { AftermathError, API_VERSION } from '../../kernel/index.js';
import { validateSource } from './safety.js';

// Game API v1: the ONLY bridge between learner code and the simulation. Each command has a documented
// contract; arguments are validated here before they ever become a Command.
const bad = (name, msg) => new AftermathError('INVALID_ARGUMENT', `${name}(): ${msg}`);
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
    doc: 'Keep gathering that resource in trips of `load` (1–20) into base stock. Stops by itself when storage is full, nothing is left, or the survivor is too tired. Add `total` (1–500) to stop after that many.',
    params(args) {
      if (args.length < 1 || args.length > 3 || typeof args[0] !== 'string' || !args[0]) throw bad('gather', 'first argument must be a resource name like "wood"');
      const amount = optInt('gather', 'load', args[1], 1, 20);
      const total = optInt('gather', 'total', args[2], 1, 500);
      if (total !== undefined && amount === undefined) throw bad('gather', 'give a load before a total, e.g. gather("wood", 10, 50)');
      return { resource: args[0], ...(amount !== undefined ? { amount } : {}), ...(total !== undefined ? { total } : {}) };
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
  eat: { type: 'eat', signature: 'survivor.eat()', doc: 'Eat one food from base stock to restore hunger.', params: (args) => noArgs('eat', args) },
  drink: { type: 'drink', signature: 'survivor.drink()', doc: 'Drink one water from base stock to restore thirst.', params: (args) => noArgs('drink', args) },
  repair: {
    type: 'repair', signature: 'survivor.repair(building)', doc: 'Walk to a building and repair it (costs wood).',
    params(args) {
      if (args.length !== 1 || !entityId(args[0])) throw bad('repair', 'pass a building, e.g. survivor.repair(fence)');
      return { targetId: args[0] };
    },
  },
  // A marker, not an action: it costs nothing and is consumed by the session. By default the FIRST command a program
  // gives a survivor replaces whatever that survivor was doing, and the rest queue behind it. After queue(), even the
  // first command is added to the end of the survivor's queue instead.
  queue: { type: null, marker: true, signature: 'survivor.queue()', doc: 'Add the commands that follow to the END of this survivor\'s queue instead of replacing the current task.', params: (args) => noArgs('queue', args) },
  // R4a — standing reaction to a need. Configuration, not work: it never counts as the program's "first command"
  // (so it does not stop the next command from replacing the survivor's current job). Ranges are checked by the simulation
  // (they live in definitions/data, not here).
  policy: {
    type: 'policy', config: true, acceptsOptions: true, signature: 'survivor.policy(name, { below })',
    doc: 'React by yourself: when the need drops BELOW the number, pause the current job, run the survival action, then resume the job. Names: "eat" (hunger), "drink" (thirst), "rest" (energy). Example: survivor.policy("eat", { below: 30 }). Costs 1 strategy point and stays until cleared.',
    params(args) {
      if (args.length !== 2 || typeof args[0] !== 'string' || !args[0]) throw bad('policy', 'use policy(name, { below: number }), e.g. survivor.policy("eat", { below: 30 })');
      const o = args[1];
      if (!o || typeof o !== 'object' || Array.isArray(o) || !Object.hasOwn(o, 'below')) throw bad('policy', 'second argument must look like { below: 30 }');
      if (Object.keys(o).some((k) => k !== 'below')) throw bad('policy', 'only { below } is understood');
      if (!Number.isInteger(o.below)) throw bad('policy', 'below must be a whole number');
      return { name: args[0], below: o.below };
    },
  },
  clearPolicy: {
    type: 'clearPolicy', config: true, signature: 'survivor.clearPolicy(name)',
    doc: 'Remove a policy. An action it already started (for example a meal) finishes normally.',
    params(args) {
      if (args.length !== 1 || typeof args[0] !== 'string' || !args[0]) throw bad('clearPolicy', 'pass the policy name, e.g. survivor.clearPolicy("eat")');
      return { name: args[0] };
    },
  },
  stop: { type: 'stop', signature: 'survivor.stop()', doc: 'Cancel this survivor\'s queued and running actions.', params: (args) => noArgs('stop', args) },
  // R4b — learner event hooks. Configuration commands: cost 1 strategy point, recorded in the command timeline
  // for deterministic replay, never count as the program's "first command".
  on: {
    type: 'hook', config: true, acceptsFunctions: true,
    signature: 'survivor.on(eventName, handler)',
    doc: 'React to an event: when eventName fires, run handler. Handler may only issue commands. Names: "hungry", "thirsty", "tired", "stopped". Costs 1 strategy point per command the handler issues.',
    params(args) {
      if (args.length !== 2 || typeof args[0] !== 'string' || !args[0]) throw bad('on', 'use on(eventName, handler)');
      const event = args[0];
      const valid = ['hungry', 'thirsty', 'tired', 'stopped'];
      if (!valid.includes(event)) throw bad('on', `unknown event "${event}". Use ${valid.join(', ')}.`);
      const handler = args[1];
      if (typeof handler !== 'function') throw bad('on', 'second argument must be a function');
      const source = handler.toString();
      if (/\b(while|for)\s*\(/.test(source)) throw bad('on', 'handler must not contain loops');
      const check = validateSource(source);
      if (!check.ok) throw bad('on', 'handler failed safety check: ' + check.violations.map((v) => v.message).join('; '));
      return { event, handlerSource: source };
    },
  },
  off: {
    type: 'unhook', config: true,
    signature: 'survivor.off(eventName)',
    doc: 'Remove a hook for eventName. Costs 1 strategy point.',
    params(args) {
      if (args.length !== 1 || typeof args[0] !== 'string' || !args[0]) throw bad('off', 'pass the event name, e.g. off("hungry")');
      return { event: args[0] };
    },
  },
};

/** Documented, learner-readable read surface (kept next to the commands so docs can't drift). */
export const READ_SURFACE = [
  'survivor.needs.health / hunger / thirst / energy / morale',
  'survivor.conditions   (e.g. ["hungry","tired"])',
  'survivor.x, survivor.y, survivor.direction, survivor.task, survivor.lastTask   (why the survivor stopped: { type, status, reason, gathered })',
  'survivor.attributes, survivor.skills, survivor.traits, survivor.inventory',
  'survivor.policies   (your standing reactions, e.g. { eat: { below: 30 } })',
  'survivors   (array of all survivors)',
  'base.wood, base.stone, base.food, base.water   (available amounts)',
  'fence, hq, buildings   (id, type, level, health, maxHealth, condition, x, y)',
  'nodes   (resource nodes: id, type, resource, amount, x, y)',
  'every building and node is also available by its id: gate, tent_1, storage_1, tree_1 …',
  'world.width, world.height, tick',
];

const isPlainOptions = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
/** A small `{ key: number|text|boolean }` options object → fresh plain data (own enumerable keys only, no prototype tricks). */
function plainOptions(name, v) {
  const entries = Object.entries(v);
  if (entries.length > 4) throw bad(name, 'options object has too many keys');
  for (const [, x] of entries) if (!['number', 'string', 'boolean'].includes(typeof x)) throw bad(name, 'option values must be numbers, text, or true/false');
  return Object.fromEntries(entries);
}

/**
 * Validate a call coming out of the sandbox and normalise arguments to plain JSON.
 * Entities (objects with a string `id`) are replaced by their id.
 */
export function normalizeCall(name, args) {
  const cmd = Object.prototype.hasOwnProperty.call(COMMANDS, name) ? COMMANDS[name] : null;
  if (!cmd) throw new AftermathError('UNKNOWN_COMMAND', `survivor.${name}() is not part of the Game API v${API_VERSION}`);
  const wire = args.map((v) => {
    if (v && typeof v === 'object' && typeof v.id === 'string') return v.id;
    if (cmd.acceptsOptions && isPlainOptions(v)) return plainOptions(name, v);
    return v;
  });
  for (const v of wire) {
    const t = typeof v;
    const isOptions = v !== null && t === 'object' && !Array.isArray(v) && cmd.acceptsOptions;
    const okType = v === undefined || t === 'number' || t === 'string' || t === 'boolean' || isOptions || (cmd.acceptsFunctions && t === 'function');
    if (!okType) throw bad(name, cmd.acceptsOptions ? 'arguments must be numbers, text, game objects, or a { name: value } options object' : 'arguments must be numbers, text, or game objects');
  }
  while (wire.length && wire[wire.length - 1] === undefined) wire.pop();
  cmd.params(wire); // throws on bad arguments
  return { name, args: wire };
}

/** Command Builder: wire call → versioned Command the simulation accepts. */
export const isMarker = (name) => Object.prototype.hasOwnProperty.call(COMMANDS, name) && COMMANDS[name].marker === true;
/** Configuration commands (policy/clearPolicy) change standing rules, not work: they never count as a program's first command. */
export const isConfig = (name) => Object.prototype.hasOwnProperty.call(COMMANDS, name) && COMMANDS[name].config === true;

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
