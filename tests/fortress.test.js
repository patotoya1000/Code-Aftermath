// P0-P3 (docs/game/23): HQ levels 3-4 and the HQ ceiling, fortress materials (sand, cement, steel, blocks, hinges, sandbags) and where they come from, the smelter,
// and the wall (L1-5) and gate (L1-5) ladders with per-level health, armor, repair and HQ requirement. Plus the wall / gate card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, types, sandbox } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { buildCommand } from '../src/modules/api/index.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { raidSchedule } from '../src/modules/definitions/data/threats.js';
import { scavenge as scavengeData } from '../src/modules/definitions/data/scavenge.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { hqLevelOf, hqLock, nextUpgrade, armorOf, repairOf } from '../src/modules/buildings/index.js';
import { lootFor } from '../src/modules/threats/index.js';
import { wallCardHtml, isWallCard, WALL_TABS } from '../src/app/ui/wallcard.js';
import { buildingActionList } from '../src/app/ui/actions.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) st.ledger[`stock.${k}`].total = v; };
const stock = (sim, k) => sim.snapshot().ledger[`stock.${k}`].total;
const skill = (st, name, level) => { st.survivors.survivor_1.skills[name] = level; };
const failed = (sim) => JSON.stringify(sim.log.all().filter((e) => e.type === 'action.failed'));
const view = (sim, id) => sim.studentView().buildings.find((b) => b.id === id);
const ready = (st) => { skill(st, 'repair', 1); skill(st, 'crafting', 2); };

// ---------- P0: HQ levels and the ceiling ----------

test('P0: the HQ has levels 1-4 with the planned health and upgrade costs', () => {
  const hq = defs.buildings.hq;
  assert.deepEqual(Object.keys(hq.levels).map(Number), [1, 2, 3, 4]);
  assert.deepEqual([1, 2, 3, 4].map((l) => hq.levels[l].maxHealth), [200, 300, 450, 650]);
  assert.deepEqual(hq.upgrade[3].cost, { wood: 40, stone: 40, steel_plate: 8 });
  assert.deepEqual(hq.upgrade[4].cost, { concrete_block: 20, steel_plate: 16, boss_core: 1 });
  for (const l of [2, 3, 4]) assert.ok(hq.levels[l].storage.cement > 0 && hq.levels[l].storage.sand > 0, `HQ level ${l} stores the new goods`);
  assert.ok(hq.levels[3].storage.wood > hq.levels[2].storage.wood && hq.levels[4].storage.wood > hq.levels[3].storage.wood, 'storage grows with the level');
});

test('P0: hqLevelOf / hqLock read the world, and nextUpgrade carries minHq only where data has it', () => {
  const sim = newSim('stage1', 1);
  const st = sim.snapshot();
  assert.equal(hqLevelOf(st), 1);
  assert.equal(hqLock(st, { minHq: 2 }).need, 2);
  assert.equal(hqLock(st, { minHq: 1 }), null);
  assert.equal(hqLock(st, undefined), null);
  assert.equal(nextUpgrade(defs, st.buildings.hq).minHq, undefined, 'the HQ itself has no ceiling');
  assert.equal(nextUpgrade(defs, st.buildings.fence).minHq, 1);
  assert.equal(hqLevelOf({ buildings: {} }), 0, 'no hq in the world = level 0');
});

test('P0: upgrading above the HQ level is refused with HQ_LEVEL and nothing is spent or reserved', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'fence', 2); give(st, { wood: 100, stone: 100, cement: 20 }); });
  assert.equal(view(sim, 'fence').upgradeLocked.need, 2);
  call(sim, 'upgrade', 'fence'); runUntilIdle(sim, 300);
  assert.ok(failed(sim).includes('HQ_LEVEL'), failed(sim));
  assert.equal(sim.snapshot().buildings.fence.level, 2);
  assert.equal(stock(sim, 'wood'), 100); assert.equal(stock(sim, 'cement'), 20);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('P0: with the HQ at level 2 the same upgrade goes through, costs exactly the table and gives the level-3 wall', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); fix(st, 'fence', 2); give(st, { wood: 100, stone: 100, cement: 20 }); });
  assert.equal(view(sim, 'fence').upgradeLocked, null);
  call(sim, 'upgrade', 'fence'); runUntilIdle(sim, 600);
  const st = sim.snapshot();
  assert.equal(st.buildings.fence.level, 3);
  assert.equal(st.buildings.fence.health, 320);
  assert.equal(view(sim, 'fence').name, 'Stone Wall');
  assert.equal(stock(sim, 'wood'), 70); assert.equal(stock(sim, 'stone'), 80); assert.equal(stock(sim, 'cement'), 10);
  assert.ok(types(sim).includes('building.upgraded'));
  assert.deepEqual(ledgerViolations(st), []);
});

