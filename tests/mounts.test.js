// Z6b: mounted weapons on towers - mount (install), hopper + reload, crewed automatic fire, operators vs posted shooters, minigun power only while firing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, sandbox } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { weapons, towers } from '../src/modules/definitions/data/arsenal.js';
import { buildCommand } from '../src/modules/api/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { operatorOf, crewOf } from '../src/modules/threats/index.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) { st.ledger[`stock.${k}`] ??= { total: 0, reserved: 0 }; st.ledger[`stock.${k}`].total = v; } };
const fresh = (st) => Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
const at = (st, id, x, y) => { st.survivors[id].position = { x, y }; };
const addSurvivor = (st, id, x, y) => { const s = structuredClone(st.survivors.survivor_1); s.id = id; s.position = { x, y }; st.survivors[id] = s; };
const view = (sim, id) => sim.studentView().buildings.find((b) => b.id === id);
const last = (sim, id = 'survivor_1') => sim.snapshot().survivors[id].lastTask;
const types = (sim) => sim.log.all().map((e) => e.type);
const stock = (sim, k) => sim.snapshot().ledger[`stock.${k}`]?.total ?? 0;
const wave = () => ({ day: 6, strength: 2, defense: 0, composition: { walker: 1 }, queue: [], spawned: 1, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 });
const zombie = (st, id, type, x, y, health) => { st.threats.zombies[id] = { id, type, x, y, direction: 'LEFT', state: 'walk', health: health ?? defs.zombies[type].health, move: 0, hit: 0, goal: null, route: null, reached: null }; st.threats.counter = Math.max(st.threats.counter, Number(id.split('_')[1])); };
const mounted = (weapon, hopper = 0) => ({ weapon, hopper, cooldown: 0, status: 'IDLE', powered: false });

/** A world with a tower of `level` holding the given mounts, survivor_1 posted next to it, an active wave and (optionally) one zombie. */
function armed(level, mounts, { zombieAt = [20, 4], type = 'walker', health, extra } = {}) {
  return newSim('stage1', 1, (st) => {
    fresh(st); fix(st, 'tower_1', level); st.buildings.tower_1.mounts = mounts; at(st, 'survivor_1', 14, 4);
    st.threats.wave = wave();
    if (zombieAt) zombie(st, 'zombie_1', type, zombieAt[0], zombieAt[1], health);
    extra?.(st);
  });
}

test('data: mounted weapons have items, recipes that mirror their craft block, HQ storage, and the workshop has an Armory level 3', () => {
  for (const id of ['ballista', 'repeating_crossbow', 'minigun']) {
    const rc = defs.recipes[id], w = defs.weapons[id];
    assert.deepEqual(rc.inputs, w.craft.materials, `${id} materials`);
    assert.equal(rc.stationLevel, w.craft.stationLevel); assert.equal(rc.minSkill, w.craft.minSkill); assert.deepEqual(rc.outputs, { [id]: 1 });
    assert.ok(defs.items[id]); assert.ok(defs.buildings.hq.storage[id] > 0 && defs.buildings.hq.levels[2].storage[id] > 0, `${id} HQ storage`);
  }
  assert.ok(defs.recipes.bullets.outputs.bullets > 1 && defs.recipes.bullets.stationLevel === 3);
  assert.equal(defs.buildings.workshop.levels[3].name, 'Armory');
  assert.ok(defs.buildings.workshop.upgrade[3].cost.scrap > 0);
  assert.deepEqual(newSim().snapshot().buildings.tower_1.mounts, []);
});

test('definitions validation: a mounted weapon nobody can mount or craft is refused', () => {
  assert.throws(() => createDefinitions({ towers: { ...towers, 3: { ...towers[3], mounts: ['ballista', 'repeating_crossbow'] } } }), /minigun/);
  const { minigun, ...rest } = defs.recipes;
  assert.throws(() => createDefinitions({ recipes: rest }), /minigun/);
  assert.throws(() => createDefinitions({ actions: { ...defs.actions, mount: { ...defs.actions.mount, installTicks: 0 } } }), /installTicks/);
});

