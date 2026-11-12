import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { createSurvivor } from '../src/modules/survivors/index.js';
import { buildCommand } from '../src/modules/api/index.js';
import { defs, newSim, call, types } from './helpers.js';

const fresh = async () => { const app = createApp(); const { sim } = await app.createFreeSim(); return { app, sim }; };
const gathered = (sim) => sim.log.ofType('resource.gathered').map((e) => e.amount);

// ---------------------------------------------------------------- R1: continuous clock ----

test('free-play code is applied to the live world at once; nothing happens until time passes', async () => {
  const { app, sim } = await fresh();
  const r = await app.runCode(sim, 'survivor.gather("wood", 5, 5);');
  assert.equal(r.ok, true);
  assert.deepEqual(r.submitted.map((s) => s.ok), [true]);
  assert.equal(sim.tick, 0, 'no turn to press: time is driven by the clock');
  assert.equal(sim.studentView().base.wood, 0);
  sim.step(200);
  assert.equal(sim.studentView().base.wood, 5);
});

test('there is no per-turn command cap: strategy points are the only limit, and they regenerate with time', async () => {
  const { app, sim } = await fresh();
  const max = sim.getClockInfo().maxStrategyPoints;
  const r = await app.runCode(sim, `for (let i = 0; i < ${max + 2}; i++) survivor.rest(1);`);
  assert.equal(r.submitted.filter((s) => s.ok).length, max);
  assert.equal(r.submitted.at(-1).error.code, 'INSUFFICIENT_STRATEGY_POINTS');
  assert.equal(sim.getClockInfo().strategyPoints, 0);
  sim.step(defs.clock.strategy.regenEvery);
  assert.equal(sim.getClockInfo().strategyPoints, 1, '+1 point after regenEvery ticks');
  sim.step(defs.clock.strategy.regenEvery * (max + 5));
  assert.equal(sim.getClockInfo().strategyPoints, max, 'capped at the maximum');
});

test('rejected and failed runs spend nothing', async () => {
  const { app, sim } = await fresh();
  assert.equal((await app.runCode(sim, 'while (true) {}')).error.code, 'EXECUTION_TIMEOUT');
  const bad = await app.runCode(sim, 'fetch("http://example.com")');
  assert.equal(bad.error.code, 'SAFETY_VIOLATION');
  assert.equal((await app.runCode(sim, 'survivor.rest(')).error.code, 'SYNTAX_ERROR');
  assert.equal((await app.runCode(sim, 'survivor.teleport(1, 1);')).error.code, 'RUNTIME_ERROR');
  assert.equal((await app.runCode(sim, 'survivor.gather(5);')).error.code, 'INVALID_ARGUMENT');
  assert.equal(sim.getClockInfo().strategyPoints, defs.clock.strategy.start);
});

test('learner code cannot mutate game state', async () => {
  const { app, sim } = await fresh();
  const before = sim.stateHash();
  const r = await app.runCode(sim, 'survivor.needs.health = 0; base.wood = 999;');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'RUNTIME_ERROR');
  assert.equal(sim.stateHash(), before);
});

test('the clock driver turns frame time into ticks: paused by default, speed scales it, backlog is capped', () => {
  const app = createApp();
  const sim = app.createFreeSim().sim;
  const clock = app.createClock(sim);
  const tps = defs.clock.ticksPerSecond;
  assert.equal(clock.paused, true);
  assert.equal(clock.update(1000), 0, 'paused: no ticks');
  clock.play();
  let ran = 0; for (let i = 0; i < tps * 10; i++) ran += clock.update(1000 / (tps * 10)); // 30 small frames = 1 second
  assert.equal(ran, tps, 'one second at 1x = ticksPerSecond ticks');
  clock.setSpeed(4);
  assert.equal(clock.update(100), 1, '4x: 0.1 s = 1.2 ticks, the remainder carries over');
  const burst = clock.update(60_000); // a stalled frame is clamped to 250 ms, so there is no huge catch-up burst
  assert.equal(burst, 3);
  clock.pause();
  assert.equal(clock.update(1000), 0);
  assert.throws(() => clock.setSpeed(3), RangeError);
  assert.equal(sim.tick, tps + 1 + burst);
});

