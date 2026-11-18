// Z5: weapon + ammo recipes (workshop), survivor.equip (Combat skill gate), bone meal as the better fertilizer. docs/game/20 sections 4, 9, 15.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, sandbox } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { crops } from '../src/modules/definitions/data/crops.js';
import { actions } from '../src/modules/definitions/data/actions.js';
import { weapons } from '../src/modules/definitions/data/arsenal.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { yieldFor } from '../src/modules/farming/index.js';
import { buildCommand } from '../src/modules/api/index.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) st.ledger[`stock.${k}`].total = v; };
const stock = (sim, k) => sim.snapshot().ledger[`stock.${k}`].total;
const fresh = (st) => Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
const skill = (st, name, level) => { st.survivors.survivor_1.skills[name] = level; };
const held = (sim) => sim.snapshot().survivors.survivor_1.equipment.weapon;
const last = (sim) => sim.snapshot().survivors.survivor_1.lastTask;
const types = (sim) => sim.log.all().map((e) => e.type);

test('every weapon recipe mirrors its weapons.<id>.craft block, and every crafted personal weapon and ammo has an item and an HQ storage table', () => {
  for (const id of ['advanced_spear', 'bow', 'crossbow']) {
    const rc = defs.recipes[id], w = defs.weapons[id];
    assert.deepEqual(rc.inputs, w.craft.materials, `${id} materials`);
    assert.equal(rc.stationLevel, w.craft.stationLevel); assert.equal(rc.minSkill, w.craft.minSkill); assert.equal(rc.station, w.craft.station);
    assert.deepEqual(rc.outputs, { [id]: 1 }); assert.ok(defs.items[id], `${id} item`);
    assert.ok(defs.buildings.hq.storage[id] > 0 && defs.buildings.hq.levels[2].storage[id] > 0, `${id} HQ storage`);
  }
  for (const id of ['arrows', 'bolts', 'bone_meal']) { assert.ok(defs.recipes[id].outputs[id] > 1); assert.ok(defs.buildings.hq.storage[id] > 0); }
  assert.equal(defs.weapons.bow.ammo, 'arrows'); assert.ok(defs.recipes.arrows && defs.recipes.bolts);
  for (const w of Object.values(defs.weapons)) assert.ok(Number.isInteger(w.minCombat) && w.minCombat >= 0);
  for (const w of Object.values(defs.weapons).filter((x) => x.starter)) assert.equal(w.minCombat, 0);
});

test('crafting a bow: exact inputs, the bow lands in base stock, Crafting 1 is required; arrows come 8 per batch', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'workshop_1'); fresh(st); skill(st, 'crafting', 1); give(st, { wood: 20, hide: 2, rags: 2, scrap: 4 }); });
  call(sim, 'craft', 'bow', 1); runUntilIdle(sim, 600);
  assert.equal(stock(sim, 'bow'), 1); assert.equal(stock(sim, 'hide'), 1); assert.equal(stock(sim, 'rags'), 1); assert.equal(stock(sim, 'wood'), 17);
  call(sim, 'craft', 'arrows', 2); runUntilIdle(sim, 900);
  assert.equal(stock(sim, 'arrows'), 16); assert.equal(stock(sim, 'scrap'), 2);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  const rookie = newSim('stage1', 1, (st) => { fix(st, 'workshop_1'); fresh(st); give(st, { wood: 20, hide: 2, rags: 2 }); });
  call(rookie, 'craft', 'bow', 1); rookie.step(3);
  assert.equal(last(rookie).reason, 'CAPABILITY_INSUFFICIENT'); assert.equal(stock(rookie, 'wood'), 20);
});

test('a crossbow needs workshop level 2 (NEEDS_REPAIR on level 1) and bolts too', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'workshop_1', 1); fresh(st); skill(st, 'crafting', 2); give(st, { wood: 20, scrap: 10 }); });
  call(sim, 'craft', 'crossbow', 1); sim.step(3);
  assert.equal(last(sim).reason, 'NEEDS_REPAIR'); assert.equal(stock(sim, 'scrap'), 10);
  const l2 = newSim('stage1', 1, (st) => { fix(st, 'workshop_1', 2); fresh(st); skill(st, 'crafting', 2); give(st, { wood: 20, scrap: 10 }); });
  call(l2, 'craft', 'crossbow', 1); runUntilIdle(l2, 800);
  assert.equal(stock(l2, 'crossbow'), 1); assert.equal(stock(l2, 'scrap'), 7);
});

