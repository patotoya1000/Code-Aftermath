// R3 carry + deposit. Rule under test: a unit is always in exactly one place — a node, a survivor's hands, or base stock —
// and storage can never be overfilled, however the trip is interrupted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ledgerViolations, stockKey, nodeKey, total } from '../src/modules/resources/index.js';
import { carriedLoad, carryCapacity, carryRoom, addCarried, removeCarried } from '../src/modules/survivors/index.js';
import { storageCapacity } from '../src/modules/buildings/index.js';
import { createSurvivor } from '../src/modules/survivors/index.js';
import { normalizeCall, buildCommand } from '../src/modules/api/index.js';
import { replayTimeline } from '../src/modules/session/index.js';
import { defs, newSim, call, runUntilIdle, types } from './helpers.js';

const cmd = (type, params = {}, extra = {}) => ({ apiVersion: 1, actorId: 'survivor_1', type, params, ...extra });
const me = (sim) => sim.snapshot().survivors.survivor_1;
const unitsOf = (st, res) => Object.values(st.nodes).filter((n) => n.resource === res).reduce((t, n) => t + st.ledger[nodeKey(n.id)].total, 0)
  + st.ledger[stockKey(res)].total + Object.values(st.survivors).reduce((t, s) => t + (s.inventory.items[res] ?? 0), 0);

test('carry capacity is derived from data: base + strength, times trait multipliers', () => {
  const s = createSurvivor(defs, { id: 's', template: 'rookie', x: 0, y: 0 });
  assert.equal(carryCapacity(s, defs), defs.carry.base + defs.carry.perStrength * 5);
  s.attributes.strength = 7;
  assert.equal(carryCapacity(s, defs), 20 + 8 * 7);
  s.traits = ['strong'];
  assert.equal(carryCapacity(s, defs), Math.floor((20 + 8 * 7) * 1.25));
  assert.equal(newSim().studentView().survivor.carry.capacity, 60, 'the projection reports it; learner code cannot set it');
});

test('inventory helpers refuse to exceed capacity or remove more than is held', () => {
  const s = createSurvivor(defs, { id: 's', template: 'rookie', x: 0, y: 0 });
  addCarried(s, defs, 'wood', 30);
  assert.equal(carriedLoad(s, defs), 60);
  assert.equal(carryRoom(s, defs, 'wood'), 0);
  assert.throws(() => addCarried(s, defs, 'wood', 1), (e) => e.code === 'OVER_CARRY_CAPACITY');
  assert.throws(() => removeCarried(s, 'wood', 31), (e) => e.code === 'INVALID_QUANTITY');
  removeCarried(s, 'wood', 30);
  assert.deepEqual(s.inventory.items, {}, 'an empty inventory has no zero entries');
});

test('a gather trip puts the wood in her hands first; base stock only grows when she unloads', () => {
  const sim = newSim();
  const w0 = unitsOf(sim.snapshot(), 'wood');
  call(sim, 'gather', 'wood', 10, 10);
  let sawCarrying = false;
  while (!sim.isIdle() && sim.tick < 600) {
    sim.step(1);
    const st = sim.snapshot();
    const held = st.survivors.survivor_1.inventory.items.wood ?? 0;
    if (held > 0) { sawCarrying = true; assert.equal(st.ledger[stockKey('wood')].total, 0, 'not in base while still carried'); }
    assert.equal(unitsOf(st, 'wood'), w0, 'wood is conserved every tick (node + hands + base)');
  }
  assert.ok(sawCarrying);
  assert.equal(sim.studentView().base.wood, 10);
  assert.deepEqual(me(sim).inventory.items, {});
  assert.equal(sim.log.ofType('resource.deposited')[0].depotId, 'hq');
});

test('a trip never carries more than she can hold: stone (weight 4) is capped at 15 per trip', () => {
  const sim = newSim();
  call(sim, 'gather', 'stone', 20, 15);
  let most = 0;
  while (!sim.isIdle() && sim.tick < 900) { sim.step(1); most = Math.max(most, carriedLoad(me(sim), defs)); }
  assert.equal(most, 60, 'she filled her hands exactly to capacity, never past it');
  assert.equal(sim.studentView().base.stone, 15);
  assert.equal(sim.log.ofType('resource.gathered')[0].amount, 15);
});

