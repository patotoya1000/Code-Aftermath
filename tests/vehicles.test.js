// R5 vehicles (docs/game/24 section 3e): the GARAGE building fields a hand cart, a motor cart and a truck; `survivor.retrieve(site, { vehicle })` hauls a stash home with more
// carry capacity and in fewer ticks; motorised runs burn fuel when she leaves; one vehicle of each kind can be out at a time. Same ledger, gates and refusal rules as the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { scavenge as scavengeData } from '../src/modules/definitions/data/scavenge.js';
import { vehicles as vehicleData } from '../src/modules/definitions/data/vehicles.js';
import { raidSchedule } from '../src/modules/definitions/data/threats.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { tripPlan } from '../src/modules/scavenge/index.js';
import { vehicleCarry, vehicleTicks, vehicleRefusal, fuelPlan, garageLevelOf } from '../src/modules/buildings/index.js';
import { carryCapacity } from '../src/modules/survivors/index.js';
import { buildCommand } from '../src/modules/api/index.js';
import { runLiveCode } from '../src/modules/session/index.js';
import { ledgerViolations, stockKey } from '../src/modules/resources/index.js';
import { buildingActionList } from '../src/app/ui/actions.js';
import { sandbox } from './helpers.js';

// A calm world (no raids or events) with every site open from day 1 and a harmless quarry road, so exact hauls are exact.
const calm = { eventSchedule: { ...eventSchedule, chancePercent: 0 }, raidSchedule: { ...raidSchedule, chancePercent: 0 } };
const safe = structuredClone(scavengeData); safe.startDay = 1; for (const s of Object.values(safe.sites)) s.danger = 0;
const defs = createDefinitions({ ...calm, scavenge: safe });
const V = defs.vehicles.types;

const fix = (st, id, level = 1) => { const b = st.buildings[id]; const lv = defs.buildings[b.type].levels[level]; b.level = level; b.health = lv.maxHealth; b.condition = 'repaired'; if (lv.storage) b.storage = { ...lv.storage }; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) st.ledger[stockKey(k)].total = v; };
const stock = (sim, k) => sim.snapshot().ledger[stockKey(k)].total;
const keep = (st) => { for (const s of Object.values(st.survivors)) Object.assign(s.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 }); };
/** HQ level 4 (lots of storage), a garage of `garage` level (0 = leave it a ruin), a stash of `stash` units at the quarry, `give` items in stock. */
const mk = ({ hq = 4, garage = 1, stash = { stone: 40 }, items = {}, d = defs, mutate } = {}) => {
  const state = createInitialState({ defs: d, scenarioId: 'stage1', seed: 1 });
  fix(state, 'hq', hq); if (garage) fix(state, 'garage_1', garage);
  if (stash) state.scavenge.stash.quarry = { items: { ...stash }, protected: false };
  give(state, items); mutate?.(state); keep(state);
  return createSimulation({ defs: d, state });
};
const cmd = (sim, args, who = 'survivor_1') => sim.submit(buildCommand(who, { name: 'retrieve', args }));
const evs = (s, type) => s.log.all().filter((e) => e.type === type);
const failedWith = (s) => evs(s, 'action.failed').at(-1)?.reason;
const run = (s, args, who = 'survivor_1') => { const had = evs(s, 'scavenge.returned').length; cmd(s, args, who); let n = 0; while (evs(s, 'scavenge.returned').length === had && n++ < 700) s.step(1); return evs(s, 'scavenge.returned').at(-1); };
const refusedCode = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
const stashUnits = (s) => Object.values(s.snapshot().scavenge.stash.quarry?.items ?? {}).reduce((a, b) => a + b, 0);

