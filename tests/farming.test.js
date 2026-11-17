import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, types, sandbox } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { dayOf, weatherAt } from '../src/modules/environment/index.js';
import { syncPlots } from '../src/modules/farming/index.js';

// O10 farming (docs/game/16): field (level 1) / greenhouse (level 2), plots with ledger accounts, planting, watering, rain, weather hazards.

const repaired = (st, id = 'field_1') => { const b = st.buildings[id]; b.health = defs.buildings[b.type].levels[b.level].maxHealth; b.condition = 'repaired'; };
const fresh = (st) => { Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100 }); };
const farm = (sim) => sim.studentView().buildings.find((b) => b.id === 'field_1').farm;
const stock = (sim, item) => sim.snapshot().ledger[`stock.${item}`].total;
const ready = (st, id, crop, qty, extra = {}) => { // put a plot straight into the "ripe" state (the crop's yield waits in its ledger account)
  Object.assign(st.plots[id], { crop, stage: 'ready', progress: defs.crops[crop].growthTicks * 100, water: 0, damage: 0, ...extra });
  st.ledger[`plot.${id}`].total = qty;
};
const growing = (st, id, crop, extra = {}) => Object.assign(st.plots[id], { crop, stage: 'growing', progress: 0, water: 0, damage: 0, ...extra });
/** First tick (>= from) at which the calendar says `predicate(weather)`. */
const tickWhere = (predicate, from = 0) => { for (let t = from; t < 20000; t++) if (predicate(weatherAt(defs, t))) return t; throw new Error('no such weather'); };
const dayStart = (day) => (day - 1) * defs.environment.ticksPerDay - defs.environment.startHour * (defs.environment.ticksPerDay / 24);

