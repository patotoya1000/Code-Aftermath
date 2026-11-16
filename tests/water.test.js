// O7 water: the deep well (aquifer recharge by ticks and weather), drawing with gather("water"), waiting at an empty well,
// the siphon (auto-store, only while a working water store is within reach), the water tank, upgrades, determinism, soak.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { buildCommand, describeApi } from '../src/modules/api/index.js';
import { createFreeSim, runLiveCode, replayTimeline } from '../src/modules/session/index.js';
import { weatherAt } from '../src/modules/environment/index.js';
import { ledgerViolations, stockKey, sourceKey } from '../src/modules/resources/index.js';
import { storageCapacity } from '../src/modules/buildings/index.js';
import { createRng } from '../src/kernel/index.js';
import { defs, sandbox, newSim, call, runUntilIdle, types } from './helpers.js';

const wellOf = (sim) => sim.studentView().buildings.find((b) => b.id === 'well');
const reservoir = (sim) => sim.snapshot().ledger[sourceKey('well')].total;
const stockOf = (sim, item = 'water') => sim.snapshot().ledger[stockKey(item)].total;
const failed = (sim) => sim.log.all().filter((e) => e.type === 'action.failed');
const fresh = (st) => { const n = st.survivors.survivor_1.needs; n.energy = 100; n.hunger = 100; n.thirst = 100; };

// ---- scenario helpers: a repaired well / tank without spending the wood it would take to repair them ----
const fixWell = (st, { level = 1, water = 0 } = {}) => {
  const b = st.buildings.well;
  b.level = level;
  b.health = defs.buildings.well.levels[level].maxHealth;
  b.condition = 'repaired';
  st.ledger[sourceKey('well')].total = water;
};
const fixTank = (st, level = 1) => {
  const b = st.buildings.tank;
  b.level = level;
  b.health = defs.buildings.water_tank.levels[level].maxHealth;
  b.condition = 'repaired';
  if (defs.buildings.water_tank.levels[level].storage) b.storage = { ...defs.buildings.water_tank.levels[level].storage };
};
const rich = (st) => { st.ledger['stock.wood'].total = 300; st.ledger['stock.stone'].total = 300; st.survivors.survivor_1.skills.repair = 1; fresh(st); };

/** A world where the aquifer never refills: every water movement is then pure bookkeeping and conservation is exact. */
function droughtSim(mutate, seed = 1) {
  const env = structuredClone(defs.environment);
  for (const w of Object.values(env.weather)) w.recharge = 0;
  const d = createDefinitions({ environment: env });
  const state = createInitialState({ defs: d, scenarioId: 'stage1', seed });
  mutate?.(state);
  return createSimulation({ defs: d, state });
}
const firstTickWhere = (weather) => { for (let t = 0; t < 4000; t++) if (weatherAt(defs, t) === weather) return t; throw new Error(`no ${weather} in the calendar`); };

// ------------------------------------------------------------------ data & validation ----

test('stage 1 has a ruined deep well and a ruined water tank; the well is out of reach of the HQ, the tank is within reach of the well', () => {
  const v = newSim().studentView();
  const well = v.buildings.find((b) => b.id === 'well');
  const tank = v.buildings.find((b) => b.id === 'tank');
  assert.equal(well.condition, 'ruined');
  assert.equal(tank.condition, 'ruined');
  assert.equal(well.water.working, false);
  assert.equal(well.water.amount, 0);
  assert.deepEqual(well.upgrade, { level: 2, cost: { wood: 25, stone: 20 }, ticks: 70 });
  assert.equal(tank.storageInfo.working, false, 'a ruined tank adds no water capacity');
  assert.equal(tank.water, undefined, 'a tank has no source');
  const hq = v.buildings.find((b) => b.id === 'hq');
  const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const reach = defs.buildings.well.levels[2].siphon.reach;
  assert.ok(dist(well, hq) > reach, 'the HQ is too far for the siphon: the learner needs the tank');
  assert.ok(dist(well, tank) <= reach);
});