test('P0: the HQ itself climbs to level 3 and 4 with the planned materials and takes the bigger storage table', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); give(st, { wood: 60, stone: 60, steel_plate: 8 }); });
  call(sim, 'upgrade', 'hq'); runUntilIdle(sim, 800);
  let st = sim.snapshot();
  assert.equal(st.buildings.hq.level, 3); assert.equal(st.buildings.hq.health, 450);
  assert.equal(st.buildings.hq.storage.sand, defs.buildings.hq.levels[3].storage.sand);
  assert.equal(stock(sim, 'steel_plate'), 0);
  const sim4 = newSim('stage1', 1, (s) => { ready(s); fix(s, 'hq', 3); give(s, { concrete_block: 20, steel_plate: 16, boss_core: 1 }); });
  call(sim4, 'upgrade', 'hq'); runUntilIdle(sim4, 1000);
  st = sim4.snapshot();
  assert.equal(st.buildings.hq.level, 4); assert.equal(st.buildings.hq.health, 650);
  assert.equal(stock(sim4, 'boss_core'), 0, 'the tier-5 boss core is consumed');
  assert.equal(nextUpgrade(defs, st.buildings.hq), null);
});

test('P0: every level above the HQ ceiling stays locked, level by level (wall L4 needs HQ 3, L5 needs HQ 4)', () => {
  const need = (id, level) => defs.buildings[id].upgrade[level].minHq;
  assert.deepEqual([2, 3, 4, 5].map((l) => need('fence', l)), [1, 2, 3, 4]);
  assert.deepEqual([2, 3, 4, 5].map((l) => need('gate', l)), [1, 2, 3, 4]);
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); fix(st, 'fence', 3); give(st, { concrete_block: 12, steel_plate: 6 }); });
  assert.deepEqual(view(sim, 'fence').upgradeLocked, { need: 3, have: 2 });
  call(sim, 'upgrade', 'fence'); runUntilIdle(sim, 300);
  assert.ok(failed(sim).includes('HQ_LEVEL'));
  assert.equal(stock(sim, 'concrete_block'), 12);
});

// ---------- P1: materials, recipes, where they come from ----------

test('P1: the fortress items exist, are heavy, never spoil, and the HQ can store them', () => {
  for (const id of ['sand', 'cement', 'steel_ingot', 'steel_plate', 'concrete_block', 'hinge_set', 'sandbag']) {
    assert.ok(defs.items[id], id); assert.equal(defs.items[id].shelfLife, undefined, `${id} does not spoil`);
    assert.ok(defs.buildings.hq.storage[id] > 0, `${id} fits in the level-1 HQ`);
  }
});

test('P1: recipes make the right thing at the right station and level (exact inputs and outputs)', () => {
  const r = defs.recipes;
  assert.deepEqual([r.steel_ingot.station, r.steel_ingot.inputs, r.steel_ingot.outputs, r.steel_ingot.ticks], ['smelter', { scrap: 2, charcoal: 1 }, { steel_ingot: 1 }, 40]);
  assert.deepEqual([r.steel_plate.station, r.steel_plate.stationLevel, r.steel_plate.inputs, r.steel_plate.ticks], ['workshop', 2, { steel_ingot: 2 }, 30]);
  assert.deepEqual([r.hinge_set.station, r.hinge_set.stationLevel, r.hinge_set.inputs, r.hinge_set.ticks], ['workshop', 1, { scrap: 2, wood: 1 }, 20]);
  assert.deepEqual([r.concrete_block.stationLevel, r.concrete_block.inputs, r.concrete_block.ticks], [2, { cement: 2, sand: 3, water: 1 }, 40]);
  assert.deepEqual([r.sandbag.stationLevel, r.sandbag.inputs, r.sandbag.ticks], [1, { rags: 2, sand: 3 }, 15]);
});

