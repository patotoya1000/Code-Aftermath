// O14 battery bank: charges only from surplus generation, discharges before generators burn fuel, rate/capacity limits, ruins, upgrade, reads, determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, sandbox } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { sunPercent } from '../src/modules/power/index.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const wood = (sim) => sim.snapshot().ledger['stock.wood'].total;
const view = (sim, id) => sim.studentView().buildings.find((b) => b.id === id);
const charge = (sim) => sim.snapshot().buildings.battery_1.power.charge;
const DAY = defs.environment.ticksPerDay;
const noonTick = (day = 0) => { for (let t = day * DAY; t < (day + 1) * DAY; t++) if (sunPercent(defs, t) === 100) return t; throw new Error('no daylight'); };
const nightTick = () => { for (let t = 0; t < DAY * 3; t++) if (sunPercent(defs, t) === 0) return t; throw new Error('no night'); };
const setup = (mut) => (st) => { st.ledger['stock.wood'].total = 60; mut(st); };

test('the scenario places a ruined battery: it stores nothing, shows no capacity and costs nothing', () => {
  const sim = newSim('stage1', 1, setup(() => {}));
  assert.equal(view(sim, 'battery_1').condition, 'ruined');
  assert.equal(sim.studentView().power.capacity, 0);
  sim.step(100);
  assert.equal(charge(sim), 0);
});

test('surplus solar charges it by day, at most `rate` per tick, never past capacity', () => {
  const t0 = noonTick();
  const sim = newSim('stage1', 1, setup((st) => { fix(st, 'solar_1'); fix(st, 'battery_1'); st.tick = t0; }));
  sim.step(1); sim.step(1);
  assert.equal(charge(sim), 8 * 2, 'solar makes 8, no demand: all of it is surplus (rate 8)');
  assert.equal(view(sim, 'battery_1').power.status, 'CHARGING');
  sim.step(40);
  assert.ok(charge(sim) <= defs.buildings.battery.levels[1].power.store.capacity);
  assert.equal(sim.studentView().power.capacity, 80);
  assert.equal(sim.studentView().power.stored, charge(sim));
});

test('it discharges before a generator burns fuel, and the generator stays idle while the battery lasts', () => {
  const t0 = nightTick();
  const sim = newSim('stage1', 1, setup((st) => { fix(st, 'generator_1'); fix(st, 'storage_1', 3); fix(st, 'battery_1'); st.buildings.battery_1.power.charge = 30; st.tick = t0; }));
  sim.step(4); // freezer needs 6 per tick; the battery covers it (rate 8)
  assert.equal(view(sim, 'generator_1').power.status, 'IDLE');
  assert.equal(wood(sim), 60, 'no fuel burned');
  assert.equal(view(sim, 'storage_1').power.powered, true);
  assert.equal(view(sim, 'battery_1').power.status, 'DISCHARGING');
  assert.ok(charge(sim) < 30 && charge(sim) >= 30 - 4 * 6);
});

test('when the battery runs dry the generator takes over and the consumer is never left unpowered in between', () => {
  const t0 = nightTick();
  const sim = newSim('stage1', 1, setup((st) => { fix(st, 'generator_1'); fix(st, 'storage_1', 3); fix(st, 'battery_1'); st.buildings.battery_1.power.charge = 12; st.tick = t0; }));
  sim.step(2);
  assert.equal(charge(sim), 0);
  sim.step(5);
  assert.equal(view(sim, 'generator_1').power.status, 'RUNNING');
  assert.ok(wood(sim) < 60);
  assert.equal(view(sim, 'storage_1').power.powered, true);
});

test('a generator with spare output charges the battery, but never burns fuel just to charge it', () => {
  const idle = newSim('stage1', 1, setup((st) => { fix(st, 'generator_1'); fix(st, 'battery_1'); st.tick = nightTick(); }));
  idle.step(100);
  assert.equal(wood(idle), 60, 'no demand: the generator idles');
  assert.equal(charge(idle), 0);
  const spare = newSim('stage1', 1, setup((st) => { fix(st, 'generator_1'); fix(st, 'storage_1', 3); fix(st, 'battery_1'); st.tick = nightTick(); }));
  spare.step(1); // generator 10, freezer 6: surplus 4 goes into the battery
  assert.equal(charge(spare), 4);
  assert.equal(view(spare, 'battery_1').power.status, 'CHARGING');
});

