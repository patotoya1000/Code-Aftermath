import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app/index.js';

// Learner boundary + survivor card tests (ported from the removed turn-model suite to the real-time model).
const fresh = async () => { const app = createApp(); const { sim } = await app.createFreeSim(); return { app, sim }; };

test('sandbox failures return structured errors and spend no strategy points', async () => {
  const { app, sim } = await fresh();
  const loop = await app.runCode(sim, 'while (true) {}');
  assert.equal(loop.ok, false); assert.equal(loop.error.code, 'EXECUTION_TIMEOUT');
  const bad = await app.runCode(sim, 'fetch("http://example.com")');
  assert.equal(bad.error.code, 'SAFETY_VIOLATION'); assert.equal(bad.violations[0].line, 1);
  const syn = await app.runCode(sim, 'survivor.rest(');
  assert.equal(syn.error.code, 'SYNTAX_ERROR');
  const unk = await app.runCode(sim, 'survivor.teleport(1, 1);');
  assert.equal(unk.error.code, 'RUNTIME_ERROR'); assert.match(unk.error.message, /teleport/);
  assert.equal(sim.getClockInfo().strategyPoints, 10, 'nothing was spent');
  assert.equal(sim.commandTimeline().length, 0, 'nothing was recorded');
});

test('invalid command arguments are reported by the Game API, not by UI parsing', async () => {
  const { app, sim } = await fresh();
  const r = await app.runCode(sim, 'survivor.gather(5);');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'INVALID_ARGUMENT');
  assert.equal(sim.getClockInfo().strategyPoints, 10);
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
