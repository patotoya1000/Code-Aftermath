import { AftermathError, createRng, deepFreeze } from '../../kernel/index.js';
import { COMMANDS, normalizeCall } from '../api/index.js';

// Runs INSIDE the worker. Builds the frozen learner environment and executes the code once, synchronously,
// to produce a bounded list of commands (Clock A). It never waits for simulation state (Clock B).

export const DEFAULT_BUDGET = Object.freeze({ maxCommands: 500, maxLogs: 200, timeoutMs: 1500 });

// Names shadowed to `undefined` inside learner code (defence in depth on top of the static check + worker isolation).
const SHADOWED = [
  'globalThis', 'self', 'window', 'process', 'require', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts',
  'postMessage', 'Worker', 'setTimeout', 'setInterval', 'Date', 'performance', 'Function', 'Reflect', 'Proxy',
  'Atomics', 'SharedArrayBuffer', 'WebAssembly', 'indexedDB', 'navigator', 'close',
];

const FunctionCtor = Function; // captured before hardening
let hardened = false;
function harden() {
  if (hardened) return;
  hardened = true;
  // Remove the classic `(()=>{}).constructor("return globalThis")()` escape hatch.
  const protos = [Function.prototype, Object.getPrototypeOf(async function () {}), Object.getPrototypeOf(function* () {})];
  for (const p of protos) Object.defineProperty(p, 'constructor', { value: undefined, configurable: false, writable: false });
}

function seededMath(seed) {
  const rng = createRng(seed);
  const m = {};
  for (const k of Object.getOwnPropertyNames(Math)) m[k] = Math[k];
  m.random = () => rng.next();
  return Object.freeze(m);
}

const fmt = (v) => { try { return typeof v === 'string' ? v : JSON.stringify(v) ?? String(v); } catch { return String(v); } };

export function runLearnerCode({ code, view, seed, budget = DEFAULT_BUDGET, actorId = null }) {
  harden();
  const calls = [];
  const logs = [];

  const record = (actorId, name, args) => {
    if (calls.length >= budget.maxCommands) throw new AftermathError('COMMAND_BUDGET_EXCEEDED', `Too many commands (limit ${budget.maxCommands}). Use fewer or larger commands.`);
    calls.push({ actorId, ...normalizeCall(name, args) });
  };
  const withCommands = (sv) => {
    const o = structuredClone(sv);
    for (const name of Object.keys(COMMANDS)) o[name] = (...args) => record(sv.id, name, args);
    return deepFreeze(o);
  };

  const survivors = view.survivors.map(withCommands);
  const env = {
    survivor: survivors.find((s) => s.id === actorId) ?? survivors[0] ?? null, survivors, base: structuredClone(view.base), fence: view.fence, hq: view.hq,
    buildings: view.buildings, nodes: view.nodes, world: view.world, tick: view.tick,
    console: Object.freeze({ log: (...a) => { if (logs.length < budget.maxLogs) logs.push(a.map(fmt).join(' ')); } }),
    Math: seededMath(seed),
  };
  for (const k of ['base', 'fence', 'hq', 'buildings', 'nodes', 'world']) deepFreeze(env[k]);
  Object.freeze(survivors);
  // Every building and resource node is also readable by its id (tent_1, gate, storage_1, tree_1 …), so the hints the
  // UI shows — survivor.repair(tent_1), survivor.moveTo(tree_1) — are real code. Built-in names always win.
  const taken = new Set([...Object.keys(env), ...SHADOWED]);
  for (const e of [...view.buildings, ...view.nodes]) {
    if (/^[A-Za-z_$][\w$]*$/.test(e.id) && !taken.has(e.id)) { env[e.id] = e; taken.add(e.id); }
  }

  try {
    const names = [...Object.keys(env), ...SHADOWED];
    const fn = new FunctionCtor(...names, '"use strict";' + code);
    fn(...Object.values(env), ...SHADOWED.map(() => undefined));
    return { ok: true, calls, logs, error: null };
  } catch (e) {
    const code_ = e instanceof AftermathError ? e.code : e?.name === 'SyntaxError' ? 'SYNTAX_ERROR' : 'RUNTIME_ERROR';
    return { ok: false, calls: [], logs, error: { code: code_, message: String(e?.message ?? e) } };
  }
}