test('a ruined battery neither charges nor discharges, and keeps what it held', () => {
  const sim = newSim('stage1', 1, setup((st) => { fix(st, 'solar_1'); st.buildings.battery_1.power.charge = 20; st.tick = noonTick(); }));
  sim.step(20);
  assert.equal(charge(sim), 20);
  assert.equal(view(sim, 'battery_1').power.status, 'BROKEN');
  assert.equal(sim.studentView().power.capacity, 0, 'a ruin adds no capacity');
  assert.equal(sim.studentView().power.stored, 20);
});

test('upgrade to the large bank: more capacity and a faster rate', () => {
  const sim = newSim('stage1', 1, setup((st) => { fix(st, 'battery_1'); st.ledger['stock.stone'].total = 40; st.survivors.survivor_1.skills.repair = 1; }));
  assert.equal(view(sim, 'battery_1').upgrade.level, 2);
  call(sim, 'upgrade', 'battery_1'); runUntilIdle(sim, 800);
  assert.equal(view(sim, 'battery_1').level, 2);
  assert.equal(view(sim, 'battery_1').power.capacity, 200);
  assert.equal(view(sim, 'battery_1').power.rate, 14);
});

test('learner reads: power.stored / capacity and battery_1.power; frozen', async () => {
  const sim = newSim('stage1', 1, setup((st) => { fix(st, 'battery_1'); st.buildings.battery_1.power.charge = 25; }));
  const res = await sandbox.run({ code: 'if (power.stored === 25 && battery_1.power.role === "storage" && battery_1.power.charge === 25) survivor.rest(1);', view: sim.studentView(), seed: 1 });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(res.calls.length, 1);
  assert.ok(Object.isFrozen(sim.studentView().power));
});

test('a powered recipe can run on stored power alone (MRE sealing at night from the battery)', () => {
  const sim = newSim('stage1', 1, setup((st) => {
    fix(st, 'kitchen', 3); fix(st, 'battery_1'); st.buildings.battery_1.power.charge = 80; st.tick = nightTick();
    st.ledger['stock.hot_meal'].total = 2; st.ledger['stock.packaging'].total = 1; st.perishables.hot_meal = [{ qty: 2, age: 0 }]; st.survivors.survivor_1.skills.cooking = 2;
  }));
  call(sim, 'cook', 'mre', 1); runUntilIdle(sim, 600);
  assert.equal(sim.snapshot().ledger['stock.mre'].total, 1);
  assert.ok(charge(sim) < 80);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('definitions validation: a battery needs whole capacity and rate, and cannot also produce or consume', () => {
  const mk = (power) => { const battery = structuredClone(defs.buildings.battery); battery.levels[1].power = power; return () => createDefinitions({ buildings: { ...defs.buildings, battery } }); };
  assert.throws(mk({ store: { capacity: 0, rate: 8 } }), /battery/);
  assert.throws(mk({ store: { capacity: 10 } }), /battery/);
  assert.throws(mk({ store: { capacity: 10, rate: 2 }, use: 3 }), /EITHER/);
});

test('batteries are deterministic and replay exactly; power is conserved (charge never negative, never over capacity)', () => {
  const run = () => {
    const s = newSim('stage1', 3, setup((st) => { fix(st, 'solar_1'); fix(st, 'generator_1'); fix(st, 'storage_1', 3); fix(st, 'battery_1'); }));
    for (let i = 0; i < 40; i++) { s.step(DAY / 8); const c = charge(s); assert.ok(c >= 0 && c <= 80, `charge ${c}`); }
    return s.stateHash();
  };
  assert.equal(run(), run());
});
