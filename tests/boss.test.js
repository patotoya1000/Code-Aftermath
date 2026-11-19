// Z7f: the Horde King - a fixed-milestone wave (escorts + boss), siege behaviour, one enrage phase, boss_core loot. docs/game/20 section 27.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, types } from './helpers.js';
import { bosses, bossSchedule } from '../src/modules/definitions/data/threats.js';
import { createDefinitions, validateDefinitions } from '../src/modules/definitions/index.js';
import { waveStart, killZombie, behaviourFor, statsOf, raidForDay } from '../src/modules/threats/index.js';

const K = bosses.horde_king;
const fenceOf = (st) => Object.values(st.buildings).find((b) => b.type === 'fence');
const zombie = (st, id, type, x, y, health) => { st.threats.zombies[id] = { id, type, x, y, direction: 'RIGHT', state: 'walk', health: health ?? statsOf(defs, type).health, move: 0, hit: 0, goal: null, route: null, reached: null }; st.threats.counter = 9; };
const bossWave = () => ({ day: 25, strength: 0, defense: 0, composition: { horde_king: 1 }, queue: [], spawned: 1, reinforced: 0, summoned: 0, startTick: 0, gateClosed: true, breached: false, wallDamage: 0, boss: 'horde_king' });

function startOn(day, d = defs) {
  const sim = newSim('stage1', 1, () => {});
  const events = [];
  const ctx = { state: structuredClone(sim.snapshot()), defs: d, emit: (type, data) => events.push({ type, ...data }) };
  ctx.state.threats.wave = null;
  waveStart(ctx, day);
  return { ctx, events };
}

test('boss data validates: siege behaviour and falling phases; a bad phase is refused', () => {
  assert.equal(K.behaviour.type, 'siege');
  assert.equal(K.phases.length, 1);
  const bad = (phases) => validateDefinitions({ ...defs, bosses: { horde_king: { ...K, phases } } });
  assert.throws(() => bad([{ name: 'x', belowPercent: 0, summons: 1 }]), /phase/);
  assert.throws(() => bad([{ name: 'a', belowPercent: 50, summons: 1 }, { name: 'b', belowPercent: 60, summons: 1 }]), /phase/);
  assert.throws(() => bad([{ name: 'a', belowPercent: 50, set: { nope: 3 } }]), /phase/);
});

test('a boss day is a wave even with raids off: escorts then the boss LAST, strength 0; other days start nothing', () => {
  const { ctx, events } = startOn(bossSchedule.firstDay);
  const w = ctx.state.threats.wave;
  assert.ok(w && w.boss === 'horde_king' && w.strength === 0);
  assert.deepEqual(w.composition, { ...K.escorts, horde_king: 1 });
  assert.equal(w.queue.at(-1), 'horde_king');
  assert.equal(w.queue.length, 6 + 1 + 1);
  assert.equal(w.queue.filter((t) => t === 'horde_king').length, 1);
  assert.equal(events[0].type, 'wave.started'); assert.equal(events[0].boss, 'horde_king');
  assert.equal(startOn(bossSchedule.firstDay + 1).ctx.state.threats.wave, null);
  assert.ok(startOn(bossSchedule.firstDay + bossSchedule.everyDays).ctx.state.threats.wave, 'then every everyDays');
});

test('on a boss day that also has a random raid, the raid composition and the escorts merge', () => {
  const real = createDefinitions();
  let day = null;
  for (let d = bossSchedule.firstDay; d < 400 && !day; d += bossSchedule.everyDays) if (raidForDay(real, 1, d)) day = d;
  assert.ok(day, 'a boss day with a raid exists');
  const raid = raidForDay(real, 1, day);
  const { ctx } = startOn(day, real);
  const w = ctx.state.threats.wave;
  assert.equal(w.strength, raid.strength);
  for (const [id, n] of Object.entries(raid.composition)) assert.ok((w.composition[id] ?? 0) >= n + (K.escorts[id] ?? 0));
  assert.equal(w.queue.at(-1), 'horde_king');
});

