import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim, call, runUntilIdle } from './helpers.js';
import { ledgerViolations } from '../src/modules/resources/index.js';

const failures = (sim) => sim.log.all().filter((e) => e.type === 'action.failed').map((e) => e.reason);

test('prototype-chain names are unknown targets, never a crash inside the tick', () => {
  for (const [name, args] of [['repair', ['constructor']], ['repair', ['toString']], ['repair', ['__proto__']],
    ['moveTo', ['constructor']], ['moveTo', ['hasOwnProperty']], ['gather', ['constructor']], ['gather', ['__proto__', 3]]]) {
    const sim = newSim();
    assert.doesNotThrow(() => { call(sim, name, ...args); runUntilIdle(sim, 50); }, `${name}(${args[0]})`);
    assert.equal(failures(sim).length, 1, `${name}(${args[0]}) fails with a reason`);
    assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  }
});

test('a command the simulation refuses does not cost budget or strategy points', () => {
  const sim = newSim();
  const before = sim.getClockInfo();
  assert.throws(() => sim.submitCommand({ apiVersion: 1, type: 'gather', actorId: 'ghost', params: { resource: 'wood' } }), { code: 'UNKNOWN_ACTOR' });
  assert.throws(() => sim.submitCommand({ apiVersion: 1, type: 'gather', actorId: 'constructor', params: { resource: 'wood' } }), { code: 'UNKNOWN_ACTOR' });
  const after = sim.getClockInfo();
  assert.equal(after.strategyPoints, before.strategyPoints);
  call(sim, 'rest', 1);
  sim.submitCommand({ apiVersion: 1, type: 'rest', actorId: 'survivor_1', params: { ticks: 1 } });
  assert.equal(sim.getClockInfo().strategyPoints, before.strategyPoints - 1);
});

test('gather prefers a node that can fill the whole request over a nearly empty nearer node', () => {
  const sim = newSim();
  for (let i = 0; i < 3; i++) call(sim, 'gather', 'wood', 20, 20);
  runUntilIdle(sim);
  const got = sim.log.all().filter((e) => e.type === 'resource.gathered').map((e) => e.amount);
  assert.deepEqual(got, [20, 20, 20]);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('gather takes what is left when no node can fill a trip, and keeps going across nodes until none is left', () => {
  const sim = newSim('stage1', 1, (st) => { for (const k of ['node.tree_1', 'node.tree_2', 'node.tree_3']) st.ledger[k].total = 3; });
  call(sim, 'gather', 'wood', 20, 20); runUntilIdle(sim);
  assert.deepEqual(sim.log.all().filter((e) => e.type === 'resource.gathered').map((e) => e.amount), [3, 3, 3]);
  assert.equal(sim.studentView().survivor.lastTask.reason, 'NO_TARGET');
});

test('inspector ignores prototype-chain ids', () => {
  const sim = newSim();
  assert.equal(sim.inspector('constructor'), null);
  assert.equal(sim.inspector('__proto__'), null);
});
