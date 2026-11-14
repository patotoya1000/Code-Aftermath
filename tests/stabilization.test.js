// Regression tests for the stabilization pass (2026-11-13). Each test names the bug it guards against.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app/index.js';
import { createEventLog, hashValue, stableStringify, AftermathError } from '../src/kernel/index.js';
import { runLesson } from '../src/modules/lessons/index.js';
import { createMemoryAdapter } from '../src/modules/persistence/index.js';
import { ledgerViolations, nodeKey, stockKey, total } from '../src/modules/resources/index.js';
import { defs, sandbox, newSim, call, runUntilIdle } from './helpers.js';

const energy = (sim) => sim.snapshot().survivors.survivor_1.needs.energy;
const nodeSum = (sim, resource) => {
  const st = sim.snapshot();
  return Object.values(st.nodes).filter((n) => n.resource === resource).reduce((t, n) => t + st.ledger[nodeKey(n.id)].total, 0);
};

// ---------------------------------------------------------------- rest ----

test('rest: exactly +energyPerTick per tick for the ticks asked — no hidden "top-up" to the default length', () => {
  const sim = newSim('stage1_tired'); // energy 3
  call(sim, 'rest', 5);
  runUntilIdle(sim);
  assert.equal(energy(sim), 13, 'rest(5) = +10, not the +40 the old adjustment granted');
});

test('rest: a tired survivor recovers at full speed (tiredness must not slow the cure for tiredness)', () => {
  const sim = newSim('stage1_tired');
  call(sim, 'rest', 10);
  sim.step(1);
  assert.equal(energy(sim), 5);
  runUntilIdle(sim);
  assert.equal(energy(sim), 23);
});

test('rest: energy is capped at the maximum and the action ends early when full', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.needs.energy = 98; });
  call(sim, 'rest', 50);
  runUntilIdle(sim);
  assert.equal(energy(sim), 100);
  assert.ok(sim.tick < 10, 'stopped as soon as energy was full');
});

// -------------------------------------------------------------- gather ----

test('gather: small trips still cost energy (work ticks are counted across trips, not per trip)', () => {
  const sim = newSim('stage1');
  call(sim, 'gather', 'wood', 1, 20); // 20 trips of 1 unit = 40 work ticks
  runUntilIdle(sim);
  const act = Object.values(sim.snapshot().actions).find((a) => a.actionType === 'gather');
  assert.equal(act.workTotal, 40);
  const decay = Math.floor(sim.tick / defs.needs.decay.energy.every);
  assert.equal(energy(sim), 90 - decay - 4, 'work cost 4 energy (1 per 10 work ticks) on top of passive decay');
});

test('gather: skill/trait output bonuses never create or destroy material (node loss === base gain)', () => {
  const sim = newSim('stage1', 3, (st) => { Object.assign(st.survivors.survivor_1, { traits: ['strong'] }); st.survivors.survivor_1.skills.gathering = 10; });
  const before = nodeSum(sim, 'wood') + total(sim.snapshot(), stockKey('wood'));
  call(sim, 'gather', 'wood', 5, 40);
  runUntilIdle(sim);
  const st = sim.snapshot();
  assert.equal(nodeSum(sim, 'wood') + st.ledger[stockKey('wood')].total, before, 'wood is conserved');
  assert.equal(st.ledger[stockKey('wood')].total, 40, 'exactly the requested total arrives');
  assert.deepEqual(ledgerViolations(st), []);
});

test('gather: a bonus trip carries more per trip but never more than the node has or the total asked for', () => {
  const sim = newSim('stage1', 2, (st) => { st.survivors.survivor_1.traits = ['strong']; st.survivors.survivor_1.skills.gathering = 10; });
  call(sim, 'gather', 'wood', 5, 12);
  runUntilIdle(sim);
  assert.equal(sim.snapshot().ledger[stockKey('wood')].total, 12);
});

test('gather: modifiers are re-read each trip, so a standing job slows down as the survivor gets hungry', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.needs.hunger = 31; });
  call(sim, 'gather', 'wood', 5, 60);
  sim.step(2000);
  const gatheredAt = sim.log.ofType('resource.gathered').map((e) => e.tick);
  const gaps = gatheredAt.slice(1).map((t, i) => t - gatheredAt[i]);
  assert.ok(gaps.length >= 4);
  assert.ok(Math.max(...gaps) > Math.min(...gaps), 'later trips take longer once hunger < threshold');
});