test('mount: fetches the ballista from stock, hauls it to a level 2 tower and fits it (empty hopper, one slot used, stock reserved until done)', () => {
  const sim = newSim('stage1', 1, (st) => { fresh(st); fix(st, 'hq', 2); fix(st, 'tower_1', 2); st.survivors.survivor_1.skills.combat = 2; give(st, { ballista: 1 }); });
  call(sim, 'mount', 'tower_1', 'ballista');
  sim.step(2);
  assert.equal(sim.snapshot().ledger['stock.ballista'].reserved, 1, 'reserved while she works');
  runUntilIdle(sim, 400);
  assert.equal(stock(sim, 'ballista'), 0); assert.equal(sim.snapshot().ledger['stock.ballista'].reserved, 0);
  const t = view(sim, 'tower_1').tower;
  assert.equal(t.installed.length, 1); assert.equal(t.installed[0].weapon, 'ballista'); assert.equal(t.installed[0].hopper, 0); assert.equal(t.installed[0].hopperMax, weapons.ballista.hopper);
  assert.equal(t.freeSlots, 1); assert.equal(t.installed[0].status, 'NO_AMMO');
  assert.ok(types(sim).includes('mount.installed')); assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('mount: cancelling gives the weapon back; the failures are named', () => {
  const base = (mut) => newSim('stage1', 1, (st) => { fresh(st); fix(st, 'hq', 2); fix(st, 'tower_1', 2); st.survivors.survivor_1.skills.combat = 4; give(st, { ballista: 1, minigun: 1 }); mut?.(st); });
  const fails = (sim, ...args) => { call(sim, 'mount', ...args); sim.step(3); return last(sim).reason; };
  const c = base(); call(c, 'mount', 'tower_1', 'ballista'); c.step(2); c.submit({ apiVersion: 1, actorId: 'survivor_1', type: 'stop' }); c.step(1);
  assert.equal(c.snapshot().ledger['stock.ballista'].reserved, 0); assert.equal(stock(c, 'ballista'), 1); assert.deepEqual(c.snapshot().buildings.tower_1.mounts, []);
  assert.equal(fails(base(), 'tower_1', 'minigun'), 'TOWER_TOO_LOW', 'a level 2 tower cannot hold a minigun');
  assert.equal(fails(base((st) => fix(st, 'tower_1', 1)), 'tower_1', 'ballista'), 'TOWER_TOO_LOW', 'a lookout holds nothing');
  assert.equal(fails(base((st) => { st.buildings.tower_1.mounts = [mounted('ballista'), mounted('ballista')]; }), 'tower_1', 'ballista'), 'NO_SLOT');
  assert.equal(fails(base((st) => { st.survivors.survivor_1.skills.combat = 1; }), 'tower_1', 'ballista'), 'CAPABILITY_INSUFFICIENT');
  assert.equal(fails(base((st) => { give(st, { ballista: 0 }); }), 'tower_1', 'ballista'), 'INSUFFICIENT_RESOURCE');
  assert.equal(fails(base((st) => { st.buildings.tower_1.condition = 'ruined'; st.buildings.tower_1.health = 1; }), 'tower_1', 'ballista'), 'NEEDS_REPAIR');
  assert.equal(fails(base(), 'hq', 'ballista'), 'UNKNOWN_TARGET');
  assert.equal(fails(base(), 'tower_1', 'bow'), 'INVALID_PARAMS');
});

test('reload: take ammo, pour it into the hopper (clamped to what she carries and the room), then the failures', () => {
  const base = (mut) => newSim('stage1', 1, (st) => { fresh(st); fix(st, 'hq', 2); fix(st, 'tower_1', 2); st.buildings.tower_1.mounts = [mounted('ballista')]; at(st, 'survivor_1', 13, 5); give(st, { bolts: 40 }); mut?.(st); });
  const sim = base();
  call(sim, 'take', 'bolts', 12); call(sim, 'reload', 'tower_1', 'bolts', 5); runUntilIdle(sim, 300);
  assert.equal(sim.snapshot().buildings.tower_1.mounts[0].hopper, 5);
  assert.equal(sim.snapshot().survivors.survivor_1.inventory.items.bolts, 7, 'only 5 left her hands');
  call(sim, 'reload', 'tower_1', 'bolts'); runUntilIdle(sim, 300); // no amount: pours in everything that fits
  assert.equal(sim.snapshot().buildings.tower_1.mounts[0].hopper, 12);
  assert.ok(types(sim).includes('hopper.loaded'));
  const full = base((st) => { st.buildings.tower_1.mounts[0].hopper = weapons.ballista.hopper; st.survivors.survivor_1.inventory.items.bolts = 3; });
  call(full, 'reload', 'tower_1', 'bolts'); full.step(3); assert.equal(last(full).reason, 'HOPPER_FULL');
  const nomount = base((st) => { st.survivors.survivor_1.inventory.items.arrows = 3; });
  call(nomount, 'reload', 'tower_1', 'arrows'); nomount.step(3); assert.equal(last(nomount).reason, 'NO_MOUNT');
  const none = base(); call(none, 'reload', 'tower_1', 'bolts'); none.step(3); assert.equal(last(none).reason, 'NO_AMMO');
  const wrongTarget = base((st) => { st.survivors.survivor_1.inventory.items.bolts = 4; });
  call(wrongTarget, 'reload', 'hq', 'bolts'); wrongTarget.step(3); assert.equal(last(wrongTarget).reason, 'UNKNOWN_TARGET');
});

test('a crewed ballista fires by itself at the nearest zombie in range, one hopper unit per shot, every `reload` ticks; armor is pierced', () => {
  const sim = armed(2, [mounted('ballista', 5)], { type: 'brute', health: 100 }); // brute armor 2, ballista pierce 8: full damage
  sim.step(1);
  const hits = []; for (let i = 0; i < 40; i++) { sim.step(1); for (const e of sim.log.all()) if (e.type === 'zombie.hurt' && !hits.includes(e)) hits.push(e); }
  assert.ok(hits.length >= 3 && hits.every((h) => h.weapon === 'ballista' && h.towerId === 'tower_1' && h.survivorId === 'survivor_1' && h.damage === weapons.ballista.damage));
  assert.deepEqual(hits.slice(1).map((h, i) => h.tick - hits[i].tick), hits.slice(1).map(() => weapons.ballista.reload), 'one shot per reload');
  assert.equal(sim.snapshot().buildings.tower_1.mounts[0].hopper, 5 - hits.length);
  assert.ok(sim.snapshot().survivors.survivor_1.progression.xp.combat >= hits.length, 'the operator practises Combat');
});

test('a mounted weapon kills like any other weapon: the zombie leaves, its loot drops, the wave clears', () => {
  const sim = armed(2, [mounted('ballista', 3)], { type: 'walker', health: 10 });
  sim.step(5);
  assert.equal(Object.keys(sim.snapshot().threats.zombies).length, 0);
  assert.ok(types(sim).includes('zombie.killed')); assert.ok(types(sim).includes('wave.cleared'));
  assert.equal(sim.log.all().find((e) => e.type === 'zombie.killed').weapon, 'ballista');
});

test('status: NO_OPERATOR without a posted survivor, NO_AMMO with an empty hopper, IDLE out of range, BROKEN when ruined - and none of them fire', () => {
  const stat = (sim) => { sim.step(2); return view(sim, 'tower_1').tower.installed[0].status; };
  const fired = (sim) => types(sim).includes('zombie.hurt');
  const a = armed(2, [mounted('ballista', 5)], { extra: (st) => at(st, 'survivor_1', 11, 9) }); assert.equal(stat(a), 'NO_OPERATOR'); assert.equal(fired(a), false);
  const b = armed(2, [mounted('ballista', 0)]); assert.equal(stat(b), 'NO_AMMO'); assert.equal(fired(b), false);
  const c = armed(2, [mounted('ballista', 5)], { zombieAt: [23, 14] }); assert.equal(stat(c), 'IDLE'); assert.equal(fired(c), false);
  const d = armed(2, [mounted('ballista', 5)], { extra: (st) => { st.buildings.tower_1.condition = 'ruined'; st.buildings.tower_1.health = 1; } }); d.step(2); assert.equal(fired(d), false);
  assert.equal(d.snapshot().buildings.tower_1.mounts[0].status, 'BROKEN');
  const e = armed(2, [mounted('ballista', 5)], { zombieAt: null }); assert.equal(stat(e), 'IDLE');
});

test('operators crew the mounts (lowest ids first); the other posted survivor shoots her personal weapon; an operator on guard stays quiet', () => {
  const sim = armed(2, [mounted('ballista', 5)], { type: 'brute', health: 300, extra: (st) => { addSurvivor(st, 'survivor_2', 14, 5); st.survivors.survivor_1.equipment.weapon = 'bow'; st.survivors.survivor_1.inventory.items.arrows = 20; st.survivors.survivor_2.equipment.weapon = 'bow'; st.survivors.survivor_2.inventory.items.arrows = 20; st.survivors.survivor_1.skills.combat = 1; st.survivors.survivor_2.skills.combat = 1; } });
  const st = sim.snapshot();
  assert.deepEqual(crewOf(st, defs, st.buildings.tower_1), ['survivor_1', 'survivor_2']);
  assert.equal(operatorOf(st, defs, 'survivor_1')?.index, 0); assert.equal(operatorOf(st, defs, 'survivor_2'), null);
  assert.equal(view(sim, 'tower_1').tower.installed[0].operator, 'survivor_1');
  sim.submit(buildCommand('survivor_1', { name: 'guard', args: [] })); sim.submit(buildCommand('survivor_2', { name: 'guard', args: [] }));
  for (let i = 0; i < 30; i++) sim.step(1);
  const shots = sim.log.all().filter((e) => e.type === 'zombie.hurt');
  assert.ok(shots.some((e) => e.weapon === 'ballista')); assert.ok(shots.some((e) => e.weapon === 'bow' && e.survivorId === 'survivor_2'));
  assert.equal(shots.filter((e) => e.weapon === 'bow' && e.survivorId === 'survivor_1').length, 0, 'the operator does not also shoot her bow');
  assert.equal(sim.snapshot().survivors.survivor_1.inventory.items.arrows, 20);
});

test('a mounted weapon outranges an ordinary posted survivor: the ballista hits at 8 cells', () => {
  const far = armed(2, [mounted('ballista', 5)], { zombieAt: [23, 4], health: 50 }); far.step(3); assert.equal(types(far).includes('zombie.hurt'), true, '8 cells from the tower');
  const tooFar = armed(2, [mounted('ballista', 5)], { zombieAt: [23, 14], health: 50 }); tooFar.step(3); assert.equal(types(tooFar).includes('zombie.hurt'), false, '9 cells away');
});

test('minigun: needs power only while firing - no grid = NO_POWER and silence; with a fuelled generator it fires every tick and the grid demand appears only then', () => {
  const mini = (mut) => armed(3, [mounted('minigun', 50)], { type: 'brute', health: 500, extra: (st) => { fix(st, 'generator_1'); give(st, { wood: 30 }); mut?.(st); } });
  const dark = armed(3, [mounted('minigun', 50)], { type: 'brute', health: 500 }); dark.step(3);
  assert.equal(types(dark).includes('zombie.hurt'), false); assert.equal(view(dark, 'tower_1').tower.installed[0].status, 'NO_POWER'); assert.equal(dark.snapshot().buildings.tower_1.mounts[0].hopper, 50);
  const lit = mini(); lit.step(1);
  const before = lit.snapshot().power.demand; lit.step(10);
  const shots = lit.log.all().filter((e) => e.type === 'zombie.hurt' && e.weapon === 'minigun');
  assert.ok(shots.length >= 8, `fires about every tick (${shots.length})`);
  assert.equal(lit.snapshot().power.demand, weapons.minigun.power); assert.ok(before === weapons.minigun.power || before === 0);
  assert.ok(lit.snapshot().buildings.generator_1.power.burn > 0, 'the generator burns fuel for it');
  const none = armed(3, [mounted('minigun', 50)], { zombieAt: null, extra: (st) => { fix(st, 'generator_1'); give(st, { wood: 30 }); } }); none.step(10);
  assert.equal(none.snapshot().power.demand, 0, 'a minigun with nothing to shoot draws nothing'); assert.equal(stock(none, 'wood'), 30, 'and burns no fuel');
});

test('minigun: a charged battery alone powers it (batteries matter at night)', () => {
  const sim = armed(3, [mounted('minigun', 30)], { type: 'brute', health: 500, extra: (st) => { fix(st, 'battery_1'); st.buildings.battery_1.power.charge = 100; } });
  sim.step(8);
  assert.ok(sim.log.all().filter((e) => e.weapon === 'minigun').length >= 6);
  assert.ok(sim.snapshot().buildings.battery_1.power.charge < 100);
});

test('the learner read: tower.installed lists weapon, hopper, status, operator; commands validate their arguments; the sandbox can call both', async () => {
  const sim = armed(3, [mounted('repeating_crossbow', 4)], { zombieAt: null });
  const t = view(sim, 'tower_1').tower;
  assert.equal(t.freeSlots, 1); assert.deepEqual(t.mounts, ['ballista', 'repeating_crossbow', 'minigun']);
  assert.deepEqual(Object.keys(t.installed[0]).sort(), ['ammo', 'damage', 'hopper', 'hopperMax', 'name', 'operator', 'range', 'reload', 'status', 'weapon']);
  assert.throws(() => buildCommand('survivor_1', { name: 'mount', args: ['tower_1'] }), /mount\(\)/);
  assert.throws(() => buildCommand('survivor_1', { name: 'reload', args: ['tower_1'] }), /reload\(\)/);
  assert.throws(() => buildCommand('survivor_1', { name: 'reload', args: ['tower_1', 'bolts', 0] }), /amount/);
  assert.deepEqual(buildCommand('survivor_1', { name: 'reload', args: ['tower_1', 'bolts', 9] }).params, { targetId: 'tower_1', item: 'bolts', amount: 9 });
  assert.deepEqual(buildCommand('survivor_1', { name: 'reload', args: ['tower_1', 'bolts'] }).params, { targetId: 'tower_1', item: 'bolts' });
  const r = await sandbox.run({ code: 'survivor.take("bolts", 20);\nsurvivor.reload(tower_1, "bolts", 20);\nsurvivor.mount(tower_1, "ballista");\nconsole.log(tower_1.tower.installed.length, tower_1.tower.freeSlots);', view: sim.studentView(), seed: 1 });
  assert.equal(r.ok, true, r.error?.message);
});

test('Armory: the workshop upgrade to level 3 costs scrap and unlocks bullets; the minigun and bullets can be crafted there', () => {
  const sim = newSim('stage1', 1, (st) => { fresh(st); fix(st, 'workshop_1', 3); st.survivors.survivor_1.skills.crafting = 4; at(st, 'survivor_1', 9, 10); give(st, { scrap: 20, gland: 3 }); });
  call(sim, 'craft', 'bullets', 1); runUntilIdle(sim, 600);
  assert.equal(stock(sim, 'bullets'), defs.recipes.bullets.outputs.bullets); assert.equal(stock(sim, 'gland'), 2);
  const up = newSim('stage1', 1, (st) => { fresh(st); fix(st, 'workshop_1', 2); st.survivors.survivor_1.skills.repair = 1; at(st, 'survivor_1', 9, 10); give(st, { wood: 40, stone: 50, scrap: 12 }); });
  call(up, 'upgrade', 'workshop_1'); runUntilIdle(up, 800);
  assert.equal(view(up, 'workshop_1').level, 3); assert.equal(stock(up, 'scrap'), 0);
});

test('determinism: the same armed wave replays to the same hash, and the ledger stays balanced', () => {
  const run = () => { const s = armed(3, [mounted('minigun', 40), mounted('ballista', 10)], { type: 'brute', health: 120, extra: (st) => { fix(st, 'battery_1'); st.buildings.battery_1.power.charge = 200; addSurvivor(st, 'survivor_2', 14, 5); } }); s.step(120); return s; };
  const a = run(), b = run();
  assert.equal(a.stateHash(), b.stateHash()); assert.deepEqual(ledgerViolations(a.snapshot()), []);
});