test('definitions: sources, siphons, weather recharge and scenario water are validated', () => {
  const bad = (mutate, pattern, key = 'buildings') => {
    const d = structuredClone(defs); mutate(d);
    assert.throws(() => createDefinitions({ [key]: d[key], ...(key === 'scenarios' ? { buildings: d.buildings } : {}) }), pattern);
  };
  bad((d) => { d.buildings.well.levels[1].source.recharge.every = 0; }, /source recharge needs whole numbers/);
  bad((d) => { d.buildings.well.levels[1].source.reservoir = 2.5; }, /reservoir must be a whole number/);
  bad((d) => { d.buildings.well.levels[1].source.resource = 'lava'; }, /unknown item "lava"/);
  bad((d) => { delete d.buildings.well.levels[2].source; }, /a source must continue|siphon needs a source/);
  bad((d) => { delete d.buildings.well.levels[1].source; d.buildings.well.levels[1].siphon = { every: 1, amount: 1, reach: 1 }; }, /siphon needs a source at the same level/);
  bad((d) => { d.buildings.well.levels[2].siphon.reach = 0; }, /siphon needs whole numbers/);
  bad((d) => { d.environment.weather.rain.recharge = -5; }, /recharge must be a whole number of percent/, 'environment');
  bad((d) => { d.scenarios.stage1.buildings.find((b) => b.id === 'well').water = 999; }, /water must be a whole number from 0 to its reservoir/, 'scenarios');
  bad((d) => { d.scenarios.stage1.buildings.find((b) => b.id === 'tank').id = 'well'; }, /used twice/, 'scenarios');
});

// ------------------------------------------------------------------ the aquifer ----

test('a ruined well refills nothing; a repaired one gains water by ticks (+1 every 24 ticks in clear weather), exactly', () => {
  const ruined = newSim();
  ruined.step(300);
  assert.equal(reservoir(ruined), 0, 'a ruined well gives nothing');

  const sim = newSim('stage1', 1, (st) => fixWell(st));
  sim.step(240); // day 1 is clear weather: 240 / 24
  assert.equal(weatherAt(defs, 100), 'clear');
  assert.equal(reservoir(sim), 10);
  assert.equal(wellOf(sim).water.amount, 10);
  assert.equal(wellOf(sim).water.recharge.perDay, 10);
});