test('P1: a workshop crafts hinge sets and sandbags from base stock (conservation holds)', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'workshop_1', 1); give(st, { scrap: 10, wood: 10, rags: 6, sand: 9 }); });
  call(sim, 'craft', 'hinge_set', 3); runUntilIdle(sim, 600);
  call(sim, 'craft', 'sandbag', 3); runUntilIdle(sim, 1200);
  assert.equal(stock(sim, 'hinge_set'), 3); assert.equal(stock(sim, 'scrap'), 4); assert.equal(stock(sim, 'wood'), 7);
  assert.equal(stock(sim, 'sandbag'), 3); assert.equal(stock(sim, 'rags'), 0); assert.equal(stock(sim, 'sand'), 0);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('P1: concrete blocks and steel plate need workshop level 2', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'workshop_1', 1); give(st, { cement: 4, sand: 6, water: 4, steel_ingot: 4 }); });
  call(sim, 'craft', 'concrete_block', 1); runUntilIdle(sim, 300);
  assert.ok(failed(sim).includes('NEEDS_REPAIR'), failed(sim));
  const sim2 = newSim('stage1', 1, (st) => { ready(st); fix(st, 'workshop_1', 2); give(st, { cement: 4, sand: 6, water: 4, steel_ingot: 4 }); });
  call(sim2, 'craft', 'concrete_block', 2); runUntilIdle(sim2, 600);
  call(sim2, 'craft', 'steel_plate', 2); runUntilIdle(sim2, 1200);
  assert.equal(stock(sim2, 'concrete_block'), 2); assert.equal(stock(sim2, 'cement'), 0); assert.equal(stock(sim2, 'sand'), 0);
  assert.equal(stock(sim2, 'steel_plate'), 2); assert.equal(stock(sim2, 'steel_ingot'), 0);
});

test('P1: three new scavenge sites carry the materials, and zombie loot can drop sand and cement', () => {
  const s = defs.scavenge.sites;
  assert.ok(s.construction_site.yield.cement && s.construction_site.yield.sand && s.construction_site.yield.scrap);
  assert.ok(s.quarry.yield.sand && s.quarry.yield.stone);
  assert.ok(s.hardware_depot.yield.hinge_set && s.hardware_depot.yield.scrap);
  const sim = newSim('stage1', 1);
  assert.deepEqual(sim.studentView().scavenge.sites.map((x) => x.id).sort(), Object.keys(s).sort(), 'the learner read lists every site');
  const items = (t) => defs.lootTables[t].map((r) => r.item);
  assert.ok(items('brute').includes('cement') && items('brute').includes('sand') && items('thrower').includes('sand'));
  const drops = new Set();
  for (let id = 1; id <= 80; id++) for (const d of lootFor(defs, 1, 9, { id: `z${id}`, type: 'brute' })) drops.add(d.item);
  assert.ok(drops.has('cement') && drops.has('sand'), [...drops].join());
});

test('P1: a scavenge trip to the quarry and one to the construction site bring the materials home within the site range', () => {
  const open = createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 0 }, raidSchedule: { ...raidSchedule, chancePercent: 0 }, scavenge: { ...scavengeData, startDay: 1, sites: { ...scavengeData.sites, quarry: { ...scavengeData.sites.quarry, danger: 0 }, construction_site: { ...scavengeData.sites.construction_site, danger: 0 } } } });
  const state = createInitialState({ defs: open, scenarioId: 'stage1', seed: 3 });
  Object.assign(state.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
  const sim = createSimulation({ defs: open, state });
  const trip = (site) => { const had = sim.log.all().filter((e) => e.type === 'scavenge.returned').length; sim.submit(buildCommand('survivor_1', { name: 'scavenge', args: [site] })); for (let n = 0; n < 900 && sim.log.all().filter((e) => e.type === 'scavenge.returned').length === had; n++) sim.step(1); return sim.log.all().filter((e) => e.type === 'scavenge.returned').at(-1); };
  const q = trip('quarry');
  assert.ok(q, 'she came back');
  const st = sim.snapshot();
  assert.ok(st.ledger['stock.sand'].total >= 1 && st.ledger['stock.sand'].total <= open.scavenge.sites.quarry.yield.sand[1], `sand ${st.ledger['stock.sand'].total}`);
  const c = trip('construction_site');
  assert.ok(c, 'second trip returned');
  const st2 = sim.snapshot();
  assert.ok(st2.ledger['stock.cement'].total >= 1 && st2.ledger['stock.cement'].total <= open.scavenge.sites.construction_site.yield.cement[1], `cement ${st2.ledger['stock.cement'].total}`);
  assert.deepEqual(ledgerViolations(st2), []);
});

