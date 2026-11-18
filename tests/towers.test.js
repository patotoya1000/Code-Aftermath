// Z6a: watchtowers (ruin -> repair -> upgrade), posting, the range bonus for ranged weapons only, slots, learner read, validation. docs/game/20 section 10.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, sandbox } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { buildings } from '../src/modules/definitions/data/world.js';
import { postedLevel, effectiveRange } from '../src/modules/threats/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { buildCommand } from '../src/modules/api/index.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) st.ledger[`stock.${k}`].total = v; };
const fresh = (st) => Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
const at = (st, id, x, y) => { st.survivors[id].position = { x, y }; };
const view = (sim, id) => sim.studentView().buildings.find((b) => b.id === id);
const addSurvivor = (st, id, x, y) => { const s = structuredClone(st.survivors.survivor_1); s.id = id; s.position = { x, y }; st.survivors[id] = s; };

test('the tower data matches the towers table, and stage 1 has a ruined watchtower inside the wall', () => {
  for (const [lv, t] of Object.entries(defs.towers)) { assert.equal(defs.buildings.tower.levels[lv].maxHealth, t.maxHealth); assert.equal(defs.buildings.tower.levels[lv].name, t.name); }
  const sim = newSim('stage1', 1);
  const b = sim.snapshot().buildings.tower_1;
  assert.equal(b.condition, 'ruined'); assert.deepEqual([b.x, b.y], [15, 4]);
  const f = sim.snapshot().buildings.fence.bounds;
  assert.ok(b.x > f.x1 && b.x < f.x2 && b.y > f.y1 && b.y < f.y2, 'inside the fence');
  assert.equal(view(sim, 'tower_1').tower.working, false);
});

test('repair brings the tower to life, upgrade needs Repair skill and materials and raises slots and range bonus', () => {
  const sim = newSim('stage1', 1, (st) => { fresh(st); give(st, { wood: 60, stone: 60 }); });
  for (let i = 0; i < 4; i++) call(sim, 'repair', 'tower_1');
  runUntilIdle(sim, 800);
  assert.equal(view(sim, 'tower_1').condition, 'repaired'); assert.equal(view(sim, 'tower_1').tower.working, true);
  assert.deepEqual(view(sim, 'tower_1').upgrade.cost, { wood: 20, stone: 15 });
  const up = newSim('stage1', 1, (st) => { fresh(st); fix(st, 'tower_1'); st.survivors.survivor_1.skills.repair = 1; give(st, { wood: 60, stone: 60 }); });
  call(up, 'upgrade', 'tower_1'); runUntilIdle(up, 800);
  assert.equal(view(up, 'tower_1').level, 2); assert.equal(view(up, 'tower_1').tower.slots, 2); assert.equal(view(up, 'tower_1').tower.rangeBonus, 2);
  assert.equal(up.snapshot().ledger['stock.wood'].total, 40); assert.deepEqual(ledgerViolations(up.snapshot()), []);
});

test('posting: next to a working tower = posted at its level; far away, or next to a ruin, = not posted', () => {
  const s = (mutate) => { const sim = newSim('stage1', 1, (st) => { fresh(st); mutate(st); }); return sim.snapshot(); };
  assert.equal(postedLevel(s((st) => { fix(st, 'tower_1', 2); at(st, 'survivor_1', 14, 4); }), defs, 'survivor_1'), 2);
  assert.equal(postedLevel(s((st) => { fix(st, 'tower_1', 1); at(st, 'survivor_1', 14, 5); }), defs, 'survivor_1'), 1, 'diagonal counts as next to');
  assert.equal(postedLevel(s((st) => { fix(st, 'tower_1', 1); at(st, 'survivor_1', 12, 4); }), defs, 'survivor_1'), 0, 'two cells away');
  assert.equal(postedLevel(s((st) => { at(st, 'survivor_1', 14, 4); }), defs, 'survivor_1'), 0, 'a ruined tower gives nothing');
  const damaged = s((st) => { fix(st, 'tower_1', 1); st.buildings.tower_1.health = 40; st.buildings.tower_1.condition = 'damaged'; at(st, 'survivor_1', 14, 4); });
  assert.equal(postedLevel(damaged, defs, 'survivor_1'), 1, 'a damaged tower still works');
});

