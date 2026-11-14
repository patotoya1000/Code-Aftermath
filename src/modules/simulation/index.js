import { AftermathError, createEventLog, hashValue, hasOwn, SUPPORTED_API_VERSIONS } from '../../kernel/index.js';
import { applyNeedsDecay } from '../survivors/index.js';
import { createActionEngine, runPolicies } from '../actions/index.js';
import { buildCommand, normalizeCall, COMMANDS } from '../api/index.js';
import { studentView, renderProjection, inspectorCard } from '../projection/index.js';

export { createClockDriver } from './clock.js';

const MODES = [undefined, 'queue', 'replace'];

/**
 * The simulation is the ONLY writer of GameState. The state object lives in this closure; the outside
 * world gets commands in (submit), time (step) and frozen projections out.
 *
 * Time is continuous: the world just keeps ticking. Survivors keep working on their standing actions until those
 * stop by themselves (storage full, nothing left, too tired) or a new command takes over. There are no turns.
 */
export function createSimulation({ defs, state, log = createEventLog() }) {
  const engine = createActionEngine(defs);
  state._replaying = state._replaying ?? false; // replay runs hooks only from the timeline, not live
  const tickEvents = []; // events emitted during the current tick, consumed by runHooks
  const ctx = { state, defs, emit: (type, data) => { log.append(state.tick, type, data); tickEvents.push({ type, data }); } };
  const cfg = defs.clock.strategy;
  const timeline = []; // free-play commands with the tick they were issued at: the replay input for a live session

  /**
   * Queue a command. mode 'queue' (default) adds it behind whatever the survivor is doing; mode 'replace' first
   * cancels the survivor's current and queued work (this is what a new program's first command does).
   */
  function submit(command) {
    if (!command || typeof command !== 'object') throw new AftermathError('INVALID_COMMAND', 'Command must be an object');
    if (!SUPPORTED_API_VERSIONS.includes(command.apiVersion)) throw new AftermathError('UNSUPPORTED_API_VERSION', `API version ${command.apiVersion} is not supported`);
    if (!hasOwn(state.survivors, command.actorId)) throw new AftermathError('UNKNOWN_ACTOR', `Unknown actor ${command.actorId}`);
    if (!MODES.includes(command.mode)) throw new AftermathError('INVALID_COMMAND', `Unknown command mode ${command.mode}`);
    if (command.type === 'policy' || command.type === 'clearPolicy') return setPolicy(command);
    if (command.type === 'hook') return setHook(command);
    if (command.type === 'unhook') return clearHook(command);
    if (command.type === 'stop') {
      engine.cancelFor(ctx, command.actorId);
      ctx.emit('command.stop', { actorId: command.actorId });
      return null;
    }
    if (!hasOwn(defs.actions, command.type)) throw new AftermathError('UNKNOWN_ACTION', `Unknown action type ${command.type}`);
    if (command.mode === 'replace') engine.cancelFor(ctx, command.actorId, 'REPLACED');
    return engine.submit(ctx, command);
  }

  /**
   * Set or clear a needs policy. Validated here (the simulation is the authority; ranges and names come from definitions)
   * BEFORE anything changes, so a rejected policy command costs nothing. It takes effect on the next tick.
   */
  function setPolicy(command) {
    const { name, below } = command.params ?? {};
    const def = hasOwn(defs.policies.list, name) ? defs.policies.list[name] : null;
    if (!def) throw new AftermathError('INVALID_POLICY', `Unknown policy \"${name}\". Available: ${Object.keys(defs.policies.list).join(', ')}.`);
    const who = state.survivors[command.actorId];
    if (command.type === 'clearPolicy') {
      if (hasOwn(who.policies, name)) { delete who.policies[name]; ctx.emit('policy.cleared', { actorId: who.id, policy: name }); }
      return null;
    }
    const { minBelow, maxBelow } = defs.policies.rules;
    if (!Number.isInteger(below) || below < minBelow || below > maxBelow) throw new AftermathError('INVALID_POLICY', `Policy \"${name}\": below must be a whole number from ${minBelow} to ${maxBelow}.`);
    who.policies[name] = { below, retryAt: 0 };
    ctx.emit('policy.set', { actorId: who.id, policy: name, need: def.need, below });
    return null;
  }

  let hookCounter = 0;
  const HOOK_EVENTS = ['hungry', 'thirsty', 'tired', 'stopped'];

  /** Register a learner event hook. Validated before anything changes; rejected hooks cost nothing. */
  function setHook(command) {
    const { event, handlerSource } = command.params ?? {};
    if (typeof event !== 'string' || !HOOK_EVENTS.includes(event)) throw new AftermathError('INVALID_HOOK', `Unknown hook event "${event}". Use ${HOOK_EVENTS.join(', ')}.`);
    if (typeof handlerSource !== 'string' || !handlerSource) throw new AftermathError('INVALID_HOOK', 'Hook handler source must be non-empty text.');
    const who = state.survivors[command.actorId];
    if (!who.hooks) who.hooks = {};
    if (!who.hooks[event]) who.hooks[event] = [];
    if (who.hooks[event].some((h) => h.handlerSource === handlerSource)) return null; // duplicate, no-op
    who.hooks[event].push({ id: ++hookCounter, event, handlerSource });
    ctx.emit('hook.set', { actorId: who.id, event });
    return null;
  }

  /** Remove all learner hooks for an event. */
  function clearHook(command) {
    const { event } = command.params ?? {};
    if (typeof event !== 'string') throw new AftermathError('INVALID_HOOK', 'pass the event name, e.g. off("hungry")');
    const who = state.survivors[command.actorId];
    if (who.hooks && who.hooks[event] && who.hooks[event].length > 0) {
      const count = who.hooks[event].length;
      who.hooks[event] = [];
      ctx.emit('hook.cleared', { actorId: who.id, event, count });
    }
    return null;
  }

  const isIdle = () => engine.isIdle(state);

  function tickOnce() {
    tickEvents.length = 0;
    state.tick += 1;
    for (const id of applyNeedsDecay(ctx)) engine.cancelFor(ctx, id, 'ACTOR_DOWNED');
    if (state.tick % cfg.regenEvery === 0 && state.strategyPoints < cfg.max) state.strategyPoints += 1;
    runPolicies(ctx, engine); // R4a: needs policies react to the new needs BEFORE actions advance
    if (!state._replaying) runHooks(ctx, engine); // R4b: learner event hooks react to this tick's events
    engine.step(ctx);
  }

  /** R4b: run learner hooks for events emitted this tick. Hook handlers run with a frozen view and may only issue commands. */
  function runHooks(ctx, engine) {
    const { state } = ctx;
    const MAX_HOOK_COMMANDS = 5; // per-hook execution budget: a runaway hook cannot spam commands forever

    for (const { type, data } of tickEvents) {
      const actorId = data.actorId || data.survivorId;
      if (!actorId || !hasOwn(state.survivors, actorId)) continue;
      const hooks = state.survivors[actorId].hooks;
      if (!hooks) continue;

      const matched = matchHookEvents(type, data);
      for (const eventName of matched) {
        const eventHooks = hooks[eventName];
        if (!eventHooks || eventHooks.length === 0) continue;
        for (const hook of [...eventHooks]) executeHook(ctx, engine, actorId, hook, MAX_HOOK_COMMANDS);
      }
    }
  }

  /** Map a simulation event to the hook event names it triggers. */
  function matchHookEvents(type, data) {
    const matched = [];
    if (type === 'survivor.conditions_changed') {
      for (const c of (data.conditions ?? [])) {
        if (c === 'hungry' || c === 'thirsty' || c === 'tired') matched.push(c);
      }
    } else if (type === 'action.completed' || type === 'action.failed' || type === 'action.cancelled') {
      matched.push('stopped');
    }
    return matched;
  }

  /** Execute one hook: build a frozen command-recording view, evaluate the handler source, submit resulting commands. */
  function executeHook(ctx, engine, actorId, hook, maxCommands) {
    const { state } = ctx;
    const who = state.survivors[actorId];
    if (!who) return;

    let hookCommands = 0;
    const calls = [];

    const record = (name, args) => {
      if (hookCommands >= maxCommands) throw new AftermathError('COMMAND_BUDGET_EXCEEDED', `Hook "${hook.event}" exceeded command budget (${maxCommands}).`);
      hookCommands += 1;
      calls.push({ actorId, ...normalizeCall(name, args) });
    };

    const withCommands = (sv) => {
      const o = structuredClone(sv);
      for (const name of Object.keys(COMMANDS)) o[name] = (...args) => record(name, args);
      return Object.freeze(o);
    };

    const view = Object.freeze({ survivor: withCommands(who), tick: state.tick });

    try {
      // The handler source closes over `survivor` (and `tick`) from this function's parameters.
      new Function('survivor', 'tick', '"use strict"; (' + hook.handlerSource + ')(survivor, tick);')(view.survivor, view.tick);
    } catch (e) {
      // Budget exceeded while the handler was running is a stop condition, not a code error.
      if (e.code === 'COMMAND_BUDGET_EXCEEDED') {
        ctx.emit('hook.stopped', { actorId, event: hook.event, reason: 'COMMAND_BUDGET_EXCEEDED' });
      } else {
        ctx.emit('hook.error', { actorId, event: hook.event, error: String(e?.message ?? e) });
      }
      return; // isolate: one hook's failure never crashes the simulation or other hooks
    }

    for (const call of calls) {
      try {
        const command = buildCommand(actorId, call);
        submitCommand({ ...command, mode: 'queue' });
      } catch (e) {
        ctx.emit('hook.stopped', { actorId, event: hook.event, reason: e.code ?? 'ERROR' });
        return; // out of strategy points or command rejected: stop this hook gracefully
      }
    }
  }

  /** Clock + strategy-point info for the UI. */
  function getClockInfo() {
    return {
      tick: state.tick, strategyPoints: state.strategyPoints, maxStrategyPoints: cfg.max,
      regenEvery: cfg.regenEvery, ticksPerSecond: defs.clock.ticksPerSecond,
    };
  }

  /**
   * Submit a learner command if there are strategy points for it (1 each; they regenerate with time). A command the
   * simulation refuses must not cost anything: submit() throws before it mutates anything.
   */
  function submitCommand(command) {
    if (state.strategyPoints < 1) throw new AftermathError('INSUFFICIENT_STRATEGY_POINTS', 'Not enough strategy points to issue a command. They come back over time.');
    const actionId = submit(command);
    state.strategyPoints -= 1;
    timeline.push({ tick: state.tick, command: structuredClone(command) });
    return actionId;
  }

  /** Step until `predicate(sim)` is true or `maxTicks` ticks have passed. Replaces "run until idle" for open-ended work. */
  function runUntil(predicate, maxTicks = 600) {
    const start = state.tick;
    while (!predicate(api) && state.tick - start < maxTicks) tickOnce();
    return { reached: Boolean(predicate(api)), ticks: state.tick - start };
  }

  const api = {
    log,
    submit,
    submitCommand,
    getClockInfo,
    runUntil,
    step(n = 1) { for (let i = 0; i < n; i++) tickOnce(); },
    get tick() { return state.tick; },
    get seed() { return state.seed; },
    get scenarioId() { return state.scenarioId; },
    isIdle,
    commandTimeline: () => timeline.map((t) => structuredClone(t)),
    // _replaying is an internal execution flag (hooks replay from the timeline, not live). It is not part of
    // the game state, so it must not factor into the state hash used to verify replays and save integrity.
    stateHash: () => { const { _replaying, ...rest } = state; return hashValue(rest); },
    // snapshot excludes _replaying (an internal execution flag, not game state) so that JSON save/load round-trips
    // hash identically to the live stateHash used for replay and save-integrity checks.
    snapshot: () => { const { _replaying, ...rest } = state; return structuredClone(rest); },
    studentView: () => studentView(state, defs),
    renderProjection: () => renderProjection(state, defs),
    inspector: (id) => inspectorCard(state, defs, id),
    setReplaying: (v) => { state._replaying = !!v; },
  };
  return api;
}
