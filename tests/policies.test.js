// R4a — needs policies: a survivor reacts to a need by itself (interrupt → act → resume), deterministically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app/index.js';
import { ledgerViolations, nodeKey, stockKey } from '../src/modules/resources/index.js';
import { defs, newSim, call, types } from './helpers.js';

const ID = 'survivor_1';
const policy = (sim, name, below) => call(sim, 'policy', name, { below });
const hungry = (v) => (st) => { st.survivors[ID].needs.hunger = v; };
const events = (sim, type) => sim.log.all().filter((e) => e.type === type);
const woodTotal = (st) => Object.values(st.nodes).filter((n) => n.resource === 'wood').reduce((t, n) => t + st.ledger[nodeKey(n.id)].total, 0) + st.ledger[stockKey('wood')].total;

test('policy commands are validated by the simulation from definitions, before anything changes', () => {
  const sim = newSim();
  const before = sim.stateHash();
  for (const [name, below] of [['fly', 30], ['eat', 0], ['eat', 101], ['eat', 30.5], ['eat', '30']]) {
    assert.throws(() => sim.submit({ apiVersion: 1, actorId: ID, type: 'policy', params: { name, below } }), (e) => e.code === 'INVALID_POLICY', `${name}/${below}`);
  }
  assert.equal(sim.stateHash(), before, 'a rejected policy changes nothing');
  assert.throws(() => sim.submitCommand({ apiVersion: 1, actorId: ID, type: 'policy', params: { name: 'eat', below: 0 } }));
  assert.equal(sim.getClockInfo().strategyPoints, 10, 'and costs nothing');
  sim.submitCommand({ apiVersion: 1, actorId: ID, type: 'policy', params: { name: 'eat', below: 30 } });
  assert.equal(sim.getClockInfo().strategyPoints, 9, 'a valid policy costs 1 strategy point');
  assert.equal(sim.commandTimeline().length, 1, 'and is recorded for replay');
});

test('a policy does nothing while the need is above its threshold', () => {
  const sim = newSim();
  policy(sim, 'eat', 30);
  call(sim, 'gather', 'wood', 5, 10);
  sim.step(200);
  assert.equal(events(sim, 'policy.triggered').length, 0);
});

test('policy interrupts a standing gather, eats, then resumes it and reaches the same total', () => {
  const sim = newSim('stage1', 1, hungry(31));
  policy(sim, 'eat', 30);
  call(sim, 'gather', 'wood', 10, 40);
  sim.runUntil(() => sim.snapshot().actions.act_1.status === 'COMPLETED' || sim.snapshot().actions.act_1.status === 'CANCELLED', 400);
  sim.runUntil((s) => s.isIdle(), 600);
  const st = sim.snapshot();
  const seq = types(sim).filter((t) => ['policy.triggered', 'task.interrupted', 'task.resumed', 'policy.completed'].includes(t));
  assert.deepEqual(seq, ['policy.triggered', 'task.interrupted', 'policy.completed', 'task.resumed']);
  assert.equal(events(sim, 'survivor.consumed').length, 1);
  assert.ok(st.survivors[ID].needs.hunger >= 55, 'ate and recovered');
  assert.equal(st.ledger[stockKey('food')].total, 5);
  assert.equal(st.ledger[stockKey('wood')].total, 40, 'exactly the requested total: nothing lost, nothing duplicated');
  assert.equal(woodTotal(st), woodTotal(newSim().snapshot()), "wood is conserved between trees and base");
  assert.deepEqual(ledgerViolations(st), []);
  const resumed = Object.values(st.actions).find((a) => a.origin === 'resume');
  assert.equal(resumed.status, 'COMPLETED');
  assert.equal(resumed.stopReason, 'TARGET_REACHED');
});

