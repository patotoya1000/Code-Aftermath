import { hashValue, SIM_VERSION, API_VERSION, REPLAY_FORMAT } from '../../kernel/index.js';
import { createInitialState } from '../world/index.js';
import { createSimulation } from '../simulation/index.js';
import { buildCommand } from '../api/index.js';

/**
 * Create a fresh simulation with turn tracking for command-focused free play.
 * Returns { sim, initialView } where sim is a live Simulation you can call
 * submitCommand / startTurn / executeTurn / getTurnInfo on between turns.
 */
export function createFreeSim({ defs, scenarioId = 'stage1', seed = 1 }) {
  const initial = createInitialState({ defs, scenarioId, seed });
  const sim = createSimulation({ defs, state: initial });
  return { sim, initialView: sim.studentView() };
}

/**
 * Advance one turn on a live free-play simulation:
 *   1. Submit each command (respects command budget)
 *   2. Execute the turn (run ticks until idle)
 *   3. Return updated attempt info
 */
export async function advanceTurn(sim, commands = []) {
  // Start a fresh turn: reset command budget, recharge strategy points.
  sim.startTurn();

  const submitted = [];
  const rejected = [];

  for (const { actorId, name, args } of commands) {
    try {
      const command = buildCommand(actorId, { name, args });
      const actionId = sim.submitCommand(command);
      submitted.push({ ok: true, actionId, name, actorId, args });
    } catch (e) {
      submitted.push({ ok: false, name, actorId, args, error: { code: e.code ?? 'ERROR', message: e.message } });
      sim.log.append(sim.tick, 'command.rejected', { actorId, name, code: e.code ?? 'ERROR' });
    }
  }

  const { events, tick } = sim.executeTurn();

  return {
    submitted,
    rejected,
    turnInfo: sim.getTurnInfo(),
    events,
    tick,
    studentView: sim.studentView(),
    renderProjection: sim.renderProjection(),
    stateHash: sim.stateHash(),
  };
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

  const run = await sandbox.run({ code, view: sim.studentView(), seed });
  const sandboxResult = { ok: run.ok, error: run.error, logs: run.logs, violations: run.violations ?? null };

  if (run.ok) {
    for (const call of run.calls) {
      try {
        const command = buildCommand(call.actorId, call);
        const actionId = sim.submit(command);
        commands.push({ accepted: true, actionId, name: call.name, actorId: call.actorId, args: call.args });
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
    ok: run.ok, sandbox: sandboxResult, commands, ticks: sim.tick, timedOut: run.ok && !sim.isIdle(),
    events: sim.log.all(), finalView, checkpoints, frames, finalState: sim.snapshot(),
    eventLogHash: sim.log.hash(), stateHash: sim.stateHash(), initialStateHash, code,
  };
  result.record = {
    format: REPLAY_FORMAT, simVersion: SIM_VERSION, apiVersion: API_VERSION, lessonId, lessonVersion,
    scenarioId, seed, maxTicks, code, initialStateHash, eventLogHash: result.eventLogHash, stateHash: result.stateHash,
  };
  return result;
}
