// Z7e: the tank (brute) - slow, heavy on walls, slow hands. docs/game/20 section 26.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim } from './helpers.js';
import { zombies } from '../src/modules/definitions/data/threats.js';
import { validateDefinitions } from '../src/modules/definitions/index.js';

const K = zombies.brute.behaviour;
const wave = () => ({ day: 21, strength: 8, defense: 0, composition: { brute: 1 }, queue: [], spawned: 1, reinforced: 0, summoned: 0, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 });
const zombie = (st, id, type, x, y) => { st.threats.zombies[id] = { id, type, x, y, direction: 'RIGHT', state: 'walk', health: defs.zombies[type].health, move: 0, hit: 0, goal: null, route: null, reached: null }; st.threats.counter = 9; };
const fenceOf = (st) => Object.values(st.buildings).find((b) => b.type === 'fence');
const calm = (st) => Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });

function at(type, dx, mut) {
  return newSim('stage1', 1, (st) => {
    calm(st); st.threats.wave = wave();
    const { x1, y1 } = fenceOf(st).bounds;
    zombie(st, 'zombie_1', type, x1 - dx, y1 + 3);
    mut?.(st);
  });
}

test('the brute carries a validated siege behaviour; a bad one is refused', () => {
  assert.deepEqual(K, { type: 'siege', stepTicks: 4, attackEveryTicks: 12, wallMultiplier: 2 });
  assert.throws(() => validateDefinitions({ ...defs, zombies: { ...defs.zombies, brute: { ...defs.zombies.brute, behaviour: { ...K, wallMultiplier: 0 } } } }), /siege/);
});

test('a brute walks one cell every stepTicks - slower than a walker', () => {
  const b = at('brute', 5), w = at('walker', 5);
  b.step(8); w.step(8);
  const bx = b.snapshot().threats.zombies.zombie_1.x, wx = w.snapshot().threats.zombies.zombie_1.x;
  const x0 = fenceOf(b.snapshot()).bounds.x1 - 5;
  assert.equal(bx - x0, 8 / K.stepTicks);
  assert.ok(wx - x0 > bx - x0, 'the walker is ahead');
});

test('a brute at the wall hits every attackEveryTicks for (damage x wallMultiplier - wall armor)', () => {
  const sim = at('brute', 1);
  const f0 = fenceOf(sim.snapshot()).health;
  sim.step(K.attackEveryTicks - 1);
  assert.equal(fenceOf(sim.snapshot()).health, f0, 'no hit before its slow rhythm');
  sim.step(1);
  const st = sim.snapshot();
  const lvl = fenceOf(st).level;
  assert.equal(fenceOf(st).health, f0 - (zombies.brute.damage * K.wallMultiplier - defs.waveRules.wallArmorPerLevel * lvl));
});

test('a higher fence level still cuts the siege hit (armor after the multiplier)', () => {
  const dmg = (level) => {
    const sim = at('brute', 1, (st) => { const f = fenceOf(st); f.level = level; f.health = defs.buildings.fence.levels[level].maxHealth; f.condition = 'repaired'; });
    const f0 = fenceOf(sim.snapshot()).health; sim.step(K.attackEveryTicks);
    return f0 - fenceOf(sim.snapshot()).health;
  };
  assert.ok(dmg(1) > dmg(2));
  assert.equal(dmg(1) - dmg(2), defs.waveRules.wallArmorPerLevel);
});

test('a brute hits a survivor every attackEveryTicks for its plain damage; the sim is deterministic', () => {
  const mk = () => at('brute', 1, (st) => { const { x1, y1 } = fenceOf(st).bounds; st.survivors.survivor_1.position = { x: x1 - 2, y: y1 + 3 }; });
  const sim = mk();
  sim.step(K.attackEveryTicks);
  assert.equal(sim.snapshot().survivors.survivor_1.needs.health, 100 - zombies.brute.damage);
  const a = mk(), b = mk(); a.step(80); b.step(80);
  assert.equal(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()));
});
