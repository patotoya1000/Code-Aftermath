import { runAttempt } from '../session/index.js';
import { CHECKS } from './checks.js';

export { CHECKS };

// Learner-friendly hints for engine failure reasons.
export const FAILURE_HINTS = {
  EXHAUSTED: 'Your survivor was too tired to work. Check survivor.needs.energy and call survivor.rest() first.',
  INSUFFICIENT_RESOURCE: 'There was not enough of something in base stock (for example no food when a policy tried to eat). Gather more first.',
  NO_TARGET: 'There is no resource of that type left to gather.',
  INVALID_PARAMS: 'A command had an invalid value. Check the API reference.',
  NOT_NEEDED: 'That action was not needed right now (the need is already full).',
  NOTHING_TO_REPAIR: 'That building is already at full health.',
  UNKNOWN_TARGET: 'The target does not exist.',
  OUT_OF_BOUNDS: 'That tile is outside the map.',
  ACTOR_DOWNED: 'Your survivor collapsed. Keep hunger, thirst and health safe.',
  CANCELLED: 'The action was cancelled.',
  INTERRUPTED: 'A policy paused this job to look after a need; the job resumes afterwards.',
  CAPABILITY_INSUFFICIENT: 'Your survivor lacks the attribute, skill, or trait needed for this action. Check survivor.attributes and survivor.skills, then train or choose a different action.',
};

export function listLessons(defs) {
  return Object.values(defs.lessons).map((l) => ({ id: l.id, title: l.title, brief: l.brief, starter: l.starter ?? '' }));
}

/** Evaluate an attempt against a lesson's goals. Pure: returns feedback, changes nothing. */
export function evaluateLesson(lesson, attempt, hiddenRuns = []) {
  if (!attempt.ok) {
    const e = attempt.sandbox.error;
    return {
      lessonId: lesson.id, passed: false,
      results: lesson.goals.map((g) => ({ id: g.id, passed: false, message: g.message, detail: 'Code did not run', hint: null })),
      feedback: [`Your code did not run (${e?.code}): ${e?.message}`],
    };
  }
  const results = lesson.goals.map((g) => {
    const check = CHECKS[g.check];
    const r = check ? check(attempt, g.args ?? {}) : { passed: false, detail: `unknown check ${g.check}` };
    return { id: g.id, passed: r.passed, message: g.message, detail: r.detail, hint: r.passed ? null : g.hint ?? null };
  });
  // Hidden scenarios: the same program in a different starting world. They are shown only AFTER the run, so the learner
  // can learn from them but cannot memorise one answer beforehand.
  for (const h of hiddenRuns) {
    for (const g of h.scenario.goals) {
      const check = CHECKS[g.check];
      const r = check ? check(h.attempt, g.args ?? {}) : { passed: false, detail: `unknown check ${g.check}` };
      results.push({ id: `hidden:${h.scenario.id}:${g.id}`, passed: r.passed, hidden: true, message: `Hidden test (${h.scenario.title}): ${g.message}`, detail: r.detail, hint: r.passed ? null : g.hint ?? null });
    }
    if (h.attempt.timedOut) results.push({ id: `hidden:${h.scenario.id}:time`, passed: false, hidden: true, message: `Hidden test (${h.scenario.title}): the program finished in time.`, detail: `${h.attempt.ticks} ticks`, hint: null });
  }
  const feedback = results.filter((r) => !r.passed).map((r) => `${r.message}${r.hint ? ' Hint: ' + r.hint : ''}`);
  if (results.some((r) => r.hidden && !r.passed) && results.filter((r) => !r.hidden).every((r) => r.passed)) feedback.unshift('Your program solved the visible world but not a different one. Make decisions from what you read (survivor.needs …), not from what you saw once.');
  const reasons = new Set(attempt.events.filter((e) => e.type === 'action.failed').map((e) => e.reason));
  for (const r of reasons) if (FAILURE_HINTS[r]) feedback.push(FAILURE_HINTS[r]);
  if (attempt.timedOut) feedback.push('The simulation ran out of time before everything finished.');
  return { lessonId: lesson.id, passed: results.every((r) => r.passed), results, feedback };
}

/** Run a lesson attempt from a fresh scenario state. Never touches saved progression. */
export async function runLesson({ defs, sandbox, lessonId, code, captureFrames = true }) {
  const lesson = defs.lessons[lessonId];
  if (!lesson) throw new Error(`Unknown lesson ${lessonId}`);
  const attempt = await runAttempt({
    defs, sandbox, code, scenarioId: lesson.scenario, seed: lesson.seed, maxTicks: lesson.maxTicks,
    captureFrames, lessonId: lesson.id, lessonVersion: lesson.version,
  });
  const hiddenRuns = [];
  if (attempt.ok) {
    for (const h of lesson.hidden ?? []) {
      const hidden = await runAttempt({ defs, sandbox, code, scenarioId: h.scenario, seed: h.seed, maxTicks: h.maxTicks ?? lesson.maxTicks, captureFrames: false, lessonId: lesson.id, lessonVersion: lesson.version });
      hiddenRuns.push({ scenario: h, attempt: hidden });
    }
  }
  return { attempt, evaluation: evaluateLesson(lesson, attempt, hiddenRuns), hiddenRuns };
}
