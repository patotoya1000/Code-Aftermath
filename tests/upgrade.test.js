import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, types } from './helpers.js';
import { buildCommand, COMMANDS } from '../src/modules/api/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';

const stocked = (st) => { st.ledger['stock.wood'].total = 100; st.ledger['stock.stone'].total = 100; st.survivors.survivor_1.skills.repair = 1; };
const failedWith = (sim) => JSON.stringify(sim.log.all().filter((e) => e.type === 'action.failed'));
const hqOf = (sim) => sim.snapshot().buildings.hq;
const fixHq = (st) => { stocked(st); st.buildings.hq.health = 200; st.buildings.hq.condition = 'repaired'; };

test('upgrade raises a repaired HQ to level 2: cost paid, new max health, bigger storage, event + XP', () => {
  const sim = newSim('stage1', 1, fixHq);
  call(sim, 'upgrade', 'hq');
  runUntilIdle(sim, 500);
  const st = sim.snapshot();
  assert.equal(st.buildings.hq.level, 2);
  assert.equal(st.buildings.hq.health, 300);
  assert.equal(st.buildings.hq.storage.wood, 300);
  assert.equal(st.ledger['stock.wood'].total, 70);
  assert.equal(st.ledger['stock.stone'].total, 85);
  assert.ok(types(sim).includes('building.upgraded'));
  assert.ok(st.survivors.survivor_1.progression.xp.repair >= 12);
  assert.deepEqual(ledgerViolations(st), []);
});

test('pooled capacity grows with the level', () => {
  const sim = newSim('stage1', 1, fixHq);
  const before = sim.studentView().base.capacity.wood;
  call(sim, 'upgrade', 'hq'); runUntilIdle(sim, 500);
  assert.equal(sim.studentView().base.capacity.wood, before + 150);
});

test('a ruined or damaged building must be repaired first (NEEDS_REPAIR), and nothing is spent', () => {
  const sim = newSim('stage1', 1, (st) => { stocked(st); }); // the HQ starts below full health? use the fence (health 20)
  call(sim, 'upgrade', 'fence'); runUntilIdle(sim, 200);
  assert.ok(failedWith(sim).includes('NEEDS_REPAIR'), failedWith(sim));
  assert.equal(sim.snapshot().ledger['stock.wood'].total, 100);
  assert.equal(sim.snapshot().buildings.fence.level, 1);
});

test('no next level → MAX_LEVEL; a building without an upgrade table → MAX_LEVEL', () => {
  const sim = newSim('stage1', 1, (st) => { fixHq(st); st.buildings.hq.level = 4; st.buildings.hq.health = 650; st.buildings.tent_1.health = 60; }); // P0: the HQ now has levels 1-4
  call(sim, 'upgrade', 'hq'); runUntilIdle(sim, 100);
  call(sim, 'upgrade', 'tent_1'); runUntilIdle(sim, 100);
  assert.equal((failedWith(sim).match(/MAX_LEVEL/g) ?? []).length, 2);
});

test('not enough materials → INSUFFICIENT_RESOURCE and the level is unchanged', () => {
  const sim = newSim('stage1', 1, (st) => { fixHq(st); st.ledger['stock.wood'].total = 10; });
  call(sim, 'upgrade', 'hq'); runUntilIdle(sim, 300);
  assert.ok(failedWith(sim).includes('INSUFFICIENT_RESOURCE'));
  assert.equal(hqOf(sim).level, 1);
});

test('upgrading is advanced work: it needs practised Repair skill (CAPABILITY_INSUFFICIENT at level 0)', () => {
  const sim = newSim('stage1', 1, (st) => { fixHq(st); st.survivors.survivor_1.skills.repair = 0; });
  call(sim, 'upgrade', 'hq'); runUntilIdle(sim, 100);
  assert.ok(failedWith(sim).includes('CAPABILITY_INSUFFICIENT'));
  assert.equal(hqOf(sim).level, 1);
});

test('cancelling mid-upgrade releases the reserved materials and changes nothing', () => {
  const sim = newSim('stage1', 1, fixHq);
  call(sim, 'upgrade', 'hq'); sim.step(10);
  call(sim, 'stop'); sim.step(3);
  const st = sim.snapshot();
  assert.equal(st.buildings.hq.level, 1);
  assert.equal(st.ledger['stock.wood'].total, 100);
  assert.deepEqual(ledgerViolations(st), []);
});

test('API: survivor.upgrade(building) validates its argument and shows the offer on the building', () => {
  assert.ok(COMMANDS.upgrade);
  assert.throws(() => buildCommand('survivor_1', { name: 'upgrade', args: [] }), /upgrade/);
  assert.throws(() => buildCommand('survivor_1', { name: 'upgrade', args: [5] }), /upgrade/);
  const v = newSim('stage1', 1, fixHq).studentView();
  assert.deepEqual(v.buildings.find((b) => b.id === 'hq').upgrade, { level: 2, cost: { wood: 30, stone: 15 }, ticks: 60 });
  assert.equal(v.buildings.find((b) => b.id === 'tent_1').upgrade, null);
});

test('determinism', () => {
  const run = () => { const s = newSim('stage1', 3, fixHq); call(s, 'upgrade', 'hq'); runUntilIdle(s, 500); return s.stateHash(); };
  assert.equal(run(), run());
});

test('definitions: every upgrade targets an existing level and costs known items', () => {
  for (const [id, b] of Object.entries(defs.buildings)) for (const [lvl, u] of Object.entries(b.upgrade ?? {})) {
    assert.ok(b.levels[lvl], `${id}: upgrade to missing level ${lvl}`);
    for (const k of Object.keys(u.cost)) assert.ok(defs.items[k], `${id}: unknown cost item ${k}`);
  }
});
