// Z7d: the screamer calls capped extra walkers into the wave. docs/game/20 section 25.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, types } from './helpers.js';
import { zombies } from '../src/modules/definitions/data/threats.js';
import { validateDefinitions } from '../src/modules/definitions/index.js';

const S = zombies.screamer.behaviour;
const wave = (extra = {}) => ({ day: 18, strength: 4, defense: 0, composition: { screamer: 1 }, queue: [], spawned: 1, reinforced: 0, summoned: 0, startTick: 0, gateClosed: true, breached: false, wallDamage: 0, ...extra });
const zombie = (st, id, type, x, y) => { st.threats.zombies[id] = { id, type, x, y, direction: 'RIGHT', state: 'walk', health: defs.zombies[type].health, move: 0, hit: 0, goal: null, route: null, reached: null }; st.threats.counter = 9; };

const setup = (mut, w) => newSim('stage1', 1, (st) => {
  Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
  st.threats.wave = wave(w); zombie(st, 'zombie_1', 'screamer', 1, 6); mut?.(st);
});
const left = (sim) => { const st = sim.snapshot(); return st.threats.wave.queue.length + (st.threats.wave.spawned - 1); };

test('a screamer screams every cooldownTicks and summons walkers into the spawn queue', () => {
  const sim = setup();
  sim.step(S.cooldownTicks - 1);
  assert.ok(!types(sim).includes('zombie.screamed'), 'no scream before the cooldown');
  sim.step(1);
  const e = sim.log.all().find((x) => x.type === 'zombie.screamed');
  assert.ok(e); assert.equal(e.summoned, S.summons); assert.equal(e.total, S.summons);
  const q = sim.snapshot().threats.wave;
  assert.equal(q.summoned, S.summons);
  assert.ok(q.queue.every((t) => t === 'walker'), 'only walkers are summoned');
});

test('the wave cap holds: no more than waveCap summoned walkers, screams beyond it add 0', () => {
  const sim = setup();
  sim.step(S.cooldownTicks * 5);
  const w = sim.snapshot().threats.wave;
  assert.equal(w.summoned, S.waveCap);
  const screams = sim.log.all().filter((x) => x.type === 'zombie.screamed');
  assert.ok(screams.length >= 3);
  assert.equal(screams.reduce((n, e) => n + e.summoned, 0), S.waveCap);
  assert.equal(screams.at(-1).summoned, 0, 'a scream at the cap summons nothing');
});

test('the cap is shared by every screamer of the wave', () => {
  const sim = setup((st) => zombie(st, 'zombie_2', 'screamer', 1, 7));
  sim.step(S.cooldownTicks * 3);
  assert.equal(sim.snapshot().threats.wave.summoned, S.waveCap);
});

test('only a living screamer screams: with it gone before its first scream, nothing is summoned', () => {
  const sim = setup((st) => { delete st.threats.zombies.zombie_1; });
  sim.step(S.cooldownTicks * 3);
  assert.equal(sim.snapshot().threats.wave.summoned, 0);
  assert.ok(!types(sim).includes('zombie.screamed'));
});

test('a screamer does no damage to the wall and the summoned walkers are real zombies that spawn', () => {
  const sim = setup();
  const fence = () => Object.values(sim.snapshot().buildings).find((b) => b.type === 'fence');
  const f0 = fence().health;
  sim.step(S.cooldownTicks + 3 * defs.waveRules.spawnEveryTicks + 2);
  assert.equal(fence().health, f0, 'the screamer itself never hits');
  const walkers = Object.values(sim.snapshot().threats.zombies).filter((z) => z.type === 'walker');
  assert.ok(walkers.length >= 1, 'summoned walkers spawn like any queued zombie');
});

test('screamer behaviour is validated and the sim is deterministic', () => {
  assert.throws(() => validateDefinitions({ ...defs, zombies: { ...defs.zombies, screamer: { ...defs.zombies.screamer, behaviour: { ...S, waveCap: 1 } } } }), /scream/);
  const a = setup(); const b = setup();
  a.step(120); b.step(120);
  assert.equal(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()));
});
