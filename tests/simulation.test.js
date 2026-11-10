import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSim, call, runUntilIdle, types, defs } from './helpers.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { createSurvivor } from '../src/modules/survivors/index.js';
import { buildCommand } from '../src/modules/api/index.js';
import { FailureReason } from '../src/modules/actions/lifecycle.js';

test('gather walks to the nearest tree, works, and credits base stock via the full lifecycle', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood', 10);
  runUntilIdle(sim);
  const statuses = sim.log.all().filter((e) => e.type.startsWith('action.')).map((e) => e.type);
  assert.deepEqual(statuses, ['action.queued', 'action.validating', 'action.reserved', 'action.executing', 'action.completed']);
  assert.equal(sim.studentView().base.wood, 10);
  assert.equal(sim.log.ofType('resource.gathered')[0].amount, 10);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  const v = sim.studentView().survivor;
  assert.ok(Math.max(Math.abs(v.x - 20), Math.abs(v.y - 4)) <= 1, 'ends adjacent to tree_1');
});

test('movement uses the 8-direction vocabulary and the simulation owns direction', () => {
  const sim = newSim();
  call(sim, 'moveTo', 14, 5); // from (11,9): up-right
  sim.step(1);
  assert.equal(sim.studentView().survivor.direction, 'UP_RIGHT');
  runUntilIdle(sim);
  const v = sim.studentView().survivor;
  assert.deepEqual([v.x, v.y], [14, 5]);
});

test('render projection derives animation from simulation task (never the reverse)', () => {
  const sim = newSim();
  assert.equal(sim.renderProjection().npcs[0].animation, 'IDLE');
  call(sim, 'gather', 'wood', 5);
  sim.step(1);
  assert.equal(sim.renderProjection().npcs[0].animation, 'WALK');
  while (sim.renderProjection().npcs[0].animation === 'WALK') sim.step(1);
  assert.equal(sim.renderProjection().npcs[0].animation, 'GATHER');
});

test('repair costs wood, raises health, and fires a condition change at the visual threshold', () => {
  const sim = newSim('stage1', 5, (s) => { s.ledger['stock.wood'].total = 10; });
  call(sim, 'repair', 'fence');
  runUntilIdle(sim);
  const f = sim.studentView().fence;
  assert.equal(f.health, 45);
  assert.equal(f.condition, 'damaged');
  call(sim, 'repair', 'fence');
  runUntilIdle(sim);
  assert.equal(sim.studentView().fence.condition, 'repaired');
  assert.equal(sim.studentView().base.wood, 0);
  const changes = sim.log.ofType('building.condition_changed').map((e) => `${e.from}>${e.to}`);
  assert.deepEqual(changes, ['ruined>damaged', 'damaged>repaired']);
  assert.equal(sim.renderProjection().buildings.find((b) => b.id === 'fence').assetKey, 'building_fence_lv1_repaired');
});