test('the reservoir never holds more than its capacity: surplus water is lost, not stored', () => {
  const sim = newSim('stage1', 1, (st) => fixWell(st, { water: 39 }));
  sim.step(200);
  assert.equal(reservoir(sim), 40);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('weather changes how fast the aquifer refills: rain +60%, a heat wave halves it (a public, plannable calendar)', () => {
  const rainAt = firstTickWhere('rain');
  const rain = newSim('stage1', 1, (st) => { st.tick = rainAt; fixWell(st); });
  rain.step(240);
  assert.equal(reservoir(rain), 16, '240 ticks x 160% / 24');
  assert.equal(wellOf(rain).water.recharge.percent, 160);

  const heatAt = firstTickWhere('heatwave');
  const heat = newSim('stage1', 1, (st) => { st.tick = heatAt; fixWell(st); });
  heat.step(240);
  assert.equal(reservoir(heat), 5, '240 ticks x 50% / 24');
});

test('the refill is a pure function of the tick: no randomness, so two runs agree to the unit', () => {
  const run = (seed) => { const s = newSim('stage1', seed, (st) => fixWell(st)); s.step(1500); return reservoir(s); };
  assert.equal(run(1), run(99), 'the seed does not matter: the aquifer is not random');
});

// ------------------------------------------------------------------ drawing water by hand ----

test('gather("water") draws from the well, carries it to storage and balances the books to the unit', () => {
  const sim = droughtSim((st) => { fixWell(st, { water: 20 }); fresh(st); });
  const d = sim.studentView();
  sim.submit(buildCommand('survivor_1', { name: 'gather', args: ['water', 5, 12] }));
  runUntilIdle(sim, 1500);
  const st = sim.snapshot();
  assert.equal(st.ledger[stockKey('water')].total, 6 + 12, 'base stock gained exactly what she asked for');
  assert.equal(st.ledger[sourceKey('well')].total, 20 - 12, 'the well lost exactly that');
  assert.deepEqual(ledgerViolations(st), []);
  assert.deepEqual(st.survivors.survivor_1.inventory.items, {});
  const ev = sim.log.all().filter((e) => e.type === 'resource.gathered');
  assert.ok(ev.length >= 3 && ev.every((e) => e.resource === 'water' && e.nodeId === 'well'));
  assert.equal(st.survivors.survivor_1.lastTask.reason, 'TARGET_REACHED');
  assert.ok(st.survivors.survivor_1.progression.xp.gathering >= 12, 'drawing water is practice for Gathering');
  assert.equal(d.base.water, 6);
});

test('at an empty well she WAITS for the aquifer instead of failing, then finishes the job', () => {
  const sim = newSim('stage1', 1, (st) => { fixWell(st, { water: 0 }); fresh(st); });
  call(sim, 'gather', 'water', 5, 3);
  sim.step(8);
  const act = Object.values(sim.snapshot().actions).find((a) => a.actionType === 'gather');
  assert.equal(act.status, 'EXECUTING');
  assert.equal(act.phase, 'wait', 'standing at the well, waiting for water');
  assert.equal(sim.renderProjection().npcs[0].animation, 'IDLE', 'she is not chopping or walking while she waits');
  runUntilIdle(sim, 1200);
  assert.equal(failed(sim).length, 0);
  assert.equal(stockOf(sim), 6 + 3);
  assert.equal(sim.snapshot().survivors.survivor_1.lastTask.reason, 'TARGET_REACHED');
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('waiting costs no energy and no needs-policy is starved of its turn: she can still be interrupted to drink', () => {
  const sim = newSim('stage1', 1, (st) => { fixWell(st, { water: 0 }); fresh(st); st.survivors.survivor_1.needs.thirst = 40; });
  sim.submit({ apiVersion: 1, actorId: 'survivor_1', type: 'policy', params: { action: 'drink', below: 45 } });
  call(sim, 'gather', 'water', 5, 4);
  const energy = sim.snapshot().survivors.survivor_1.needs.energy;
  sim.step(30);
  assert.ok(types(sim).includes('policy.triggered'), 'the drink policy fired while she was waiting');
  assert.ok(sim.snapshot().survivors.survivor_1.needs.energy >= energy - 1, 'waiting is not work');
  runUntilIdle(sim, 1500);
  assert.equal(sim.snapshot().survivors.survivor_1.lastTask.status, 'COMPLETED');
});

test('a ruined well is NO_TARGET straight away: repair it first', () => {
  const sim = newSim();
  call(sim, 'gather', 'water', 5, 5);
  sim.step(5);
  assert.ok(failed(sim).some((e) => e.reason === 'NO_TARGET'));
  assert.equal(stockOf(sim), 6);
});

test('she does not wait forever: with no refill at all she gives up after waitTicks with NO_TARGET', () => {
  const sim = droughtSim((st) => { fixWell(st, { water: 0 }); fresh(st); });
  sim.submit(buildCommand('survivor_1', { name: 'gather', args: ['water', 5, 5] }));
  runUntilIdle(sim, 400);
  const waitTicks = defs.actions.gather.waitTicks;
  assert.ok(failed(sim).some((e) => e.reason === 'NO_TARGET'));
  assert.ok(sim.tick > waitTicks && sim.tick < waitTicks + 20, `gave up after ~${waitTicks} ticks, at tick ${sim.tick}`);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('two gatherers never take the same water: reservations are made against the reservoir', () => {
  const sim = droughtSim((st) => {
    fixWell(st, { water: 7 }); fresh(st);
    st.survivors.survivor_2 = structuredClone(st.survivors.survivor_1); st.survivors.survivor_2.id = 'survivor_2'; st.survivors.survivor_2.position = { x: 12, y: 9 };
  });
  for (const id of ['survivor_1', 'survivor_2']) sim.submit(buildCommand(id, { name: 'gather', args: ['water', 5, 5] }));
  sim.step(600);
  const st = sim.snapshot();
  assert.deepEqual(ledgerViolations(st), []);
  const carried = Object.values(st.survivors).reduce((t, s) => t + (s.inventory.items.water ?? 0), 0);
  assert.equal(st.ledger[sourceKey('well')].total + st.ledger[stockKey('water')].total + carried, 7 + 6, 'every unit is in exactly one place');
});

// ------------------------------------------------------------------ the siphon ----

test('upgrading the well: needs a fully repaired well, costs materials, deepens the reservoir and adds the siphon', () => {
  const fresh1 = newSim('stage1', 1, rich); // the well is still a ruin
  call(fresh1, 'upgrade', 'well'); fresh1.step(5);
  assert.ok(failed(fresh1).some((e) => e.reason === 'NEEDS_REPAIR'));

  const sim = newSim('stage1', 1, (st) => { rich(st); fixWell(st, { water: 5 }); });
  call(sim, 'upgrade', 'well');
  runUntilIdle(sim, 500);
  sim.step(2);
  const w = wellOf(sim);
  assert.equal(w.level, 2);
  assert.equal(w.water.capacity, 80);
  assert.equal(w.water.recharge.every, 16);
  assert.deepEqual(w.upgrade, null, 'no level 3 yet: the pumped machine tier arrives with power');
  assert.ok(w.water.siphon && w.water.siphon.reach === 3);
  assert.equal(sim.snapshot().ledger['stock.wood'].total, 300 - 25);
  assert.equal(sim.snapshot().ledger['stock.stone'].total, 300 - 20);
  assert.ok(types(sim).includes('building.upgraded'));
});

test('the siphon depends on the building structure: no working water store within reach → NO_STORAGE, and no water moves', () => {
  const sim = newSim('stage1', 1, (st) => { fixWell(st, { level: 2, water: 10 }); fresh(st); });
  sim.step(200);
  assert.equal(wellOf(sim).water.siphon.status, 'NO_STORAGE', 'the HQ stores water but stands 4 tiles away; the tank is still a ruin');
  assert.equal(wellOf(sim).water.siphon.target, null);
  assert.equal(stockOf(sim), 6, 'nothing was moved');
  assert.ok(reservoir(sim) >= 10);
});

test('repairing the tank connects the siphon: water now reaches base stock by itself, and the tank adds room for it', () => {
  const sim = newSim('stage1', 1, (st) => { rich(st); fixWell(st, { level: 2, water: 10 }); });
  const before = sim.studentView().base.capacity.water;
  for (let i = 0; i < 3; i++) call(sim, 'repair', 'tank');
  runUntilIdle(sim, 600);
  sim.step(300);
  assert.equal(wellOf(sim).water.siphon.status, 'ACTIVE');
  assert.equal(wellOf(sim).water.siphon.target, 'tank');
  assert.equal(sim.studentView().base.capacity.water, before + 120, 'the repaired tank pools its capacity');
  assert.ok(stockOf(sim) > 6 + 10, `base water grew without anybody hauling it (${stockOf(sim)})`);
  const flips = sim.log.all().filter((e) => e.type === 'siphon.status').map((e) => `${e.from}>${e.to}`);
  assert.deepEqual(flips, ['OFF>NO_STORAGE', 'NO_STORAGE>ACTIVE'], 'status events fire only when the structure changes');
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('the HQ alone is enough when the well stands close to it (reach is measured from the well, to any working water store)', () => {
  const sim = newSim('stage1', 1, (st) => { fixWell(st, { level: 2, water: 10 }); fresh(st); st.buildings.well.x = 12; st.buildings.well.y = 9; });
  sim.step(120);
  assert.equal(wellOf(sim).water.siphon.status, 'ACTIVE');
  assert.equal(wellOf(sim).water.siphon.target, 'hq');
  assert.ok(stockOf(sim) > 6);
});

test('a full store pauses the siphon (FULL) and the well keeps its water; storage is never overfilled', () => {
  const sim = newSim('stage1', 1, (st) => { fixWell(st, { level: 2, water: 30 }); fixTank(st); fresh(st); });
  const cap = storageCapacity(sim.snapshot(), 'water'); // HQ 100 + tent 50 + tank 120
  sim.snapshot();
  sim.step(1); // let the status settle
  // top the base up to the brim, then see that nothing more is pushed in
  const topUp = newSim('stage1', 1, (st) => { fixWell(st, { level: 2, water: 30 }); fixTank(st); fresh(st); st.ledger[stockKey('water')].total = cap; });
  topUp.step(300);
  assert.equal(wellOf(topUp).water.siphon.status, 'FULL');
  assert.equal(stockOf(topUp), cap);
  assert.ok(reservoir(topUp) >= 30, 'the water waits in the well');
  // a drink makes room again and the siphon resumes
  call(topUp, 'drink'); topUp.step(40);
  assert.equal(stockOf(topUp), cap);
  assert.deepEqual(ledgerViolations(topUp.snapshot()), []);
});

test('a ruined level-2 well reports BROKEN and moves nothing', () => {
  const sim = newSim('stage1', 1, (st) => { fixWell(st, { level: 2, water: 10 }); fixTank(st); st.buildings.well.health = 5; st.buildings.well.condition = 'ruined'; });
  sim.step(100);
  assert.equal(wellOf(sim).water.siphon.status, 'BROKEN');
  assert.equal(stockOf(sim), 6);
  assert.equal(reservoir(sim), 10);
});

test('siphon and gatherer share the reservoir without double-spending (the gatherer\'s reservation protects its water)', () => {
  const sim = droughtSim((st) => { fixWell(st, { level: 2, water: 12 }); fixTank(st); fresh(st); });
  sim.submit(buildCommand('survivor_1', { name: 'gather', args: ['water', 6, 6] }));
  sim.step(800);
  const st = sim.snapshot();
  assert.deepEqual(ledgerViolations(st), []);
  const carried = st.survivors.survivor_1.inventory.items.water ?? 0;
  assert.equal(st.ledger[sourceKey('well')].total + st.ledger[stockKey('water')].total + carried, 12 + 6, 'nothing created, nothing lost');
  assert.equal(st.ledger[sourceKey('well')].total, 0, 'between them the siphon and the gatherer emptied the well into storage');
});

// ------------------------------------------------------------------ learner view, API, save ----

test('learner code can read the well by id: reservoir, recharge, siphon status', async () => {
  const { sim } = createFreeSim({ defs });
  const r = await runLiveCode({ sim, sandbox, actorId: 'survivor_1', code: 'console.log(well.water.amount, well.water.working, well.water.recharge.perDay, well.water.siphon, tank.condition, world.weatherInfo.recharge);' });
  assert.ok(r.ok, r.error?.message);
  assert.equal(r.logs[0], '0 false 10 null ruined 100');
  const bad = await runLiveCode({ sim, sandbox, actorId: 'survivor_1', code: 'well.water.amount = 99;' });
  assert.equal(bad.ok, false, 'the well is read-only to learner code');
});

test('learner code can decide by what the well says: an if on well.water.amount', async () => {
  const { sim } = createFreeSim({ defs });
  const r = await runLiveCode({ sim, sandbox, actorId: 'survivor_1', code: 'if (well.condition === "ruined") { survivor.repair(well); } else { survivor.gather("water", 5); }' });
  assert.ok(r.ok && r.submitted[0].ok && r.submitted[0].name === 'repair');
});

test('the API documents water for learners', () => {
  const d = describeApi();
  assert.ok(d.commands.find((c) => c.name === 'gather').doc.includes('water'));
  assert.ok(d.reads.some((l) => l.includes('well.water')));
});

test('a session with a well replays to the same hash (aquifer, siphon and gather are deterministic)', () => {
  const run = () => {
    const sim = newSim('stage1', 4, (st) => { rich(st); fixWell(st, { level: 2, water: 3 }); fixTank(st); });
    call(sim, 'gather', 'water', 4, 8);
    sim.step(900);
    return { hash: sim.stateHash(), log: sim.log.hash() };
  };
  assert.deepEqual(run(), run());
  // and the recorded command timeline rebuilds the same world
  const live = createFreeSim({ defs, seed: 6 }).sim;
  live.step(10); live.submitCommand({ apiVersion: 1, actorId: 'survivor_1', type: 'repair', params: { targetId: 'well' }, mode: 'replace' });
  live.step(500);
  const again = replayTimeline({ defs, scenarioId: 'stage1', seed: 6, timeline: live.commandTimeline(), untilTick: live.tick });
  assert.equal(again.stateHash(), live.stateHash());
});

test('the render projection carries a reservoir gauge for working wells and the renderer survives it', () => {
  const sim = newSim('stage1', 1, (st) => fixWell(st, { water: 20 }));
  const b = sim.renderProjection().buildings.find((x) => x.id === 'well');
  assert.deepEqual(b.water, { amount: 20, capacity: 40, working: true });
  assert.equal(sim.renderProjection().buildings.find((x) => x.id === 'tank').water, undefined);
});

// ------------------------------------------------------------------ soak ----

test('conservation soak: with no refill, stock + reservoir + carried + drunk stays exactly what it started as, whatever she does', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const sim = droughtSim((st) => { rich(st); fixWell(st, { level: 2, water: 40 }); fixTank(st); }, seed);
    const rng = createRng(seed * 31);
    const total = () => { const st = sim.snapshot(); return st.ledger[sourceKey('well')].total + st.ledger[stockKey('water')].total + (st.survivors.survivor_1.inventory.items.water ?? 0); };
    const start = total();
    let drunk = 0;
    for (let slice = 0; slice < 40; slice++) {
      const pick = rng.int(5);
      try {
        if (pick === 0) sim.submit({ apiVersion: 1, actorId: 'survivor_1', mode: 'replace', type: 'gather', params: { resource: 'water', amount: 1 + rng.int(20), ...(rng.int(2) ? { total: 1 + rng.int(30) } : {}) } });
        else if (pick === 1) sim.submit({ apiVersion: 1, actorId: 'survivor_1', mode: 'queue', type: 'drink', params: {} });
        else if (pick === 2) sim.submit({ apiVersion: 1, actorId: 'survivor_1', mode: 'replace', type: 'deposit', params: {} });
        else if (pick === 3) sim.submit({ apiVersion: 1, actorId: 'survivor_1', mode: 'replace', type: 'stop', params: {} });
        else sim.submit({ apiVersion: 1, actorId: 'survivor_1', mode: 'queue', type: 'rest', params: { ticks: 1 + rng.int(40) } });
      } catch (e) { assert.ok(e.code); }
      sim.step(25);
      drunk = sim.log.all().filter((e) => e.type === 'survivor.consumed' && e.item === 'water').length;
      assert.equal(total() + drunk, start, `seed ${seed} slice ${slice}: a unit of water appeared or vanished`);
      const st = sim.snapshot();
      assert.deepEqual(ledgerViolations(st), [], `seed ${seed} slice ${slice}`);
      assert.ok(st.ledger[stockKey('water')].total <= storageCapacity(st, 'water'));
      if (st.survivors.survivor_1.status !== 'active') break;
    }
  }
});

test('refill soak: with the real weather calendar the reservoir and base water never exceed their limits over three seasons', () => {
  const sim = newSim('stage1', 3, (st) => { rich(st); fixWell(st, { level: 2 }); fixTank(st); });
  const w = defs.buildings.well.levels[2];
  for (let i = 0; i < 60; i++) {
    sim.step(40);
    const st = sim.snapshot();
    assert.ok(st.ledger[sourceKey('well')].total <= w.source.reservoir);
    assert.ok(st.ledger[stockKey('water')].total <= storageCapacity(st, 'water'));
    assert.deepEqual(ledgerViolations(st), []);
  }
});
