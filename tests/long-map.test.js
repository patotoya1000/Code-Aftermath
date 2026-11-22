// stage1_long: the 40x16 line-wall map (docs/game/21 sections 3 and 5). The stage-1 settlement shifted 6 cells east behind a line wall at x = 22.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { raidSchedule } from '../src/modules/definitions/data/threats.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { scenarios } from '../src/modules/definitions/data/world.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { blockedTiles, findPath } from '../src/modules/buildings/index.js';
import { isLineWall } from '../src/kernel/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';

const weak = createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 0 }, raidSchedule: { ...raidSchedule, chancePercent: 100, strengthBase: 4, strengthPerDay: 0, variancePercent: 0 } });
const DAY = weak.environment.ticksPerDay;
const dusk = (day) => (day - 1) * DAY + (weak.environment.duskHour - weak.environment.startHour) * (DAY / 24);
const sim = (seed = 1, mutate) => { const state = createInitialState({ defs: weak, scenarioId: 'stage1_long', seed }); for (const s of Object.values(state.survivors)) Object.assign(s.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 }); mutate?.(state); return createSimulation({ defs: weak, state }); };
const runTo = (s, t) => { while (s.snapshot().tick < t) s.step(1); };
const evs = (s, type) => s.log.all().filter((e) => e.type === type);
const wall = (st) => Object.values(st.buildings).find((b) => b.type === 'fence');

test('stage1_long is a valid 40x16 map with one line wall at x = 22 and the gate in it', () => {
  const sc = scenarios.stage1_long; const st = createInitialState({ defs: weak, scenarioId: 'stage1_long', seed: 1 });
  assert.deepEqual(st.map, { width: 40, height: 16 });
  assert.deepEqual(wall(st).bounds, { x1: 22, y1: 0, x2: 22, y2: 15, shape: 'line' });
  assert.ok(isLineWall(sc.buildings.find((b) => b.id === 'fence').bounds));
  assert.deepEqual([st.buildings.gate.x, st.buildings.gate.y], [22, 7]);
  const blocked = blockedTiles(st);
  for (let y = 0; y < 16; y++) assert.equal(blocked.has(`22,${y}`), y !== 7);
});

test('the settlement is stage 1 unchanged, only 6 cells east: every distance to the wall is the same', () => {
  const a = scenarios.stage1; const b = scenarios.stage1_long;
  for (const x of a.buildings.filter((q) => q.id !== 'fence')) { const y = b.buildings.find((q) => q.id === x.id); assert.equal(y.x, x.x + 6, x.id); assert.equal(y.y, x.y, x.id); assert.equal(y.health, x.health, x.id); }
  for (const x of a.nodes) assert.equal(b.nodes.find((q) => q.id === x.id).x, x.x + 6, x.id);
  assert.equal(b.survivors[0].x, a.survivors[0].x + 6);
  assert.ok(b.terrain.zones[0].x1 > 22 && b.terrain.paths[0].cells.every(([x]) => x > 22), 'forest and road are beyond the wall');
  assert.ok(b.nodes.filter((n) => n.type === 'tree').some((n) => n.x > 22), 'there are trees to gather beyond the wall');
});

test('every wave spawns on the east edge (x = 39), hits the line from the east and never crosses it', () => {
  for (const seed of [1, 2, 3, 4]) { const s = sim(seed); runTo(s, dusk(6) + 12); const sp = evs(s, 'zombie.spawned'); assert.equal(sp.length, 2); for (const e of sp) { assert.equal(e.side, 'east'); assert.equal(e.x, 39); } }
  const s = sim(1, (st) => { wall(st).health = 100; wall(st).condition = 'repaired'; });
  runTo(s, dusk(6) + 160);
  // a daytime wanderer may already be out by now (docs/game/24 W1): only raid zombies are checked
  for (const z of Object.values(s.snapshot().threats.zombies).filter((q) => !q.wanderer)) { assert.ok(z.x > 22, `zombie at x=${z.x}`); assert.equal(z.state, 'attack'); }
  assert.ok(evs(s, 'zombie.reached_wall').length >= 1);
});

test('walking: the only way across the wall is the gate, from anywhere on the map', () => {
  const st = sim().snapshot();
  const p = findPath(st, { x: 10, y: 1 }, { x: 30, y: 1 });
  assert.ok(p.some((c) => c.x === 22 && c.y === 7));
});

test('determinism and a two-week soak keep the ledger balanced', () => {
  const a = sim(4), b = sim(4); runTo(a, dusk(6) + 120); runTo(b, dusk(6) + 120); assert.equal(a.stateHash(), b.stateHash());
  const soak = sim(2); runTo(soak, DAY * 14); assert.deepEqual(ledgerViolations(soak.snapshot()), []);
});
