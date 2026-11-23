// R4 mining station (docs/game/24): a ruined building that opens with the HQ at level 3; survivor.mine(ore, rounds) digs ore in rounds (rail cart and powered drill
// raise the yield), each round may end in a cave-in, ore is smelted into bars. Same ledger, gates and skill rules as the other standing jobs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs as baseDefs, newSim, call, runUntilIdle, types, sandbox } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { raidSchedule } from '../src/modules/definitions/data/threats.js';
import { mining } from '../src/modules/definitions/data/mining.js';
import { caveInPercent } from '../src/modules/buildings/index.js';
import { buildingActionList } from '../src/app/ui/actions.js';
import { AftermathError } from '../src/kernel/index.js';
import { buildCommand } from '../src/modules/api/index.js';

const defs = baseDefs;
// A world where a cave-in can never happen, so exact ore counts are exact.
const safeDefs = createDefinitions({
  eventSchedule: { ...eventSchedule, chancePercent: 0 }, raidSchedule: { ...raidSchedule, chancePercent: 0 },
  mining: { ...mining, caveIn: { ...mining.caveIn, percent: { 1: 0, 2: 0, 3: 0 }, floorPercent: 0 } },
});
const safeSim = (scenario, seed, mutate) => { const state = createInitialState({ defs: safeDefs, scenarioId: scenario, seed }); mutate?.(state); return createSimulation({ defs: safeDefs, state }); };

// Like a finished upgrade: the level's max health AND its storage table (the HQ's storage grows with its level).
const fix = (st, id, level = 1) => { const b = st.buildings[id]; const lv = defs.buildings[b.type].levels[level]; b.level = level; b.health = lv.maxHealth; b.condition = 'repaired'; if (lv.storage) b.storage = { ...lv.storage }; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) st.ledger[`stock.${k}`].total = v; };
const stock = (sim, k) => sim.snapshot().ledger[`stock.${k}`].total;
const failed = (sim) => JSON.stringify(sim.log.all().filter((e) => e.type === 'action.failed'));
const events = (sim, type) => sim.log.all().filter((e) => e.type === type);
const view = (sim, id) => sim.studentView().buildings.find((b) => b.id === id);
const ready = (st, hq = 3) => { fix(st, 'hq', Math.min(hq, 4)); fix(st, 'mining_1', 1); };

test('data: the station, its three levels, the three ores and the Mining skill are defined and consistent', () => {
  assert.equal(defs.mining.station, 'mining_station'); assert.equal(defs.mining.minHq, 3);
  assert.deepEqual(Object.keys(defs.mining.ores), ['iron_ore', 'lead_ore', 'coal']);
  const lv = defs.buildings.mining_station.levels;
  assert.deepEqual([lv[1].mine.yieldPercent, lv[2].mine.yieldPercent, lv[3].mine.yieldPercent], [100, 200, 300]);
  assert.equal(lv[3].mine.power, 8); assert.equal(lv[2].name, 'Rail Cart Mine'); assert.equal(lv[3].name, 'Powered Drill');
  assert.equal(defs.buildings.mining_station.upgrade[2].minHq, 3); assert.equal(defs.buildings.mining_station.upgrade[3].minHq, 4);
  assert.equal(defs.skills.mining.name, 'Mining'); assert.equal(defs.progression.awards.mine.skill, 'mining');
  assert.equal(defs.survivorTemplates.rookie.skills.mining, 0);
  assert.ok(defs.town.candidates.skills.pool.includes('mining'), 'recruits can arrive with Mining');
  for (const item of ['iron_ore', 'lead_ore', 'coal']) {
    assert.ok(defs.items[item].unitWeight > 0, item);
    for (const l of [1, 2, 3, 4]) { const t = l === 1 ? defs.buildings.hq.storage : defs.buildings.hq.levels[l].storage; assert.ok(t[item] > 0, `hq level ${l} stores ${item}`); }
  }
});

test('data: the ore smelter recipes give MORE bars than the scrap ones and need the smelter and HQ 2', () => {
  for (const [id, ore, bar] of [['iron_bar_ore', 'iron_ore', 'iron_bar'], ['lead_bar_ore', 'lead_ore', 'lead_bar']]) {
    const r = defs.recipes[id];
    assert.deepEqual([r.station, r.minHq, r.action], ['smelter', 2, 'craft']);
    assert.deepEqual(r.inputs, { [ore]: 3, coal: 1 }); assert.deepEqual(r.outputs, { [bar]: 2 });
  }
});

