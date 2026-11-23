// R3 sawmill (docs/game/24): a ruined station building; level 1 saws wood (logs) into planks, level 2 (the Beam Mill, HQ 3) squares planks into beams.
// Both recipes open with the headquarters at level 2. Same craft handler, ledger and gates as the smelter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle } from './helpers.js';
import { ledgerViolations } from '../src/modules/resources/index.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) st.ledger[`stock.${k}`].total = v; };
const stock = (sim, k) => sim.snapshot().ledger[`stock.${k}`].total;
const failed = (sim) => JSON.stringify(sim.log.all().filter((e) => e.type === 'action.failed'));
const view = (sim, id) => sim.studentView().buildings.find((b) => b.id === id);
const ready = (st) => { st.survivors.survivor_1.skills.repair = 1; st.survivors.survivor_1.skills.crafting = 2; };

test('data: the sawmill and its two recipes, the plank and beam items and their storage at every HQ level', () => {
  assert.equal(defs.buildings.sawmill.levels[2].name, 'Beam Mill');
  assert.equal(defs.buildings.sawmill.upgrade[2].minHq, 3);
  assert.deepEqual([defs.recipes.plank.station, defs.recipes.plank.inputs, defs.recipes.plank.outputs, defs.recipes.plank.minHq, defs.recipes.plank.stationLevel], ['sawmill', { wood: 3 }, { plank: 2 }, 2, 1]);
  assert.deepEqual([defs.recipes.beam.station, defs.recipes.beam.inputs, defs.recipes.beam.outputs, defs.recipes.beam.minHq, defs.recipes.beam.stationLevel], ['sawmill', { plank: 3 }, { beam: 1 }, 2, 2]);
  assert.ok(defs.items.plank.unitWeight > 0 && defs.items.beam.unitWeight > defs.items.plank.unitWeight);
  for (const l of [1, 2, 3, 4]) { const t = l === 1 ? defs.buildings.hq.storage : defs.buildings.hq.levels[l].storage; assert.ok(t.plank > 0 && t.beam > 0, `hq level ${l} stores planks and beams`); }
});

test('scenarios: a ruined sawmill_1 in the settlement and in the painted outpost, listing its recipes', () => {
  for (const scenario of ['stage1', 'stage1_outpost', 'stage1_line', 'stage1_long']) {
    const b = view(newSim(scenario, 1), 'sawmill_1');
    assert.equal(b.type, 'sawmill', scenario); assert.equal(b.condition, 'ruined', scenario);
    assert.deepEqual(b.recipes.map((r) => r.id), ['plank', 'beam'], scenario);
  }
});

test('a ruined sawmill refuses the recipe (NEEDS_REPAIR) and spends nothing; repairing it opens it; planks come out exactly', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); give(st, { wood: 100, stone: 30 }); });
  call(sim, 'craft', 'plank', 1); runUntilIdle(sim, 200);
  assert.ok(failed(sim).includes('NEEDS_REPAIR'), failed(sim));
  assert.equal(stock(sim, 'wood'), 100);
  for (let i = 0; i < 5; i++) call(sim, 'repair', 'sawmill_1');
  runUntilIdle(sim, 1200);
  assert.equal(sim.snapshot().buildings.sawmill_1.condition, 'repaired');
  const wood = stock(sim, 'wood');
  call(sim, 'craft', 'plank', 3); runUntilIdle(sim, 1500);
  assert.equal(stock(sim, 'plank'), 6); assert.equal(stock(sim, 'wood'), wood - 9);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('planks stay closed below HQ level 2 (HQ_LEVEL, nothing spent), even with a repaired sawmill', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'sawmill_1', 1); give(st, { wood: 20 }); });
  assert.equal(view(sim, 'sawmill_1').recipes[0].working, false);
  assert.equal(sim.studentView().recipes.plank.minHq, 2);
  call(sim, 'craft', 'plank', 1); runUntilIdle(sim, 200);
  assert.ok(failed(sim).includes('HQ_LEVEL'), failed(sim)); assert.equal(stock(sim, 'wood'), 20);
  const open = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); fix(st, 'sawmill_1', 1); give(st, { wood: 20 }); });
  assert.equal(view(open, 'sawmill_1').recipes[0].working, true);
  assert.equal(view(open, 'sawmill_1').recipes[1].working, false, 'beams need the Beam Mill');
});

test('beams need the Beam Mill (level 2), whose upgrade is HQ-gated (HQ 3) and costs wood, stone and scrap', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); fix(st, 'sawmill_1', 1); give(st, { plank: 9, wood: 40, stone: 40, scrap: 10 }); });
  call(sim, 'craft', 'beam', 1); runUntilIdle(sim, 200);
  assert.ok(failed(sim).includes('NEEDS_REPAIR'), failed(sim)); assert.equal(stock(sim, 'plank'), 9);
  call(sim, 'upgrade', 'sawmill_1'); runUntilIdle(sim, 400);
  assert.ok(failed(sim).includes('HQ_LEVEL'), 'the Beam Mill needs HQ 3');
  const up = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 3); fix(st, 'sawmill_1', 1); give(st, { wood: 40, stone: 40, scrap: 10 }); });
  call(up, 'upgrade', 'sawmill_1'); runUntilIdle(up, 800);
  assert.equal(up.snapshot().buildings.sawmill_1.level, 2);
  assert.equal(stock(up, 'wood'), 20); assert.equal(stock(up, 'stone'), 20); assert.equal(stock(up, 'scrap'), 4);
  const mill = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 3); fix(st, 'sawmill_1', 2); give(st, { plank: 9 }); });
  call(mill, 'craft', 'beam', 2); runUntilIdle(mill, 800);
  assert.equal(stock(mill, 'beam'), 2); assert.equal(stock(mill, 'plank'), 3);
});

test('the chain works end to end: wood becomes planks, planks become a beam; the ledger stays balanced', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 3); fix(st, 'sawmill_1', 2); give(st, { wood: 30 }); });
  call(sim, 'craft', 'plank', 3); runUntilIdle(sim, 1500);
  call(sim, 'craft', 'beam', 2); runUntilIdle(sim, 1500);
  assert.equal(stock(sim, 'beam'), 2); assert.equal(stock(sim, 'plank'), 0); assert.equal(stock(sim, 'wood'), 21);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('storage: a full plank store refuses the batch (STORAGE_FULL) and spends nothing', () => {
  const cap = defs.buildings.hq.storage.plank;
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); fix(st, 'sawmill_1', 1); give(st, { wood: 20 }); st.ledger['stock.plank'].total = defs.buildings.hq.levels[2].storage.plank; });
  call(sim, 'craft', 'plank', 1); runUntilIdle(sim, 300);
  assert.ok(failed(sim).includes('STORAGE_FULL'), failed(sim)); assert.equal(stock(sim, 'wood'), 20);
  assert.ok(cap > 0);
});