test('data: the shipped vehicles are valid, ordered by garage level, and bad definitions are refused at load time', () => {
  assert.equal(defs.vehicles.garage, 'garage'); assert.equal(defs.vehicles.minHq, 2);
  assert.deepEqual(Object.keys(V), ['hand_cart', 'motor_cart', 'truck']);
  assert.deepEqual(Object.values(V).map((t) => t.garageLevel), [1, 2, 3]);
  const carry = Object.values(V).map((t) => t.carryPercent); const ticks = Object.values(V).map((t) => t.ticksPercent);
  assert.deepEqual([...carry].sort((a, b) => a - b), carry, 'each tier carries more'); assert.deepEqual([...ticks].sort((a, b) => b - a), ticks, 'each tier is faster');
  assert.deepEqual(defs.buildings.garage.levels[2].name, 'Motor Pool'); assert.equal(defs.buildings.garage.upgrade[3].minHq, 4);
  const bad = (mut, re) => assert.throws(() => { const v = structuredClone(vehicleData); mut(v); createDefinitions({ vehicles: v }); }, re);
  bad((v) => { v.garage = 'nowhere'; }, /garage must be a known building/);
  bad((v) => { v.minHq = 0; }, /minHq/);
  bad((v) => { v.fuelItems = ['unobtainium']; }, /fuelItems/);
  bad((v) => { v.types.truck.garageLevel = 9; }, /garageLevel/);
  bad((v) => { v.types.hand_cart.carryPercent = 50; }, /carryPercent/); // a vehicle never carries less than a person
  bad((v) => { v.types.hand_cart.ticksPercent = 150; }, /ticksPercent/); // and is never slower
  bad((v) => { v.types.truck.fuel = -1; }, /fuel/);
});

test('pure rules: carry and ticks multiply, never below one tick, and no vehicle changes nothing', () => {
  assert.equal(vehicleCarry(defs, null, 60), 60); assert.equal(vehicleCarry(defs, 'hand_cart', 60), 120); assert.equal(vehicleCarry(defs, 'truck', 60), 480);
  assert.equal(vehicleTicks(defs, null, 56), 56); assert.equal(vehicleTicks(defs, 'hand_cart', 56), Math.ceil(56 * 0.9)); assert.equal(vehicleTicks(defs, 'truck', 1), 1);
  const foot = tripPlan(defs, 'quarry', 'retrieve').ticks;
  assert.equal(foot, 40); // 50 x 80 %
  assert.deepEqual(tripPlan(defs, 'quarry', 'retrieve', { vehicle: 'truck' }), { mode: 'retrieve', ticks: 16, vehicle: 'truck' });
  assert.ok(tripPlan(defs, 'quarry', 'retrieve', { vehicle: 'hand_cart' }).ticks < foot);
  assert.equal(tripPlan(defs, 'quarry', 'stash', { vehicle: 'truck' }).vehicle, undefined, 'a stash trip ignores vehicles');
});

test('the garage is a ruin in every scenario, including the painted outpost, with a learner read for each vehicle', () => {
  for (const sc of ['stage1', 'stage1_line', 'stage1_long', 'stage1_outpost']) {
    const st = createInitialState({ defs, scenarioId: sc, seed: 1 });
    assert.equal(st.buildings.garage_1?.condition, 'ruined', sc); assert.equal(st.buildings.garage_1.type, 'garage');
  }
  const g = createSimulation({ defs, state: createInitialState({ defs, scenarioId: 'stage1', seed: 1 }) }).studentView().buildings.find((b) => b.id === 'garage_1');
  assert.equal(g.garage.working, false); assert.equal(g.garage.vehicles.length, 3);
  assert.equal(g.garage.vehicles[0].canUse, false); assert.match(g.garage.vehicles[0].reason, /HQ level 2/); assert.equal(g.garage.open, false);
  const open = mk().studentView().buildings.find((b) => b.id === 'garage_1');
  assert.deepEqual(open.garage.vehicles.map((v) => [v.id, v.canUse]), [['hand_cart', true], ['motor_cart', false], ['truck', false]]);
  assert.equal(open.garage.vehicles[0].carryPercent, 200); assert.equal(open.garage.open, true);
});