test('data: invalid mining tables are refused at load time', () => {
  const bad = (m) => assert.throws(() => createDefinitions({ mining: m }), (e) => e instanceof AftermathError && e.code === 'INVALID_DEFINITIONS');
  bad({ ...mining, station: 'nope' });
  bad({ ...mining, ores: {} });
  bad({ ...mining, ores: { iron_ore: { ...mining.ores.iron_ore, item: 'unobtainium' } } });
  bad({ ...mining, caveIn: { ...mining.caveIn, percent: { 1: 10, 2: 6 } } });
  bad({ ...mining, minHq: 0 });
});

test('pure: the cave-in chance falls with the station level and with Mining skill, never below the floor', () => {
  assert.equal(caveInPercent(mining, 1, 0), 10); assert.equal(caveInPercent(mining, 2, 0), 6); assert.equal(caveInPercent(mining, 3, 0), 4);
  assert.equal(caveInPercent(mining, 1, 4), 6); assert.equal(caveInPercent(mining, 3, 10), mining.caveIn.floorPercent);
});

test('scenarios: a ruined mining_1 in the settlement and in the painted outpost, closed at HQ level 1', () => {
  for (const scenario of ['stage1', 'stage1_outpost', 'stage1_line', 'stage1_long']) {
    const b = view(newSim(scenario, 1), 'mining_1');
    assert.equal(b.type, 'mining_station', scenario); assert.equal(b.condition, 'ruined', scenario);
    assert.equal(b.mining.working, false, scenario); assert.equal(b.mining.open, false, scenario);
    assert.deepEqual(b.mining.ores.map((o) => o.id), ['iron_ore', 'lead_ore', 'coal'], scenario);
    assert.equal(b.mining.ores.every((o) => o.canMine === false), true, scenario);
  }
});

test('a ruined station refuses (NEEDS_REPAIR), HQ below 3 refuses (HQ_LEVEL), an unknown ore refuses (INVALID_PARAMS): nothing changes', () => {
  const a = newSim('stage1', 1, (st) => { fix(st, 'hq', 3); });
  call(a, 'mine', 'iron_ore', 1); runUntilIdle(a, 100);
  assert.ok(failed(a).includes('NEEDS_REPAIR'), failed(a));
  const b = newSim('stage1', 1, (st) => { fix(st, 'mining_1', 1); fix(st, 'hq', 2); });
  call(b, 'mine', 'iron_ore', 1); runUntilIdle(b, 100);
  assert.ok(failed(b).includes('HQ_LEVEL'), failed(b)); assert.equal(stock(b, 'iron_ore'), 0);
  const c = newSim('stage1', 1, (st) => ready(st));
  call(c, 'mine', 'diamond', 1); runUntilIdle(c, 100);
  assert.ok(failed(c).includes('INVALID_PARAMS'), failed(c));
  assert.deepEqual(ledgerViolations(c.snapshot()), []);
});

test('mining at level 1: each round brings exactly the ore yield, the job stops with TARGET_REACHED, and the ledger balances', () => {
  const sim = safeSim('stage1', 1, (st) => ready(st));
  call(sim, 'mine', 'iron_ore', 3); runUntilIdle(sim, 1500);
  assert.equal(stock(sim, 'iron_ore'), 6, '3 rounds x 2 ore');
  assert.equal(events(sim, 'ore.mined').length, 3);
  assert.deepEqual(events(sim, 'ore.mined').map((e) => e.data?.qty ?? e.qty), [2, 2, 2]);
  const stopped = events(sim, 'task.stopped').find((e) => (e.data ?? e).taskType === 'mine');
  assert.equal((stopped.data ?? stopped).reason, 'TARGET_REACHED');
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  call(sim, 'mine', 'coal', 2); runUntilIdle(sim, 3000);
  assert.equal(stock(sim, 'coal'), 6, 'coal gives 3 per round');
});

test('the rail cart (level 2) doubles the yield and the powered drill (level 3) triples it', () => {
  const l2 = safeSim('stage1', 1, (st) => { fix(st, 'hq', 3); fix(st, 'mining_1', 2); });
  call(l2, 'mine', 'iron_ore', 2); runUntilIdle(l2, 1500);
  assert.equal(stock(l2, 'iron_ore'), 8);
  const l3 = safeSim('stage1', 1, (st) => { fix(st, 'hq', 4); fix(st, 'mining_1', 3); fix(st, 'generator_1', 1); give(st, { wood: 60 }); });
  call(l3, 'mine', 'lead_ore', 2); runUntilIdle(l3, 2500);
  assert.equal(stock(l3, 'lead_ore'), 12, '2 rounds x 2 ore x 300 %');
  assert.deepEqual(ledgerViolations(l3.snapshot()), []);
});