// ------------------------------------------------------------- lessons ----

test('every lesson can be passed with its own starter code (no unwinnable lesson)', async () => {
  for (const l of Object.values(defs.lessons)) {
    const { evaluation } = await runLesson({ defs, sandbox, lessonId: l.id, code: l.starter, captureFrames: false });
    assert.equal(evaluation.passed, true, `${l.id}: ${JSON.stringify(evaluation.results.filter((r) => !r.passed))}`);
  }
});

// ------------------------------------------------------------ kernel ----

test('hash: undefined-valued keys do not change the hash (so a JSON save round-trip keeps its integrity hash)', () => {
  const a = { x: 1, y: undefined, z: { q: undefined, r: [1, undefined] } };
  const b = JSON.parse(JSON.stringify(a));
  assert.equal(hashValue(a), hashValue(b));
  assert.equal(stableStringify({ a: undefined }), '{}');
});

test('event log: since(cursor) returns only newer events', () => {
  const log = createEventLog();
  for (let i = 0; i < 5; i++) log.append(i, 't');
  assert.equal(log.since(3).length, 2);
  assert.equal(log.since(5).length, 0);
  assert.equal(log.since().length, 5);
});

// ------------------------------------------------- free-play save/load ----

test('free-play save/load: the loaded world is identical (same tick, same state hash), and keeps running identically', async () => {
  const app = createApp({ adapter: createMemoryAdapter() });
  const { sim } = app.createFreeSim();
  await app.runCode(sim, 'survivor.gather("wood", 5, 15); survivor.rest(10);');
  sim.step(37);
  await app.runCode(sim, 'survivor.drink();');
  sim.step(11);
  assert.deepEqual(await app.saveFreePlay(sim), { tick: 48, commands: 3 });
  const loaded = await app.loadFreePlay();
  assert.equal(loaded.sim.tick, sim.tick);
  assert.equal(loaded.sim.stateHash(), sim.stateHash());
  assert.equal(loaded.sim.log.hash(), sim.log.hash());
  sim.step(300); loaded.sim.step(300);
  assert.equal(loaded.sim.stateHash(), sim.stateHash(), 'identical after more time too');
});

test('free-play load: no save → null; a tampered record is refused, never silently loaded', async () => {
  const adapter = createMemoryAdapter();
  const app = createApp({ adapter });
  assert.equal(await app.loadFreePlay(), null);
  const { sim } = app.createFreeSim();
  await app.runCode(sim, 'survivor.gather("wood", 5, 5);');
  sim.step(20);
  await app.saveFreePlay(sim);
  const env = JSON.parse(await adapter.get('freeplay'));
  env.state.timeline[0].tick = 5; // change history, then fix the envelope hash so only the replay check can catch it
  env.stateHash = hashValue(env.state);
  await adapter.set('freeplay', JSON.stringify(env));
  await assert.rejects(() => app.loadFreePlay(), (e) => e instanceof AftermathError && e.code === 'SAVE_CORRUPT');
});

test('free-play load: a save from another simulation version is refused with a clear code', async () => {
  const adapter = createMemoryAdapter();
  const app = createApp({ adapter });
  const { sim } = app.createFreeSim();
  await app.saveFreePlay(sim);
  const env = JSON.parse(await adapter.get('freeplay'));
  env.simVersion = '0.0.1';
  await adapter.set('freeplay', JSON.stringify(env));
  await assert.rejects(() => app.loadFreePlay(), (e) => e.code === 'SAVE_VERSION_MISMATCH');
});

// ------------------------------------------------------------------ UI ----

test('UI: the page CSP forbids inline handlers, so nothing may use onclick= (lesson buttons were dead)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../src/app/mainscreen.js', import.meta.url), 'utf8');
  assert.match(html, /script-src 'self'/);
  assert.equal(/\sonclick=/.test(html), false, 'index.html');
  assert.equal(/\sonclick=/.test(js), false, 'mainscreen.js');
});

test('app: the old turn API is gone (runTurnCode referenced sim methods that no longer exist)', () => {
  const app = createApp();
  assert.equal('runTurnCode' in app, false);
  assert.equal('advanceTurn' in app, false);
});
