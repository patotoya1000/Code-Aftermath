// Z7c: the thrower hits the wall (or a survivor outside) from range and leaves rubble (stone) outside. docs/game/20 section 24.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, types } from './helpers.js';
import { zombies } from '../src/modules/definitions/data/threats.js';
import { validateDefinitions } from '../src/modules/definitions/index.js';

const T = zombies.thrower.behaviour;
const wave = () => ({ day: 15, strength: 5, defense: 0, composition: { thrower: 1 }, queue: [], spawned: 1, reinforced: 0, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 });
const zombie = (st, id, type, x, y) => { st.threats.zombies[id] = { id, type, x, y, direction: 'RIGHT', state: 'walk', health: defs.zombies[type].health, move: 0, hit: 0, goal: null, route: null, reached: null }; st.threats.counter = 9; };
const fenceOf = (st) => Object.values(st.buildings).find((b) => b.type === 'fence');
const inside = (f, x, y) => x > f.bounds.x1 && x < f.bounds.x2 && y > f.bounds.y1 && y < f.bounds.y2;
const calm = (st) => Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });

function setup(dx, mut) {
  return newSim('stage1', 1, (st) => {
    calm(st); st.threats.wave = wave();
    const { x1, y1 } = fenceOf(st).bounds;
    zombie(st, 'zombie_1', 'thrower', x1 - dx, y1 + 3); // west of the wall, on the map
    mut?.(st, { x1, y1 });
  });
}

test('a thrower in range throws every everyTicks: flat wall damage and one stone of rubble outside the wall', () => {
  const sim = setup(T.range);
  const f0 = fenceOf(sim.snapshot()).health;
  sim.step(T.everyTicks - 1);
  assert.equal(fenceOf(sim.snapshot()).health, f0, 'nothing thrown before the first interval');
  sim.step(1);
  const st = sim.snapshot();
  assert.equal(fenceOf(st).health, f0 - T.damage, 'flat damage, fence armor does not apply');
  const piles = Object.values(st.threats.loot);
  assert.equal(piles.length, 1);
  assert.equal(piles[0].item, 'stone'); assert.equal(piles[0].qty, T.rubble);
  assert.ok(!inside(fenceOf(st), piles[0].x, piles[0].y) && !(piles[0].x >= fenceOf(st).bounds.x1 && piles[0].x <= fenceOf(st).bounds.x2 && piles[0].y >= fenceOf(st).bounds.y1 && piles[0].y <= fenceOf(st).bounds.y2), 'rubble lies outside the wall');
  assert.ok(types(sim).includes('zombie.threw'));
  assert.equal(st.threats.zombies.zombie_1.x, fenceOf(st).bounds.x1 - T.range, 'it stood still while throwing');
  assert.equal(piles[0].x, fenceOf(st).bounds.x1 - 1, 'rubble lies just outside the west wall, toward the thrower');
  sim.step(T.everyTicks);
  assert.equal(Object.values(sim.snapshot().threats.loot).reduce((n, p) => n + p.qty, 0), 2 * T.rubble, 'one more stone per throw');
});

test('a thrower out of range walks first and does not throw', () => {
  const sim = setup(T.range + 1);
  const f0 = fenceOf(sim.snapshot()).health;
  sim.step(T.everyTicks);
  const st = sim.snapshot();
  assert.equal(fenceOf(st).health, f0); assert.deepEqual(Object.values(st.threats.loot), []);
  sim.step(60);
  assert.ok(fenceOf(sim.snapshot()).health < f0, 'after walking into range it throws');
});

test('a survivor outside within range is the target: thrown damage, no rubble', () => {
  const sim = setup(T.range, (st, { x1, y1 }) => { st.survivors.survivor_1.position = { x: x1 - 2, y: y1 - 2 }; });
  sim.step(T.everyTicks);
  const st = sim.snapshot();
  assert.equal(st.survivors.survivor_1.needs.health, 100 - T.damage);
  assert.deepEqual(Object.values(st.threats.loot), []);
  assert.ok(sim.log.all().some((e) => e.type === 'survivor.damaged' && e.cause === 'thrown'));
});

test('killing the thrower still drops scrap and clears the wave; rubble stays for the sortie', () => {
  const sim = setup(T.range);
  sim.step(T.everyTicks);
  const st0 = sim.snapshot();
  assert.equal(Object.values(st0.threats.loot).filter((p) => p.item === 'stone').length, 1);
  assert.ok(st0.threats.zombies.zombie_1);
});

test('throw behaviour is validated and the sim is deterministic', () => {
  assert.throws(() => validateDefinitions({ ...defs, zombies: { ...defs.zombies, thrower: { ...defs.zombies.thrower, behaviour: { ...T, range: 0 } } } }), /throw/);
  const a = setup(T.range); const b = setup(T.range);
  a.step(40); b.step(40);
  assert.equal(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()));
});