test('the farm starts as a ruin with its plots; farming at a ruin is refused until it is repaired', () => {
  const sim = newSim();
  const f = sim.studentView().buildings.find((b) => b.id === 'field_1');
  assert.equal(f.condition, 'ruined');
  assert.equal(f.name, 'Field');
  assert.equal(f.farm.working, false);
  assert.equal(f.farm.plots.length, 4);
  assert.deepEqual(f.farm.plots.map((p) => p.stage), ['empty', 'empty', 'empty', 'empty']);
  call(sim, 'farm', 'field_1', 'potato'); runUntilIdle(sim, 50);
  assert.equal(sim.snapshot().survivors.survivor_1.lastTask.reason, 'NEEDS_REPAIR');
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('plant -> water -> grow -> ripe -> harvest -> unload: a whole wheat cycle, with the ledger balanced the whole way', () => {
  const sim = newSim('stage1', 1, (st) => { repaired(st); fresh(st); st.ledger['stock.water'].total = 30; });
  const wheat0 = stock(sim, 'wheat'); const water0 = stock(sim, 'water');
  call(sim, 'farm', 'field_1', 'wheat', 1);
  let violations = 0;
  while (!sim.isIdle() && sim.tick < 3000) { sim.step(1); if (sim.tick % 50 === 0 && ledgerViolations(sim.snapshot()).length) violations += 1; }
  const st = sim.snapshot();
  assert.equal(violations, 0);
  assert.equal(st.survivors.survivor_1.lastTask.reason, 'TARGET_REACHED');
  assert.equal(st.survivors.survivor_1.lastTask.status, 'COMPLETED');
  assert.equal(st.survivors.survivor_1.lastTask.gathered, 4, 'the 4 wheat of one plot reached storage');
  assert.equal(stock(sim, 'wheat'), wheat0 - 4 + 4, 'she planted all four empty plots (4 seeds) and harvested one (4 wheat)');
  assert.ok(stock(sim, 'water') < water0, 'hand watering spent water');
  assert.equal(st.plots.field_1_1.stage, 'empty', 'the harvested plot is free again');
  assert.deepEqual(st.survivors.survivor_1.inventory.items, {}, 'nothing is left in her hands');
  const crop = types(sim).filter((t) => t.startsWith('crop.'));
  assert.equal(crop.filter((t) => t === 'crop.planted').length, 4);
  assert.equal(crop.filter((t) => t === 'crop.harvested').length, 1);
  assert.ok(crop.indexOf('crop.ready') > crop.lastIndexOf('crop.planted') - 4 && crop.indexOf('crop.ready') < crop.indexOf('crop.harvested'));
  assert.ok(st.survivors.survivor_1.skills.farming >= 0 && st.survivors.survivor_1.progression.xp.farming > 0, 'farming practice earns XP');
  assert.deepEqual(ledgerViolations(st), []);
});

test('a dry plot does not grow; water makes it grow one tick per tick of water; rain waters it for free', () => {
  const dry = newSim('stage1', 1, (st) => { repaired(st); growing(st, 'field_1_1', 'potato', { water: 0 }); st.tick = tickWhere((w) => w === 'clear'); });
  dry.step(60);
  assert.equal(dry.snapshot().plots.field_1_1.progress, 0);
  assert.equal(farm(dry).plots[0].dry, true);

  const wet = newSim('stage1', 1, (st) => { repaired(st); growing(st, 'field_1_1', 'potato', { water: 30 }); st.tick = tickWhere((w) => w === 'clear'); });
  wet.step(60);
  const p = wet.snapshot().plots.field_1_1;
  assert.equal(p.progress, 30 * 100, '30 ticks of water = 30 ticks of growth at 100 %');
  assert.equal(p.water, 0);

  const rainTick = tickWhere((w) => w === 'rain', 100);
  const rain = newSim('stage1', 1, (st) => { repaired(st); growing(st, 'field_1_1', 'potato', { water: 0 }); st.tick = rainTick; });
  rain.step(5);
  assert.equal(rain.snapshot().plots.field_1_1.water, defs.farming.cap - 1, 'rain tops the plot up every tick; growth uses one tick of it');
  assert.equal(rain.snapshot().plots.field_1_1.progress, 500);
});

test('a ruined or damaged farm does not grow', () => {
  const sim = newSim('stage1', 1, (st) => { growing(st, 'field_1_1', 'potato', { water: 100 }); st.tick = tickWhere((w) => w === 'clear'); });
  sim.step(30);
  assert.equal(sim.snapshot().plots.field_1_1.progress, 0);
});

test('a greenhouse grows 1.5x faster, yields 1.5x and has more plots', () => {
  const sim = newSim('stage1', 1, (st) => {
    st.buildings.field_1.level = 2; repaired(st); syncPlots(st, defs, st.buildings.field_1);
    growing(st, 'field_1_1', 'wheat', { water: defs.farming.cap }); st.tick = tickWhere((w) => w === 'clear');
  });
  assert.equal(farm(sim).plots.length, 6);
  assert.equal(sim.studentView().buildings.find((b) => b.id === 'field_1').name, 'Greenhouse');
  sim.step(480); // 720 ticks of work at 150 % = 480 ticks, and 240 ticks of water is not enough: refill once
  const p = sim.snapshot().plots.field_1_1;
  assert.equal(p.water, 0);
  assert.equal(p.progress, 240 * 150, 'the water ran out after 240 ticks');
  const st2 = newSim('stage1', 1, (st) => { st.buildings.field_1.level = 2; repaired(st); syncPlots(st, defs, st.buildings.field_1); growing(st, 'field_1_1', 'wheat', { progress: 719 * 100 - 50, water: 5 }); st.tick = tickWhere((w) => w === 'clear'); });
  st2.step(2);
  assert.equal(st2.snapshot().plots.field_1_1.stage, 'ready');
  assert.equal(st2.snapshot().ledger['plot.field_1_1'].total, 6, 'wheat yields 4, a greenhouse 150 % = 6');
});

test('upgrading the field to a greenhouse adds its plots and keeps the crops that are growing', () => {
  const sim = newSim('stage1', 1, (st) => { repaired(st); fresh(st); st.ledger['stock.wood'].total = 40; st.ledger['stock.stone'].total = 40; st.survivors.survivor_1.skills.repair = 1; growing(st, 'field_1_1', 'carrot'); });
  call(sim, 'upgrade', 'field_1'); runUntilIdle(sim, 400);
  assert.equal(sim.snapshot().buildings.field_1.level, 2);
  assert.equal(Object.keys(sim.snapshot().plots).length, 6);
  assert.equal(sim.snapshot().plots.field_1_1.crop, 'carrot');
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('weather hazards: an open field loses part of a growing crop and of a ripe one; a greenhouse loses nothing', () => {
  const stormDay = dayOf(defs, tickWhere((w) => w === 'storm'));
  const before = dayStart(stormDay) - 2;
  const build = (level) => newSim('stage1', 1, (st) => {
    st.buildings.field_1.level = level; repaired(st); syncPlots(st, defs, st.buildings.field_1);
    growing(st, 'field_1_1', 'wheat', { water: 50 }); ready(st, 'field_1_2', 'wheat', 5); growing(st, 'field_1_3', 'potato', { water: 50 });
    st.tick = before;
  });
  const field = build(1); field.step(4);
  const s = field.snapshot();
  assert.equal(s.plots.field_1_1.damage, 40, 'wheat loses 40 % to a storm');
  assert.equal(s.plots.field_1_3.damage, 25, 'potato loses 25 %');
  assert.equal(s.ledger['plot.field_1_2'].total, 3, '5 ripe wheat - floor(5 x 40 %) = 3');
  assert.deepEqual(types(field).filter((t) => t === 'crop.damaged').length, 3);
  assert.deepEqual(ledgerViolations(s), []);

  const house = build(2); house.step(4);
  const h = house.snapshot();
  assert.equal(h.plots.field_1_1.damage, 0);
  assert.equal(h.ledger['plot.field_1_2'].total, 5);
});

test('damage lowers the yield (never below 1) and a ripe plot always keeps at least one unit', () => {
  const sim = newSim('stage1', 1, (st) => { repaired(st); growing(st, 'field_1_1', 'carrot', { damage: 90, progress: 359 * 100, water: 5 }); st.tick = tickWhere((w) => w === 'clear'); });
  sim.step(2);
  assert.equal(sim.snapshot().ledger['plot.field_1_1'].total, 1, 'carrot yield 3 at 90 % damage = 0.3 -> 1');
  const storm = dayOf(defs, tickWhere((w) => w === 'storm'));
  const lone = newSim('stage1', 1, (st) => { repaired(st); ready(st, 'field_1_1', 'wheat', 1); st.tick = dayStart(storm) - 2; });
  lone.step(4);
  assert.equal(lone.snapshot().ledger['plot.field_1_1'].total, 1);
});

test('the forecast tells the learner when a hazard comes: harvesting before it saves the crop', () => {
  const storm = dayOf(defs, tickWhere((w) => w === 'storm'));
  const sim = newSim('stage1', 1, (st) => { repaired(st); fresh(st); ready(st, 'field_1_1', 'wheat', 4); st.tick = dayStart(storm) - 60; });
  assert.ok(sim.studentView().world.forecast.some((d) => d.weather === 'storm'));
  call(sim, 'farm', 'field_1', 'wheat', 1); runUntilIdle(sim, dayStart(storm) + 200);
  assert.equal(sim.snapshot().survivors.survivor_1.lastTask.reason, 'TARGET_REACHED');
  assert.equal(stock(sim, 'wheat'), 10 + 4);
});

test('stop reasons: no seed, no water, nothing to do', () => {
  const noSeed = newSim('stage1', 1, (st) => { repaired(st); fresh(st); st.ledger['stock.potato'].total = 0; });
  call(noSeed, 'farm', 'field_1', 'potato'); runUntilIdle(noSeed, 60);
  assert.equal(noSeed.snapshot().survivors.survivor_1.lastTask.reason, 'NO_SEED');
  assert.equal(noSeed.snapshot().survivors.survivor_1.lastTask.status, 'FAILED');

  const noWater = newSim('stage1', 1, (st) => { repaired(st); fresh(st); st.ledger['stock.water'].total = 0; st.tick = tickWhere((w) => w === 'clear'); });
  call(noWater, 'farm', 'field_1', 'carrot'); runUntilIdle(noWater, 400);
  const t = noWater.snapshot().survivors.survivor_1.lastTask;
  assert.equal(t.reason, 'NO_WATER');
  assert.equal(t.status, 'COMPLETED', 'she planted before the water ran out');
  assert.equal(noWater.snapshot().plots.field_1_1.stage, 'growing');

  const idle = newSim('stage1', 1, (st) => { repaired(st); fresh(st); for (const i of [1, 2, 3, 4]) growing(st, `field_1_${i}`, 'wheat', { water: 0 }); st.ledger['stock.water'].total = 0; st.tick = tickWhere((w) => w === 'clear'); });
  call(idle, 'farm', 'field_1', 'potato'); runUntilIdle(idle, 60);
  assert.equal(idle.snapshot().survivors.survivor_1.lastTask.reason, 'NOTHING_TO_DO', 'every plot is taken by another crop');
});

test('a full storage stops the harvest with STORAGE_FULL and leaves the crop in the plot', () => {
  const sim = newSim('stage1', 1, (st) => { repaired(st); fresh(st); ready(st, 'field_1_1', 'wheat', 4); for (const i of [2, 3, 4]) growing(st, `field_1_${i}`, 'potato', { water: 200 }); st.ledger['stock.wheat'].total = 60; });
  call(sim, 'farm', 'field_1', 'wheat'); runUntilIdle(sim, 200);
  assert.equal(sim.snapshot().survivors.survivor_1.lastTask.reason, 'STORAGE_FULL');
  assert.equal(sim.snapshot().ledger['plot.field_1_1'].total, 4);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('stopping or being replaced mid-chore gives every reserved unit back', () => {
  const sim = newSim('stage1', 1, (st) => { repaired(st); fresh(st); st.tick = tickWhere((w) => w === 'clear'); });
  const seeds = stock(sim, 'potato');
  call(sim, 'farm', 'field_1', 'potato');
  sim.step(8); // walking / planting
  call(sim, 'stop'); sim.step(1);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  assert.ok(stock(sim, 'potato') === seeds || stock(sim, 'potato') === seeds - 1, 'a seed is either still in stock or really planted');
  assert.equal(sim.snapshot().ledger['stock.potato'].reserved, 0);
});

test('a harvest is carried and unloaded at storage; the crop is a fresh perishable batch', () => {
  const sim = newSim('stage1', 1, (st) => { repaired(st); fresh(st); ready(st, 'field_1_1', 'carrot', 3); st.ledger['stock.carrot'].total = 0; st.perishables.carrot = []; });
  call(sim, 'farm', 'field_1', 'carrot', 1); runUntilIdle(sim, 300);
  assert.equal(stock(sim, 'carrot'), 3);
  assert.deepEqual(sim.snapshot().perishables.carrot, [{ qty: 3, age: 0 }]);
  assert.deepEqual(sim.studentView().base.perishables.find((p) => p.item === 'carrot').qty, 3);
});

test('learner code: survivor.farm() validates its arguments, crops and farm.plots can be read and are read-only', async () => {
  const sim = newSim('stage1', 1, (st) => { repaired(st); ready(st, 'field_1_1', 'potato', 3); });
  const view = sim.studentView();
  const ok = await sandbox.run({ code: 'const p = field_1.farm.plots.find((x) => x.stage === "ready"); if (p) survivor.farm(field_1, "potato", 1);', view, seed: 1 });
  assert.equal(ok.ok, true, JSON.stringify(ok.error));
  assert.deepEqual(ok.calls.map((c) => [c.name, c.args]), [['farm', ['field_1', 'potato', 1]]]);
  for (const code of ['survivor.farm("potato")', 'survivor.farm(field_1)', 'survivor.farm(field_1, 3)', 'survivor.farm(field_1, "potato", 0)', 'survivor.farm(field_1, "potato", 1.5)', 'survivor.farm(field_1, "potato", 2, 3)']) {
    const r = await sandbox.run({ code, view, seed: 1 });
    assert.equal(r.ok, false, code);
  }
  const read = await sandbox.run({ code: 'console.log(crops.potato.yield, crops.wheat.hazards.storm, base.potato, field_1.farm.sheltered);', view, seed: 1 });
  assert.equal(read.ok, true);
  assert.equal(read.logs[0], '3 40 4 false');
  const write = await sandbox.run({ code: 'field_1.farm.plots[0].stage = "ready";', view, seed: 1 });
  assert.equal(write.ok, false);
  const mutate = await sandbox.run({ code: 'crops.potato.yield = 99;', view, seed: 1 });
  assert.equal(mutate.ok, false);
});

test('an unknown crop or a building that is not a farm is refused before any work', () => {
  const sim = newSim('stage1', 1, (st) => { repaired(st); fresh(st); });
  call(sim, 'farm', 'field_1', 'turnip'); runUntilIdle(sim, 30);
  assert.equal(sim.snapshot().survivors.survivor_1.lastTask.reason, 'INVALID_PARAMS');
  call(sim, 'farm', 'hq', 'potato'); runUntilIdle(sim, 60);
  assert.equal(sim.snapshot().survivors.survivor_1.lastTask.reason, 'UNKNOWN_TARGET');
});

test('definitions validation: crops, farm levels and the farm action are checked', () => {
  assert.throws(() => createDefinitions({ crops: { ...defs.crops, potato: { ...defs.crops.potato, hazards: { meteor: 10 } } } }), /hazard/);
  assert.throws(() => createDefinitions({ crops: { ...defs.crops, turnip: { name: 'Turnip', growthTicks: 100, seeds: 1, yield: 1 } } }), /must also be an item/);
  assert.throws(() => createDefinitions({ crops: { ...defs.crops, potato: { ...defs.crops.potato, growthTicks: 0 } } }), /growthTicks/);
  const b = structuredClone(defs.buildings);
  b.field.levels[1].farm.shelter = 'yes';
  assert.throws(() => createDefinitions({ buildings: b }), /farm needs/);
  assert.throws(() => createDefinitions({ farming: { ...defs.farming, cap: 10 } }), /farming/);
  assert.equal(defs.actions.farm.handler, 'farm');
});

test('determinism: the same farm job gives the same state hash', () => {
  const run = () => { const sim = newSim('stage1', 7, (st) => { repaired(st); fresh(st); st.ledger['stock.water'].total = 40; }); call(sim, 'farm', 'field_1', 'carrot', 2); sim.step(1500); return sim.stateHash(); };
  assert.equal(run(), run());
});

test('soak: random farming, eating and weather over many days never breaks the ledger or the plots', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const sim = newSim('stage1', seed, (st) => { repaired(st); fresh(st); st.ledger['stock.water'].total = 100; st.ledger['stock.wood'].total = 20; });
    const crops = ['wheat', 'potato', 'carrot'];
    for (let i = 0; i < 60; i++) {
      try { if (i % 3 === 0) call(sim, 'farm', 'field_1', crops[(seed + i) % 3], 1 + (i % 3)); else if (i % 3 === 1) call(sim, 'drink'); else call(sim, 'eat'); } catch { /* refused: free */ }
      sim.step(120);
      const st = sim.snapshot();
      assert.deepEqual(ledgerViolations(st), [], `seed ${seed} step ${i}`);
      for (const p of Object.values(st.plots)) {
        assert.ok(['empty', 'growing', 'ready'].includes(p.stage));
        assert.ok(p.damage >= 0 && p.damage <= defs.farming.maxDamage && p.water >= 0 && p.water <= defs.farming.cap);
        assert.ok((p.stage === 'empty') === (p.crop === null), `${p.id}: crop and stage agree`);
        if (p.stage !== 'ready') assert.equal(st.ledger[`plot.${p.id}`].total, 0, `${p.id}: only a ripe plot holds units`);
      }
      for (const item of Object.keys(defs.items)) assert.ok(st.ledger[`stock.${item}`].total <= 400 + 1000);
      if (st.survivors.survivor_1.status !== 'active') break;
    }
    for (const p of Object.values(sim.snapshot().plots)) { /* shape only */ assert.equal(p.farmId, 'field_1'); }
  }
});
