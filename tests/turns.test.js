import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app/index.js';

const fresh = async () => { const app = createApp(); const { sim } = await app.createFreeSim(); return { app, sim }; };

test('free-play code runs through the Worker sandbox and is queued, not executed', async () => {
  const { app, sim } = await fresh();
  const r = await app.runTurnCode(sim, 'const n = 2; for (let i = 0; i < n; i++) survivor.gather("wood", 5);');
  assert.equal(r.ok, true);
  assert.deepEqual(r.submitted.map((s) => s.ok), [true, true]);
  assert.equal(r.turnInfo.commandsLeft, 1);
  assert.equal(sim.tick, 0, 'nothing ran yet');
  assert.equal(sim.studentView().base.wood, 0);
});

test('a fourth command in one turn is rejected with COMMAND_BUDGET_EXCEEDED (also across separate runs)', async () => {
  const { app, sim } = await fresh();
  const r = await app.runTurnCode(sim, 'survivor.rest(1); survivor.rest(1); survivor.rest(1); survivor.rest(1);');
  assert.deepEqual(r.submitted.map((s) => s.ok), [true, true, true, false]);
  assert.equal(r.submitted[3].error.code, 'COMMAND_BUDGET_EXCEEDED');
  const again = await app.runTurnCode(sim, 'survivor.rest(1);');
  assert.equal(again.submitted[0].error.code, 'COMMAND_BUDGET_EXCEEDED');
});

test('strategy points are spent per command and recharge only when a new turn starts', async () => {
  const { app, sim } = await fresh();
  assert.equal(sim.getTurnInfo().strategyPoints, 10);
  await app.runTurnCode(sim, 'survivor.rest(1); survivor.rest(1);');
  assert.equal(sim.getTurnInfo().strategyPoints, 8);
  const res = await app.advanceTurn(sim);
  assert.equal(res.endedTurn, 1);
  assert.equal(res.turnInfo.turn, 2);
  assert.equal(res.turnInfo.commandsLeft, 3);
  assert.equal(res.turnInfo.strategyPoints, 10, '8 + 2 recharge, capped at 10');
});

test('NEXT TURN executes queued commands and starts a fresh turn', async () => {
  const { app, sim } = await fresh();
  await app.runTurnCode(sim, 'survivor.gather("wood", 10);');
  const res = await app.advanceTurn(sim);
  assert.equal(res.studentView.base.wood, 10);
  assert.ok(res.events.some((e) => e.type === 'resource.gathered'));
  assert.equal(res.turnInfo.turn, 2);
});

test('turns keep working past tick 600 (tick budget is per turn)', async () => {
  const { app, sim } = await fresh();
  // jump the world clock past the old absolute cap, then play a normal turn
  sim.step(1);
  const state = sim.snapshot(); assert.ok(state.tick < 600);
  const { newSim, call } = await import('./helpers.js');
  const late = newSim('stage1', 1, (st) => { st.tick = 700; });
  call(late, 'gather', 'wood', 5);
  const out = late.executeTurn();
  assert.ok(out.tick > 700, 'executeTurn advanced time');
  assert.equal(late.studentView().base.wood, 5);
});

test('sandbox failures return structured errors and spend no budget', async () => {
  const { app, sim } = await fresh();
  const loop = await app.runTurnCode(sim, 'while (true) {}');
  assert.equal(loop.ok, false); assert.equal(loop.error.code, 'EXECUTION_TIMEOUT');
  const bad = await app.runTurnCode(sim, 'fetch("http://example.com")');
  assert.equal(bad.error.code, 'SAFETY_VIOLATION'); assert.equal(bad.violations[0].line, 1);
  const syn = await app.runTurnCode(sim, 'survivor.rest(');
  assert.equal(syn.error.code, 'SYNTAX_ERROR');
  const unk = await app.runTurnCode(sim, 'survivor.teleport(1, 1);');
  assert.equal(unk.error.code, 'RUNTIME_ERROR'); assert.match(unk.error.message, /teleport/);
  assert.equal(sim.getTurnInfo().commandsLeft, 3);
  assert.equal(sim.getTurnInfo().strategyPoints, 10);
});

test('learner code cannot mutate game state', async () => {
  const { app, sim } = await fresh();
  const before = sim.stateHash();
  const r = await app.runTurnCode(sim, 'survivor.needs.health = 0; base.wood = 999;');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'RUNTIME_ERROR');
  assert.equal(sim.stateHash(), before);
});

test('invalid command arguments are reported by the Game API, not by UI parsing', async () => {
  const { app, sim } = await fresh();
  const r = await app.runTurnCode(sim, 'survivor.gather(5);');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'INVALID_ARGUMENT');
});

test('survivor card carries item weights from definitions, with no capacity invented', async () => {
  const { sim } = await fresh();
  const card = sim.inspector('survivor_1');
  assert.ok(Array.isArray(card.inventoryDetail));
  assert.equal('carryCapacity' in card, false);
});

test('item weight shown on the card follows item definitions (no UI constants)', async () => {
  const { createDefinitions } = await import('../src/modules/definitions/index.js');
  // Same state, two definition sets: only the definition changes the displayed weight.
  const { createInitialState } = await import('../src/modules/world/index.js');
  const { createSimulation } = await import('../src/modules/simulation/index.js');
  const mk = (unit) => {
    const d = structuredClone(createDefinitions()); d.items.wood.unitWeight = unit;
    const st = createInitialState({ defs: d, scenarioId: 'stage1', seed: 1 }); st.survivors.survivor_1.inventory.items.wood = 3;
    return createSimulation({ defs: d, state: st }).inspector('survivor_1').inventoryDetail[0].weight;
  };
  assert.equal(mk(2), 6);
  assert.equal(mk(5), 15);
});
