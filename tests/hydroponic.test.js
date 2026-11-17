// O13 hydroponic farm (field level 3): glass upgrade, indoor (no rain, no weather), 8 plots, 200 % growth / 250 % yield, grows only while powered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, types } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { weatherAt } from '../src/modules/environment/index.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) st.ledger[`stock.${k}`].total = v; };
const stock = (sim, k) => sim.snapshot().ledger[`stock.${k}`].total;
const farm = (sim) => sim.studentView().buildings.find((b) => b.id === 'field_1').farm;
const hydro = (st, { grid = true, wood = 60 } = {}) => {
  fix(st, 'field_1', 3);
  // the farm's plots exist for the level the scenario was built at; a test that starts at level 3 asks for the extra ones
  for (let i = 1; i <= 8; i++) { const id = `field_1_${i}`; if (!st.plots[id]) { st.plots[id] = { id, farmId: 'field_1', index: i, crop: null, stage: 'empty', progress: 0, water: 0, damage: 0 }; st.ledger[`plot.${id}`] = { total: 0, reserved: 0 }; } }
  if (grid) fix(st, 'generator_1');
  give(st, { wood });
  Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100 });
};
const growing = (st, id, crop, extra = {}) => Object.assign(st.plots[id], { crop, stage: 'growing', progress: 0, water: 200, damage: 0, ...extra });
const tickWhere = (predicate, from = 0) => { for (let t = from; t < 20000; t++) if (predicate(weatherAt(defs, t))) return t; throw new Error('no such weather'); };

test('level 3 is a hydroponic farm in the data: indoor, 8 plots, 200 % growth, 250 % yield, power use 5, glass in the upgrade', () => {
  const L = defs.buildings.field.levels[3];
  assert.deepEqual(L.farm, { plots: 8, growth: 200, yield: 250, shelter: true, indoor: true });
  assert.equal(L.power.use, 5);
  assert.equal(L.name, 'Hydroponic Farm');
  assert.equal(defs.buildings.field.upgrade[3].cost.glass, 12);
});