test('a hand cart carries twice as much and the run is shorter; the stash keeps what it could not take', () => {
  const foot = mk(); const r0 = run(foot, ['quarry']);
  const per = defs.items.stone.unitWeight; const cap = carryCapacity(foot.snapshot().survivors.survivor_1, defs);
  assert.equal(r0.loot.stone, Math.floor(cap / per)); assert.equal(stashUnits(foot), 40 - r0.loot.stone);
  const cart = mk(); const r1 = run(cart, ['quarry', { vehicle: 'hand_cart' }]);
  assert.equal(r1.vehicle, 'hand_cart'); assert.equal(r1.loot.stone, Math.floor((cap * 2) / per), 'twice her usual load');
  assert.equal(stashUnits(cart), 40 - r1.loot.stone);
  const dep = (s) => evs(s, 'scavenge.departed').at(-1);
  assert.equal(dep(cart).returnTick - dep(cart).tick, tripPlan(defs, 'quarry', 'retrieve', { vehicle: 'hand_cart' }).ticks);
  assert.ok(dep(cart).returnTick - dep(cart).tick < dep(foot).returnTick - dep(foot).tick);
  assert.deepEqual(dep(cart).fuel, null, 'a hand cart burns nothing');
  assert.equal(evs(cart, 'stash.retrieved').at(-1).vehicle, 'hand_cart');
  assert.deepEqual(ledgerViolations(cart.snapshot()), []);
  assert.equal(cart.snapshot().survivors.survivor_1.status, 'active');
});

test('a motor cart and a truck burn fuel when she LEAVES (coal first, charcoal as the fallback) and bring the whole stash home', () => {
  const m = mk({ garage: 2, items: { coal: 3 } });
  const r = run(m, ['quarry', { vehicle: 'motor_cart' }]);
  assert.equal(r.loot.stone, 40, 'four times her load covers the stash'); assert.equal(stock(m, 'coal'), 2, 'one coal burnt');
  assert.deepEqual(evs(m, 'scavenge.departed').at(-1).fuel, { item: 'coal', units: 1 });
  assert.equal(m.snapshot().scavenge.stash.quarry, undefined, 'an emptied stash is gone');
  const c = mk({ garage: 2, items: { coal: 0, charcoal: 2 } });
  run(c, ['quarry', { vehicle: 'motor_cart' }]);
  assert.equal(stock(c, 'charcoal'), 1, 'charcoal pays when there is no coal');
  const t = mk({ garage: 3, items: { coal: 5 } });
  const d = (cmd(t, ['quarry', { vehicle: 'truck' }]), t.step(80), evs(t, 'scavenge.departed').at(-1));
  assert.deepEqual(d.fuel, { item: 'coal', units: 3 }); assert.equal(stock(t, 'coal'), 2);
  assert.deepEqual(ledgerViolations(t.snapshot()), []);
});

test('refusals: unknown vehicle, HQ too low, no garage, ruined or too low a garage, no fuel - each changes nothing', () => {
  const nothing = (s, before) => { assert.equal(s.snapshot().survivors.survivor_1.status, 'active'); assert.deepEqual(s.snapshot().ledger, before); assert.equal(stashUnits(s), 40); };
  const check = (s, args, code) => { const before = structuredClone(s.snapshot().ledger); cmd(s, args); s.step(3); assert.equal(failedWith(s), code); nothing(s, before); };
  check(mk(), ['quarry', { vehicle: 'bicycle' }], 'UNKNOWN_TARGET');
  check(mk({ hq: 1 }), ['quarry', { vehicle: 'hand_cart' }], 'HQ_LEVEL');
  check(mk({ garage: 0 }), ['quarry', { vehicle: 'hand_cart' }], 'NEEDS_REPAIR'); // a ruin
  check(mk({ garage: 1, items: { coal: 9 } }), ['quarry', { vehicle: 'motor_cart' }], 'NEEDS_REPAIR'); // level 1 cannot field a motor cart
  check(mk({ garage: 2 }), ['quarry', { vehicle: 'motor_cart' }], 'INSUFFICIENT_RESOURCE'); // no coal or charcoal at all
  check(mk({ garage: 2, items: { coal: 0 }, mutate: (st) => { delete st.buildings.garage_1; } }), ['quarry', { vehicle: 'hand_cart' }], 'NO_STATION');
  // the stash rules still come first, and the plain retrieve is untouched
  const empty = mk({ stash: null }); cmd(empty, ['quarry', { vehicle: 'hand_cart' }]); empty.step(3); assert.equal(failedWith(empty), 'NO_STASH');
  const plain = mk({ garage: 0 }); assert.equal(run(plain, ['quarry']).vehicle, undefined, 'no vehicle = the old run, a ruined garage does not matter');
});

