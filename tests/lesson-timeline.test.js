// R5: lessons on the timeline model — lesson attempts produce a command timeline,
// and replaying that timeline yields the identical state hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLesson } from '../src/modules/lessons/index.js';
import { replayLesson } from '../src/modules/session/index.js';
import { defs, sandbox } from './helpers.js';

test('R5: a lesson attempt produces a command timeline', async () => {
  const result = await runLesson({ defs, sandbox, lessonId: 'm1_first_wood', code: defs.lessons.m1_first_wood.starter });
  assert.equal(result.evaluation.passed, true, JSON.stringify(result.evaluation.results));
  const attempt = result.attempt;
  assert.ok(Array.isArray(attempt.lessonTimeline), 'lessonTimeline should be an array');
  assert.ok(attempt.lessonTimeline.length > 0, 'lessonTimeline should not be empty');
  for (const entry of attempt.lessonTimeline) {
    assert.ok(Number.isInteger(entry.tick), 'each entry needs a tick');
    assert.ok(entry.command, 'each entry needs a command');
    assert.ok(entry.command.apiVersion, 'command needs apiVersion');
    assert.ok(entry.command.type, 'command needs type');
    assert.ok(entry.command.actorId, 'command needs actorId');
  }
});

test('R5: replaying a lesson timeline yields the identical state hash', async () => {
  const result = await runLesson({ defs, sandbox, lessonId: 'm2_loop_wood', code: defs.lessons.m2_loop_wood.starter });
  assert.equal(result.evaluation.passed, true, JSON.stringify(result.evaluation.results));
  const attempt = result.attempt;

  const replayed = replayLesson({
    defs,
    scenarioId: attempt.record.scenarioId,
    seed: attempt.record.seed,
    timeline: attempt.lessonTimeline,
    untilTick: attempt.ticks,
  });
  assert.equal(replayed.stateHash(), attempt.stateHash, 'replayed lesson must produce identical state hash');
});

test('R5: replaying a lesson timeline matches the original attempt state hash across multiple lessons', async () => {
  const lessonIds = ['m1_first_wood', 'm1_rest_first', 'm1_repair_fence', 'm2_loop_wood', 'm2_a_variable', 'm3_c_condition', 'm3_d_function', 'm3_e_policy'];
  for (const lessonId of lessonIds) {
    const result = await runLesson({ defs, sandbox, lessonId, code: defs.lessons[lessonId].starter });
    assert.equal(result.evaluation.passed, true, `${lessonId}: ${JSON.stringify(result.evaluation.results)}`);
    const attempt = result.attempt;
    const replayed = replayLesson({
      defs,
      scenarioId: attempt.record.scenarioId,
      seed: attempt.record.seed,
      timeline: attempt.lessonTimeline,
      untilTick: attempt.ticks,
    });
    assert.equal(replayed.stateHash(), attempt.stateHash, `${lessonId}: replayed hash must match`);
  }
});

test('R5: lesson timeline entries are in tick order', async () => {
  const result = await runLesson({ defs, sandbox, lessonId: 'm3_e_policy', code: defs.lessons.m3_e_policy.starter });
  assert.equal(result.evaluation.passed, true, JSON.stringify(result.evaluation.results));
  const attempt = result.attempt;
  for (let i = 1; i < attempt.lessonTimeline.length; i++) {
    assert.ok(attempt.lessonTimeline[i].tick >= attempt.lessonTimeline[i - 1].tick, 'timeline ticks must be non-decreasing');
  }
});
