// Z6c: shots make noise; attention decays; excess attention brings capped reinforcements; zombies drift to the loudest tower. docs/game/20 section 21.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, sandbox } from './helpers.js';
import { weapons, noise } from '../src/modules/definitions/data/arsenal.js';
import { loudestTower } from '../src/modules/threats/index.js';
import { buildCommand } from '../src/modules/api/index.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const at = (st, id, x, y) => { st.survivors[id].position = { x, y }; };
const types = (sim) => sim.log.all().map((e) => e.type);
const wave = (queue = []) => ({ day: 6, strength: 2, defense: 0, composition: { walker: 1 }, queue, spawned: 1, reinforced: 0, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 });
const zombie = (st, id, type, x, y, health) => { st.threats.zombies[id] = { id, type, x, y, direction: 'LEFT', state: 'walk', health: health ?? defs.zombies[type].health, move: 0, hit: 0, goal: null, route: null, reached: null }; st.threats.counter = 9; };
const mounted = (weapon, hopper) => ({ weapon, hopper, cooldown: 0, status: 'IDLE', powered: false });
const read = (sim) => sim.studentView().threats.noise;

function shooter(weapon, ammo, mut) {
  return newSim('stage1', 1, (st) => {
    Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
    const s = st.survivors.survivor_1; s.skills.combat = 3; s.equipment.weapon = weapon; if (ammo) s.inventory.items[ammo] = 50; at(st, 'survivor_1', 10, 5);
    st.threats.wave = wave(); zombie(st, 'zombie_1', 'brute', 14, 5, 500); mut?.(st);
  });
}

test('a rifle shot is loud, a bow shot nearly silent, a spear shot silent; attention decays', () => {
  const rifle = shooter('rifle', 'bullets'); call(rifle, 'guard'); rifle.step(30);
  assert.ok(read(rifle).attention > 0 || types(rifle).includes('noise.high'));
  const peak = (sim, n) => { let m = 0; for (let i = 0; i < n; i++) { sim.step(1); m = Math.max(m, sim.snapshot().threats.attention); } return m; };
  const r = shooter('rifle', 'bullets'); call(r, 'guard');
  const b = shooter('bow', 'arrows'); call(b, 'guard');
  const sp = shooter('spear', null, (st) => { zombie(st, 'zombie_1', 'brute', 11, 5, 500); }); call(sp, 'guard');
  const [pr, pb, ps] = [peak(r, 40), peak(b, 40), peak(sp, 40)];
  assert.ok(pr > pb && pb >= 0 && ps === 0, `rifle ${pr} > bow ${pb} > spear ${ps}`);
  const q = newSim('stage1', 1, (st) => { st.threats.attention = 10; }); q.step(4);
  assert.equal(q.snapshot().threats.attention, 10 - 4 * noise.decayPerTick);
  q.step(20); assert.equal(q.snapshot().threats.attention, 0, 'never below zero');
});

test('excess attention brings reinforcement walkers, one per reinforceEvery points, capped per wave, and they are queued to spawn', () => {
  const sim = newSim('stage1', 1, (st) => { st.threats.wave = wave(); st.threats.attention = noise.threshold + noise.reinforceEvery * 2 + 1; });
  sim.step(1);
  const w = sim.snapshot().threats.wave;
  assert.equal(w.reinforced, 2); assert.equal(w.queue.length + w.spawned - 1, 2, 'two walkers joined the spawn queue');
  assert.ok(types(sim).includes('wave.reinforced')); assert.equal(read(sim).reinforced, 2);
  const huge = newSim('stage1', 1, (st) => { st.threats.wave = wave(); st.threats.attention = 100000; }); huge.step(1);
  assert.equal(huge.snapshot().threats.wave.reinforced, noise.reinforceCap, 'capped');
  huge.snapshot(); const before = huge.snapshot().threats.wave.queue.length + Object.keys(huge.snapshot().threats.zombies).length;
  huge.step(1); assert.equal(huge.snapshot().threats.wave.reinforced, noise.reinforceCap, 'no more once at the cap');
  assert.ok(before >= noise.reinforceCap);
  const calm = newSim('stage1', 1, (st) => { st.threats.wave = wave(); st.threats.attention = noise.threshold; }); calm.step(1);
  assert.equal(calm.snapshot().threats.wave.reinforced, 0, 'at the threshold is not above it');
});