test('one vehicle of each kind: busy while it is out (even when two survivors race for it at the gate), free again when she is back', () => {
  const two = (mutate) => mk({ mutate: (st) => { const b = structuredClone(st.survivors.survivor_1); b.id = 'survivor_2'; b.identity = { ...(b.identity ?? {}), name: 'Eli' }; st.survivors.survivor_2 = b; mutate?.(st); } });
  // 1) already out: refused at once
  const s = two((st) => { Object.assign(st.survivors.survivor_2, { status: 'away', away: { siteId: 'quarry', mode: 'retrieve', departTick: 0, returnTick: 9999, danger: 0, vehicle: 'hand_cart' } }); });
  assert.equal(vehicleRefusal(s.snapshot(), defs, 'hand_cart').code, 'VEHICLE_BUSY');
  assert.match(s.studentView().buildings.find((b) => b.id === 'garage_1').garage.vehicles[0].reason, /out with survivor_2/);
  assert.equal(s.studentView().buildings.find((b) => b.id === 'garage_1').garage.vehicles[0].busyWith, 'survivor_2');
  cmd(s, ['quarry', { vehicle: 'hand_cart' }]); s.step(3); assert.equal(failedWith(s), 'VEHICLE_BUSY');
  // 2) a race: both are accepted at the desk, the second finds it gone when she reaches the gate
  const race = two();
  cmd(race, ['quarry', { vehicle: 'hand_cart' }], 'survivor_1'); cmd(race, ['quarry', { vehicle: 'hand_cart' }], 'survivor_2');
  race.step(40);
  assert.equal(evs(race, 'scavenge.departed').length, 1, 'only one set off');
  assert.ok(evs(race, 'action.failed').some((e) => e.reason === 'VEHICLE_BUSY'));
  // 3) back home it is free again
  let n = 0; while (race.snapshot().survivors[evs(race, 'scavenge.departed')[0].survivorId].status === 'away' && n++ < 400) race.step(1);
  assert.equal(vehicleRefusal(race.snapshot(), defs, 'hand_cart'), null);
});

test('a hurt survivor still drops part of the load with a vehicle (the stash keeps it)', () => {
  const danger = structuredClone(scavengeData); danger.startDay = 1; for (const s of Object.values(danger.sites)) s.danger = 100;
  const d = createDefinitions({ ...calm, scavenge: danger });
  const s = mk({ d, garage: 1 });
  const cap = carryCapacity(s.snapshot().survivors.survivor_1, d);
  const r = run(s, ['quarry', { vehicle: 'hand_cart' }]);
  assert.equal(r.hurt, true);
  const half = Math.floor(Math.floor((cap * 200) / 100) * d.scavenge.hurtLootPercent / 100);
  assert.equal(r.loot.stone, Math.floor(half / d.items.stone.unitWeight));
  assert.ok(stashUnits(s) > 0);
});

