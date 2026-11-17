// O16 powered pump: well level 3 "Pump House" - bigger aquifer, a 3x faster siphon that only runs while the grid powers it (NO_POWER otherwise).
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle } from './helpers.js';
import { ledgerViolations } from '../src/modules/resources/index.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const stock = (sim, k = 'water') => sim.snapshot().ledger[`stock.${k}`].total;
const well = (sim) => sim.studentView().buildings.find((b) => b.id === 'well');
const rig = ({ level = 3, fuel = 40, tank = true, gen = true } = {}) => (st) => {
  fix(st, 'well', level); st.ledger['source.well'].total = 60; st.ledger['stock.water'].total = 0;
  if (tank) fix(st, 'tank'); if (gen) fix(st, 'generator_1');
  st.ledger['stock.wood'].total = fuel;
  Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100 });
};
const status = (sim) => well(sim).water.siphon.status;

test('level 3 data: Pump House with a bigger aquifer, a faster pump and a power draw; level 2 -> 3 costs packaging', () => {
  const l = defs.buildings.well.levels;
  assert.equal(l[3].name, 'Pump House');
  assert.ok(l[3].source.reservoir > l[2].source.reservoir && l[3].siphon.every < l[2].siphon.every && l[3].power.use > 0);
  assert.equal(defs.buildings.well.upgrade[3].cost.packaging, 6);
});

test('a powered pump moves water into base stock faster than the level 2 siphon', () => {
  const pumped = newSim('stage1', 1, rig()); for (let i = 0; i < 60; i++) pumped.step(1);
  const siphon = newSim('stage1', 1, rig({ level: 2, gen: false })); for (let i = 0; i < 60; i++) siphon.step(1);
  assert.equal(status(pumped), 'ACTIVE');
  assert.ok(stock(pumped) > stock(siphon) * 2, `${stock(pumped)} vs ${stock(siphon)}`);
  assert.deepEqual(ledgerViolations(pumped.snapshot()), []);
});

test('without power (generator ruined, or out of fuel) the pump is NO_POWER and moves nothing', () => {
  const dead = newSim('stage1', 1, rig({ gen: false })); for (let i = 0; i < 40; i++) dead.step(1);
  assert.equal(status(dead), 'NO_POWER'); assert.equal(stock(dead), 0);
  const dry = newSim('stage1', 1, rig({ fuel: 0 })); for (let i = 0; i < 40; i++) dry.step(1);
  assert.equal(status(dry), 'NO_POWER'); assert.equal(stock(dry), 0);
});

test('the pump is a grid consumer: its draw shows in the power read and in the well view', () => {
  const sim = newSim('stage1', 1, rig()); for (let i = 0; i < 10; i++) sim.step(1);
  const p = well(sim).power;
  assert.equal(p.role, 'consumer'); assert.equal(p.use, defs.buildings.well.levels[3].power.use); assert.equal(p.powered, true);
});

test('upgrading a ruined well to the pump house is refused (NEEDS_REPAIR)', () => {
  const ruin = newSim('stage1', 1, (st) => { st.ledger['stock.wood'].total = 100; st.ledger['stock.stone'].total = 100; st.ledger['stock.packaging'].total = 10; });
  call(ruin, 'upgrade', 'well'); runUntilIdle(ruin, 60);
  assert.ok(JSON.stringify(ruin.log.all().filter((e) => e.type === 'action.failed')).includes('NEEDS_REPAIR'));
});

test('determinism: the same pump run twice gives the same state', () => {
  const go = () => { const s = newSim('stage1', 3, rig()); for (let i = 0; i < 200; i++) s.step(1); return s.snapshot(); };
  assert.deepEqual(go(), go());
});
