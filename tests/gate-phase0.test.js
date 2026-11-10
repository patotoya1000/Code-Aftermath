// Phase 0 acceptance gate:
// Sandbox → API → Command → Queue → Tick → State Change → Event → Validator → Feedback, with deterministic replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defs, sandbox } from './helpers.js';
import { runAttempt } from '../src/modules/session/index.js';
import { runLesson, evaluateLesson } from '../src/modules/lessons/index.js';
import { verifyReplay } from '../src/modules/replay/index.js';
import { createSandbox } from '../src/modules/sandbox/index.js';

test('GATE: full pipeline from learner code to lesson feedback', async () => {
  const { attempt, evaluation } = await runLesson({ defs, sandbox, lessonId: 'm1_first_wood', code: 'survivor.gather("wood", 10);' });
  assert.equal(attempt.ok, true);
  assert.ok(attempt.events.some((e) => e.type === 'action.completed'));
  assert.equal(attempt.finalView.base.wood, 10);
  assert.equal(evaluation.passed, true);
  assert.deepEqual(evaluation.feedback, []);
});

test('GATE: replay reproduces identical outcome from seed + code + versions', async () => {
  const a = await runAttempt({ defs, sandbox, code: 'for (let i=0;i<3;i++) survivor.gather("wood", 5); survivor.repair(fence);', scenarioId: 'stage1', seed: 99, maxTicks: 600, lessonId: 'x', lessonVersion: 1 });
  const r = await verifyReplay(a.record, { defs, sandbox });
  assert.equal(r.matches, true, JSON.stringify(r.mismatches));
  // Tampering is detected.
  const tampered = { ...a.record, seed: 100 };
  assert.equal((await verifyReplay(tampered, { defs, sandbox })).matches, false);
  assert.equal((await verifyReplay({ ...a.record, simVersion: '9.9.9' }, { defs, sandbox })).reason, 'VERSION_MISMATCH');
});

test('GATE: replay includes learner randomness (seeded) and still matches', async () => {
  const a = await runAttempt({ defs, sandbox, code: 'survivor.gather("wood", 1 + Math.floor(Math.random() * 10));', seed: 31 });
  assert.equal((await verifyReplay(a.record, { defs, sandbox })).matches, true);
});

test('GATE: execution limits — runaway code is stopped and feedback explains why', async () => {
  const sb = createSandbox({ timeoutMs: 300 });
  const { evaluation, attempt } = await runLesson({ defs, sandbox: sb, lessonId: 'm1_first_wood', code: 'while(true){}' });
  assert.equal(attempt.ok, false);
  assert.equal(evaluation.passed, false);
  assert.match(evaluation.feedback[0], /EXECUTION_TIMEOUT/);
});

test('GATE: learner cannot mutate authoritative state through the API surface', async () => {
  const a = await runAttempt({ defs, sandbox, code: 'survivor.needs.energy = 100; base.wood = 500;', seed: 1 });
  assert.equal(a.ok, false);
  assert.equal(a.finalView.base.wood, 0);
  assert.equal(a.events.length, 0);
});

test('GATE: lessons accept different valid coding styles unless a construct is required', async () => {
  const styles = [
    'survivor.gather("wood", 10);',
    'survivor.gather("wood", 5);\nsurvivor.gather("wood", 5);',
    'for (let i = 0; i < 2; i++) { survivor.gather("wood", 5); }',
    'function chop(n) { survivor.gather("wood", n); }\nchop(10);',
    'const amount = 10;\nif (survivor.needs.energy > 10) survivor.gather("wood", amount);',
  ];
  for (const code of styles) {
    const { evaluation } = await runLesson({ defs, sandbox, lessonId: 'm1_first_wood', code });
    assert.equal(evaluation.passed, true, code);
  }
});

test('lesson: rest-first requires the construct and fails helpfully without handling energy', async () => {
  const naive = await runLesson({ defs, sandbox, lessonId: 'm1_rest_first', code: 'survivor.gather("wood", 10);' });
  assert.equal(naive.evaluation.passed, false);
  assert.ok(naive.evaluation.feedback.some((f) => /too tired/.test(f)));
  const good = await runLesson({ defs, sandbox, lessonId: 'm1_rest_first', code: 'if (survivor.needs.energy < 30) { survivor.rest(); }\nsurvivor.gather("wood", 10);' });
  assert.equal(good.evaluation.passed, true, JSON.stringify(good.evaluation));
  const noIf = await runLesson({ defs, sandbox, lessonId: 'm1_rest_first', code: 'survivor.rest();\nsurvivor.gather("wood", 10);' });
  assert.equal(noIf.evaluation.passed, false, 'structural check requires an if');
});

test('lesson: mend the fence and loop lessons are solvable with their starters', async () => {
  for (const id of ['m1_repair_fence', 'm2_loop_wood']) {
    const { evaluation } = await runLesson({ defs, sandbox, lessonId: id, code: defs.lessons[id].starter });
    assert.equal(evaluation.passed, true, `${id}: ${JSON.stringify(evaluation)}`);
  }
  const noLoop = await runLesson({ defs, sandbox, lessonId: 'm2_loop_wood', code: 'survivor.gather("wood", 20);\nsurvivor.gather("wood", 10);' });
  assert.equal(noLoop.evaluation.passed, false);
});

test('lesson: a rejected command is recorded and fails the clean-run goal', async () => {
  const a = await runLesson({ defs, sandbox, lessonId: 'm1_first_wood', code: 'survivor.moveTo(500, 500); survivor.gather("wood", 10);' });
  assert.equal(a.evaluation.passed, false);
  assert.ok(a.attempt.events.some((e) => e.type === 'action.failed' && e.reason === 'OUT_OF_BOUNDS'));
});

test('lessons: evaluate is pure and checkpoints expose intermediate state', async () => {
  const a = await runAttempt({ defs, sandbox, code: 'survivor.gather("wood", 20);', scenarioId: 'stage1', seed: 3, checkpointEvery: 10 });
  assert.ok(a.checkpoints.length >= 4);
  assert.equal(a.checkpoints[0].tick, 0);
  const before = JSON.stringify(a.finalView);
  evaluateLesson(defs.lessons.m1_first_wood, a);
  assert.equal(JSON.stringify(a.finalView), before);
});