test('equip: starters at once, a crafted weapon out of base stock, the old crafted weapon back into stock, Combat gate, and the failures', () => {
  const sim = newSim('stage1', 1, (st) => { fresh(st); skill(st, 'combat', 1); give(st, { bow: 1, advanced_spear: 1, crossbow: 1 }); });
  assert.equal(held(sim), 'spear');
  call(sim, 'equip', 'spear'); sim.step(2); assert.equal(last(sim).reason, 'NOT_NEEDED');
  call(sim, 'equip', 'knife'); runUntilIdle(sim, 50); assert.equal(held(sim), 'knife');
  call(sim, 'equip', 'bow'); runUntilIdle(sim, 200);
  assert.equal(held(sim), 'bow'); assert.equal(stock(sim, 'bow'), 0);
  call(sim, 'equip', 'advanced_spear'); runUntilIdle(sim, 200);
  assert.equal(held(sim), 'advanced_spear'); assert.equal(stock(sim, 'bow'), 1, 'the bow went back into stock'); assert.equal(stock(sim, 'advanced_spear'), 0);
  call(sim, 'equip', 'crossbow'); sim.step(3);
  assert.equal(last(sim).reason, 'CAPABILITY_INSUFFICIENT'); assert.equal(held(sim), 'advanced_spear');
  const stockless = newSim('stage1', 1, (st) => { fresh(st); skill(st, 'combat', 3); });
  call(stockless, 'equip', 'rifle'); stockless.step(3); assert.equal(last(stockless).reason, 'INSUFFICIENT_RESOURCE');
  call(sim, 'equip', 'minigun'); sim.step(3); assert.equal(last(sim).reason, 'INVALID_PARAMS', 'mounted weapons belong to towers');
  call(sim, 'equip', 'nonsense'); sim.step(3); assert.equal(last(sim).reason, 'INVALID_PARAMS');
  assert.ok(types(sim).includes('weapon.equipped'));
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('equip walks to storage, reserves the weapon (cancel gives it back) and fails NO_DEPOT without working storage', () => {
  const sim = newSim('stage1', 1, (st) => { fresh(st); skill(st, 'combat', 1); give(st, { bow: 1 }); });
  call(sim, 'equip', 'bow'); sim.step(1);
  assert.equal(sim.snapshot().ledger['stock.bow'].reserved, 1);
  call(sim, 'stop'); sim.step(1);
  assert.equal(sim.snapshot().ledger['stock.bow'].reserved, 0); assert.equal(stock(sim, 'bow'), 1); assert.equal(held(sim), 'spear');
  const none = newSim('stage1', 1, (st) => { fresh(st); skill(st, 'combat', 1); give(st, { bow: 1 }); st.buildings.hq.condition = 'ruined'; st.buildings.hq.health = 1; });
  call(none, 'equip', 'bow'); none.step(2); assert.equal(last(none).reason, 'NO_DEPOT');
});

test('an equipped bow spends the arrows she carries: take, equip, attack end to end', () => {
  const on = createDefinitions({ eventSchedule: { ...defs.eventSchedule, chancePercent: 0 }, raidSchedule: { ...defs.raidSchedule, chancePercent: 100, strengthBase: 4, strengthPerDay: 0, variancePercent: 0 } });
  const DAY = on.environment.ticksPerDay;
  const dusk = 5 * DAY + (on.environment.duskHour - on.environment.startHour) * (DAY / 24);
  const sim = newSim('stage1', 1);
  assert.ok(sim);
  // build a sim over the raiding definitions
  const { createInitialState } = awaitedImports;
  const st = createInitialState({ defs: on, scenarioId: 'stage1', seed: 1 });
  fresh(st); skill(st, 'combat', 1); st.ledger['stock.bow'].total = 1; st.ledger['stock.arrows'].total = 10; st.survivors.survivor_1.position = { x: 14, y: 8 };
  const s = awaitedImports.createSimulation({ defs: on, state: st });
  const go = (name, ...args) => s.submit(buildCommand('survivor_1', { name, args }));
  go('equip', 'bow'); go('take', 'arrows', 10);
  while (s.snapshot().tick < dusk + 3 || !s.isIdle()) s.step(1);
  assert.equal(s.snapshot().survivors.survivor_1.equipment.weapon, 'bow'); assert.equal(s.snapshot().survivors.survivor_1.inventory.items.arrows, 10);
  while (!Object.values(s.snapshot().threats.zombies).some((q) => q.state === 'attack') && s.snapshot().tick < dusk + 200) s.step(1); // wait until one stands at the wall: in bow range
  const z = Object.values(s.snapshot().threats.zombies).find((q) => q.state === 'attack');
  assert.ok(z);
  go('attack', z.id);
  for (let i = 0; i < 300 && s.snapshot().threats.zombies[z.id]; i++) s.step(1);
  assert.equal(s.snapshot().threats.zombies[z.id], undefined, 'the zombie died');
  assert.ok((s.snapshot().survivors.survivor_1.inventory.items.arrows ?? 0) < 10, 'shots spent arrows');
});

test('bone meal: recipe (2 bones + water -> 2), +100 % yield, used before plain fertilizer, plot records which, plain fertilizer unchanged', () => {
  assert.equal(yieldFor(defs, { yield: 100 }, 'wheat', 0, true), 6);
  assert.equal(yieldFor(defs, { yield: 100 }, 'wheat', 0, 'bone_meal'), 8);
  const setup = (extra) => (st) => { fix(st, 'field_1'); fresh(st); give(st, { water: 40, wheat: 4, ...extra }); };
  const sim = newSim('stage1', 1, setup({ fertilizer: 3, bone_meal: 3 }));
  call(sim, 'farm', 'field_1', 'wheat', { fertilize: true });
  let guard = 0; while (guard++ < 4000 && !sim.snapshot().plots.field_1_1.fertilized) sim.step(1);
  assert.equal(sim.snapshot().plots.field_1_1.fertilized, 'bone_meal');
  assert.equal(stock(sim, 'fertilizer'), 3, 'plain fertilizer untouched while bone meal is in stock');
  assert.ok(stock(sim, 'bone_meal') < 3);
  while (sim.snapshot().plots.field_1_1.stage !== 'ready' && sim.tick < 6000) sim.step(1);
  assert.equal(sim.snapshot().ledger['plot.field_1_1'].total, 8, '4 x 200 %');
  const plain = newSim('stage1', 1, setup({ fertilizer: 3 }));
  call(plain, 'farm', 'field_1', 'wheat', { fertilize: true });
  guard = 0; while (guard++ < 4000 && !plain.snapshot().plots.field_1_1.fertilized) plain.step(1);
  assert.equal(plain.snapshot().plots.field_1_1.fertilized, true);
  assert.equal(plain.studentView().buildings.find((b) => b.id === 'field_1').farm.fertilizerBonus, 50);
  const crafting = newSim('stage1', 1, (st) => { fix(st, 'workshop_1'); fresh(st); give(st, { bones: 4, water: 4 }); });
  call(crafting, 'craft', 'bone_meal', 2); runUntilIdle(crafting, 600);
  assert.equal(stock(crafting, 'bone_meal'), 4); assert.equal(stock(crafting, 'bones'), 0);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('API + validation: equip(weapon) is checked, the sandbox can issue it, broken equip/fertilizer data is refused', async () => {
  assert.deepEqual(buildCommand('survivor_1', { name: 'equip', args: ['bow'] }).params, { weapon: 'bow' });
  for (const args of [[], [3], ['a', 'b']]) assert.throws(() => buildCommand('survivor_1', { name: 'equip', args }), /equip/);
  const r = await sandbox.run({ code: 'survivor.equip("spear");', view: newSim().studentView(), seed: 1 });
  assert.equal(r.ok, true, r.error?.message); assert.deepEqual(r.calls.map((c) => c.name), ['equip']);
  const bad = (o, re) => assert.throws(() => createDefinitions(o), re);
  bad({ actions: { ...actions, equip: { ...actions.equip, ticks: 0 } } }, /action equip/);
  bad({ weapons: { ...weapons, bow: { ...weapons.bow, minCombat: -1 } } }, /weapon bow/);
  bad({ farming: { ...defs.farming, fertilizer: { ...crops.farming?.fertilizer ?? defs.farming.fertilizer, better: { item: 'bone_meal', yieldBonus: 10 } } } }, /fertilizer/);
});

import * as world from '../src/modules/world/index.js';
import * as simulation from '../src/modules/simulation/index.js';
const awaitedImports = { createInitialState: world.createInitialState, createSimulation: simulation.createSimulation };
