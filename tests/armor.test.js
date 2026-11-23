// R6 (docs/game/24 section 3f): the bars finally have a use. Bullets cast from lead bars, an iron spear, body armor (`equipment.armor`, survivor.equip) that takes points off every
// zombie hit, and the ballista built from the sawmill's planks and beams plus iron bars.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { armors as armorData } from '../src/modules/definitions/data/arsenal.js';
import { raidSchedule, wanderer as wanderData } from '../src/modules/definitions/data/threats.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { armoredDamage } from '../src/modules/survivors/index.js';
import { buildCommand } from '../src/modules/api/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { defs, newSim, call, runUntilIdle, sandbox } from './helpers.js';
import { runLiveCode } from '../src/modules/session/index.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; const lv = defs.buildings[b.type].levels[level]; b.level = level; b.health = lv.maxHealth; b.condition = 'repaired'; if (lv.storage) b.storage = { ...lv.storage }; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) st.ledger[`stock.${k}`].total = v; };
const stock = (sim, k) => sim.snapshot().ledger[`stock.${k}`].total;
const me = (sim) => sim.snapshot().survivors.survivor_1;
const fresh = (st) => Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
const setup = (extra = {}, { workshop = 3, skill = 3, combat = 0 } = {}) => newSim('stage1', 1, (st) => { fresh(st); fix(st, 'hq', 3); fix(st, 'workshop_1', workshop); st.survivors.survivor_1.skills.crafting = skill; st.survivors.survivor_1.skills.combat = combat; give(st, extra); });
const last = (sim) => me(sim).lastTask;

test('data: armor and the new recipes are valid, mirror each other, and have items and HQ storage; bad armor is refused at load time', () => {
  assert.deepEqual(Object.keys(defs.armors), ['iron_vest', 'steel_vest']);
  assert.ok(defs.armors.steel_vest.reduction > defs.armors.iron_vest.reduction);
  for (const id of ['iron_vest', 'steel_vest']) {
    const rc = defs.recipes[id], a = defs.armors[id];
    assert.deepEqual(rc.inputs, a.craft.materials); assert.equal(rc.stationLevel, a.craft.stationLevel); assert.equal(rc.minSkill, a.craft.minSkill); assert.deepEqual(rc.outputs, { [id]: 1 });
    assert.ok(defs.items[id]); for (const l of [1, 2, 3, 4]) assert.ok((l === 1 ? defs.buildings.hq.storage : defs.buildings.hq.levels[l].storage)[id] > 0, `${id} stored at HQ ${l}`);
  }
  const w = defs.weapons.iron_spear, rc = defs.recipes.iron_spear;
  assert.deepEqual(rc.inputs, w.craft.materials); assert.equal(rc.stationLevel, w.craft.stationLevel); assert.ok(defs.buildings.hq.storage.iron_spear > 0);
  assert.deepEqual(defs.recipes.ballista.inputs, defs.weapons.ballista.craft.materials); assert.deepEqual(defs.recipes.ballista.inputs, { plank: 4, beam: 1, iron_bar: 2 });
  assert.deepEqual(defs.recipes.bullets_lead.inputs, { lead_bar: 1 }); assert.deepEqual(defs.recipes.bullets_lead.outputs, { bullets: 10 });
  const bad = (mut, re) => assert.throws(() => { const a = structuredClone(armorData); mut(a); createDefinitions({ armors: a }); }, re);
  bad((a) => { a.iron_vest.reduction = 0; }, /reduction/);
  bad((a) => { a.iron_vest.craft.materials = { unobtainium: 1 }; }, /craft/);
  bad((a) => { a.rock = { name: 'Rock', tier: 1, minCombat: 0, reduction: 1, craft: armorData.iron_vest.craft }; }, /known item/);
  assert.equal(defs.armors.iron_vest.reduction, 2);
});

