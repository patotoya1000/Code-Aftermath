import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defs, sandbox } from './helpers.js';
import { createSaveStore, createMemoryAdapter, emptyProgress, recordLessonResult } from '../src/modules/persistence/index.js';
import { runLesson } from '../src/modules/lessons/index.js';
import { runAttempt } from '../src/modules/session/index.js';
import { hashValue } from '../src/kernel/index.js';

test('save/load round-trips state and progress exactly', async () => {
  const a = await runAttempt({ defs, sandbox, code: 'survivor.gather("wood", 10, 10);', seed: 4 });
  const store = createSaveStore(createMemoryAdapter(), { clock: () => 1234 });
  await store.save('slot1', { state: a.finalState, progress: emptyProgress() });
  const loaded = await store.load('slot1');
  assert.equal(hashValue(loaded.state), a.stateHash);
  assert.deepEqual(loaded.progress, emptyProgress());
  assert.equal(loaded.savedAt, 1234);
  assert.equal(await store.load('missing'), null);
});

test('corrupt or unsupported saves are detected', async () => {
  const adapter = createMemoryAdapter();
  const store = createSaveStore(adapter);
  await store.save('s', { state: { a: 1 }, progress: emptyProgress() });
  const env = JSON.parse(await adapter.get('s'));
  await adapter.set('tampered', JSON.stringify({ ...env, state: { a: 2 } }));
  await adapter.set('future', JSON.stringify({ ...env, format: 99 }));
  await adapter.set('junk', '{not json');
  await assert.rejects(store.load('tampered'), (e) => e.code === 'SAVE_CORRUPT');
  await assert.rejects(store.load('future'), (e) => e.code === 'SAVE_FORMAT_UNSUPPORTED');
  await assert.rejects(store.load('junk'), (e) => e.code === 'SAVE_CORRUPT');
});

test('educational failure never corrupts progression; passes only add', async () => {
  let progress = emptyProgress();
  const pass = await runLesson({ defs, sandbox, lessonId: 'm1_first_wood', code: 'survivor.gather("wood", 10, 10);' });
  progress = recordLessonResult(progress, pass.evaluation, { commandCount: 1 });
  const snapshot = JSON.stringify(progress.completed);
  const fail = await runLesson({ defs, sandbox, lessonId: 'm1_first_wood', code: 'while(true){}' });
  const after = recordLessonResult(progress, fail.evaluation);
  assert.equal(JSON.stringify(after.completed), snapshot, 'completed lessons untouched by a failed retry');
  assert.equal(after.attempts, 2);
  const better = recordLessonResult(after, pass.evaluation, { commandCount: 1 });
  assert.equal(better.completed.m1_first_wood.passes, 2);
  assert.equal(progress.attempts, 1, 'recordLessonResult is pure');
});

test('each attempt starts from the same fresh scenario (retries are independent)', async () => {
  const a = await runLesson({ defs, sandbox, lessonId: 'm1_first_wood', code: 'survivor.gather("wood", 10, 10);' });
  const b = await runLesson({ defs, sandbox, lessonId: 'm1_first_wood', code: 'survivor.gather("wood", 10, 10);' });
  assert.equal(a.attempt.initialStateHash, b.attempt.initialStateHash);
  assert.equal(a.attempt.stateHash, b.attempt.stateHash);
});