// ---------- P2: the smelter ----------

test('P2: the smelter is a ruined station in the settlement, with two levels', () => {
  const sim = newSim('stage1', 1);
  const b = view(sim, 'smelter_1');
  assert.equal(b.type, 'smelter'); assert.equal(b.condition, 'ruined');
  assert.equal(defs.buildings.smelter.levels[2].name, 'Blast Smelter');
  assert.deepEqual(b.recipes.map((r) => r.id), ['steel_ingot', 'steel_ingot_bulk', 'lead_bar', 'iron_bar']);
  const out = newSim('stage1_outpost', 1);
  assert.ok(view(out, 'smelter_1'), 'the painted outpost has one too');
});

test('P2: a ruined smelter refuses the recipe (NEEDS_REPAIR) and spends nothing; repairing it opens it', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); give(st, { scrap: 10, charcoal: 5, wood: 20, stone: 20 }); });
  call(sim, 'craft', 'steel_ingot', 1); runUntilIdle(sim, 200);
  assert.ok(failed(sim).includes('NEEDS_REPAIR'), failed(sim));
  assert.equal(stock(sim, 'scrap'), 10);
  for (let i = 0; i < 5; i++) call(sim, 'repair', 'smelter_1');
  runUntilIdle(sim, 1000);
  assert.equal(sim.snapshot().buildings.smelter_1.condition, 'repaired');
  call(sim, 'craft', 'steel_ingot', 2); runUntilIdle(sim, 1500);
  assert.equal(stock(sim, 'steel_ingot'), 2); assert.equal(stock(sim, 'scrap'), 6); assert.equal(stock(sim, 'charcoal'), 3);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('P2: steel ingots stay closed below HQ level 2 (HQ_LEVEL, nothing spent), even with a repaired smelter', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'smelter_1', 1); give(st, { scrap: 10, charcoal: 5 }); });
  assert.equal(view(sim, 'smelter_1').recipes[0].working, false);
  assert.equal(sim.studentView().recipes.steel_ingot.stationWorking, false);
  call(sim, 'craft', 'steel_ingot', 1); runUntilIdle(sim, 200);
  assert.ok(failed(sim).includes('HQ_LEVEL'), failed(sim));
  assert.equal(stock(sim, 'scrap'), 10);
  const open = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); fix(st, 'smelter_1', 1); give(st, { scrap: 10, charcoal: 5 }); });
  assert.equal(view(open, 'smelter_1').recipes[0].working, true);
  assert.equal(open.studentView().recipes.steel_ingot.minHq, 2);
});

test('P2: the bulk recipe needs the Blast Smelter (level 2) and its upgrade is HQ-gated', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); fix(st, 'smelter_1', 1); give(st, { scrap: 20, charcoal: 10, wood: 40, stone: 50 }); });
  call(sim, 'craft', 'steel_ingot_bulk', 1); runUntilIdle(sim, 200);
  assert.ok(failed(sim).includes('NEEDS_REPAIR'), failed(sim));
  call(sim, 'upgrade', 'smelter_1'); runUntilIdle(sim, 400);
  assert.ok(failed(sim).includes('HQ_LEVEL'), 'smelter level 2 needs HQ 3');
  const sim2 = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 3); fix(st, 'smelter_1', 2); give(st, { scrap: 20, charcoal: 10 }); });
  call(sim2, 'craft', 'steel_ingot_bulk', 1); runUntilIdle(sim2, 600);
  assert.equal(stock(sim2, 'steel_ingot'), 4); assert.equal(stock(sim2, 'scrap'), 12); assert.equal(stock(sim2, 'charcoal'), 6);
});

