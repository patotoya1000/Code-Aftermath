// O11 power: producers (generator burning wood only while needed, solar by daylight and weather), the freezer as the first consumer,
// the all-or-nothing grid, fuel conservation, learner reads, upgrades, definitions validation, determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, sandbox, noCrops } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { createFreeSim, runLiveCode, replayTimeline } from '../src/modules/session/index.js';
import { describeApi } from '../src/modules/api/index.js';
import { sunPercent } from '../src/modules/power/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';

const DAY = defs.environment.ticksPerDay;
const wood = (sim) => sim.snapshot().ledger['stock.wood'].total;
const view = (sim, id) => sim.studentView().buildings.find((b) => b.id === id);
const events = (sim, type) => sim.log.all().filter((e) => e.type === type);

const fix = (st, id, type, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[type].levels[level].maxHealth; b.condition = 'repaired'; };
const freezer = (st) => fix(st, 'storage_1', 'storage', 3);
const generator = (st, level = 1) => fix(st, 'generator_1', 'generator', level);
const solar = (st) => fix(st, 'solar_1', 'solar_panel');
const stocked = (st, w = 50) => { st.ledger['stock.wood'].total = w; };
const bread = (st, qty = 10) => { noCrops(st); st.perishables.bread = [{ qty, age: 0 }]; st.ledger['stock.bread'].total = qty; };
const breadAge = (sim) => sim.snapshot().perishables.bread[0].age;

test('the scenario places a ruined generator and a ruined solar panel; a ruin produces nothing and costs nothing', () => {
  const sim = newSim('stage1', 1, stocked);
  for (const id of ['generator_1', 'solar_1']) assert.equal(view(sim, id).condition, 'ruined');
  sim.step(300);
  assert.equal(wood(sim), 50);
  assert.deepEqual(sim.studentView().power, { produced: 0, demand: 0, balance: 0, ok: true, stored: 0, capacity: 0, sun: sim.studentView().power.sun, producers: 0, working: 0 });
});

test('a generator is demand-driven: with no consumer it idles and burns no fuel', () => {
  const sim = newSim('stage1', 1, (st) => { generator(st); stocked(st); });
  sim.step(200);
  assert.equal(view(sim, 'generator_1').power.status, 'IDLE');
  assert.equal(wood(sim), 50);
});

