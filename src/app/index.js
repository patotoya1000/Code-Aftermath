// Composition root: the ONE place where modules are wired together into the running app (the monolith).
import { createDefinitions } from '../modules/definitions/index.js';
import { createSandbox } from '../modules/sandbox/index.js';
import { runLesson, listLessons } from '../modules/lessons/index.js';
import { runAttempt, createFreeSim, runLiveCode, replayTimeline, submitCalls } from '../modules/session/index.js';
import { createClockDriver } from '../modules/simulation/index.js';
import { verifyReplay } from '../modules/replay/index.js';
import { describeApi } from '../modules/api/index.js';
import { createSaveStore, createMemoryAdapter, emptyProgress, recordLessonResult } from '../modules/persistence/index.js';

export function createApp({ adapter = createMemoryAdapter(), sandbox = createSandbox(), defs = createDefinitions(), clock = () => 0 } = {}) {
  const store = createSaveStore(adapter, { clock });
  let progress = emptyProgress();
  let lastAttempt = null;

  return {
    defs,
    apiDocs: describeApi(),
    lessons: listLessons(defs),
    get progress() { return progress; },
    get lastAttempt() { return lastAttempt; },

    /** Run a lesson. Progress only ever grows on a pass; the attempt itself is throwaway. */
    async runLesson(lessonId, code) {
      const out = await runLesson({ defs, sandbox, lessonId, code });
      lastAttempt = out.attempt;
      progress = recordLessonResult(progress, out.evaluation, { commandCount: out.attempt.commands.length });
      return out;
    },
    /** Free-play run on any scenario (no lesson, no progress). */
    async runSandbox(code, { scenarioId = 'stage1', seed = 1, maxTicks = 600 } = {}) {
      lastAttempt = await runAttempt({ defs, sandbox, code, scenarioId, seed, maxTicks, captureFrames: true });
      return lastAttempt;
    },
    /** Create a fresh free-play simulation. It does not run until a clock driver (or a test) steps it. */
    createFreeSim({ scenarioId = 'stage1', seed = 1 } = {}) {
      return createFreeSim({ defs, scenarioId, seed });
    },
    /** Real-time driver for a free-play sim: play/pause/speed and frame pacing, numbers from defs.clock. */
    createClock(sim) {
      return createClockDriver(sim, defs.clock);
    },
    /** Free-play editor path: code → sandbox Worker → Game API → live simulation (commands start working at once). */
    async runCode(sim, code, { actorId = null } = {}) {
      return runLiveCode({ sim, sandbox, code, actorId });
    },
    /** Run code through sandbox, submit commands, advance turn, return results. */
    async runTurnCode(sim, code) {
      const run = await sandbox.run({ code, view: sim.studentView(), seed: sim.seed, actorId: sim.survivors?.[0]?.id });
      if (!run.ok) {
        return { ok: false, error: run.error, violations: run.violations ?? null, submitted: [], turnInfo: sim.getTurnInfo() };
      }
      const submitted = submitCalls(sim, run.calls);
      sim.strategyPoints = sim.defs.clock.strategy.start;
      sim.turn = (sim.turn ?? 0) + 1;
      return { ok: true, submitted, turnInfo: sim.getTurnInfo(), events: sim.log.all() };
    },

    /** Rebuild a live session from scenario + seed + its command timeline. */
    replayTimeline: (record) => replayTimeline({ defs, ...record }),
    verifyReplay: (record) => verifyReplay(record, { defs, sandbox }),
    async save(slot = 'autosave') {
      if (!lastAttempt) return false;
      await store.save(slot, { state: lastAttempt.finalState, progress });
      return true;
    },
    async load(slot = 'autosave') {
      const data = await store.load(slot);
      if (data) progress = data.progress;
      return data;
    },
  };
}