test('pure rule: armor takes its points off each hit, a hit that did damage still does 1, no damage stays 0, no armor changes nothing', () => {
  const s = (armor) => ({ equipment: armor === undefined ? { weapon: 'spear' } : { weapon: 'spear', armor } });
  assert.equal(armoredDamage(defs, s(), 8), 8);
  assert.equal(armoredDamage(defs, s('iron_vest'), 8), 6); assert.equal(armoredDamage(defs, s('steel_vest'), 8), 4);
  assert.equal(armoredDamage(defs, s('steel_vest'), 3), 1, 'never below 1'); assert.equal(armoredDamage(defs, s('steel_vest'), 0), 0);
  assert.equal(armoredDamage(defs, s('ghost'), 5), 5, 'an unknown piece does nothing');
});

test('crafting: lead bars cast bullets at workshop 2 (no gland), iron bars forge the spear and the vests, each gated by workshop level and skill', () => {
  const b = setup({ lead_bar: 2 }, { workshop: 2, skill: 1 });
  call(b, 'craft', 'bullets_lead', 2); runUntilIdle(b, 400);
  assert.equal(stock(b, 'bullets'), 20); assert.equal(stock(b, 'lead_bar'), 0); assert.equal(stock(b, 'gland'), 0);
  const sp = setup({ iron_bar: 2, wood: 2, rags: 1 }, { workshop: 2, skill: 1 });
  call(sp, 'craft', 'iron_spear'); runUntilIdle(sp, 400);
  assert.equal(stock(sp, 'iron_spear'), 1); assert.equal(stock(sp, 'iron_bar'), 0);
  const v = setup({ iron_bar: 4, rags: 2, hide: 1 }, { workshop: 2, skill: 1 });
  call(v, 'craft', 'iron_vest'); runUntilIdle(v, 400); assert.equal(stock(v, 'iron_vest'), 1);
  const lowLevel = setup({ iron_bar: 2, steel_plate: 3, hide: 2 }, { workshop: 2, skill: 3 });
  call(lowLevel, 'craft', 'steel_vest'); runUntilIdle(lowLevel, 400); assert.equal(last(lowLevel).reason, 'NEEDS_REPAIR', 'level 3 workshop needed'); assert.equal(stock(lowLevel, 'steel_vest'), 0);
  const unskilled = setup({ iron_bar: 2, steel_plate: 3, hide: 2 }, { workshop: 3, skill: 2 });
  call(unskilled, 'craft', 'steel_vest'); runUntilIdle(unskilled, 400); assert.equal(last(unskilled).reason, 'CAPABILITY_INSUFFICIENT');
  const ok = setup({ iron_bar: 2, steel_plate: 3, hide: 2 });
  call(ok, 'craft', 'steel_vest'); runUntilIdle(ok, 400); assert.equal(stock(ok, 'steel_vest'), 1);
  assert.deepEqual(ledgerViolations(ok.snapshot()), []);
});

test('the ballista is now built from planks, a beam and iron bars (no wood or scrap)', () => {
  const sim = setup({ plank: 4, beam: 1, iron_bar: 2, wood: 0, scrap: 0 }, { workshop: 2, skill: 2 });
  call(sim, 'craft', 'ballista'); runUntilIdle(sim, 400);
  assert.equal(stock(sim, 'ballista'), 1); assert.equal(stock(sim, 'plank'), 0); assert.equal(stock(sim, 'beam'), 0); assert.equal(stock(sim, 'iron_bar'), 0);
});

