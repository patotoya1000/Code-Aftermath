// Curriculum validation: behaviour over keywords, hidden scenarios, independence of attempts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLesson } from '../src/modules/lessons/index.js';
import { createApp } from '../src/app/index.js';
import { defs, sandbox } from './helpers.js';

const run = (id, code) => runLesson({ defs, sandbox, lessonId: id, code, captureFrames: false });
const failedIds = (ev) => ev.results.filter((r) => !r.passed).map((r) => r.id);

test('hidden scenarios have their own seed and run only after the visible world passes through the same sandbox path', async () => {
  for (const l of Object.values(defs.lessons)) for (const h of l.hidden ?? []) assert.notEqual(h.seed, l.seed, `${l.id}/${h.id}`);
  const { hiddenRuns } = await run('m3_c_condition', defs.lessons.m3_c_condition.starter);
  assert.equal(hiddenRuns.length, 1);
  assert.equal(hiddenRuns[0].attempt.record.scenarioId, 'stage1');
});

test('m3 condition lesson: always-rest passes the visible world but FAILS the hidden rested world', async () => {
  const { evaluation } = await run('m3_c_condition', 'if (survivor.needs.energy < 30) { survivor.rest(40); }\nsurvivor.rest(40);\n');
  assert.equal(evaluation.passed, false);
  assert.ok(failedIds(evaluation).every((id) => id.startsWith('hidden:')), `only hidden goals fail: ${failedIds(evaluation)}`);
  assert.match(evaluation.feedback[0], /different one/);
});

test('m3 condition lesson: always-gather fails the visible world (too tired)', async () => {
  const { evaluation } = await run('m3_c_condition', 'if (survivor.needs.energy < 30) { }\nsurvivor.gather("wood", 10, 10);\n');
  assert.equal(evaluation.passed, false);
});

test('m3 condition lesson: a correct if/else, and a correct if-without-else, both pass every world', async () => {
  for (const code of [defs.lessons.m3_c_condition.starter, 'if (survivor.needs.energy < 30) {\n  survivor.rest(40);\n}\nsurvivor.gather("wood", 10, 10);\n']) {
    const { evaluation } = await run('m3_c_condition', code);
    assert.equal(evaluation.passed, true, JSON.stringify(failedIds(evaluation)));
  }
});

test('a lesson that only types the keyword no longer passes: `if (false) {}` + wrong behaviour fails', async () => {
  const { evaluation } = await run('m3_c_condition', 'if (false) {}\nsurvivor.rest(40);\n');
  assert.equal(evaluation.passed, false);
});

test('m7 policy lesson: the policy solution passes visible AND hidden worlds', async () => {
  const { evaluation, attempt } = await run('m7_a_dont_starve', defs.lessons.m7_a_dont_starve.solution);
  assert.equal(evaluation.passed, true, JSON.stringify(evaluation.results.filter((r) => !r.passed)));
  assert.ok(attempt.events.some((e) => e.type === 'task.interrupted'), 'the visible run really used interrupt → eat → resume');
});

test('m7 policy lesson: it can also be solved WITHOUT a policy (eat by hand) — policies are a tool, not a keyword gate', async () => {
  const { evaluation } = await run('m7_a_dont_starve', 'survivor.eat();\nsurvivor.gather("wood", 10, 30);\n');
  assert.equal(evaluation.passed, true, JSON.stringify(evaluation.results.filter((r) => !r.passed)));
});

test('m7 policy lesson: ignoring hunger fails with a goal that names the need, and the starter is a scaffold that does not pass', async () => {
  const { evaluation } = await run('m7_a_dont_starve', defs.lessons.m7_a_dont_starve.starter);
  assert.equal(evaluation.passed, false);
  assert.ok(failedIds(evaluation).includes('fed'));
  assert.ok(evaluation.results.find((r) => r.id === 'fed').detail.startsWith('hunger:'));
  assert.match(evaluation.feedback.join(' '), /policy/);
});

test('m7 policy lesson: a wrong threshold (policy too low) is caught by behaviour, not by syntax', async () => {
  const { evaluation } = await run('m7_a_dont_starve', 'survivor.policy("eat", { below: 5 });\nsurvivor.gather("wood", 10, 30);\n');
  assert.equal(evaluation.passed, false, 'the survivor is never fed in time');
});

test('policy lesson replay: the recorded attempt verifies by hash', async () => {
  const app = createApp();
  const { attempt } = await app.runLesson('m7_a_dont_starve', defs.lessons.m7_a_dont_starve.solution);
  const v = await app.verifyReplay(attempt.record);
  assert.equal(v.matches, true, JSON.stringify(v.mismatches));
});

test('failed attempts never reduce saved progress, hidden scenarios included', async () => {
  const app = createApp();
  await app.runLesson('m3_c_condition', defs.lessons.m3_c_condition.starter);
  const earned = structuredClone(app.progress.completed.m3_c_condition);
  assert.equal(earned.passes, 1);
  const attemptsBefore = app.progress.attempts;
  const { evaluation } = await app.runLesson('m3_c_condition', 'survivor.rest(40);\n');
  assert.equal(evaluation.passed, false);
  assert.deepEqual(app.progress.completed.m3_c_condition, earned, 'earned progress is untouched by a failed attempt');
  assert.equal(app.progress.attempts, attemptsBefore + 1, 'the attempt is still counted');
});