test('the boss spawns as a zombie with boss health and shows in the learner wave read', () => {
  const sim = newSim('stage1', 1, (st) => { st.threats.wave = bossWave(); st.threats.wave.queue = ['horde_king']; st.threats.wave.spawned = 0; });
  sim.step(3);
  const view = sim.studentView().threats.wave;
  assert.ok(view.boss && view.boss.type === 'horde_king' && view.boss.health === K.health && view.boss.maxHealth === K.health && view.boss.phase === 0);
  assert.equal(view.zombies[0].maxHealth, K.health);
});

test('a boss enters its enrage phase once at 50 % health: summons walkers and speeds up', () => {
  const mk = (health) => newSim('stage1', 1, (st) => { st.threats.wave = bossWave(); zombie(st, 'zombie_1', 'horde_king', 1, 6, health); });
  const calm = mk(K.health); calm.step(3);
  assert.ok(!types(calm).includes('boss.phase'), 'not before half health');
  const sim = mk(K.health / 2);
  sim.step(1);
  const e = sim.log.all().find((x) => x.type === 'boss.phase');
  assert.ok(e && e.phase === 1 && e.name === 'Enraged' && e.summoned === 3);
  const st = sim.snapshot();
  assert.equal(st.threats.zombies.zombie_1.phase, 1);
  assert.equal(st.threats.wave.queue.length + (st.threats.wave.spawned - 1), 3, 'the three summoned walkers are queued or already spawned');
  const b = behaviourFor(defs, st.threats.zombies.zombie_1);
  assert.equal(b.stepTicks, K.phases[0].set.stepTicks); assert.equal(b.attackEveryTicks, K.phases[0].set.attackEveryTicks);
  assert.equal(b.wallMultiplier, K.behaviour.wallMultiplier, 'fields not in `set` stay');
  sim.step(20);
  assert.equal(sim.log.all().filter((x) => x.type === 'boss.phase').length, 1, 'once only');
});

test('the boss hits the wall every attackEveryTicks for (damage x multiplier - armor); enraged it hits faster', () => {
  const run = (health, ticks) => {
    const sim = newSim('stage1', 1, (st) => { st.threats.wave = bossWave(); const f = fenceOf(st); f.health = defs.buildings.fence.levels[f.level].maxHealth; f.condition = 'repaired'; const { x1, y1 } = f.bounds; zombie(st, 'zombie_1', 'horde_king', x1 - 1, y1 + 3, health); });
    const f0 = fenceOf(sim.snapshot()).health; sim.step(ticks);
    return { sim, dealt: f0 - fenceOf(sim.snapshot()).health };
  };
  const lvl = fenceOf(newSim('stage1', 1).snapshot()).level;
  const hit = K.damage * K.behaviour.wallMultiplier - defs.waveRules.wallArmorPerLevel * lvl;
  assert.equal(run(K.health, K.behaviour.attackEveryTicks - 1).dealt, 0);
  assert.equal(run(K.health, K.behaviour.attackEveryTicks).dealt, hit);
  assert.equal(run(K.health / 2 - 1, K.phases[0].set.attackEveryTicks + 1).dealt, hit, 'enraged: one hit within 8-9 ticks');
});

test('killing the boss drops its core, emits boss.defeated and clears the wave', () => {
  const events = [];
  const sim = newSim('stage1', 1, (st) => { st.threats.wave = bossWave(); zombie(st, 'zombie_1', 'horde_king', 5, 6, 1); });
  const st = structuredClone(sim.snapshot());
  const ctx = { state: st, defs, emit: (type, data) => events.push({ type, ...data }) };
  killZombie(ctx, st.threats.zombies.zombie_1, 'survivor_1', 'spear');
  assert.ok(events.some((e) => e.type === 'boss.defeated' && e.boss === 'horde_king'));
  assert.ok(events.some((e) => e.type === 'wave.cleared'));
  const items = Object.values(st.threats.loot).map((p) => p.item);
  assert.ok(items.includes('boss_core') && items.includes('gland'));
});

test('boss waves are deterministic', () => {
  const mk = () => newSim('stage1', 1, (st) => { st.threats.wave = bossWave(); st.threats.wave.queue = ['walker', 'horde_king']; st.threats.wave.spawned = 0; });
  const a = mk(), b = mk(); a.step(200); b.step(200);
  assert.equal(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()));
});