test('same seed + same commands at the same ticks = same world, whatever the frame pacing', async () => {
  const { app, sim } = await fresh();
  await app.runCode(sim, 'survivor.gather("wood", 5, 15);');
  sim.step(40);
  await app.runCode(sim, 'survivor.eat(); survivor.rest(10);');
  sim.step(150);
  const record = { scenarioId: 'stage1', seed: 1, timeline: sim.commandTimeline(), untilTick: sim.tick };
  assert.equal(record.timeline.length, 3);
  const again = app.replayTimeline(record);
  assert.equal(again.stateHash(), sim.stateHash());
  // different pacing: single-tick steps vs big steps give the same result
  const a = app.createFreeSim().sim; const b = app.createFreeSim().sim;
  const cmd = (m) => ({ ...buildCommand('survivor_1', { name: 'gather', args: ['wood', 5, 20] }), mode: m });
  a.submitCommand(cmd('replace')); b.submitCommand(cmd('replace'));
  for (let i = 0; i < 120; i++) a.step(1); b.step(120);
  assert.equal(a.stateHash(), b.stateHash());
});

test('runUntil replaces "run until idle" for open-ended work', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood'); // endless
  const r = sim.runUntil((s) => s.studentView().base.wood >= 12, 600);
  assert.equal(r.reached, true);
  assert.ok(sim.studentView().base.wood >= 12);
  const never = sim.runUntil(() => false, 7);
  assert.deepEqual(never, { reached: false, ticks: 7 });
});

// ---------------------------------------------------------------- R2: standing gather ----

test('gather keeps going trip after trip until nothing is left to gather', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood', 20);
  sim.step(2000);
  const v = sim.studentView();
  assert.ok(gathered(sim).length > 3, 'many trips, not one');
  assert.ok(gathered(sim).every((n) => n <= 20), 'no trip exceeds the load');
  assert.equal(v.nodes.filter((n) => n.resource === 'wood').every((n) => n.amount === 0), true, 'every tree is empty');
  assert.equal(v.survivor.task, null);
  assert.equal(v.survivor.lastTask.reason, 'NO_TARGET');
  assert.equal(v.survivor.lastTask.status, 'COMPLETED');
  assert.equal(v.survivor.lastTask.gathered, v.base.wood);
  assert.deepEqual(types(sim).filter((t) => t.startsWith('task.')), ['task.started', 'task.stopped']);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('gather stops by itself when storage is full, and says so', () => {
  const sim = newSim('stage1', 1, (s) => { s.ledger['stock.wood'].total = 140; });
  call(sim, 'gather', 'wood', 20);
  sim.step(1000);
  const v = sim.studentView();
  assert.equal(v.base.wood, 150, 'filled to the HQ capacity exactly, never over');
  assert.deepEqual(gathered(sim), [10], 'the last trip is trimmed to the room that was left');
  assert.equal(v.survivor.lastTask.reason, 'STORAGE_FULL');
  assert.equal(sim.log.ofType('task.stopped')[0].reason, 'STORAGE_FULL');
  assert.equal(sim.log.ofType('action.failed').length, 0, 'finishing a job is not a failure');
});

test('a total ends the job with TARGET_REACHED', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood', 10, 25);
  sim.step(1000);
  assert.deepEqual(gathered(sim), [10, 10, 5]);
  assert.equal(sim.studentView().survivor.lastTask.reason, 'TARGET_REACHED');
});