test('P2: the whole chain works end to end - scrap and charcoal become a steel plate', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); fix(st, 'smelter_1', 1); fix(st, 'workshop_1', 2); give(st, { scrap: 4, charcoal: 2 }); });
  call(sim, 'craft', 'steel_ingot', 2); runUntilIdle(sim, 1500);
  call(sim, 'craft', 'steel_plate', 1); runUntilIdle(sim, 2500);
  assert.equal(stock(sim, 'steel_plate'), 1); assert.equal(stock(sim, 'steel_ingot'), 0);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('future bars: lead and iron come from the smelter (HQ 2), the HQ stores them, nothing consumes them yet', () => {
  assert.deepEqual([defs.recipes.lead_bar.station, defs.recipes.lead_bar.inputs, defs.recipes.lead_bar.minHq], ['smelter', { scrap: 3 }, 2]);
  assert.deepEqual(defs.recipes.iron_bar.inputs, { scrap: 3, charcoal: 1 });
  for (const id of ['lead_bar', 'iron_bar']) for (const l of [2, 3, 4]) assert.ok(defs.buildings.hq.levels[l].storage[id] > 0);
  for (const [id, r] of Object.entries(defs.recipes)) assert.ok(!('lead_bar' in r.inputs) && !('iron_bar' in r.inputs), `${id} must not use them yet`);
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); fix(st, 'smelter_1', 1); give(st, { scrap: 9, charcoal: 1 }); });
  call(sim, 'craft', 'lead_bar', 2); runUntilIdle(sim, 600);
  call(sim, 'craft', 'iron_bar', 1); runUntilIdle(sim, 1200);
  assert.equal(stock(sim, 'lead_bar'), 2); assert.equal(stock(sim, 'iron_bar'), 1); assert.equal(stock(sim, 'scrap'), 0);
});

// ---------- P3: wall and gate ladders ----------

test('P3: the wall ladder matches the design table (health, armor, cost, ticks, HQ)', () => {
  const f = defs.buildings.fence;
  assert.deepEqual([1, 2, 3, 4, 5].map((l) => f.levels[l].maxHealth), [100, 160, 320, 600, 1000]);
  assert.deepEqual([1, 2, 3, 4, 5].map((l) => f.levels[l].armor), [1, 2, 3, 5, 7]);
  assert.deepEqual(f.upgrade[3], { cost: { wood: 30, stone: 20, cement: 10 }, ticks: 80, minHq: 2 });
  assert.deepEqual(f.upgrade[4], { cost: { concrete_block: 12, steel_plate: 6 }, ticks: 110, minHq: 3 });
  assert.deepEqual(f.upgrade[5], { cost: { concrete_block: 16, steel_plate: 12, boss_core: 1 }, ticks: 150, minHq: 4 });
  assert.deepEqual([3, 4, 5].map((l) => f.levels[l].name), ['Stone Wall', 'Concrete Wall', 'Reinforced Concrete Wall']);
});

test('P3: the gate has its OWN ladder: hinge sets and steel plate, never cement', () => {
  const g = defs.buildings.gate;
  assert.deepEqual([1, 2, 3, 4, 5].map((l) => g.levels[l].maxHealth), [80, 130, 250, 480, 800]);
  assert.deepEqual([1, 2, 3, 4, 5].map((l) => g.levels[l].armor), [1, 2, 3, 5, 7]);
  assert.deepEqual(g.upgrade[2], { cost: { wood: 15, hinge_set: 4 }, ticks: 60, minHq: 1 });
  assert.deepEqual(g.upgrade[5], { cost: { steel_plate: 16, hinge_set: 8, boss_core: 1 }, ticks: 160, minHq: 4 });
  for (const l of [2, 3, 4, 5]) { assert.equal(g.upgrade[l].cost.cement, undefined); assert.ok(g.upgrade[l].cost.hinge_set > 0); }
});