test('stopping mid-trip keeps what she carries; deposit() walks it to storage', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood', 10);
  while ((me(sim).inventory.items.wood ?? 0) === 0) sim.step(1); // picked up, now walking home
  call(sim, 'stop');
  sim.step(1);
  assert.equal(me(sim).inventory.items.wood, 10, 'stop does not delete her load');
  assert.equal(sim.studentView().base.wood, 0);
  assert.equal(unitsOf(sim.snapshot(), 'wood'), unitsOf(newSim().snapshot(), 'wood'));
  call(sim, 'deposit');
  runUntilIdle(sim);
  assert.equal(sim.studentView().base.wood, 10);
  assert.deepEqual(me(sim).inventory.items, {});
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('deposit() with empty hands fails with a clear reason', () => {
  const sim = newSim();
  call(sim, 'deposit');
  sim.step(2);
  assert.equal(sim.log.ofType('action.failed')[0].reason, 'NOTHING_TO_DEPOSIT');
});

test('a new gather unloads what she was still carrying before it starts the first trip', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.inventory.items.wood = 6; st.survivors.survivor_1.position = { x: 12, y: 8 }; st.ledger[nodeKey('tree_1')].total -= 6; });
  call(sim, 'gather', 'wood', 5, 11);
  sim.step(8);
  assert.equal(sim.studentView().base.wood, 6, 'the old load went to storage first');
  runUntilIdle(sim);
  assert.equal(sim.studentView().base.wood, 11, 'the total counts every unit that reaches storage during the job, including the old load');
});

test('a policy that interrupts a carrying survivor loses nothing and the job resumes', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.needs.hunger = 31; });
  sim.submit(cmd('policy', { action: 'eat', below: 30 }));
  sim.submit(cmd('gather', { resource: 'wood', amount: 5, total: 20 }));
  const w0 = unitsOf(sim.snapshot(), 'wood');
  for (let i = 0; i < 500; i++) { sim.step(1); assert.equal(unitsOf(sim.snapshot(), 'wood'), w0, `tick ${sim.tick}`); }
  assert.equal(sim.snapshot().ledger[stockKey('wood')].total, 20);
});

test('a repaired storehouse adds capacity and is where she unloads when it is nearer', () => {
  const sim = newSim();
  assert.equal(storageCapacity(sim.snapshot(), 'wood'), 150, 'ruined storehouse adds nothing');
  const fixed = newSim('stage1', 1, (st) => { st.buildings.storage_1.health = 120; st.buildings.storage_1.condition = 'repaired'; });
  assert.equal(storageCapacity(fixed.snapshot(), 'wood'), 250);
  assert.equal(storageCapacity(fixed.snapshot(), 'food'), 100 + 50, 'the tent pools food/water capacity with the HQ');
  call(fixed, 'gather', 'wood', 10, 10);
  runUntilIdle(fixed);
  assert.equal(fixed.log.ofType('resource.deposited')[0].depotId, 'storage_1', 'closer to the forest than the HQ');
  assert.equal(fixed.studentView().base.wood, 10);
});

test('repairing the ruined storehouse in play raises pooled capacity', () => {
  const sim = newSim('stage1', 1, (st) => { st.ledger['stock.wood'].total = 40; });
  for (let i = 0; i < 4; i++) call(sim, 'repair', 'storage_1');
  runUntilIdle(sim);
  const v = sim.studentView();
  assert.ok(v.buildings.find((b) => b.id === 'storage_1').condition !== 'ruined');
  assert.equal(v.base.capacity.wood, 250);
});

test('storage is never overfilled, even with two gatherers and carried loads in flight', () => {
  const sim = newSim('stage1', 1, (st) => {
    st.ledger['stock.wood'].total = 130; // 20 left in a 150 pool
    st.survivors.survivor_2 = createSurvivor(defs, { id: 'survivor_2', template: 'rookie', name: 'Jon', x: 11, y: 11 });
  });
  sim.submit(buildCommand('survivor_1', { name: 'gather', args: ['wood', 15] }));
  sim.submit(buildCommand('survivor_2', { name: 'gather', args: ['wood', 15] }));
  for (let i = 0; i < 800; i++) {
    sim.step(1);
    const st = sim.snapshot();
    assert.ok(st.ledger[stockKey('wood')].total <= 150, `tick ${sim.tick}: ${st.ledger[stockKey('wood')].total}`);
    assert.deepEqual(ledgerViolations(st), []);
  }
  assert.equal(sim.snapshot().ledger[stockKey('wood')].total, 150, 'the pool ends exactly full');
  assert.ok(sim.log.ofType('task.stopped').some((e) => e.reason === 'STORAGE_FULL'));
  assert.deepEqual(Object.values(sim.snapshot().survivors).map((s) => s.inventory.items), [{}, {}], 'nobody is left holding wood');
});

test('learner code cannot set what she carries or how much she can carry', () => {
  assert.throws(() => normalizeCall('deposit', [5]), (e) => e.code === 'INVALID_ARGUMENT');
  assert.ok(Object.isFrozen(newSim().studentView().survivor.carry), 'projection is frozen');
});

test('carry trips are deterministic and replay verifies', () => {
  const a = newSim('stage1', 3); const b = newSim('stage1', 3);
  for (const s of [a, b]) { call(s, 'gather', 'wood', 10, 30); call(s, 'gather', 'stone', 20, 15); s.step(900); }
  assert.equal(a.stateHash(), b.stateHash());
  assert.ok(types(a).includes('resource.deposited'));
});
