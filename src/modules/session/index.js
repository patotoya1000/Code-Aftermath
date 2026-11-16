import { hashValue, SIM_VERSION, API_VERSION, REPLAY_FORMAT } from '../../kernel/index.js';
import { createInitialState } from '../world/index.js';
import { createSimulation } from '../simulation/index.js';
import { buildCommand, isMarker, isInstant, isHook } from '../api/index.js';

/**
 * Create a fresh simulation for continuous free play. Returns { sim, initialView }.
 * Nothing runs by itself: the app's clock driver (or a test) calls sim.step().
 */
export function createFreeSim({ defs, scenarioId = 'stage1', seed = 1 }) {
  const initial = createInitialState({ defs, scenarioId, seed });
  const sim = createSimulation({ defs, state: initial });
  return { sim, initialView: sim.studentView() };
}

const rejectedEntry = (call, e) => ({ ok: false, name: call.name, actorId: call.actorId, args: call.args, error: { code: e.code ?? 'ERROR', message: e.message } });

/**
 * Submit already-validated calls from ONE program run to the live simulation.
 * Order rule: for each survivor, the first command REPLACES what that survivor was doing and the rest queue behind it
 * (so a program reads top to bottom). `survivor.queue()` switches a survivor to "append" for the commands after it.
 * Strategy points are charged by the simulation (submitCommand); nothing here counts anything itself.
 */
export function submitCalls(sim, calls = []) {
  const submitted = [];
  const touched = new Set(); // survivors that already got a command in this run
  const appendOnly = new Set();
  for (const call of calls) {
    if (isMarker(call.name)) { if (call.name === 'queue') appendOnly.add(call.actorId); continue; }
    try {
      const command = { ...buildCommand(call.actorId, { name: call.name, args: call.args }), mode: isInstant(call.name) || touched.has(call.actorId) || appendOnly.has(call.actorId) ? 'queue' : 'replace' };
      const actionId = sim.submitCommand(command);
      if (!isInstant(call.name)) touched.add(call.actorId); // policies take effect at once; they are not part of the task order
      submitted.push({ ok: true, actionId, name: call.name, actorId: call.actorId, args: call.args, mode: command.mode });
    } catch (e) {
      submitted.push(rejectedEntry(call, e));
      sim.log.append(sim.tick, 'command.rejected', { actorId: call.actorId, name: call.name, code: e.code ?? 'ERROR' });
    }
  }
  return submitted;
}

/**
 * Free-play code path (same boundary as lessons):
 *   editor text → Safety Validator → Worker → Game API → Command Builder → live simulation.
 * The code runs once against the CURRENT world and only issues commands; the simulation keeps ticking on its own.
 * If the sandbox rejects the code, nothing is submitted and nothing is spent.
 */
export async function runLiveCode({ sim, sandbox, code, actorId = null }) {
  const run = await sandbox.run({ code, view: sim.studentView(), seed: sim.seed, actorId });
  if (!run.ok) {
    return { ok: false, error: run.error, violations: run.violations ?? null, logs: run.logs ?? [], submitted: [], clockInfo: sim.getClockInfo() };
  }
  const submitted = submitCalls(sim, run.calls);
  return { ok: true, error: null, violations: null, logs: run.logs, submitted, clockInfo: sim.getClockInfo() };
}

/**
 * Learner event hooks (R4b): react to world events with learner code.
 * Each pump() reads the events that happened since the last one and, for every registered hook that matches (and is not
 * cooling down), runs the handler in the sandbox Worker with a FRESH frozen view. The handler can only issue commands;
 * they go through submitCalls like any program (strategy points, timeline), so replay needs no hook code at all.
 * A hook that throws or never finishes is switched off (until it is registered again) and reported as hook.failed.
 */
export function createHookRunner({ sim, sandbox, defs }) {
  const { events: EVENTS, limits } = defs.hooks;
  let cursor = sim.log.length;
  let busy = false;
  const conds = {};      // survivorId -> Set of conditions last seen (so "hungry" fires when she BECOMES hungry)
  const lastFired = {};  // hook id -> tick
  const disabled = new Map(); // hook id -> registeredAtTick that failed
  for (const v of sim.studentView().survivors) conds[v.id] = new Set(v.conditions);

  function triggersFrom(fresh) {
    const out = [];
    for (const e of fresh) {
      if (e.type === 'survivor.conditions_changed') {
        const prev = conds[e.survivorId] ?? new Set();
        const now = new Set(e.conditions);
        for (const c of now) if (!prev.has(c)) for (const [name, rule] of Object.entries(EVENTS)) if (rule.on === 'condition' && rule.condition === c) out.push({ actorId: e.survivorId, event: name, info: { event: name } });
        conds[e.survivorId] = now;
      } else if (e.type === 'task.stopped' || e.type === 'action.failed') {
        for (const [name, rule] of Object.entries(EVENTS)) if (rule.on === 'stopped') out.push({ actorId: e.actorId, event: name, info: { event: name, reason: e.reason ?? null, task: e.taskType ?? e.actionType ?? null } });
      }
    }
    return out;
  }

  async function pump() {
    if (busy) return [];
    busy = true;
    const results = [];
    try {
      const fresh = sim.log.since(cursor);
      cursor += fresh.length;
      const triggers = triggersFrom(fresh);
      if (!triggers.length) return results;
      for (const t of triggers) {
        const hook = sim.hooks().find((h) => h.actorId === t.actorId && h.event === t.event);
        if (!hook || disabled.get(hook.id) === hook.registeredAtTick) continue;
        if (sim.tick - (lastFired[hook.id] ?? -Infinity) < limits.cooldownTicks) continue;
        lastFired[hook.id] = sim.tick;
        const code = `const __event = ${JSON.stringify(t.info)};\nconst __hook = (${hook.source});\n__hook(__event);`;
        const run = await sandbox.run({ code, view: sim.studentView(), seed: sim.seed, actorId: hook.actorId, maxCommands: limits.maxCommands, allowHooks: false });
        if (!run.ok) {
          disabled.set(hook.id, hook.registeredAtTick);
          sim.log.append(sim.tick, 'hook.failed', { actorId: hook.actorId, event: hook.event, code: run.error?.code ?? 'ERROR', message: run.error?.message ?? '' });
          results.push({ ok: false, hook: hook.id, error: run.error });
          continue;
        }
        const submitted = submitCalls(sim, run.calls);
        sim.log.append(sim.tick, 'hook.ran', { actorId: hook.actorId, event: hook.event, commands: submitted.filter((s) => s.ok).length });
        results.push({ ok: true, hook: hook.id, submitted });
      }
    } finally { busy = false; }
    return results;
  }
  return { pump, get busy() { return busy; } };
}