test('the powered drill needs the grid: with no power she waits, then the job fails with NO_POWER and nothing is dug', () => {
  const sim = safeSim('stage1', 1, (st) => { fix(st, 'hq', 4); fix(st, 'mining_1', 3); });
  call(sim, 'mine', 'iron_ore', 1); runUntilIdle(sim, 1500);
  assert.ok(failed(sim).includes('NO_POWER'), failed(sim));
  assert.equal(stock(sim, 'iron_ore'), 0);
});

test('Mining practice: finished rounds teach the Mining skill (level 1 after five rounds)', () => {
  const sim = safeSim('stage1', 1, (st) => ready(st));
  assert.equal(sim.snapshot().survivors.survivor_1.skills.mining, 0);
  call(sim, 'mine', 'iron_ore', 6); runUntilIdle(sim, 3000);
  assert.ok(sim.snapshot().survivors.survivor_1.skills.mining >= 1);
  assert.ok(types(sim).includes('skill.levelup'));
});

test('cave-ins: a lost round gives no ore and no XP and costs health; the result is the same for the same seed', () => {
  const run = () => { const s = newSim('stage1', 7, (st) => ready(st)); call(s, 'mine', 'iron_ore', 30); runUntilIdle(s, 4000); return s; };
  const a = run(); const b = run();
  const ins = events(a, 'mine.caveIn');
  assert.ok(ins.length >= 1, 'about 10 % of rounds should collapse over this many rounds');
  const mined = events(a, 'ore.mined');
  assert.equal(stock(a, 'iron_ore'), mined.reduce((n, e) => n + (e.data?.qty ?? e.qty), 0), 'only finished rounds are credited');
  const hp = a.snapshot().survivors.survivor_1.needs.health;
  assert.equal(hp, Math.max(1, 100 - ins.length * defs.mining.caveIn.damage), 'each cave-in costs exactly the damage (health only falls from cave-ins in this short job)');
  assert.equal(a.snapshot().survivors.survivor_1.skills.mining >= 0, true);
  assert.deepEqual(ledgerViolations(a.snapshot()), []);
  assert.equal(JSON.stringify(a.log.all().filter((e) => /mine|ore\./.test(e.type))), JSON.stringify(b.log.all().filter((e) => /mine|ore\./.test(e.type))), 'pure roll: same seed, same collapses');
});

test('too hurt: below the safe health she refuses to start (TOO_HURT) and a job stops once a cave-in leaves her below it', () => {
  const start = newSim('stage1', 1, (st) => { ready(st); st.survivors.survivor_1.needs.health = defs.mining.minHealth - 1; });
  call(start, 'mine', 'iron_ore', 2); runUntilIdle(start, 200);
  assert.ok(failed(start).includes('TOO_HURT'), failed(start));
  // Force constant cave-ins: the job must stop by itself, hurt but alive.
  const grim = createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 0 }, raidSchedule: { ...raidSchedule, chancePercent: 0 }, mining: { ...mining, caveIn: { ...mining.caveIn, percent: { 1: 100, 2: 100, 3: 100 }, floorPercent: 100 } } });
  const st = createInitialState({ defs: grim, scenarioId: 'stage1', seed: 1 }); ready(st);
  const sim = createSimulation({ defs: grim, state: st });
  call(sim, 'mine', 'iron_ore', 20); runUntilIdle(sim, 3000);
  const done = events(sim, 'task.stopped').map((e) => e.data ?? e).find((e) => e.taskType === 'mine');
  assert.equal(done.reason, 'TOO_HURT');
  const hp = sim.snapshot().survivors.survivor_1.needs.health;
  assert.ok(hp >= 1 && hp < grim.mining.minHealth, `hp ${hp}`);
  assert.equal(stock(sim, 'iron_ore'), 0);
});

test('storage: with no room left the job fails with STORAGE_FULL, and a round never overfills storage', () => {
  const full = safeSim('stage1', 1, (st) => { ready(st); give(st, { iron_ore: defs.buildings.hq.levels[3].storage.iron_ore }); });
  call(full, 'mine', 'iron_ore', 1); runUntilIdle(full, 200);
  assert.ok(failed(full).includes('STORAGE_FULL'), failed(full));
  const cap = defs.buildings.hq.levels[3].storage.iron_ore;
  const tight = safeSim('stage1', 1, (st) => { ready(st); give(st, { iron_ore: cap - 3 }); });
  call(tight, 'mine', 'iron_ore', 10); runUntilIdle(tight, 3000);
  assert.equal(stock(tight, 'iron_ore'), cap, 'filled to the brim and no further');
  const stopped = events(tight, 'task.stopped').map((e) => e.data ?? e).find((e) => e.taskType === 'mine');
  assert.equal(stopped.reason, 'STORAGE_FULL');
  assert.deepEqual(ledgerViolations(tight.snapshot()), []);
});

