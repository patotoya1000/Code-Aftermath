// Composition root: the ONE place where modules are wired together into the running app (the monolith).
import { createDefinitions } from '../modules/definitions/index.js';
import { createSandbox } from '../modules/sandbox/index.js';
import { runLesson, listLessons } from '../modules/lessons/index.js';
import { runAttempt, createFreeSim, advanceTurn } from '../modules/session/index.js';
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
    /** Create a fresh turn-based free-play simulation. Returns { sim, initialView }. */
    createFreeSim({ scenarioId = 'stage1', seed = 1 } = {}) {
      return createFreeSim({ defs, scenarioId, seed });
    },
    /** Advance one turn on a live free-play simulation with the given commands. */
    async advanceTurn(sim, commands = []) {
      return advanceTurn(sim, commands);
    },
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
