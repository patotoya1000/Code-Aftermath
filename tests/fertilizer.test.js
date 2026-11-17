// O15 fertilizer + charcoal: workshop recipes, the opt-in `fertilize` farm chore (+50 % harvest on one plot), generator fuel preference
// (charcoal before wood), learner API options, validation, determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, sandbox } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { yieldFor } from '../src/modules/farming/index.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) st.ledger[`stock.${k}`].total = v; };
const stock = (sim, k) => sim.snapshot().ledger[`stock.${k}`].total;
const fresh = (st) => Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100 });
const types = (sim) => sim.log.all().map((e) => e.type);

test('crafting: fertilizer (carrot + wood + water -> 2) and charcoal (4 wood -> 3) at a repaired workshop, exact inputs and outputs', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'workshop_1'); fresh(st); give(st, { wood: 20, carrot: 4, water: 10 }); });
  const wood0 = stock(sim, 'wood');
  call(sim, 'craft', 'fertilizer', 2); runUntilIdle(sim, 600);
  assert.equal(stock(sim, 'fertilizer'), 4);
  assert.equal(stock(sim, 'carrot'), 2); assert.equal(stock(sim, 'water'), 8); assert.equal(stock(sim, 'wood'), wood0 - 2);
  call(sim, 'craft', 'charcoal', 2); runUntilIdle(sim, 1200);
  assert.equal(stock(sim, 'charcoal'), 6);
  assert.equal(stock(sim, 'wood'), wood0 - 2 - 8);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('yieldFor: fertilizer adds the bonus percent on top of farm yield and weather damage; never below the unfertilized yield', () => {
  const farm = { yield: 100 };
  assert.equal(yieldFor(defs, farm, 'wheat', 0, false), 4);
  assert.equal(yieldFor(defs, farm, 'wheat', 0, true), 6);   // 4 x 1.5
  assert.equal(yieldFor(defs, farm, 'potato', 0, true), 4);  // 3 x 1.5 = 4.5 -> 4
  assert.equal(yieldFor(defs, { yield: 150 }, 'wheat', 0, true), 9); // 4 x 1.5 x 1.5
  assert.equal(yieldFor(defs, farm, 'wheat', 50, true), 3);  // damage and fertilizer both apply
  assert.ok(yieldFor(defs, farm, 'carrot', 90, true) >= 1);
});

const setup = (extra = {}) => (st) => { fix(st, 'field_1'); fresh(st); give(st, { water: 40, fertilizer: 3, wheat: 4, ...extra }); };

test('farm(..., { fertilize: true }) spreads fertilizer once per growing plot, spends exactly 1 each, and the plot ripens with the bonus', () => {
  const sim = newSim('stage1', 1, setup());
  call(sim, 'farm', 'field_1', 'wheat', { fertilize: true });
  let guard = 0;
  while (guard++ < 4000 && !sim.snapshot().plots.field_1_1.fertilized) sim.step(1);
  const st = sim.snapshot();
  const spread = types(sim).filter((t) => t === 'crop.fertilized').length;
  assert.ok(spread >= 1);
  assert.equal(stock(sim, 'fertilizer'), 3 - spread, 'one unit per fertilized plot');
  for (const p of Object.values(st.plots)) if (p.fertilized) assert.equal(p.stage, 'growing');
  while (sim.snapshot().plots.field_1_1.stage !== 'ready' && sim.tick < 6000) sim.step(1);
  assert.equal(sim.snapshot().ledger['plot.field_1_1'].total, 6, 'a fertilized wheat plot ripens with 4 x 150 % = 6');
});

test('without the option fertilizer is never used; running out of fertilizer does not stop the farming', () => {
  const plain = newSim('stage1', 1, setup());
  call(plain, 'farm', 'field_1', 'wheat'); for (let i = 0; i < 600; i++) plain.step(1);
  assert.equal(stock(plain, 'fertilizer'), 3);
  assert.ok(!types(plain).includes('crop.fertilized'));
  const none = newSim('stage1', 1, setup({ fertilizer: 0 }));
  call(none, 'farm', 'field_1', 'wheat', { fertilize: true }); for (let i = 0; i < 600; i++) none.step(1);
  assert.ok(types(none).includes('crop.planted'), 'planting went on without fertilizer');
  assert.ok(!types(none).includes('crop.fertilized'));
  assert.notEqual(none.snapshot().survivors.survivor_1.lastTask?.reason, 'NO_SEED');
});