test('failure reasons: not enough wood releases cleanly with INSUFFICIENT_RESOURCE', () => {
  const sim = newSim();
  call(sim, 'repair', 'fence');
  runUntilIdle(sim);
  const failed = sim.log.ofType('action.failed')[0];
  assert.equal(failed.reason, 'INSUFFICIENT_RESOURCE');
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('failure reasons: tired survivor cannot start work; unknown targets and bad tiles are reported', () => {
  const tired = newSim('stage1_tired');
  call(tired, 'gather', 'wood');
  runUntilIdle(tired);
  assert.equal(tired.log.ofType('action.failed')[0].reason, 'EXHAUSTED');

  const sim = newSim();
  call(sim, 'moveTo', 99, 99);
  call(sim, 'moveTo', 'nope');
  call(sim, 'gather', 'gold');
  call(sim, 'gather', 'stone', 1);
  runUntilIdle(sim);
  const reasons = sim.log.ofType('action.failed').map((e) => e.reason);
  assert.deepEqual(reasons, ['OUT_OF_BOUNDS', 'UNKNOWN_TARGET', 'INVALID_PARAMS']);
});

test('gather exposes STORAGE_FULL when the HQ reaches its capacity limit', () => {
  const sim = newSim('stage1', 1, (s) => { s.ledger['stock.wood'].total = 150; });
  call(sim, 'gather', 'wood', 10);
  runUntilIdle(sim);
  assert.equal(sim.log.ofType('action.failed')[0].reason, FailureReason.STORAGE_FULL);
  assert.equal(sim.studentView().base.wood, 150);
});

test('two survivors cannot spend the same reserved wood (no double-spend)', () => {
  const sim = newSim('stage1', 1, (s) => {
    s.ledger['stock.wood'].total = 5; // enough for exactly one repair
    s.survivors.survivor_2 = createSurvivor(defs, { id: 'survivor_2', template: 'rookie', name: 'Jon', x: 11, y: 11 });
  });
  sim.submit(buildCommand('survivor_1', { name: 'repair', args: ['fence'] }));
  sim.submit(buildCommand('survivor_2', { name: 'repair', args: ['fence'] }));
  sim.step(1);
  assert.equal(sim.log.ofType('action.failed').length, 1);
  assert.equal(sim.log.ofType('action.failed')[0].reason, 'INSUFFICIENT_RESOURCE');
  assert.equal(sim.studentView().base.wood, 0, 'available is 0 while reserved');
  assert.equal(sim.studentView().base.reserved.wood, 5);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  runUntilIdle(sim);
  assert.equal(sim.studentView().fence.health, 45, 'only one repair happened');
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('two gatherers sharing one node reserve disjoint amounts', () => {
  const sim = newSim('stage1', 1, (s) => {
    s.survivors.survivor_2 = createSurvivor(defs, { id: 'survivor_2', template: 'rookie', x: 11, y: 9 });
    for (const id of ['tree_2', 'tree_3']) { s.ledger[`node.${id}`].total = 0; }
    s.ledger['node.tree_1'].total = 12;
  });
  sim.submit(buildCommand('survivor_1', { name: 'gather', args: ['wood', 10] }));
  sim.submit(buildCommand('survivor_2', { name: 'gather', args: ['wood', 10] }));
  runUntilIdle(sim);
  const got = sim.log.ofType('resource.gathered').map((e) => e.amount).sort((a, b) => a - b);
  assert.deepEqual(got, [2, 10], 'second survivor only gets what is left (and its shorter job finishes first)');
  assert.equal(sim.studentView().base.wood, 12);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('queue is FIFO per survivor, and stop() cancels and releases reservations', () => {
  const sim = newSim('stage1', 1, (s) => { s.ledger['stock.wood'].total = 20; });
  call(sim, 'repair', 'fence');
  call(sim, 'repair', 'fence');
  sim.step(2);
  assert.equal(sim.snapshot().activeActions.length, 2);
  assert.equal(sim.snapshot().ledger['stock.wood'].reserved, 5, 'only the running action holds a reservation');
  call(sim, 'stop');
  assert.equal(sim.snapshot().ledger['stock.wood'].reserved, 0);
  assert.equal(sim.log.ofType('action.cancelled').length, 2);
  assert.ok(sim.isIdle());
});

test('needs decay, derived conditions are read-only data, eating restores hunger from stock', () => {
  const sim = newSim('stage1', 1, (s) => { s.survivors.survivor_1.needs.hunger = 25; });
  assert.deepEqual(sim.studentView().survivor.conditions, ['hungry']);
  call(sim, 'eat');
  runUntilIdle(sim);
  const v = sim.studentView();
  assert.equal(v.survivor.needs.hunger, 55);
  assert.equal(v.base.food, 5);
  assert.deepEqual(v.survivor.conditions, []);
  call(sim, 'eat'); call(sim, 'eat'); runUntilIdle(sim);
  call(sim, 'eat'); runUntilIdle(sim);
  assert.ok(sim.log.ofType('action.failed').some((e) => e.reason === 'NOT_NEEDED'));
});

test('starvation damages health and a downed survivor cancels their work', () => {
  const sim = newSim('stage1', 1, (s) => { Object.assign(s.survivors.survivor_1.needs, { hunger: 0, health: 2 }); });
  call(sim, 'gather', 'wood', 20);
  sim.step(40);
  assert.equal(sim.studentView().survivor.status, 'downed');
  assert.ok(sim.log.ofType('survivor.downed').length === 1);
  assert.ok(sim.log.ofType('action.cancelled').length === 1);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('rest restores energy over simulation ticks, not instantly', () => {
  const sim = newSim('stage1_tired');
  call(sim, 'rest', 10);
  sim.step(1);
  assert.equal(sim.studentView().survivor.needs.energy, 5);
  runUntilIdle(sim);
  assert.equal(sim.studentView().survivor.needs.energy, 23);
});

test('determinism: same seed => identical state & log; different seed => different world', () => {
  const run = (seed) => { const s = newSim('stage1', seed); call(s, 'gather', 'wood', 15); runUntilIdle(s); return s; };
  const a = run(7); const b = run(7); const c = run(8);
  assert.equal(a.stateHash(), b.stateHash());
  assert.equal(a.log.hash(), b.log.hash());
  assert.notEqual(a.stateHash(), c.stateHash());
});

test('projections are deeply frozen (read-only by construction)', () => {
  const sim = newSim();
  const v = sim.studentView();
  assert.throws(() => { v.base.wood = 999; }, TypeError);
  assert.throws(() => { v.survivor.needs.energy = 100; }, TypeError);
  assert.ok(Object.isFrozen(sim.renderProjection().npcs[0]));
  assert.equal(sim.inspector('survivor_1').identity.name, 'Mara');
  assert.equal(sim.studentView().base.wood, 0, 'mutation attempts did not leak');
});

test('simulation rejects bad commands: version, unknown actor', () => {
  const sim = newSim();
  assert.throws(() => sim.submit({ apiVersion: 9, type: 'rest', actorId: 'survivor_1', params: {} }), /not supported/);
  assert.throws(() => sim.submit({ apiVersion: 1, type: 'rest', actorId: 'ghost', params: {} }), /Unknown actor/);
});