test('equip: armor goes in its own slot and keeps the weapon; the old piece goes back to stock; refusals change nothing', () => {
  const sim = setup({ iron_vest: 1, steel_vest: 1 }, { combat: 1 });
  call(sim, 'equip', 'iron_vest'); runUntilIdle(sim, 200);
  assert.equal(me(sim).equipment.armor, 'iron_vest'); assert.equal(me(sim).equipment.weapon, 'spear', 'the weapon is untouched'); assert.equal(stock(sim, 'iron_vest'), 0);
  assert.deepEqual(sim.log.all().filter((e) => e.type === 'armor.equipped').map((e) => [e.armor, e.previous, e.reduction]), [['iron_vest', null, 2]]);
  call(sim, 'equip', 'iron_vest'); runUntilIdle(sim, 200); assert.equal(last(sim).reason, 'NOT_NEEDED');
  call(sim, 'equip', 'steel_vest'); runUntilIdle(sim, 200);
  assert.equal(me(sim).equipment.armor, 'steel_vest'); assert.equal(stock(sim, 'iron_vest'), 1, 'the old vest went back'); assert.equal(stock(sim, 'steel_vest'), 0);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  const none = setup({}, { combat: 1 }); call(none, 'equip', 'iron_vest'); runUntilIdle(none, 100); assert.equal(last(none).reason, 'INSUFFICIENT_RESOURCE'); assert.equal(me(none).equipment.armor, undefined);
  const weak = setup({ steel_vest: 1 }, { combat: 0 }); call(weak, 'equip', 'steel_vest'); runUntilIdle(weak, 100); assert.equal(last(weak).reason, 'CAPABILITY_INSUFFICIENT'); assert.equal(stock(weak, 'steel_vest'), 1);
  const spear = setup({ iron_spear: 1 }, { combat: 1 }); call(spear, 'equip', 'iron_spear'); runUntilIdle(spear, 200); assert.equal(me(spear).equipment.weapon, 'iron_spear');
});

// A lone walker outside the wall hits an armored survivor for less (the same fight as the wanderer test, with and without a vest).
const quiet = createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 0 }, raidSchedule: { ...raidSchedule, chancePercent: 0 }, wanderer: { ...wanderData, chancePercent: 100, firstDay: 1 } });
const fight = (armor) => {
  const state = createInitialState({ defs: quiet, scenarioId: 'stage1_outpost', seed: 1 });
  Object.assign(state.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
  state.survivors.survivor_1.position = { x: 20, y: 9 }; if (armor) state.survivors.survivor_1.equipment.armor = armor;
  state.threats.wanderCounter = 1;
  state.threats.zombies.zombie_1 = { id: 'zombie_1', type: 'walker', x: 22, y: 9, direction: 'DOWN', state: 'walk', health: 10, move: 0, hit: 0, goal: null, route: null, reached: null, wanderer: true };
  const sim = createSimulation({ defs: quiet, state }); sim.step(40);
  return sim.log.all().filter((e) => e.type === 'survivor.damaged' && e.cause === 'zombie');
};
test('integration: a walker\'s hit does less damage to an armored survivor, and the event carries the reduced number', () => {
  const bare = fight(null), vest = fight('iron_vest'), steel = fight('steel_vest');
  assert.ok(bare.length >= 1 && vest.length >= 1 && steel.length >= 1);
  const raw = quiet.zombies.walker.damage;
  assert.equal(bare[0].damage, raw);
  assert.equal(vest[0].damage, Math.max(1, raw - 2)); assert.equal(steel[0].damage, Math.max(1, raw - 4));
  assert.ok(vest[0].damage < bare[0].damage, 'the vest helped');
});

test('learner reads: threats.armors lists the pieces, the survivor read shows the worn armor, and the sandbox can equip it', async () => {
  const sim = setup({ iron_vest: 1 });
  const v = sim.studentView();
  assert.deepEqual(Object.keys(v.threats.armors), ['iron_vest', 'steel_vest']); assert.equal(v.threats.armors.iron_vest.reduction, 2);
  assert.deepEqual(v.threats.armors.iron_vest.craft.materials, { iron_bar: 4, rags: 2, hide: 1 });
  assert.equal((await runLiveCode({ sim, sandbox, code: 'threats.armors.iron_vest.reduction = 99;' })).ok, false, 'the read is frozen');
  assert.equal((await runLiveCode({ sim, sandbox, code: 'if (base.iron_vest > 0) survivor.equip("iron_vest");' })).ok, true);
  runUntilIdle(sim, 200);
  assert.equal(sim.studentView().survivors[0].equipment.armor, 'iron_vest');
});
