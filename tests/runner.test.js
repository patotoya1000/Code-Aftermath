// Z7a: the runner (rush behaviour) - vanguard spawn order and its own faster hit rhythm. docs/game/20 section 22.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim } from './helpers.js';
import { waveStart, raidForDay } from '../src/modules/threats/index.js';
import { zombies } from '../src/modules/definitions/data/threats.js';
import { validateDefinitions, createDefinitions } from '../src/modules/definitions/index.js';

const wave = () => ({ day: 9, strength: 3, defense: 0, composition: { runner: 1 }, queue: [], spawned: 1, reinforced: 0, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 });
const zombie = (st, id, type, x, y) => { st.threats.zombies[id] = { id, type, x, y, direction: 'LEFT', state: 'walk', health: defs.zombies[type].health, move: 0, hit: 0, goal: null, route: null, reached: null }; st.threats.counter = 9; };

test('the runner has a rush behaviour that validates; a bad one is refused', () => {
  assert.deepEqual(zombies.runner.behaviour, { type: 'rush', vanguard: true, attackEveryTicks: 5 });
  assert.ok(zombies.runner.attackEveryTicks === undefined);
  assert.throws(() => validateDefinitions({ ...defs, zombies: { ...defs.zombies, runner: { ...defs.zombies.runner, behaviour: { type: 'rush', vanguard: 'yes', attackEveryTicks: 0 } } } }), /rush/);
});

test('a wave queues its runners first, then the rest in id order', () => {
  const real = createDefinitions();
  let found = null;
  for (let day = 9; day < 200 && !found; day++) { const r = raidForDay(real, 1, day); if (r && r.composition.runner && Object.keys(r.composition).length > 1) found = r; }
  assert.ok(found, 'a mixed raid with runners exists');
  const sim = newSim('stage1', 1, () => {});
  const st = sim.snapshot();
  const ctx = { state: structuredClone(st), defs: real, emit() {} };
  ctx.state.seed = 1; ctx.state.threats.wave = null;
  waveStart(ctx, found.day);
  const q = ctx.state.threats.wave.queue;
  const nRun = found.composition.runner;
  assert.ok(q.slice(0, nRun).every((t) => t === 'runner'), 'runners lead the queue');
  assert.ok(q.slice(nRun).every((t) => t !== 'runner'));
  const rest = q.slice(nRun);
  assert.deepEqual(rest, [...rest].sort(), 'the others keep the id order');
  assert.equal(q.length, Object.values(found.composition).reduce((a, b) => a + b, 0), 'nothing lost or added');
});

function hitter(type) {
  return newSim('stage1', 1, (st) => {
    st.threats.wave = wave();
    const b = Object.values(st.buildings).find((x) => x.type === 'fence');
    const { x1, y1 } = b.bounds; // top-left corner cell is a wall cell; stand diagonal-adjacent outside it
    zombie(st, 'zombie_1', type, x1 - 1, y1 - 1);
  });
}

test('a runner hits the wall every 5 ticks, a walker every 8 (waveRules)', () => {
  const run = hitter('runner'); const walk = hitter('walker');
  const hits = (sim) => { const f = Object.values(sim.snapshot().buildings).find((b) => b.type === 'fence'); return f.health; };
  const f0 = hits(run);
  run.step(5); walk.step(5);
  assert.ok(hits(run) < f0, 'runner already hit after 5 ticks');
  assert.equal(hits(walk), f0, 'walker has not hit after 5 ticks');
  walk.step(3);
  assert.ok(hits(walk) < f0, 'walker hits on tick 8');
});

test('the runner rush is visible to learner code and the sim is deterministic', () => {
  const a = newSim('stage1', 1, () => {}); const b = newSim('stage1', 1, () => {});
  assert.deepEqual(a.studentView().threats.zombies.runner.behaviour, { type: 'rush', vanguard: true, attackEveryTicks: 5 });
  a.step(200); b.step(200);
  assert.equal(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()));
});