test('an interrupted batch banks the units already chopped; the resumed job asks only for the rest', () => {
  // hunger 31 → drops below 30 around tick 40, which is in the middle of the first 40-tick batch of 20 wood
  const sim = newSim('stage1', 1, hungry(31));
  policy(sim, 'eat', 30);
  call(sim, 'gather', 'wood', 20, 20);
  sim.runUntil(() => events(sim, 'task.interrupted').length === 1, 300);
  const mid = sim.snapshot();
  assert.equal(mid.actions.act_1.phase, 'work', 'interrupted while working, not while walking');
  assert.equal(mid.ledger[stockKey('wood')].total, mid.actions.act_1.stats.gathered, 'banked units are in the base immediately');
  sim.runUntil((s) => s.isIdle(), 800);
  const st = sim.snapshot();
  assert.equal(st.ledger[stockKey('wood')].total, 20);
  const gathers = Object.values(st.actions).filter((a) => a.actionType === 'gather');
  assert.equal(gathers.length, 2, 'the original and exactly one resume');
  const banked = gathers[0].stats.gathered;
  assert.ok(banked >= 1 && banked < 20, `partial batch banked (${banked})`);
  assert.equal(gathers[1].params.total, 20 - banked, 'the resume asks only for what is still missing');
  assert.equal(woodTotal(st), woodTotal(newSim().snapshot()), 'no wood created or lost');
  assert.deepEqual(ledgerViolations(st), []);
});

test('an idle survivor with a policy simply eats; no resume is created', () => {
  const sim = newSim('stage1', 1, hungry(10));
  policy(sim, 'eat', 30);
  sim.step(12);
  const st = sim.snapshot();
  assert.ok(st.survivors[ID].needs.hunger >= 40);
  assert.equal(Object.values(st.actions).filter((a) => a.origin === 'resume').length, 0);
});

test('a policy never interrupts a survival action the learner chose; it waits until that ends', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors[ID].needs.hunger = 29; st.survivors[ID].needs.energy = 40; });
  call(sim, 'rest', 10);
  sim.step(1); // the rest is running
  policy(sim, 'eat', 30);
  sim.step(3);
  assert.equal(events(sim, 'policy.triggered').length, 0, 'rest still running: the policy waits');
  sim.step(30);
  assert.equal(events(sim, 'policy.triggered').length, 1, 'after the rest it reacts');
  assert.equal(events(sim, 'survivor.rested').length, 1, 'the rest was not cut short');
  assert.ok(sim.snapshot().survivors[ID].needs.hunger >= 55);
});

test('a failing policy (no food) is silenced for retryAfter ticks and never thrashes the real work', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors[ID].needs.hunger = 20; st.ledger[stockKey('food')].total = 0; });
  policy(sim, 'eat', 30);
  call(sim, 'gather', 'wood', 5, 30);
  sim.runUntil((s) => s.isIdle(), 400);
  const st = sim.snapshot();
  const fails = events(sim, 'policy.failed');
  assert.ok(fails.length >= 1 && fails.every((f) => f.reason === 'INSUFFICIENT_RESOURCE'));
  const triggers = events(sim, 'policy.triggered');
  for (let i = 1; i < triggers.length; i++) assert.ok(triggers[i].tick - triggers[i - 1].tick >= defs.policies.rules.retryAfter, 'respects the silence window');
  assert.equal(st.ledger[stockKey('wood')].total, 30, 'the work still finished');
});

test('priority is explicit: thirst (1) is served before hunger (2), never both at once', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors[ID].needs.hunger = 20; st.survivors[ID].needs.thirst = 20; });
  policy(sim, 'eat', 30); policy(sim, 'drink', 30);
  call(sim, 'gather', 'wood', 5, 15);
  sim.step(1);
  const tr = () => events(sim, 'policy.triggered').map((e) => e.policy);
  assert.deepEqual(tr(), ['drink']);
  const live = () => Object.values(sim.snapshot().actions).filter((a) => a.origin?.startsWith('policy:') && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(a.status));
  for (let i = 0; i < 40; i++) { sim.step(1); assert.ok(live().length <= 1, 'one policy action at a time'); }
  assert.deepEqual(tr().slice(0, 2), ['drink', 'eat']);
});

