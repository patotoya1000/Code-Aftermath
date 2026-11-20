import { AftermathError, createEventLog, hashValue, hasOwn, SUPPORTED_API_VERSIONS } from '../../kernel/index.js';
import { applyNeedsDecay } from '../survivors/index.js';
import { timeOf, weatherForDay } from '../environment/index.js';
import { tickWater } from '../water/index.js';
import { tickPower } from '../power/index.js';
import { ageFood } from '../spoilage/index.js';
import { tickFarms, farmDay } from '../farming/index.js';
import { eventDay } from '../events/index.js';
import { recruit, townDay } from '../town/index.js';
import { raidWarning, waveStart, waveDawn, tickWave, lootDawn, tickMounts, mountDemands, tickNoise } from '../threats/index.js';
import { createActionEngine } from '../actions/index.js';
import { studentView, renderProjection, inspectorCard } from '../projection/index.js';

import { setHook, clearHook } from './hooks.js';

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
  const ctx = { state, defs, emit: (type, data) => log.append(state.tick, type, data) };
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
    if (command.type === 'stop') {
      engine.cancelFor(ctx, command.actorId);
      ctx.emit('command.stop', { actorId: command.actorId });
      return null;
    }
    if (command.type === 'policy') { engine.setPolicy(ctx, command.actorId, command.params ?? {}); return null; }
    if (command.type === 'policy_clear') { engine.clearPolicy(ctx, command.actorId, command.params ?? {}); return null; }
    if (command.type === 'recruit') { recruit(ctx, command.params ?? {}); return null; } // W4: hiring is instant and checked before anything changes
    if (command.type === 'hook_register') { setHook(ctx, command.actorId, command.params ?? {}); return null; }
    if (command.type === 'hook_clear') { clearHook(ctx, command.actorId, command.params ?? {}); return null; }
    if (!hasOwn(defs.actions, command.type)) throw new AftermathError('UNKNOWN_ACTION', `Unknown action type ${command.type}`);
    if (command.mode === 'replace') engine.cancelFor(ctx, command.actorId, 'REPLACED');
    return engine.submit(ctx, command);
  }

  const isIdle = () => engine.isIdle(state);

  /** Log the moments the clock/calendar crosses (dawn, dusk, a new weather phase, a new season). Pure derivation: no state. */
  function announceTime() {
    const before = timeOf(defs, state.tick - 1);
    const now = timeOf(defs, state.tick);
    if (before.isNight && !now.isNight) { ctx.emit('time.dawn', { day: now.day }); waveDawn(ctx); lootDawn(ctx, now.day); } // the wave retreats and is resolved at dawn
    if (!before.isNight && now.isNight) { ctx.emit('time.dusk', { day: now.day }); waveStart(ctx, now.day); } // a raid, if one is scheduled, starts as a wave of zombies at dusk
    if (now.day !== before.day) {
      ageFood(ctx, now.day); // food ages once a day, at dawn
      farmDay(ctx, now.day); // today's weather hazard hits unsheltered crops
      raidWarning(ctx, now.day); // announce a raid scheduled `warnDays` ahead
      townDay(ctx, now.day); // announce a new board of recruits when the period changes
      eventDay(ctx, now.day); // warn about a coming risk event, then apply today's (if any)
      const from = weatherForDay(defs, before.day);
      const to = weatherForDay(defs, now.day);
      if (from !== to) ctx.emit('weather.changed', { from, to, day: now.day });
      if (now.season !== before.season) ctx.emit('season.changed', { season: now.season, day: now.day, year: now.year });
    }
  }

  function tickOnce() {
    state.tick += 1;
    announceTime();
    tickFarms(ctx); // crops grow (rain waters them); ripe plots fill their ledger account
    tickPower(ctx, mountDemands(state, defs)); // the grid: solar, then generators (burning fuel only while needed), then consumers (+ mounted weapons about to fire, Z6b)
    tickWater(ctx); // aquifers refill, siphons move water (before survivors act, so a waiting gatherer sees new water at once)
    for (const id of applyNeedsDecay(ctx)) engine.cancelFor(ctx, id, 'ACTOR_DOWNED');
    if (state.tick % cfg.regenEvery === 0 && state.strategyPoints < cfg.max) state.strategyPoints += 1;
    engine.applyPolicies(ctx);
    engine.step(ctx);
    tickMounts(ctx); // Z6b: crewed mounted weapons fire at the nearest zombie in range
    tickNoise(ctx); // Z6c: shots made noise; too much attention brings reinforcements, then it fades
    tickWave(ctx); // the wave's zombies spawn, walk, and hit the wall (after survivors acted this tick)
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
    hooks: () => Object.values(state.hooks).map((h) => ({ ...h })),
    commandTimeline: () => timeline.map((t) => structuredClone(t)),
    stateHash: () => hashValue(state),
    snapshot: () => structuredClone(state),
    studentView: () => studentView(state, defs),
    renderProjection: () => renderProjection(state, defs),
    inspector: (id) => inspectorCard(state, defs, id),
  };
  return api;
}