test('a powered freezer makes the generator burn one wood per `every` ticks, exactly', () => {
  const sim = newSim('stage1', 1, (st) => { generator(st); freezer(st); stocked(st); });
  sim.step(100);
  assert.equal(view(sim, 'generator_1').power.status, 'RUNNING');
  assert.equal(view(sim, 'storage_1').power.powered, true);
  assert.equal(wood(sim), 50 - 5, 'wood at ticks 1, 21, 41, 61 and 81');
  assert.deepEqual(sim.studentView().power.produced, 10);
  assert.deepEqual(sim.studentView().power.demand, 6);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('the advanced generator makes more power from less fuel', () => {
  const l1 = newSim('stage1', 1, (st) => { generator(st, 1); freezer(st); stocked(st); });
  const l2 = newSim('stage1', 1, (st) => { generator(st, 2); freezer(st); stocked(st); });
  l1.step(120); l2.step(120);
  assert.ok(50 - wood(l2) < 50 - wood(l1));
  assert.equal(l2.studentView().power.produced, 24);
});

test('without fuel the freezer is NO_POWER and protects nothing; wood in stock brings it back', () => {
  const sim = newSim('stage1', 1, (st) => { generator(st); freezer(st); stocked(st, 0); bread(st); });
  sim.step(5);
  assert.equal(view(sim, 'generator_1').power.status, 'NO_FUEL');
  assert.equal(view(sim, 'storage_1').power.status, 'NO_POWER');
  assert.equal(view(sim, 'storage_1').cold.working, false);
  assert.equal(view(sim, 'storage_1').cold.powered, false);
  assert.equal(sim.studentView().power.ok, false);
  sim.snapshot(); // (read only)
  const fed = newSim('stage1', 1, (st) => { generator(st); freezer(st); stocked(st, 0); });
  fed.step(5);
  const st = fed.snapshot(); st.ledger['stock.wood'].total = 3;
  const again = createSimulation({ defs, state: st });
  again.step(3);
  assert.equal(again.studentView().buildings.find((b) => b.id === 'storage_1').power.powered, true);
});

test('food ages 5x slower in a powered freezer and at the normal rate in an unpowered one', () => {
  const on = newSim('stage1', 1, (st) => { generator(st); freezer(st); stocked(st); bread(st); });
  const off = newSim('stage1', 1, (st) => { freezer(st); stocked(st); bread(st); }); // no generator repaired
  on.step(DAY); off.step(DAY);
  assert.equal(breadAge(on), Math.floor(100 / defs.buildings.storage.levels[3].cold.factor));
  assert.equal(breadAge(off), 100);
  assert.equal(on.studentView().base.perishables[0].cold, true);
  assert.equal(off.studentView().base.perishables[0].cold, false);
});

test('solar covers the freezer in clear daylight (generator idles), and fails at night (generator takes over)', () => {
  const sim = newSim('stage1', 1, (st) => { solar(st); generator(st); freezer(st); stocked(st); });
  sim.step(30); // morning, clear
  assert.equal(view(sim, 'solar_1').power.status, 'RUNNING');
  assert.equal(view(sim, 'solar_1').power.producing, 8);
  assert.equal(view(sim, 'generator_1').power.status, 'IDLE');
  assert.equal(wood(sim), 50);
  sim.step(100); // tick 130: night
  assert.equal(view(sim, 'solar_1').power.status, 'DARK');
  assert.equal(view(sim, 'generator_1').power.status, 'RUNNING');
  assert.equal(view(sim, 'storage_1').power.powered, true);
  assert.ok(wood(sim) < 50);
});

test('weather scales solar: a rainy day gives floor(8 x 40%) = 3 and the generator makes up the rest', () => {
  const env = structuredClone(defs.environment);
  for (const s of env.seasons) s.phases = [{ weather: 'rain', days: s.days }];
  const d = createDefinitions({ environment: env });
  const state = createInitialState({ defs: d, scenarioId: 'stage1', seed: 1 });
  for (const [id, type] of [['solar_1', 'solar_panel'], ['generator_1', 'generator'], ['storage_1', 'storage']]) { const b = state.buildings[id]; b.level = type === 'storage' ? 3 : 1; b.health = d.buildings[type].levels[b.level].maxHealth; b.condition = 'repaired'; }
  state.ledger['stock.wood'].total = 40;
  const sim = createSimulation({ defs: d, state });
  sim.step(30);
  assert.equal(sunPercent(d, sim.tick), 40);
  const grid = sim.studentView().power;
  assert.equal(sim.studentView().buildings.find((b) => b.id === 'solar_1').power.producing, 3);
  assert.equal(grid.produced, 3 + 10);
  assert.equal(grid.ok, true);
});

test('the grid is all-or-nothing per consumer, served in id order, and never invents power', () => {
  // Two consumers of 6 on a 10-power generator: the first (by id) is powered, the second is not.
  const env = structuredClone(defs.buildings);
  env.generator.levels[1].power.output = 10;
  env.tent.levels[1].power = { use: 6 };
  const d = createDefinitions({ buildings: env });
  const state = createInitialState({ defs: d, scenarioId: 'stage1', seed: 1 });
  for (const [id, type, lvl] of [['generator_1', 'generator', 1], ['storage_1', 'storage', 3], ['tent_1', 'tent', 1]]) { const b = state.buildings[id]; b.level = lvl; b.health = d.buildings[type].levels[lvl].maxHealth; b.condition = 'repaired'; }
  state.ledger['stock.wood'].total = 20;
  const sim = createSimulation({ defs: d, state });
  sim.step(3);
  const v = (id) => sim.studentView().buildings.find((b) => b.id === id).power;
  assert.equal(v('storage_1').powered, true, 'storage_1 comes before tent_1');
  assert.equal(v('tent_1').powered, false);
  assert.equal(sim.studentView().power.demand, 12);
  assert.equal(sim.studentView().power.balance, -2);
});

test('status changes are events, once per change', () => {
  const sim = newSim('stage1', 1, (st) => { generator(st); freezer(st); stocked(st, 2); });
  sim.step(100);
  const ev = events(sim, 'power.status').filter((e) => e.buildingId === 'generator_1').map((e) => e.to);
  assert.deepEqual(ev, ['RUNNING', 'NO_FUEL']);
});

test('generator and freezer are reached through repair and upgrade (no free construction)', () => {
  const sim = newSim('stage1', 1, (st) => { st.ledger['stock.wood'].total = 300; st.ledger['stock.stone'].total = 300; st.survivors.survivor_1.skills.repair = 1; });
  for (let i = 0; i < 6; i++) call(sim, 'repair', 'generator_1');
  runUntilIdle(sim, 1500);
  assert.equal(view(sim, 'generator_1').condition, 'repaired');
  call(sim, 'upgrade', 'generator_1'); runUntilIdle(sim, 2500);
  assert.equal(view(sim, 'generator_1').level, 2);
  assert.equal(view(sim, 'generator_1').name, 'Advanced Generator');
  assert.equal(view(sim, 'storage_1').upgrade.level, 2);
});

test('learner code reads the grid and a producer by id, read-only', async () => {
  const { sim } = createFreeSim({ defs });
  const r = await runLiveCode({ sim, sandbox, actorId: 'survivor_1', code: 'console.log(power.ok, power.demand, generator_1.power.status, generator_1.power.fuel.item, solar_1.power.kind, storage_1.power);' });
  assert.ok(r.ok, r.error?.message);
  assert.equal(r.logs[0], 'true 0 OFF wood solar undefined');
  const bad = await runLiveCode({ sim, sandbox, actorId: 'survivor_1', code: 'generator_1.power.status = "RUNNING";' });
  assert.equal(bad.ok, false);
  const bad2 = await runLiveCode({ sim, sandbox, actorId: 'survivor_1', code: 'power.produced = 99;' });
  assert.equal(bad2.ok, false);
});

test('the API documents the power reads', () => {
  const reads = describeApi().reads.join('\n');
  assert.ok(reads.includes('power   (the grid'));
  assert.ok(reads.includes('generator_1.power'));
});

test('definitions: power tables and the weather solar % are validated', () => {
  const bad = (mutate, pattern, key = 'buildings') => {
    const d = structuredClone(defs); mutate(d);
    assert.throws(() => createDefinitions({ [key]: d[key] }), pattern);
  };
  bad((d) => { d.buildings.generator.levels[1].power.use = 3; }, /EITHER a producer .* OR a consumer/);
  bad((d) => { d.buildings.generator.levels[1].power.output = 0; }, /output must be a whole number/);
  bad((d) => { d.buildings.generator.levels[1].power.solar = true; }, /either solar .* or fuelled/);
  bad((d) => { delete d.buildings.generator.levels[1].power.fuel; }, /either solar .* or fuelled/);
  bad((d) => { d.buildings.generator.levels[1].power.fuel.item = 'lava'; }, /fuel needs a known item/);
  bad((d) => { d.buildings.storage.levels[3].power.use = 0; }, /use must be a whole number/);
  bad((d) => { d.environment.weather.clear.solar = 250; }, /solar must be a whole number/, 'environment');
});

test('determinism: the same seed and ticks give the same hash and log, and a session replays', () => {
  const run = () => { const sim = newSim('stage1', 7, (st) => { solar(st); generator(st); freezer(st); stocked(st, 80); bread(st); }); sim.step(DAY * 3); return { hash: sim.stateHash(), log: sim.log.hash() }; };
  assert.deepEqual(run(), run());
  const live = createFreeSim({ defs, seed: 6 }).sim;
  live.step(10); live.submitCommand({ apiVersion: 1, actorId: 'survivor_1', type: 'repair', params: { targetId: 'generator_1' }, mode: 'replace' });
  live.step(500);
  const again = replayTimeline({ defs, scenarioId: 'stage1', seed: 6, timeline: live.commandTimeline(), untilTick: live.tick });
  assert.equal(again.stateHash(), live.stateHash());
});

test('soak: three days of fuel use balance the ledger exactly (burned wood = discarded wood)', () => {
  const sim = newSim('stage1', 3, (st) => { solar(st); generator(st, 2); freezer(st); stocked(st, 60); bread(st); });
  for (let i = 0; i < 12; i++) { sim.step(60); assert.deepEqual(ledgerViolations(sim.snapshot()), []); }
  const burned = 60 - wood(sim);
  assert.ok(burned > 0 && burned < 60);
  assert.equal(sim.snapshot().ledger['stock.wood'].total, 60 - burned);
});
