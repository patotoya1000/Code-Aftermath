import { AftermathError, API_VERSION } from '../../kernel/index.js';

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
    type: 'gather', signature: 'survivor.gather(resource, amount = 5)',
    doc: 'Walk to the nearest node with that resource and gather up to `amount` (1–20) into base stock.',
    params(args) {
      if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string' || !args[0]) throw bad('gather', 'first argument must be a resource name like "wood"');
      const amount = optInt('gather', 'amount', args[1], 1, 20);
      return amount === undefined ? { resource: args[0] } : { resource: args[0], amount };
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
  stop: { type: 'stop', signature: 'survivor.stop()', doc: 'Cancel this survivor\'s queued and running actions.', params: (args) => noArgs('stop', args) },
};

/** Documented, learner-readable read surface (kept next to the commands so docs can't drift). */
export const READ_SURFACE = [
  'survivor.needs.health / hunger / thirst / energy / morale',
  'survivor.conditions   (e.g. ["hungry","tired"])',
  'survivor.x, survivor.y, survivor.direction, survivor.task',
  'survivor.attributes, survivor.skills, survivor.traits, survivor.inventory',
  'survivors   (array of all survivors)',
  'base.wood, base.stone, base.food, base.water   (available amounts)',
  'fence, hq, buildings   (id, type, level, health, maxHealth, condition, x, y)',
  'nodes   (resource nodes: id, type, resource, amount, x, y)',
  'world.width, world.height, tick',
];

/**
 * Validate a call coming out of the sandbox and normalise arguments to plain JSON.
 * Entities (objects with a string `id`) are replaced by their id.
 */
export function normalizeCall(name, args) {
  const cmd = Object.prototype.hasOwnProperty.call(COMMANDS, name) ? COMMANDS[name] : null;
  if (!cmd) throw new AftermathError('UNKNOWN_COMMAND', `survivor.${name}() is not part of the Game API v${API_VERSION}`);
  const wire = args.map((v) => (v && typeof v === 'object' && typeof v.id === 'string' ? v.id : v));
  for (const v of wire) {
    const t = typeof v;
    if (!(v === undefined || t === 'number' || t === 'string' || t === 'boolean')) throw bad(name, 'arguments must be numbers, text, or game objects');
  }
  while (wire.length && wire[wire.length - 1] === undefined) wire.pop();
  cmd.params(wire); // throws on bad arguments
  return { name, args: wire };
}

/** Command Builder: wire call → versioned Command the simulation accepts. */
export function buildCommand(actorId, call) {
  const norm = normalizeCall(call.name, call.args ?? []);
  return { apiVersion: API_VERSION, type: COMMANDS[norm.name].type, actorId, params: COMMANDS[norm.name].params(norm.args) };
}

export const describeApi = () => ({
  version: API_VERSION,
  commands: Object.entries(COMMANDS).map(([name, c]) => ({ name, signature: c.signature, doc: c.doc })),
  reads: READ_SURFACE,
});