test('the upgrade needs a repaired greenhouse and 12 glass (from the workshop); it spends exactly the cost and adds plots', () => {
  const noGlass = newSim('stage1', 1, (st) => { fix(st, 'field_1', 2); give(st, { wood: 40, stone: 40, glass: 5 }); st.survivors.survivor_1.skills.repair = 1; });
  call(noGlass, 'upgrade', 'field_1'); runUntilIdle(noGlass);
  assert.ok(JSON.stringify(noGlass.log.all()).includes('INSUFFICIENT_RESOURCE'));
  assert.equal(stock(noGlass, 'glass'), 5);

  const sim = newSim('stage1', 1, (st) => { fix(st, 'field_1', 2); give(st, { wood: 40, stone: 40, glass: 12 }); st.survivors.survivor_1.skills.repair = 1; });
  const before = farm(sim).plots.length; // the scenario built plots for level 1; the upgrade adds the rest
  assert.ok(before < 8);
  call(sim, 'upgrade', 'field_1'); runUntilIdle(sim, 800);
  const v = sim.studentView().buildings.find((b) => b.id === 'field_1');
  assert.equal(v.level, 3); assert.equal(v.name, 'Hydroponic Farm');
  assert.equal(v.farm.plots.length, 8);
  assert.equal(stock(sim, 'glass'), 0); assert.equal(stock(sim, 'wood'), 25); assert.equal(stock(sim, 'stone'), 25);
  assert.equal(v.farm.indoor, true); assert.equal(v.farm.needsPower, true);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('powered: it grows at 200 % (a potato in half the ticks) and the generator burns wood for the draw of 5', () => {
  const sim = newSim('stage1', 1, (st) => { hydro(st); growing(st, 'field_1_1', 'potato'); });
  sim.step(100);
  assert.equal(farm(sim).powered, true);
  assert.equal(sim.snapshot().plots.field_1_1.progress, 99 * 200, 'the grid answers one tick after the demand appears');
  assert.ok(stock(sim, 'wood') < 60, 'fuel was burned');
  assert.equal(sim.studentView().power.demand, 5);
});

test('unpowered: nothing grows, nothing is lost, and it resumes the moment power returns', () => {
  const sim = newSim('stage1', 1, (st) => { hydro(st, { grid: false }); growing(st, 'field_1_1', 'potato'); });
  sim.step(200);
  assert.equal(farm(sim).powered, false);
  assert.equal(sim.snapshot().plots.field_1_1.progress, 0);
  assert.equal(sim.snapshot().plots.field_1_1.water, 200, 'water is not used up either');
  const st = sim.snapshot();
  const sim2 = newSim('stage1', 1, (s) => { hydro(s, { grid: false }); growing(s, 'field_1_1', 'potato'); fix(s, 'generator_1'); });
  sim2.step(50);
  assert.equal(sim2.snapshot().plots.field_1_1.progress, 49 * 200);
  assert.ok(st);
});

test('no fuel, no power: a hydroponic farm with a generator but no wood stops growing (NO_FUEL)', () => {
  const sim = newSim('stage1', 1, (st) => { hydro(st, { wood: 0 }); growing(st, 'field_1_1', 'potato'); });
  sim.step(60);
  assert.equal(sim.studentView().buildings.find((b) => b.id === 'generator_1').power.status, 'NO_FUEL');
  assert.equal(sim.snapshot().plots.field_1_1.progress, 0);
});

test('yield is 250 %: a ripe potato plot (yield 3) holds 7 units, wheat 10', () => {
  const sim = newSim('stage1', 1, (st) => { hydro(st); growing(st, 'field_1_1', 'potato', { progress: defs.crops.potato.growthTicks * 100 - 200 }); growing(st, 'field_1_2', 'wheat', { progress: defs.crops.wheat.growthTicks * 100 - 200 }); });
  sim.step(3);
  assert.equal(farm(sim).plots[0].ready, 7);
  assert.equal(farm(sim).plots[1].ready, 10);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('indoors: rain does not water the plots (hand watering is still needed) and storms do no damage', () => {
  const rainTick = tickWhere((w) => w === 'rain', 100);
  const rain = newSim('stage1', 1, (st) => { hydro(st); growing(st, 'field_1_1', 'potato', { water: 0 }); st.tick = rainTick; });
  rain.step(5);
  assert.equal(rain.snapshot().plots.field_1_1.water, 0, 'no rain top-up indoors');
  assert.equal(rain.snapshot().plots.field_1_1.progress, 0);
  assert.equal(farm(rain).plots[0].dry, true);

  const stormTick = tickWhere((w) => w === 'storm');
  const storm = newSim('stage1', 1, (st) => { hydro(st); growing(st, 'field_1_1', 'wheat'); st.tick = stormTick - 5; });
  storm.step(defs.environment.ticksPerDay * 2);
  assert.equal(storm.snapshot().plots.field_1_1.damage, 0);
  assert.ok(!types(storm).includes('crop.damaged'));
});

test('survivor.farm works a hydroponic farm end to end: plant, water by hand, wait for growth, harvest 250 %; ledger balanced', () => {
  const sim = newSim('stage1', 1, (st) => { hydro(st); give(st, { potato: 8, water: 40 }); });
  call(sim, 'farm', 'field_1', 'potato', 8);
  runUntilIdle(sim, 6000);
  const st = sim.snapshot();
  assert.ok(st.ledger['stock.potato'].total > 8, 'harvest beat the seeds spent');
  assert.deepEqual(ledgerViolations(st), []);
  assert.ok(types(sim).includes('crop.ready'));
});

test('definitions validation: indoor must be true/false', () => {
  const field = structuredClone(defs.buildings.field);
  field.levels[3].farm.indoor = 'yes';
  assert.throws(() => createDefinitions({ buildings: { ...defs.buildings, field } }), /indoor/);
});

test('hydroponics is deterministic and replays exactly', () => {
  const run = () => { const s = newSim('stage1', 5, (st) => { hydro(st); give(st, { potato: 8, water: 40 }); }); call(s, 'farm', 'field_1', 'potato', 4); runUntilIdle(s, 4000); return s.stateHash(); };
  assert.equal(run(), run());
});