test('queued commands stay behind the resumed job, in order', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors[ID].needs.hunger = 31; st.survivors[ID].needs.energy = 60; });
  policy(sim, 'eat', 30);
  call(sim, 'gather', 'wood', 10, 40);
  sim.submit({ apiVersion: 1, actorId: ID, type: 'rest', params: { ticks: 5 }, mode: 'queue' });
  sim.runUntil((s) => s.isIdle(), 800);
  const started = sim.log.all().filter((e) => e.type === 'action.executing').map((e) => e.actionType);
  assert.deepEqual(started, ['gather', 'eat', 'gather', 'rest']);
});

test('clearPolicy removes the reaction; a meal already started finishes', () => {
  const sim = newSim('stage1', 1, hungry(29));
  policy(sim, 'eat', 30);
  sim.step(1);
  call(sim, 'clearPolicy', 'eat');
  sim.step(30);
  assert.deepEqual(Object.keys(sim.snapshot().survivors[ID].policies), []);
  assert.equal(events(sim, 'survivor.consumed').length, 1, 'the meal that had started completed');
  const sim2 = newSim('stage1', 1, hungry(29));
  policy(sim2, 'eat', 30); call(sim2, 'clearPolicy', 'eat');
  sim2.step(30);
  assert.equal(events(sim2, 'policy.triggered').length, 0);
});

test('a new program (replace) cancels an in-flight policy chain, including the resume action', () => {
  const sim = newSim('stage1', 1, hungry(31));
  policy(sim, 'eat', 30);
  call(sim, 'gather', 'wood', 10, 60);
  sim.runUntil(() => events(sim, 'policy.triggered').length === 1, 300);
  sim.submit({ apiVersion: 1, actorId: ID, type: 'rest', params: { ticks: 3 }, mode: 'replace' });
  const st = sim.snapshot();
  assert.equal(st.activeActions.length, 1, 'only the new command is alive');
  assert.equal(st.actions[st.activeActions[0]].actionType, 'rest');
  assert.deepEqual(ledgerViolations(st), []);
});

test('a downed survivor drops its policy chain cleanly', () => {
  const sim = newSim('stage1', 1, (st) => { Object.assign(st.survivors[ID].needs, { hunger: 0, thirst: 0, health: 1 }); st.ledger[stockKey('food')].total = 0; });
  policy(sim, 'eat', 30);
  call(sim, 'gather', 'wood', 5, 50);
  sim.step(60);
  const st = sim.snapshot();
  assert.equal(st.survivors[ID].status, 'downed');
  assert.deepEqual(st.activeActions, []);
  assert.deepEqual(ledgerViolations(st), []);
});

test('policies replay exactly: same record → same state hash (also after save → load)', async () => {
  const app = createApp();
  const { sim } = app.createFreeSim();
  await app.runCode(sim, 'survivor.policy("eat", { below: 90 });\nsurvivor.policy("rest", { below: 80 });\nsurvivor.gather("wood", 10, 60);');
  sim.step(400);
  const rebuilt = app.replayTimeline({ scenarioId: sim.scenarioId, seed: sim.seed, timeline: sim.commandTimeline(), untilTick: sim.tick });
  assert.equal(rebuilt.stateHash(), sim.stateHash());
  assert.equal(rebuilt.log.hash(), sim.log.hash());
  await app.saveFreePlay(sim);
  const loaded = await app.loadFreePlay();
  assert.equal(loaded.sim.stateHash(), sim.stateHash());
  loaded.sim.step(200); sim.step(200);
  assert.equal(loaded.sim.stateHash(), sim.stateHash(), 'and the loaded world continues identically');
  assert.ok(events(sim, 'policy.triggered').length >= 1, 'the policies really did something in this run');
});

