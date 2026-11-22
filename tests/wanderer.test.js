// The WANDERER (docs/game/24 W1): a lone common zombie that drifts outside the wall in daylight, chases a survivor who is outside, can be attacked with no wave,
// drops its loot, and wanders off at dusk. Pure schedule + simulation behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { buildCommand } from '../src/modules/api/index.js';
import { wandererSpawnTick, wandererComes, wanderersOf } from '../src/modules/threats/index.js';
import { insideWall } from '../src/kernel/index.js';
import { renderProjection } from '../src/modules/projection/index.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { raidSchedule } from '../src/modules/definitions/data/threats.js';
import { wanderer as wanderData } from '../src/modules/definitions/data/threats.js';

const DAY = 240;
const quiet = (wanderer) => createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 0 }, raidSchedule: { ...raidSchedule, chancePercent: 0 }, wanderer });
const always = quiet({ ...wanderData, chancePercent: 100, firstDay: 1 });
const build = (defs, seed = 1, tweak = () => {}) => {
  const state = createInitialState({ defs, scenarioId: 'stage1_outpost', seed });
  for (const s of Object.values(state.survivors)) Object.assign(s.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
  tweak(state);
  return { state, sim: createSimulation({ defs, state }) };
};
const evs = (sim, type) => sim.log.all().filter((e) => e.type === type);
const fenceOf = (st) => Object.values(st.buildings).find((b) => b.type === 'fence');
const plant = (state, x, y) => { state.threats.wanderCounter = 1; state.threats.zombies.zombie_1 = { id: 'zombie_1', type: 'walker', x, y, direction: 'DOWN', state: 'walk', health: 10, move: 0, hit: 0, goal: null, route: null, reached: null, wanderer: true }; };

test('the schedule is pure: the spawn tick falls shortly after dawn and the roll depends only on (seed, day)', () => {
  for (const day of [1, 2, 3, 9]) {
    const t = wandererSpawnTick(always, 1, day); const dawn = (day - 1) * DAY;
    assert.ok(t >= dawn && t < dawn + always.wanderer.spawnWindowTicks, `day ${day}: ${t}`);
    assert.equal(t, wandererSpawnTick(always, 1, day));
  }
  assert.equal(wandererComes(quiet({ ...wanderData, chancePercent: 100, firstDay: 3 }), 1, 2), false, 'before firstDay never');
  assert.equal(wandererComes(quiet({ ...wanderData, chancePercent: 100, firstDay: 3 }), 1, 3), true);
  assert.equal(wandererComes(quiet({ ...wanderData, chancePercent: 0 }), 1, 5), false);
  const some = [...Array(60).keys()].map((d) => wandererComes(createDefinitions(), 7, d + 2));
  assert.ok(some.some(Boolean) && some.some((v) => !v), 'at 60% some days have one and some do not');
});

test('with chancePercent 100 a wanderer appears after dawn on the east edge, outside the wall, once', () => {
  const { sim, state } = build(always);
  sim.step(wandererSpawnTick(always, 1, 1) + 1);
  const w = wanderersOf(state);
  assert.equal(w.length, 1); assert.equal(w[0].type, 'walker'); assert.equal(w[0].wanderer, true);
  assert.equal(evs(sim, 'wanderer.spawned').length, 1);
  assert.ok(!insideWall(fenceOf(state).bounds, w[0]), 'outside the wall');
  assert.equal(evs(sim, 'zombie.spawned').length, 0, 'it is not a wave zombie');
  sim.step(100); assert.equal(wanderersOf(state).length, 1, 'maxAlive 1');
});

test('it drifts at random but never crosses the wall or leaves the map, and stays in the projection the renderer draws', () => {
  const { sim, state } = build(always);
  sim.step(wandererSpawnTick(always, 1, 1) + 1);
  const seen = new Set(); const f = fenceOf(state);
  for (let i = 0; i < 70; i++) {
    sim.step(1);
    const z = wanderersOf(state)[0]; if (!z) break;
    seen.add(`${z.x},${z.y}`);
    assert.ok(!insideWall(f.bounds, z) && z.x >= 0 && z.y >= 0 && z.x < state.map.width && z.y < state.map.height, `${z.x},${z.y}`);
  }
  assert.ok(seen.size > 2, `it moved (${seen.size} cells)`);
  const z = renderProjection(state, always).zombies.find((q) => q.id === wanderersOf(state)[0].id);
  assert.ok(z && z.type === 'walker');
});

test('it wanders off at dusk, before a wave could start, and the dusk event order stays dusk -> wanderer.left', () => {
  const { sim, state } = build(always);
  sim.step(DAY * 0.8 + 5); // dusk is at hour 18 = tick 120 of the day (10 ticks per hour)
  const dusk = evs(sim, 'time.dusk')[0]; assert.ok(dusk, 'dusk reached');
  assert.equal(wanderersOf(state).length, 0);
  assert.equal(evs(sim, 'wanderer.left').length, 1);
  assert.equal(state.threats.wave, null);
});

test('it comes back on later days (new id each time), and with wanderer: null it never appears', () => {
  const { sim, state } = build(always);
  sim.step(DAY * 3);
  assert.ok(evs(sim, 'wanderer.spawned').length >= 2, 'one a day');
  const ids = evs(sim, 'wanderer.spawned').map((e) => e.id); assert.equal(new Set(ids).size, ids.length); assert.ok(ids.every((i) => /^wanderer_\d+$/.test(i)), 'wanderers have their own ids');
  const off = build(quiet(null)); off.sim.step(DAY * 4);
  assert.equal(evs(off.sim, 'wanderer.spawned').length, 0); assert.equal(wanderersOf(off.state).length, 0);
});

test('a survivor outside the wall is chased and hit; a survivor inside is left alone', () => {
  const hurt = build(always, 1, (st) => { st.survivors.survivor_1.position = { x: 20, y: 9 }; plant(st, 22, 9); });
  hurt.sim.step(40);
  const hits = evs(hurt.sim, 'survivor.damaged').filter((e) => e.cause === 'zombie');
  assert.ok(hits.length >= 1 && hits[0].zombieType === 'walker', 'she was hit');
  assert.ok(evs(hurt.sim, 'wanderer.reached_survivor').length >= 1);
  const safe = build(always, 1, (st) => { plant(st, 20, 9); }); // survivors start inside the wall
  safe.sim.step(60);
  assert.equal(evs(safe.sim, 'survivor.damaged').filter((e) => e.cause === 'zombie').length, 0);
});

test('attack works with NO wave on: the wanderer dies, drops loot where it fell, and the log says who killed it', () => {
  const { sim, state } = build(always, 1, (st) => { st.survivors.survivor_1.position = { x: 20, y: 9 }; plant(st, 21, 9); });
  assert.equal(state.threats.wave, null);
  sim.submit(buildCommand('survivor_1', { name: 'attack', args: ['zombie_1'] }));
  sim.step(120);
  assert.equal(wanderersOf(state).length, 0);
  const k = evs(sim, 'zombie.killed'); assert.equal(k.length, 1); assert.equal(k[0].survivorId, 'survivor_1');
  assert.ok(sim.log.all().every((e) => e.type !== 'action.failed' || e.reason !== 'NO_WAVE'));
  const loot = state.threats.loot; assert.ok(typeof loot === 'object');
});

test('an ordinary raid zombie still needs a wave: attack with no wave and no wanderer is NO_WAVE', () => {
  const { sim, state } = build(quiet(null), 1, (st) => { st.threats.counter = 1; st.threats.zombies.zombie_1 = { id: 'zombie_1', type: 'walker', x: 25, y: 9, direction: 'DOWN', state: 'walk', health: 10, move: 0, hit: 0, goal: null, route: null, reached: null }; });
  sim.submit(buildCommand('survivor_1', { name: 'attack', args: ['zombie_1'] })); sim.step(5);
  assert.ok(JSON.stringify(sim.log.all()).includes('NO_WAVE'));
});

test('the learner read lists wanderers (id, type, position, health) and a wave read is untouched', () => {
  const { sim } = build(always); sim.step(wandererSpawnTick(always, 1, 1) + 1);
  const v = sim.studentView().threats;
  assert.equal(v.wanderers.length, 1); assert.deepEqual(Object.keys(v.wanderers[0]).sort(), ['health', 'id', 'maxHealth', 'state', 'type', 'x', 'y']);
  assert.equal(v.wave.active, false);
});

test('determinism: the same seed gives the same wanderer path; different seeds differ', () => {
  const path = (seed) => { const { sim, state } = build(always, seed); const p = []; for (let i = 0; i < 160; i++) { sim.step(1); const z = wanderersOf(state)[0]; if (z) p.push(`${z.x},${z.y}`); } return p.join('|'); };
  assert.equal(path(3), path(3));
  assert.notEqual(path(3), path(4));
});

test('definitions: the wanderer must be a plain zombie, with whole numbers', () => {
  assert.throws(() => quiet({ ...wanderData, type: 'brute' }), /wanderer/);
  assert.throws(() => quiet({ ...wanderData, stepTicks: 0 }), /wanderer/);
  assert.throws(() => quiet({ ...wanderData, chancePercent: 101 }), /wanderer/);
  assert.doesNotThrow(() => quiet(null));
});
