// R4a needs policies: interrupt -> act -> resume. Each test names the rule it protects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ledgerViolations, stockKey, nodeKey } from '../src/modules/resources/index.js';
import { runLesson } from '../src/modules/lessons/index.js';
import { replayTimeline, createFreeSim, submitCalls } from '../src/modules/session/index.js';
import { defs, sandbox, newSim, types } from './helpers.js';

const cmd = (type, params = {}, extra = {}) => ({ apiVersion: 1, actorId: 'survivor_1', type, params, ...extra });
const me = (sim) => sim.snapshot().survivors.survivor_1;
const hungry = (st) => { st.survivors.survivor_1.needs.hunger = 29; };

test('policy: an eat policy interrupts a gather job, eats, and the job resumes and finishes', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.needs.hunger = 31; }); // decays below 30 mid-job
  sim.submit(cmd('policy', { action: 'eat', below: 30 }));
  sim.submit(cmd('gather', { resource: 'wood', amount: 5, total: 20 }));
  sim.step(400);
  const t = types(sim);
  for (const e of ['policy.set', 'policy.triggered', 'task.resumed', 'task.stopped']) assert.ok(t.includes(e), e);
  const st = sim.snapshot();
  assert.equal(st.ledger[stockKey('wood')].total, 20, 'the learner\'s total still holds across the interruption');
  assert.ok(st.ledger[stockKey('food')].total < 6, 'food was eaten');
  assert.ok(me(sim).needs.hunger > 30);
  assert.deepEqual(ledgerViolations(st), []);
  const cancelled = sim.log.all().find((e) => e.type === 'action.cancelled' && e.reason === 'INTERRUPTED');
  assert.ok(cancelled, 'the interrupted job says why it stopped');
});

test('policy: jobs queued behind the interrupted one keep their order', () => {
  const sim = newSim('stage1', 1, hungry);
  sim.submit(cmd('policy', { action: 'eat', below: 30 }));
  sim.submit(cmd('gather', { resource: 'wood', amount: 5, total: 5 }));
  sim.submit(cmd('rest', { ticks: 5 }, { mode: 'queue' }));
  sim.step(3);
  const order = sim.snapshot().activeActions.map((id) => sim.snapshot().actions[id]).map((a) => a.origin ?? a.actionType);
  assert.deepEqual(order.slice(0, 3), ['policy:eat', 'gather', 'rest']);
});

test('policy: no food means no interruption — one policy.blocked event, then a quiet wait', () => {
  const sim = newSim('stage1', 1, (st) => { hungry(st); st.ledger[stockKey('food')].total = 0; });
  sim.submit(cmd('policy', { action: 'eat', below: 30 }));
  sim.submit(cmd('gather', { resource: 'wood', amount: 5, total: 10 }));
  sim.step(200);
  assert.equal(types(sim).filter((e) => e === 'policy.blocked').length, 1);
  assert.equal(types(sim).filter((e) => e === 'action.cancelled').length, 0, 'nothing was interrupted for nothing');
  assert.equal(sim.snapshot().ledger[stockKey('wood')].total, 10);
});

test('policy: a rest policy rests to its goal and never fights a manual rest', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.needs.energy = 26; });
  sim.submit(cmd('policy', { action: 'rest', below: 30, until: 50 }));
  sim.step(2);
  assert.equal(types(sim).filter((e) => e === 'policy.triggered').length, 1);
  sim.step(13);
  assert.ok(me(sim).needs.energy >= 50 && me(sim).needs.energy < 54, `energy ${me(sim).needs.energy}`);
  const manual = newSim('stage1', 1, (st) => { st.survivors.survivor_1.needs.energy = 26; });
  manual.submit(cmd('policy', { action: 'rest', below: 30 }));
  manual.submit(cmd('rest', { ticks: 10 }));
  manual.step(3);
  assert.equal(types(manual).filter((e) => e === 'policy.triggered').length, 0, 'the manual rest already cures it');
});