test('slots: a level 1 tower holds ONE survivor (the lowest id), a level 2 tower holds two', () => {
  const two = (level) => newSim('stage1', 1, (st) => { fresh(st); fix(st, 'tower_1', level); at(st, 'survivor_1', 14, 4); addSurvivor(st, 'survivor_2', 14, 5); addSurvivor(st, 'survivor_3', 15, 5); }).snapshot();
  const l1 = two(1); assert.deepEqual(['survivor_1', 'survivor_2', 'survivor_3'].map((id) => postedLevel(l1, defs, id)), [1, 0, 0]);
  const l2 = two(2); assert.deepEqual(['survivor_1', 'survivor_2', 'survivor_3'].map((id) => postedLevel(l2, defs, id)), [2, 2, 0]);
  const sim = newSim('stage1', 1, (st) => { fresh(st); fix(st, 'tower_1', 2); at(st, 'survivor_1', 14, 4); addSurvivor(st, 'survivor_2', 14, 5); });
  assert.deepEqual(view(sim, 'tower_1').tower.posted, ['survivor_1', 'survivor_2']);
});

test('the bonus applies to ranged weapons only (a spear gains nothing) and grows with the level', () => {
  assert.equal(effectiveRange(defs, 'bow', 0), 6); assert.equal(effectiveRange(defs, 'bow', 1), 7); assert.equal(effectiveRange(defs, 'bow', 3), 9);
  for (const lv of [0, 1, 2, 3]) assert.equal(effectiveRange(defs, 'spear', lv), defs.weapons.spear.reach);
});

/** A bow survivor guards at (14,4) while one zombie stands 7 cells from her; returns the tick of the first hit on it. */
function firstHit(towerLevel) {
  const sim = newSim('stage1', 1, (st) => {
    fresh(st); st.survivors.survivor_1.skills.combat = 1; st.survivors.survivor_1.equipment.weapon = 'bow'; st.survivors.survivor_1.inventory.items.arrows = 30; at(st, 'survivor_1', 14, 4);
    if (towerLevel) fix(st, 'tower_1', towerLevel);
    st.threats.wave = { day: 6, strength: 2, defense: 0, composition: { walker: 1 }, queue: [], spawned: 1, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 };
    st.threats.counter = 1;
    st.threats.zombies.zombie_1 = { id: 'zombie_1', type: 'walker', x: 21, y: 4, direction: 'LEFT', state: 'walk', health: 10, move: 0, hit: 0, goal: null, route: null, reached: null };
  });
  call(sim, 'guard');
  for (let i = 0; i < 40; i++) { sim.step(1); const ev = sim.log.all().find((e) => e.type === 'zombie.hurt'); if (ev) return ev.tick; }
  return Infinity;
}

test('a bow survivor posted on a tower hits a zombie that a bow alone cannot reach yet', () => {
  const plain = firstHit(0), posted = firstHit(1), higher = firstHit(3);
  assert.ok(posted < plain, `posted ${posted} before plain ${plain}`);
  assert.ok(higher <= posted, `level 3 (${higher}) is no later than level 1 (${posted})`);
});

test('guard(tower_1) walks her to the tower and the learner read tells who is posted; the sandbox reads it', async () => {
  const sim = newSim('stage1', 1, (st) => { fresh(st); fix(st, 'tower_1', 1); at(st, 'survivor_1', 11, 9); st.threats.wave = { day: 6, strength: 2, defense: 0, composition: {}, queue: [], spawned: 0, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 }; });
  sim.submit(buildCommand('survivor_1', { name: 'guard', args: ['tower_1'] }));
  for (let i = 0; i < 40; i++) sim.step(1);
  assert.deepEqual(view(sim, 'tower_1').tower.posted, ['survivor_1']);
  const r = await sandbox.run({ code: 'console.log(tower_1.tower.level, tower_1.tower.rangeBonus, tower_1.tower.posted.length);', view: sim.studentView(), seed: 1 });
  assert.equal(r.ok, true, r.error?.message);
});

test('validation: a tower building that disagrees with the towers table is refused', () => {
  const t = structuredClone(buildings.tower); t.levels[2].maxHealth = 99;
  assert.throws(() => createDefinitions({ buildings: { ...buildings, tower: t } }), /tower 2/);
});