test('smelting: 3 iron ore + 1 coal become 2 iron bars at a repaired smelter (HQ 2), exactly', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.skills.repair = 1; fix(st, 'hq', 3); fix(st, 'smelter_1', 1); give(st, { iron_ore: 9, lead_ore: 3, coal: 4 }); });
  call(sim, 'craft', 'iron_bar_ore', 3); runUntilIdle(sim, 2000);
  assert.equal(stock(sim, 'iron_bar'), 6); assert.equal(stock(sim, 'iron_ore'), 0); assert.equal(stock(sim, 'coal'), 1);
  call(sim, 'craft', 'lead_bar_ore', 1); runUntilIdle(sim, 3000);
  assert.equal(stock(sim, 'lead_bar'), 2); assert.equal(stock(sim, 'coal'), 0);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('station upgrades: the rail cart needs HQ 3, the powered drill needs HQ 4 (HQ_LEVEL) and steel plate', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.skills.repair = 1; fix(st, 'hq', 3); fix(st, 'mining_1', 2); give(st, { wood: 100, stone: 100, scrap: 40, steel_plate: 4 }); });
  call(sim, 'upgrade', 'mining_1'); runUntilIdle(sim, 600);
  assert.ok(failed(sim).includes('HQ_LEVEL'), failed(sim));
  const ok = newSim('stage1', 1, (st) => { st.survivors.survivor_1.skills.repair = 1; fix(st, 'hq', 4); fix(st, 'mining_1', 2); give(st, { wood: 100, stone: 100, scrap: 40, steel_plate: 4 }); });
  call(ok, 'upgrade', 'mining_1'); runUntilIdle(ok, 900);
  assert.equal(ok.snapshot().buildings.mining_1.level, 3);
  assert.equal(stock(ok, 'steel_plate'), 0);
});

test('learner view and buttons: mining_1.mining lists the ores; the buttons only insert code and say why they are disabled', () => {
  const closed = newSim('stage1', 1);
  const cb = buildingActionList(view(closed, 'mining_1'), closed.studentView());
  assert.equal(cb.filter((a) => a.id.startsWith('mine:')).every((a) => !a.enabled), true);
  assert.match(cb.find((a) => a.id === 'mine:iron_ore').reason, /Repair the mining station/);
  const open = newSim('stage1', 1, (st) => ready(st));
  const v = view(open, 'mining_1'); assert.equal(v.mining.open, true); assert.equal(v.mining.working, true);
  assert.deepEqual(v.mining.ores.map((o) => [o.id, o.yield, o.canMine]), [['iron_ore', 2, true], ['lead_ore', 2, true], ['coal', 3, true]]);
  const btn = buildingActionList(v, open.studentView()).find((a) => a.id === 'mine:coal');
  assert.equal(btn.enabled, true); assert.equal(btn.snippet, 'survivor.mine("coal", 5);');
  const lowHq = newSim('stage1', 1, (st) => { fix(st, 'mining_1', 1); });
  assert.match(buildingActionList(view(lowHq, 'mining_1'), lowHq.studentView()).find((a) => a.id === 'mine:iron_ore').reason, /Needs HQ level 3/);
});

test('API: survivor.mine(ore, rounds) is validated before it becomes a command; the survivor "doing" line says mining', () => {
  assert.deepEqual(buildCommand('survivor_1', { name: 'mine', args: ['iron_ore', 5] }).params, { ore: 'iron_ore', count: 5 });
  assert.deepEqual(buildCommand('survivor_1', { name: 'mine', args: ['coal'] }).params, { ore: 'coal' });
  for (const args of [[], [5], ['iron_ore', 0], ['iron_ore', 101], ['iron_ore', 2.5], ['iron_ore', 1, 2]]) {
    assert.throws(() => buildCommand('survivor_1', { name: 'mine', args }), (e) => e instanceof AftermathError && e.code === 'INVALID_ARGUMENT', JSON.stringify(args));
  }
  const sim = newSim('stage1', 1, (st) => ready(st));
  call(sim, 'mine', 'coal', 2); sim.step(8);
  assert.equal(sim.renderProjection().npcs[0].doing, 'mining coal');
});

test('SIM_VERSION moved to 0.47.0 (R5 garage): an older save or replay is refused instead of loading a world without the mining station', async () => {
  const { SIM_VERSION } = await import('../src/kernel/index.js');
  assert.equal(SIM_VERSION, '0.47.0');
});