test('a mounted minigun is loud and marks its tower as the loudest; a ballista is quiet', () => {
  const run = (weapon, ammo) => newSim('stage1', 1, (st) => {
    Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
    fix(st, 'tower_1', 4); st.buildings.tower_1.mounts = [mounted(weapon, 50)]; at(st, 'survivor_1', 14, 4); fix(st, 'battery_1'); st.buildings.battery_1.power.charge = 200;
    st.threats.wave = wave(); zombie(st, 'zombie_1', 'brute', 20, 4, 900);
  });
  const mg = run('minigun'); mg.step(6);
  assert.equal(loudestTower(mg.snapshot())?.id, 'tower_1'); assert.equal(read(mg).loudest, 'tower_1');
  assert.ok(mg.snapshot().threats.attention >= weapons.minigun.noise * 4);
  assert.ok(types(mg).includes('noise.high'));
  const bal = run('ballista'); bal.step(3); assert.ok(bal.snapshot().threats.attention <= weapons.ballista.noise);
});

test('posted shooters make their tower loud too; a shooter far from any tower only raises attention', () => {
  const posted = shooter('rifle', 'bullets', (st) => { fix(st, 'tower_1', 1); at(st, 'survivor_1', 14, 4); zombie(st, 'zombie_1', 'brute', 20, 4, 500); });
  call(posted, 'guard'); posted.step(12);
  assert.equal(loudestTower(posted.snapshot())?.id, 'tower_1');
  const free = shooter('rifle', 'bullets'); call(free, 'guard'); free.step(12);
  assert.equal(loudestTower(free.snapshot()), null); assert.ok(free.snapshot().threats.attention > 0);
});

test('drift: with nobody outside, zombies head for the wall nearest the LOUDEST tower instead of the nearest wall', () => {
  const walk = (loud) => {
    const sim = newSim('stage1', 1, (st) => {
      Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 }); at(st, 'survivor_1', 11, 9);
      fix(st, 'tower_1'); st.threats.wave = wave(); zombie(st, 'zombie_1', 'walker', 12, 0, 50);
      if (loud) st.threats.towerNoise.tower_1 = 500;
    });
    sim.step(14); const z = sim.snapshot().threats.zombies.zombie_1; return z.x;
  };
  assert.ok(walk(true) > walk(false), 'the noisy tower (east side, x=15) pulls it east of where it would go');
});

test('rifle: craftable at the Armory (item, HQ storage, recipe mirrors craft); validation holds; deterministic', async () => {
  const w = defs.weapons.rifle, rc = defs.recipes.rifle;
  assert.deepEqual(rc.inputs, w.craft.materials); assert.equal(rc.stationLevel, w.craft.stationLevel); assert.equal(rc.minSkill, w.craft.minSkill); assert.deepEqual(rc.outputs, { rifle: 1 });
  assert.ok(defs.items.rifle && defs.buildings.hq.storage.rifle > 0 && defs.buildings.hq.levels[2].storage.rifle > 0);
  const r = await sandbox.run({ code: 'console.log(threats.noise.attention, threats.noise.loudest, threats.noise.reinforced);', view: newSim().studentView(), seed: 1 });
  assert.equal(r.ok, true, r.error?.message);
  const run = () => { const s = shooter('rifle', 'bullets', (st) => { st.threats.wave = wave(['walker', 'walker']); }); call(s, 'guard'); s.step(150); return s.stateHash(); };
  assert.equal(run(), run());
});
