// Composition root: the ONE place where modules are wired together into the running app (the monolith).
import { createDefinitions } from '../modules/definitions/index.js';
import { createSandbox } from '../modules/sandbox/index.js';
import { runLesson, listLessons } from '../modules/lessons/index.js';
import { runAttempt, createFreeSim, runLiveCode, replayTimeline } from '../modules/session/index.js';
import { createClockDriver } from '../modules/simulation/index.js';
import { verifyReplay } from '../modules/replay/index.js';
import { describeApi } from '../modules/api/index.js';
import { AftermathError, SIM_VERSION } from '../kernel/index.js';
import { createSaveStore, createMemoryAdapter, emptyProgress, recordLessonResult } from '../modules/persistence/index.js';

const FREE_PLAY_SLOT = 'freeplay';

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
    /** Rebuild a live session from scenario + seed + its command timeline. */
    replayTimeline: (record) => replayTimeline({ defs, ...record }),
    verifyReplay: (record) => verifyReplay(record, { defs, sandbox }),
    async save(slot = 'autosave') {
      if (!lastAttempt) return false;
      await store.save(slot, { state: lastAttempt.finalState, progress });
      return true;
    },
    /**
     * Save a free-play session as its RECORD (scenario + seed + the commands with the ticks they were issued at), not as
     * a raw state dump. The simulation is deterministic, so replaying the record rebuilds the identical world, and the
     * state hash stored beside it proves it did.
     */
    async saveFreePlay(sim, slot = FREE_PLAY_SLOT) {
      const record = { scenarioId: sim.scenarioId, seed: sim.seed, tick: sim.tick, timeline: sim.commandTimeline(), stateHash: sim.stateHash() };
      await store.save(slot, { state: record, progress });
      return { tick: record.tick, commands: record.timeline.length };
    },
    /** Rebuild the saved session. Throws SAVE_CORRUPT / SAVE_VERSION_MISMATCH instead of silently loading a different world. */
    async loadFreePlay(slot = FREE_PLAY_SLOT) {
      const data = await store.load(slot);
      if (!data) return null;
      if (data.simVersion !== SIM_VERSION) throw new AftermathError('SAVE_VERSION_MISMATCH', `Saved with simulation ${data.simVersion}; this build is ${SIM_VERSION}, so the session cannot be rebuilt exactly.`);
      const rec = data.state;
      let sim;
      try { sim = replayTimeline({ defs, scenarioId: rec.scenarioId, seed: rec.seed, timeline: rec.timeline, untilTick: rec.tick }); } catch (e) {
        throw new AftermathError('SAVE_CORRUPT', `Saved session could not be replayed: ${e.message}`);
      }
      if (sim.stateHash() !== rec.stateHash) throw new AftermathError('SAVE_CORRUPT', 'Saved session did not replay to the same world (state hash differs).');
      progress = data.progress ?? progress;
      return { sim, initialView: sim.studentView(), savedTick: rec.tick };
    },
    async hasFreePlaySave(slot = FREE_PLAY_SLOT) { return (await store.list()).includes(slot); },
    async load(slot = 'autosave') {
      const data = await store.load(slot);
      if (data) progress = data.progress;
      return data;
    },
  };
}