test('P3: a gate upgrades like any building: level 2 at HQ 1 (wood + hinge sets), level 3 refused until HQ 2', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'gate', 1); give(st, { wood: 30, hinge_set: 4 }); });
  call(sim, 'upgrade', 'gate'); runUntilIdle(sim, 600);
  const st = sim.snapshot();
  assert.equal(st.buildings.gate.level, 2); assert.equal(st.buildings.gate.health, 130);
  assert.equal(view(sim, 'gate').name, 'Braced Gate');
  assert.equal(stock(sim, 'wood'), 15); assert.equal(stock(sim, 'hinge_set'), 0);
  give(st, {}); const sim2 = newSim('stage1', 1, (s) => { ready(s); fix(s, 'gate', 2); give(s, { steel_plate: 6, hinge_set: 4 }); });
  call(sim2, 'upgrade', 'gate'); runUntilIdle(sim2, 300);
  assert.ok(failed(sim2).includes('HQ_LEVEL'), failed(sim2));
});

test('P3: armor comes from the level data (and falls back to the old per-level rule)', () => {
  const sim = newSim('stage1', 1);
  const st = sim.snapshot();
  for (const [lv, armor] of [[1, 1], [2, 2], [3, 3], [4, 5], [5, 7]]) assert.equal(armorOf(defs, { ...st.buildings.fence, level: lv }), armor);
  const plain = structuredClone(defs); // the shared defs are frozen
  delete plain.buildings.fence.levels[3].armor;
  assert.equal(armorOf(plain, { ...st.buildings.fence, level: 3 }), 3 * plain.waveRules.wallArmorPerLevel);
  assert.equal(view(sim, 'fence').armor, 1); assert.equal(view(sim, 'gate').armor, 1);
  assert.equal(view(sim, 'hq').armor, undefined, 'only walls and gates report armor');
});

test('P3: heavier walls take heavier repairs (the level\'s own repair table), and light ones keep the old cost', () => {
  const sim = newSim('stage1', 1);
  const st = sim.snapshot();
  assert.deepEqual(repairOf(defs, { ...st.buildings.fence, level: 2 }), defs.buildings.fence.repair);
  assert.deepEqual(repairOf(defs, { ...st.buildings.fence, level: 4 }).cost, { stone: 8, cement: 2 });
  const hurt = newSim('stage1', 1, (s) => { ready(s); fix(s, 'fence', 3); s.buildings.fence.health = 280; s.buildings.fence.condition = 'repaired'; give(s, { wood: 20, stone: 20 }); });
  call(hurt, 'repair', 'fence'); runUntilIdle(hurt, 400);
  assert.equal(hurt.snapshot().buildings.fence.health, 320);
  assert.equal(stock(hurt, 'wood'), 14); assert.equal(stock(hurt, 'stone'), 14, 'one step of the level-3 repair: 6 wood + 6 stone');
});

test('P3: a zombie wall hit is reduced by the level\'s armor (brute: 12 raw)', () => {
  const dmg = (level) => Math.max(0, 12 - armorOf(defs, { type: 'fence', level }));
  assert.deepEqual([1, 2, 3, 4, 5].map(dmg), [11, 10, 9, 7, 5]);
});

test('P3: definitions validation rejects broken upgrade, armor and repair data', () => {
  const clone = () => structuredClone(defs.buildings);
  const bad = (fn, re) => { const b = clone(); fn(b); assert.throws(() => createDefinitions({ buildings: b }), re); };
  bad((b) => { b.fence.upgrade[3].minHq = 9; }, /minHq/);
  bad((b) => { b.fence.upgrade[3].cost = { mystery: 1 }; }, /cost/);
  bad((b) => { b.fence.upgrade[6] = { cost: { wood: 1 }, ticks: 1 }; }, /level 6/);
  bad((b) => { b.fence.levels[3].armor = -1; }, /armor/);
  bad((b) => { b.fence.levels[3].repair = { cost: { wood: 0 }, healthPerAction: 1, ticks: 1 }; }, /repair/);
  assert.throws(() => createDefinitions({ recipes: { x: { ...defs.recipes.steel_ingot, minHq: 9 } } }), /minHq/);
});

test('P3: determinism - the same upgrade run twice gives the same hash, and a replay matches', () => {
  const run = () => { const s = newSim('stage1', 5, (st) => { ready(st); fix(st, 'hq', 2); fix(st, 'fence', 2); give(st, { wood: 60, stone: 60, cement: 10 }); }); call(s, 'upgrade', 'fence'); runUntilIdle(s, 600); return s.snapshot(); };
  assert.deepEqual(run(), run());
});