test('the Game API: retrieve takes an optional { vehicle }, rejects anything else, and the sandbox reaches it end to end', async () => {
  assert.deepEqual(buildCommand('survivor_1', { name: 'retrieve', args: ['quarry'] }).params, { siteId: 'quarry' });
  assert.deepEqual(buildCommand('survivor_1', { name: 'retrieve', args: ['quarry', { vehicle: 'truck' }] }).params, { siteId: 'quarry', vehicle: 'truck' });
  assert.deepEqual(buildCommand('survivor_1', { name: 'retrieve', args: ['quarry', {}] }).params, { siteId: 'quarry' });
  for (const args of [['quarry', { speed: 9 }], ['quarry', { vehicle: 5 }], ['quarry', { vehicle: '' }], ['quarry', 'truck'], ['quarry', { vehicle: 'truck' }, 1], [{ vehicle: 'truck' }]]) {
    assert.equal(refusedCode(() => buildCommand('survivor_1', { name: 'retrieve', args })), 'INVALID_ARGUMENT', JSON.stringify(args));
  }
  const s = mk({ garage: 2, items: { coal: 2 } });
  const out = await runLiveCode({ sim: s, sandbox, code: 'const g = buildings.find((b) => b.type === "garage").garage; const v = g.vehicles.find((x) => x.canUse && x.id === "motor_cart"); console.log(g.level, v.carryPercent); survivor.retrieve("quarry", { vehicle: v.id });' });
  assert.equal(out.ok, true, JSON.stringify(out));
  let n = 0; while (!evs(s, 'stash.retrieved').length && n++ < 400) s.step(1);
  assert.equal(evs(s, 'stash.retrieved').at(-1).vehicle, 'motor_cart');
  assert.equal((await runLiveCode({ sim: s, sandbox, code: 'buildings.find((b) => b.type === "garage").garage.vehicles[0].carryPercent = 1;' })).ok, false, 'the read is frozen');
  assert.ok(s.studentView().scavenge.sites.find((x) => x.id === 'quarry').stash.retrieveTicksWith.truck < s.studentView().scavenge.sites.find((x) => x.id === 'quarry').stash.retrieveTicks);
});

test('UI: the garage card has one honest Haul button per vehicle; it only inserts the real call', () => {
  const s = mk({ garage: 2, items: { coal: 1 } });
  const v = s.studentView(); const g = v.buildings.find((b) => b.id === 'garage_1');
  const list = buildingActionList(g, v).filter((a) => a.id.startsWith('haul:'));
  assert.deepEqual(list.map((a) => [a.id, a.enabled]), [['haul:hand_cart', true], ['haul:motor_cart', true], ['haul:truck', false]]);
  assert.equal(list[0].snippet, 'survivor.retrieve("quarry", { vehicle: "hand_cart" });');
  assert.match(list[2].reason, /garage/);
  const none = mk({ stash: null }); const nv = none.studentView();
  const off = buildingActionList(nv.buildings.find((b) => b.id === 'garage_1'), nv).find((a) => a.id === 'haul:hand_cart');
  assert.equal(off.enabled, false); assert.match(off.reason, /No stash/);
  const ruin = mk({ garage: 0 }); const rv = ruin.studentView();
  assert.match(buildingActionList(rv.buildings.find((b) => b.id === 'garage_1'), rv).find((a) => a.id === 'haul:hand_cart').reason, /garage/i);
});

test('garage levels: the highest repaired level counts, a ruined garage counts as none', () => {
  assert.equal(garageLevelOf(mk({ garage: 0 }).snapshot(), defs), 0);
  assert.equal(garageLevelOf(mk({ garage: 3 }).snapshot(), defs), 3);
  assert.equal(fuelPlan(mk({ garage: 3, items: { coal: 2 } }).snapshot(), defs, 'truck'), null, 'two coal cannot pay for three');
  assert.deepEqual(fuelPlan(mk({ garage: 3, items: { coal: 2, charcoal: 3 } }).snapshot(), defs, 'truck'), { item: 'charcoal', units: 3 });
  assert.deepEqual(fuelPlan(mk().snapshot(), defs, 'hand_cart'), { item: null, units: 0 });
});