test('a tired survivor works until too tired, keeps the wood already chopped, and stops with EXHAUSTED', () => {
  const sim = newSim('stage1', 1, (s) => { s.survivors.survivor_1.needs.energy = 9; });
  call(sim, 'gather', 'wood', 20);
  sim.step(1000);
  const v = sim.studentView();
  assert.ok(v.base.wood > 0, 'partial work counts');
  assert.equal(v.survivor.lastTask.reason, 'EXHAUSTED');
  assert.equal(v.survivor.lastTask.status, 'COMPLETED');
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('ending before any work is a failure with the same reason code', () => {
  const none = newSim('stage1', 1, (s) => { for (const k of ['node.tree_1', 'node.tree_2', 'node.tree_3']) s.ledger[k].total = 0; });
  call(none, 'gather', 'wood'); none.step(10);
  assert.equal(none.log.ofType('action.failed')[0].reason, 'NO_TARGET');
  const full = newSim('stage1', 1, (s) => { s.ledger['stock.wood'].total = 150; });
  call(full, 'gather', 'wood'); full.step(10);
  assert.equal(full.log.ofType('action.failed')[0].reason, 'STORAGE_FULL');
  assert.equal(full.studentView().survivor.lastTask.status, 'FAILED');
});

test('two gatherers share storage room and trees without overfilling or double-spending', () => {
  const sim = newSim('stage1', 1, (s) => {
    s.survivors.survivor_2 = createSurvivor(defs, { id: 'survivor_2', template: 'rookie', x: 11, y: 9 });
    s.ledger['stock.wood'].total = 130;
  });
  sim.submit(buildCommand('survivor_1', { name: 'gather', args: ['wood', 20] }));
  sim.submit(buildCommand('survivor_2', { name: 'gather', args: ['wood', 20] }));
  for (let i = 0; i < 1500; i++) { sim.step(1); assert.ok(sim.studentView().base.wood <= 150, 'never over capacity'); assert.deepEqual(ledgerViolations(sim.snapshot()), []); }
  assert.equal(sim.studentView().base.wood, 150);
  assert.equal(sim.studentView().survivors.every((s) => s.task === null), true);
});

test('stop() cancels a standing job, releases its reservation, and keeps what was already delivered', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood', 5);
  sim.runUntil((s) => gathered(s).length >= 2, 600);
  const got = sim.studentView().base.wood;
  sim.step(3);
  sim.submit(buildCommand('survivor_1', { name: 'stop', args: [] }));
  assert.equal(sim.studentView().survivor.task, null);
  assert.equal(sim.studentView().base.wood, got);
  assert.equal(sim.studentView().survivor.lastTask.status, 'CANCELLED');
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  assert.equal(sim.snapshot().ledger['node.tree_2'].reserved + sim.snapshot().ledger['node.tree_1'].reserved + sim.snapshot().ledger['node.tree_3'].reserved, 0);
});

// ---------------------------------------------------------------- replace vs queue ----

test('a new program replaces what the survivor was doing; its own commands run in order', async () => {
  const { app, sim } = await fresh();
  await app.runCode(sim, 'survivor.gather("wood", 5);');
  sim.step(30);
  const r = await app.runCode(sim, 'survivor.rest(5); survivor.gather("stone", 5, 5);');
  assert.deepEqual(r.submitted.map((s) => s.mode), ['replace', 'queue']);
  const cancelled = sim.log.ofType('action.cancelled');
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].reason, 'REPLACED');
  sim.step(600);
  assert.ok(sim.studentView().base.stone >= 5, 'the queued command ran after rest');
});

test('survivor.queue() appends instead of replacing, and costs nothing', async () => {
  const { app, sim } = await fresh();
  await app.runCode(sim, 'survivor.gather("wood", 5, 10);');
  sim.step(5);
  const spBefore = sim.getClockInfo().strategyPoints;
  const r = await app.runCode(sim, 'survivor.queue(); survivor.rest(5);');
  assert.deepEqual(r.submitted.map((s) => [s.name, s.mode]), [['rest', 'queue']]);
  assert.equal(sim.getClockInfo().strategyPoints, spBefore - 1, 'only the real command is charged');
  assert.equal(sim.log.ofType('action.cancelled').length, 0);
  sim.step(600);
  assert.equal(sim.studentView().base.wood, 10);
  assert.ok(sim.log.ofType('survivor.rested').length >= 1, 'rest ran after the gather finished');
});

test('the survivor card carries lastTask and a batch fraction without inventing state', async () => {
  const { app, sim } = await fresh();
  assert.equal(sim.inspector('survivor_1').lastTask, null);
  await app.runCode(sim, 'survivor.gather("wood", 20, 20);');
  sim.runUntil((s) => s.studentView().survivor.task?.fraction > 0.3, 200);
  const t = sim.inspector('survivor_1').task;
  assert.ok(t.fraction > 0.3 && t.fraction <= 1);
  assert.deepEqual(Object.keys(t.stats).sort(), ['gathered', 'trips']);
});