test('through the sandbox: a policy is configuration, so the next command still REPLACES the current job', async () => {
  const app = createApp();
  const { sim } = app.createFreeSim();
  await app.runCode(sim, 'survivor.gather("wood", 5);');
  sim.step(2);
  const r = await app.runCode(sim, 'survivor.policy("eat", { below: 30 });\nsurvivor.gather("stone", 5, 5);');
  assert.equal(r.ok, true);
  assert.deepEqual(r.submitted.map((s) => [s.name, s.ok, s.mode]), [['policy', true, 'replace'], ['gather', true, 'replace']], 'the policy did not use up the "first command" slot');
  const st = sim.snapshot();
  assert.equal(Object.values(st.actions).filter((a) => a.status === 'CANCELLED' && a.failureReason === 'REPLACED').length, 1, 'the old gather was replaced by the new first command');
});

test('the learner API rejects malformed policy calls with clear errors and spends nothing', async () => {
  const app = createApp();
  const { sim } = app.createFreeSim();
  const bad = [
    'survivor.policy("eat", 30);',
    'survivor.policy("eat");',
    'survivor.policy("eat", {});',
    'survivor.policy("eat", { below: "30" });',
    'survivor.policy("eat", { below: 30, extra: 1 });',
    'survivor.policy("eat", { below: { x: 1 } });',
    'survivor.policy(5, { below: 30 });',
    'survivor.clearPolicy();',
  ];
  for (const code of bad) {
    const r = await app.runCode(sim, code);
    assert.equal(r.ok, false, code);
    assert.ok(['INVALID_ARGUMENT', 'RUNTIME_ERROR'].includes(r.error.code), `${code} → ${r.error.code}`);
  }
  assert.equal(sim.getClockInfo().strategyPoints, 10);
  const unknown = await app.runCode(sim, 'survivor.policy("fly", { below: 30 });');
  assert.equal(unknown.ok, true, 'name checking belongs to the simulation, which reports it per call');
  assert.equal(unknown.submitted[0].ok, false);
  assert.equal(unknown.submitted[0].error.code, 'INVALID_POLICY');
  assert.equal(sim.getClockInfo().strategyPoints, 10);
  assert.ok(sim.log.all().some((e) => e.type === 'command.rejected'));
});

test('learner code reads policies but cannot write them', async () => {
  const app = createApp();
  const { sim } = app.createFreeSim();
  await app.runCode(sim, 'survivor.policy("eat", { below: 30 });');
  assert.deepEqual(sim.studentView().survivor.policies, { eat: { below: 30 } });
  const before = sim.stateHash();
  const r = await app.runCode(sim, 'survivor.policies.eat.below = 99; console.log(JSON.stringify(survivor.policies));');
  assert.equal(r.ok, false, 'frozen read surface');
  assert.equal(sim.stateHash(), before);
  const r2 = await app.runCode(sim, 'console.log(JSON.stringify(survivor.policies));');
  assert.deepEqual(r2.logs, ['{"eat":{"below":30}}']);
});

test('policy definitions are validated: unique priorities, survival actions only, never an interruptible action', async () => {
  const { createDefinitions } = await import('../src/modules/definitions/index.js');
  const bad = (mut) => { const p = structuredClone(defs.policies); mut(p); return { policies: p }; };
  assert.throws(() => createDefinitions(bad((p) => { p.list.eat.priority = 1; })), /priority/);
  assert.throws(() => createDefinitions(bad((p) => { p.list.eat.action = 'gather'; })), /survival action/);
  assert.throws(() => createDefinitions(bad((p) => { p.list.eat.need = 'luck'; })), /unknown need/);
  assert.throws(() => createDefinitions(bad((p) => { p.rules.retryAfter = 0; })), /retryAfter/);
  assert.throws(() => createDefinitions(bad((p) => { p.rules.maxBelow = 500; })), /minBelow/);
});