test('harvest clears the fertilized flag; the next crop in that plot starts unfertilized', () => {
  const sim = newSim('stage1', 1, (st) => { setup()(st); Object.assign(st.plots.field_1_1, { crop: 'wheat', stage: 'ready', progress: 72000, water: 0, damage: 0, fertilized: true }); st.ledger['plot.field_1_1'].total = 6; });
  call(sim, 'farm', 'field_1', 'wheat', 1); runUntilIdle(sim, 800);
  const p = sim.snapshot().plots.field_1_1;
  assert.equal(p.fertilized, false);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('generator fuel: charcoal burns first and lasts longer than wood; wood is used when there is no charcoal', () => {
  const run = (items) => {
    const sim = newSim('stage1', 1, (st) => { fix(st, 'generator_1'); fix(st, 'storage_1', 3); give(st, items); });
    for (let i = 0; i < 100; i++) sim.step(1);
    return sim;
  };
  const wood = run({ wood: 40, charcoal: 0 });
  assert.ok(stock(wood, 'wood') < 40, 'wood was burned');
  const coal = run({ wood: 40, charcoal: 5 });
  assert.equal(stock(coal, 'wood'), 40, 'charcoal came first');
  assert.ok(stock(coal, 'charcoal') < 5);
  const gen = (sim) => sim.studentView().buildings.find((b) => b.id === 'generator_1').power.fuel;
  assert.equal(gen(coal).better.item, 'charcoal');
  assert.equal(gen(coal).item, 'wood');
});

test('learner API: farm options are validated and read-only data; fertilizer and charcoal are readable stock', async () => {
  const view = newSim('stage1', 1, setup()).studentView();
  const ok = await sandbox.run({ code: 'survivor.farm(field_1, "wheat", 2, { fertilize: true }); survivor.farm(field_1, "wheat", { fertilize: true }); console.log(base.fertilizer, base.charcoal, field_1.farm.fertilizerBonus);', view, seed: 1 });
  assert.deepEqual(ok.calls.map((c) => [c.name, c.args]), [['farm', ['field_1', 'wheat', 2, { fertilize: true }]], ['farm', ['field_1', 'wheat', { fertilize: true }]]]);
  assert.match(ok.logs.join(' '), /3 0 50/);
  for (const code of ['survivor.farm(field_1, "wheat", { fertilise: true })', 'survivor.farm(field_1, "wheat", { fertilize: 1 })', 'survivor.farm(field_1, "wheat", 2, 3, { fertilize: true })', 'survivor.farm(field_1, "wheat", 1, 2)']) {
    const r = await sandbox.run({ code, view, seed: 1 });
    assert.ok(r.error || r.calls.length === 0, code);
  }
});

test('definitions validation: fertilizer config, fuel.better and the fertilize chore time are checked', () => {
  assert.throws(() => createDefinitions({ farming: { ...defs.farming, fertilizer: { item: 'nothing', yieldBonus: 50 } } }), /fertilizer/);
  assert.throws(() => createDefinitions({ farming: { ...defs.farming, fertilizer: { item: 'fertilizer', yieldBonus: 0 } } }), /fertilizer/);
  const g = structuredClone(defs.buildings);
  g.generator.levels[1].power.fuel.better = { item: 'wood', every: 50 };
  assert.throws(() => createDefinitions({ buildings: g }), /fuel\.better/);
  const a = structuredClone(defs.actions); delete a.farm.chore.fertilize;
  assert.throws(() => createDefinitions({ actions: a }), /fertilize/);
});

test('determinism: the same fertilizing run twice gives the same state', () => {
  const go = () => { const s = newSim('stage1', 7, setup()); call(s, 'farm', 'field_1', 'wheat', { fertilize: true }); for (let i = 0; i < 800; i++) s.step(1); return s.snapshot(); };
  assert.deepEqual(go(), go());
});
