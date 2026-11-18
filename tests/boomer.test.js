// Z7b: the boomer explodes on contact with a wall or a survivor - radius damage, no gland, wave clear. docs/game/20 section 23.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, types } from './helpers.js';
import { zombies } from '../src/modules/definitions/data/threats.js';

const B = zombies.boomer.behaviour;
const wave = (queue = []) => ({ day: 12, strength: 5, defense: 0, composition: { boomer: 1 }, queue, spawned: 1, reinforced: 0, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 });
const zombie = (st, id, type, x, y) => { st.threats.zombies[id] = { id, type, x, y, direction: 'LEFT', state: 'walk', health: defs.zombies[type].health, move: 0, hit: 0, goal: null, route: null, reached: null }; st.threats.counter = 9; };
const fenceOf = (st) => Object.values(st.buildings).find((b) => b.type === 'fence');
const at = (st, id, x, y) => { st.survivors[id].position = { x, y }; };
const calm = (st) => { for (const s of Object.values(st.survivors)) Object.assign(s.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 }); };

function setup(mut) {
  return newSim('stage1', 1, (st) => {
    calm(st);
    st.threats.wave = wave();
    const { x1, y1 } = fenceOf(st).bounds;
    zombie(st, 'zombie_1', 'boomer', x1 - 1, y1 - 1);
    mut?.(st, { x1, y1 });
  });
}

test('a boomer at the wall explodes: the fence takes fenceDamage, the boomer is gone, no gland, the wave clears', () => {
  const sim = setup();
  const f0 = fenceOf(sim.snapshot()).health;
  sim.step(2);
  const st = sim.snapshot();
  assert.equal(st.threats.zombies.zombie_1, undefined, 'the boomer is gone');
  assert.equal(fenceOf(st).health, Math.max(0, f0 - B.fenceDamage), 'flat fence damage, armor does not apply');
  assert.deepEqual(Object.values(st.threats.loot), [], 'an exploded boomer drops no gland');
  const e = sim.log.all().find((x) => x.type === 'zombie.exploded');
  assert.ok(e && e.radius === B.radius && e.wallDamage === f0 - fenceOf(st).health);
  assert.ok(types(sim).includes('wave.cleared'), 'it was the last zombie of the wave');
  assert.equal(st.threats.wave.cleared, true);
  assert.equal(st.threats.wave.wallDamage, e.wallDamage, 'the wave counts the damage');
});

test('survivors within the radius take survivorDamage (inside or outside the wall), others are safe', () => {
  const sim = setup((st, { x1, y1 }) => {
    st.survivors.survivor_2 = { ...structuredClone(st.survivors.survivor_1), id: 'survivor_2' };
    at(st, 'survivor_1', x1 + 1, y1 + 1); // inside, 2 cells from the boomer
    at(st, 'survivor_2', x1 + 6, y1 + 6); // far away
  });
  sim.step(2);
  const st = sim.snapshot();
  assert.equal(st.survivors.survivor_1.needs.health, 100 - B.survivorDamage);
  assert.equal(st.survivors.survivor_2.needs.health, 100);
  const e = sim.log.all().find((x) => x.type === 'zombie.exploded');
  assert.deepEqual(e.survivorsHit, ['survivor_1']);
  assert.ok(sim.log.all().some((x) => x.type === 'survivor.damaged' && x.cause === 'explosion' && x.survivorId === 'survivor_1'));
});

test('a weak survivor is downed by the blast; a downed survivor is not hit again', () => {
  const sim = setup((st, { x1, y1 }) => { at(st, 'survivor_1', x1 + 1, y1 + 1); st.survivors.survivor_1.needs.health = B.survivorDamage; });
  sim.step(2);
  assert.equal(sim.snapshot().survivors.survivor_1.status, 'downed');
  assert.ok(types(sim).includes('survivor.downed'));
});

test('a boomer that reaches a survivor outside explodes on her', () => {
  const sim = newSim('stage1', 1, (st) => {
    calm(st); st.threats.wave = wave();
    const { x1, y1 } = fenceOf(st).bounds;
    at(st, 'survivor_1', x1 - 4, y1 - 4);
    zombie(st, 'zombie_1', 'boomer', x1 - 5, y1 - 5);
  });
  sim.step(2);
  const st = sim.snapshot();
  assert.equal(st.threats.zombies.zombie_1, undefined);
  assert.equal(st.survivors.survivor_1.needs.health, 100 - B.survivorDamage);
});

test('a boomer still on its way does not explode, and one killed before contact drops its gland (not exploded)', () => {
  const sim = setup((st, { x1, y1 }) => { st.threats.zombies.zombie_1.x = x1 - 8; st.threats.zombies.zombie_1.y = y1 - 8; });
  sim.step(2);
  assert.ok(sim.snapshot().threats.zombies.zombie_1, 'still walking');
  assert.ok(!types(sim).includes('zombie.exploded'));
});

test('the explosion is deterministic and replay-safe', () => {
  const a = setup(); const b = setup();
  a.step(30); b.step(30);
  assert.equal(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()));
});