test('policy: bad options are rejected with a clear code and change nothing', () => {
  const sim = newSim();
  for (const params of [{ action: 'dance' }, { action: 'eat', below: 0 }, { action: 'eat', until: 50 }, { action: 'rest', below: 50, until: 40 }, { action: 'eat', bogus: 1 }]) {
    assert.throws(() => sim.submit(cmd('policy', params)), (e) => e.code === 'INVALID_COMMAND', JSON.stringify(params));
  }
  assert.deepEqual(me(sim).policies, {});
  sim.submit(cmd('policy', { action: 'drink' }));
  assert.equal(me(sim).policies.drink.below, 30, 'default threshold comes from data');
  sim.submit(cmd('policy_clear', { action: 'drink' }));
  assert.deepEqual(me(sim).policies, {});
});

test('policy: through the sandbox, an options object works and a program\'s first action still replaces', async () => {
  const { sim } = createFreeSim({ defs });
  const run = await sandbox.run({ code: 'survivor.policy("eat", { below: 40 });\nsurvivor.policy("rest", 20);\nsurvivor.gather("wood", 5, 5);', view: sim.studentView(), seed: 1 });
  assert.equal(run.ok, true, JSON.stringify(run.error));
  const out = submitCalls(sim, run.calls);
  assert.deepEqual(out.map((o) => o.ok), [true, true, true]);
  assert.equal(out[2].mode, 'replace');
  assert.equal(sim.studentView().survivor.policies.eat.below, 40);
  const evil = await sandbox.run({ code: 'survivor.policy("eat", { below: () => 1 });', view: sim.studentView(), seed: 1 });
  assert.equal(evil.ok, false);
});

test('policy: same timeline => same world (replay + hash), and the lesson passes with a policy and without', async () => {
  const a = createFreeSim({ defs, seed: 3 }).sim;
  a.step(5); a.submitCommand(cmd('policy', { action: 'rest', below: 35, until: 60 }));
  a.submitCommand(cmd('gather', { resource: 'wood', amount: 10, total: 60 }, { mode: 'replace' }));
  a.step(500);
  const b = replayTimeline({ defs, seed: 3, timeline: a.commandTimeline(), untilTick: a.tick });
  assert.equal(b.stateHash(), a.stateHash());

  const withPolicy = await runLesson({ defs, sandbox, lessonId: 'm3_e_policy', code: defs.lessons.m3_e_policy.starter });
  assert.equal(withPolicy.evaluation.passed, true, JSON.stringify(withPolicy.evaluation.results));
  const without = await runLesson({ defs, sandbox, lessonId: 'm3_e_policy', code: 'survivor.rest(30);\nsurvivor.gather("wood", 10, 60);' });
  assert.equal(without.evaluation.passed, true, JSON.stringify(without.evaluation.results));
  const naive = await runLesson({ defs, sandbox, lessonId: 'm3_e_policy', code: 'survivor.gather("wood", 10, 60);' });
  assert.equal(naive.evaluation.passed, false, 'the lesson really needs one of the two');
});

test('policy: soak — random policies + commands keep every ledger invariant and the node/stock balance', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const sim = newSim('stage1', seed);
    const woodAll = () => { const st = sim.snapshot(); return Object.values(st.nodes).filter((n) => n.resource === 'wood').reduce((t, n) => t + st.ledger[nodeKey(n.id)].total, 0) + st.ledger[stockKey('wood')].total + Object.values(st.survivors).reduce((t, sv) => t + (sv.inventory.items.wood ?? 0), 0); }; // node + carried + stock
    const w0 = woodAll();
    sim.submit(cmd('policy', { action: 'eat', below: 20 + seed * 5 }));
    sim.submit(cmd('policy', { action: 'drink', below: 50 }));
    sim.submit(cmd('policy', { action: 'rest', below: 40, until: 80 }));
    for (let i = 0; i < 30; i++) {
      try { sim.submit(cmd('gather', { resource: 'wood', amount: 1 + ((i * seed) % 15), ...(i % 2 ? { total: 5 + i } : {}) }, { mode: i % 3 ? 'queue' : 'replace' })); } catch { /* ignored */ }
      sim.step(40);
      const st = sim.snapshot();
      assert.deepEqual(ledgerViolations(st), [], `seed ${seed} step ${i}`);
      assert.equal(st.activeActions.length, new Set(st.activeActions).size);
      for (const a of Object.values(st.actions)) if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(a.status)) assert.deepEqual(a.reservationIds, []);
      assert.ok(woodAll() >= w0 - 0 && woodAll() <= w0, 'no wood created or lost'); // wood is only gathered here, never spent
      if (me(sim).status !== 'active') break;
    }
  }
});