/**
 * Rebuild a live session from its record: same scenario + seed + the commands at the ticks they were issued.
 * Because the simulation is a deterministic tick counter, the result is identical to the original — at any speed.
 */
export function replayTimeline({ defs, scenarioId = 'stage1', seed = 1, timeline, untilTick }) {
  const { sim } = createFreeSim({ defs, scenarioId, seed });
  for (const { tick, command } of timeline) {
    if (tick > sim.tick) sim.step(tick - sim.tick);
    sim.submitCommand(command);
  }
  if (untilTick > sim.tick) sim.step(untilTick - sim.tick);
  return sim;
}

/**
 * R5: Replay a lesson from its recorded timeline. Uses sim.submit (no strategy-point charging) because lessons
 * run in an isolated simulation. Returns the sim so callers can compare stateHash() with the original attempt.
 */
export function replayLesson({ defs, scenarioId = 'stage1', seed = 1, timeline, untilTick }) {
  const { sim } = createFreeSim({ defs, scenarioId, seed });
  for (const { tick, command } of timeline) {
    if (tick > sim.tick) sim.step(tick - sim.tick);
    sim.submit(command);
  }
  if (untilTick > sim.tick) sim.step(untilTick - sim.tick);
  return sim;
}

/**
 * One learner attempt, end to end:
 *   code → Sandbox (Clock A) → Game API → Command Builder → Action Queue → Simulation ticks (Clock B)
 *   → Event Log → result for the Lesson Validator.
 * Every attempt starts from a fresh scenario state, so a failed attempt can never damage persistent progress.
 */
export async function runAttempt({
  defs, sandbox, code, scenarioId = 'stage1', seed = 1, maxTicks = 600,
  captureFrames = false, checkpointEvery = 25, lessonId = null, lessonVersion = null,
}) {
  const initial = createInitialState({ defs, scenarioId, seed });
  const initialStateHash = hashValue(initial);
  const sim = createSimulation({ defs, state: initial });
  const frames = captureFrames ? [sim.renderProjection()] : [];
  const checkpoints = [{ tick: 0, view: sim.studentView() }];
  const commands = [];
  const lessonTimeline = []; // R5: lesson commands in (tick, command) format for replay

  const run = await sandbox.run({ code, view: sim.studentView(), seed });
  const sandboxResult = { ok: run.ok, error: run.error, logs: run.logs, violations: run.violations ?? null };

  if (run.ok) {
    for (const call of run.calls) {
      if (isMarker(call.name)) continue; // lessons already queue in order
      if (isHook(call.name)) { // hooks need the live world; lessons run to completion in one go
        commands.push({ accepted: false, name: call.name, actorId: call.actorId, args: call.args, error: { code: 'HOOKS_FREE_PLAY_ONLY', message: `survivor.${call.name}() works in free play, not inside lessons yet.` } });
        sim.log.append(sim.tick, 'command.rejected', { actorId: call.actorId, name: call.name, code: 'HOOKS_FREE_PLAY_ONLY' });
        continue;
      }
      try {
        const command = buildCommand(call.actorId, call);
        const actionId = sim.submit(command);
        commands.push({ accepted: true, actionId, name: call.name, actorId: call.actorId, args: call.args });
        lessonTimeline.push({ tick: sim.tick, command: structuredClone(command) }); // R5: record for timeline replay
      } catch (e) {
        commands.push({ accepted: false, name: call.name, actorId: call.actorId, args: call.args, error: { code: e.code ?? 'ERROR', message: e.message } });
        sim.log.append(sim.tick, 'command.rejected', { actorId: call.actorId, name: call.name, code: e.code ?? 'ERROR' });
      }
    }
    while (!sim.isIdle() && sim.tick < maxTicks) {
      sim.step(1);
      if (captureFrames) frames.push(sim.renderProjection());
      if (sim.tick % checkpointEvery === 0) checkpoints.push({ tick: sim.tick, view: sim.studentView() });
    }
  }

  const finalView = sim.studentView();
  if (checkpoints[checkpoints.length - 1].tick !== sim.tick) checkpoints.push({ tick: sim.tick, view: finalView });

  const result = {
    ok: run.ok, sandbox: sandboxResult, commands, lessonTimeline, ticks: sim.tick, timedOut: run.ok && !sim.isIdle(),
    events: sim.log.all(), finalView, checkpoints, frames, finalState: sim.snapshot(),
    eventLogHash: sim.log.hash(), stateHash: sim.stateHash(), initialStateHash, code,
  };
  result.record = {
    format: REPLAY_FORMAT, simVersion: SIM_VERSION, apiVersion: API_VERSION, lessonId, lessonVersion,
    scenarioId, seed, maxTicks, code, initialStateHash, eventLogHash: result.eventLogHash, stateHash: result.stateHash,
  };
  return result;
}