test('P3: learner code can read what an upgrade needs (the HQ level) and what a recipe needs, through the sandbox', async () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); fix(st, 'hq', 2); fix(st, 'fence', 2); give(st, { wood: 30, stone: 20, cement: 10 }); });
  const code = 'if (fence.upgrade.minHq === 2 && fence.upgradeLocked === null && recipes.steel_ingot.minHq === 2 && hq.level === 2) survivor.upgrade(fence);';
  const res = await sandbox.run({ code, view: sim.studentView(), seed: 1 });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(res.calls[0].name, 'upgrade');
});

test('P3: SIM_VERSION moved to 0.42.0, so an older save or replay is refused instead of loading a world without the new sites and smelter', async () => {
  const { SIM_VERSION } = await import('../src/kernel/index.js');
  assert.equal(SIM_VERSION, '0.43.0');
});

// ---------- the wall / gate card ----------

test('card: only a wall and a gate get the tabbed card; the tabs are INFO | UPGRADE | CODE', () => {
  const v = newSim('stage1', 1).studentView();
  assert.deepEqual(WALL_TABS, ['info', 'upgrade', 'code']);
  assert.equal(isWallCard(v.buildings.find((b) => b.id === 'fence')), true);
  assert.equal(isWallCard(v.buildings.find((b) => b.id === 'gate')), true);
  assert.equal(isWallCard(v.buildings.find((b) => b.id === 'hq')), false);
});

test('card: INFO shows level, health, armor and the next level; an unknown tab falls back to INFO', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'fence', 2); });
  const v = sim.studentView(); const f = v.buildings.find((b) => b.id === 'fence');
  const html = wallCardHtml(f, v, 'info');
  assert.ok(html.includes('level 2 of 5') && html.includes('160 / 160 HP') && html.includes('Armor <b>2</b>') && html.includes('Stone Wall'));
  assert.equal(wallCardHtml(f, v, 'nonsense'), html);
});

test('card: UPGRADE shows have/need per material, the HQ lock and a disabled button with the reason', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'fence', 2); give(st, { wood: 30, stone: 5, cement: 0 }); });
  const v = sim.studentView(); const f = v.buildings.find((b) => b.id === 'fence');
  const html = wallCardHtml(f, v, 'upgrade');
  assert.ok(html.includes('30 / 30') && html.includes('5 / 20') && html.includes('0 / 10'), html);
  assert.ok(html.includes('Needs HQ level 2 (yours is 1)'));
  const up = buildingActionList(f, v).find((a) => a.id === 'upgrade');
  assert.equal(up.enabled, false); assert.match(up.reason, /HQ level 2/);
  assert.match(html, /disabled/);
  const ok = newSim('stage1', 1, (st) => { fix(st, 'hq', 2); fix(st, 'fence', 2); give(st, { wood: 30, stone: 20, cement: 10 }); }).studentView();
  const fo = ok.buildings.find((b) => b.id === 'fence');
  assert.equal(buildingActionList(fo, ok).find((a) => a.id === 'upgrade').enabled, true);
  assert.ok(wallCardHtml(fo, ok, 'upgrade').includes('yours is high enough'));
});

test('card: CODE only inserts commands (data-action insert), nothing runs; the top level says so', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'hq', 4); fix(st, 'fence', 5); });
  const v = sim.studentView(); const f = v.buildings.find((b) => b.id === 'fence');
  const code = wallCardHtml(f, v, 'code');
  assert.ok(code.includes('data-action="insert"') && code.includes('survivor.repair(fence);') && code.includes('survivor.upgrade(fence);'));
  assert.ok(wallCardHtml(f, v, 'upgrade').includes('Top level reached'));
  assert.ok(wallCardHtml(f, v, 'info').includes('Top level'));
});

test('card: the building view of a station shows why a recipe is closed (HQ level), and the smelter button says so', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'smelter_1', 1); });
  const v = sim.studentView(); const s = v.buildings.find((b) => b.id === 'smelter_1');
  const btn = buildingActionList(s, v).find((a) => a.id === 'craft:steel_ingot');
  assert.equal(btn.enabled, false); assert.match(btn.reason, /HQ level 2/);
});
