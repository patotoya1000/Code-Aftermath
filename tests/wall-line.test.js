// W2 the `line` wall (docs/game/21 section 5): one full-height column with a gate in it. "Inside" = west of the line, the wave always spawns east,
// there is no way around the wall, and the original `perimeter` wall keeps behaving exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { raidSchedule } from '../src/modules/definitions/data/threats.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { scenarios } from '../src/modules/definitions/data/world.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { blockedTiles, findPath } from '../src/modules/buildings/index.js';
import { wallCellsOf, onWall, insideWall, isLineWall } from '../src/kernel/index.js';
import { fenceCells } from '../src/modules/assets/index.js';
import { groundGrid } from '../src/modules/assets/terrain.js';
import { mountRenderer, perimeterCells } from '../src/modules/render/index.js';
import { placeholderManifestFor } from '../src/modules/assets/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';

const quiet = { eventSchedule: { ...eventSchedule, chancePercent: 0 } };
// a wave of exactly 2 walkers every day from day 6, so the schedule never gets in the way
const weak = createDefinitions({ ...quiet, raidSchedule: { ...raidSchedule, chancePercent: 100, strengthBase: 4, strengthPerDay: 0, variancePercent: 0 } });
const DAY = weak.environment.ticksPerDay;
const duskTick = (day) => (day - 1) * DAY + (weak.environment.duskHour - weak.environment.startHour) * (DAY / 24);
const keep = (st) => { for (const s of Object.values(st.survivors)) Object.assign(s.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 }); };
const sim = (scenarioId = 'stage1_line', seed = 1, mutate) => {
  const state = createInitialState({ defs: weak, scenarioId, seed });
  keep(state); mutate?.(state);
  return createSimulation({ defs: weak, state });
};
const runTo = (s, tick) => { while (s.snapshot().tick < tick) s.step(1); };
const evs = (s, type) => s.log.all().filter((e) => e.type === type);
const at = (st, id, x, y) => { st.survivors[id].position = { x, y }; };
const wallOf = (st) => Object.values(st.buildings).find((b) => b.type === 'fence');

test('kernel: a line is one full-height column; a perimeter is unchanged; inside is west of a line, inside the rectangle otherwise', () => {
  const line = { x1: 16, y1: 0, x2: 16, y2: 15, shape: 'line' };
  assert.equal(wallCellsOf(line).length, 16);
  assert.ok(wallCellsOf(line).every(([x]) => x === 16));
  assert.ok(isLineWall(line)); assert.ok(!isLineWall({ x1: 6, y1: 3, x2: 16, y2: 12 }));
  assert.ok(onWall(line, 16, 0) && onWall(line, 16, 15) && !onWall(line, 15, 7) && !onWall(line, 17, 7));
  assert.ok(insideWall(line, { x: 0, y: 0 }) && insideWall(line, { x: 15, y: 15 }));
  assert.ok(!insideWall(line, { x: 16, y: 7 }) && !insideWall(line, { x: 17, y: 7 }), 'the wall cell is not inside');
  const rect = { x1: 6, y1: 3, x2: 16, y2: 12 };
  assert.equal(wallCellsOf(rect).length, 11 * 2 + 8 * 2, 'a rectangle perimeter has its usual cell count');
  assert.ok(insideWall(rect, { x: 10, y: 7 }) && !insideWall(rect, { x: 3, y: 7 }) && !insideWall(rect, { x: 6, y: 7 }));
  assert.deepEqual(wallCellsOf(null), []); assert.ok(!insideWall(null, { x: 1, y: 1 }));
});

test('definitions: stage1_line is valid; the other scenarios still carry a perimeter; bad line shapes are refused at load time', () => {
  assert.ok(weak.scenarios.stage1_line);
  assert.equal(isLineWall(scenarios.stage1_line.buildings.find((b) => b.id === 'fence').bounds), true);
  for (const id of ['stage1', 'stage1_tired', 'stage1_weary']) assert.equal(isLineWall(scenarios[id].buildings.find((b) => b.id === 'fence').bounds), false, id);
  const bad = (mut, re) => assert.throws(() => { const sc = structuredClone(scenarios.stage1_line); mut(sc); createDefinitions({ scenarios: { ...scenarios, stage1_line: sc } }); }, re);
  const fenceB = (sc) => sc.buildings.find((b) => b.id === 'fence').bounds;
  bad((sc) => { fenceB(sc).y2 = 10; }, /full map height/);
  bad((sc) => { fenceB(sc).y1 = 2; }, /full map height/);
  bad((sc) => { fenceB(sc).x2 = 17; }, /x1 must equal x2/);
  bad((sc) => { fenceB(sc).shape = 'ring'; }, /unknown/);
  bad((sc) => { sc.buildings.find((b) => b.id === 'gate').x = 15; }, /gate.*fence line/);
  bad((sc) => { sc.buildings.find((b) => b.id === 'storage_1').x = 16; }, /must not sit on the fence line/);
  bad((sc) => { sc.buildings.find((b) => b.id === 'hq').x = 15; }, /fence line/); // the 3x3 hq footprint would touch x = 16
});

test('walking: the wall blocks the whole column except the gate; with the gate closed there is no way around', () => {
  const s = sim();
  const st = s.snapshot();
  const blocked = blockedTiles(st);
  for (let y = 0; y < 16; y++) assert.equal(blocked.has(`16,${y}`), y !== 7, `x=16 y=${y}`);
  const through = findPath(st, { x: 10, y: 7 }, { x: 20, y: 7 });
  assert.ok(through && through.some((p) => p.x === 16 && p.y === 7), 'the only way across is the gate');
  const around = findPath(st, { x: 10, y: 1 }, { x: 20, y: 1 });
  assert.ok(around.some((p) => p.x === 16 && p.y === 7), 'even from the north edge she must walk down to the gate');
  const shut = structuredClone(st); shut.threats.wave = { gateClosed: true };
  assert.equal(findPath(shut, { x: 10, y: 7 }, { x: 20, y: 7 }), null, 'closed gate = nothing crosses, nowhere around');
  assert.equal(findPath(shut, { x: 10, y: 0 }, { x: 20, y: 0 }), null);
});

test('spawn: on a line wall every zombie enters on the EAST edge (any seed, any day); a perimeter wall still varies the side by seed', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = sim('stage1_line', seed);
    runTo(s, duskTick(6) + 12);
    const spawned = evs(s, 'zombie.spawned');
    assert.equal(spawned.length, 2);
    for (const e of spawned) { assert.equal(e.side, 'east'); assert.equal(e.x, s.snapshot().map.width - 1); }
  }
  const sides = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => { const s = sim('stage1', seed); runTo(s, duskTick(6) + 12); return evs(s, 'zombie.spawned')[0].side; }));
  assert.ok(sides.size > 1, 'perimeter scenarios keep the seed-chosen side');
});

test('inside = west: zombies hit the line from the east, never cross it, and the wall (not a survivor) takes the damage', () => {
  const s = sim('stage1_line', 1, (st) => { wallOf(st).health = wallOf(st).level === 1 ? 100 : 100; wallOf(st).condition = 'repaired'; });
  runTo(s, duskTick(6) + 90);
  const st = s.snapshot();
  const zs = Object.values(st.threats.zombies);
  assert.equal(zs.length, 2);
  for (const z of zs) { assert.ok(z.x > 16, `zombie at x=${z.x} stays east of the wall`); assert.equal(z.state, 'attack'); }
  assert.ok(evs(s, 'zombie.reached_wall').length >= 1);
  assert.ok(wallOf(st).health < 100, 'the wall was hit');
  assert.ok(st.threats.wave.wallDamage > 0);
});

test('prey: a survivor EAST of the line is chased first; one WEST of it is safe until the wall is breached', () => {
  const reachedSurvivor = (s) => evs(s, 'zombie.reached_survivor').filter((e) => e.survivorId === 'survivor_1').length;
  const outside = sim('stage1_line', 1, (st) => { at(st, 'survivor_1', 21, 3); wallOf(st).health = 100; wallOf(st).condition = 'repaired'; });
  runTo(outside, duskTick(6) + 60);
  assert.ok(reachedSurvivor(outside) >= 1, 'the survivor outside (east) is the target');
  const safe = sim('stage1_line', 1, (st) => { at(st, 'survivor_1', 10, 7); wallOf(st).health = 100; wallOf(st).condition = 'repaired'; });
  runTo(safe, duskTick(6) + 160);
  assert.equal(reachedSurvivor(safe), 0, 'an inside (west) survivor is not chased while the wall stands');
  assert.ok(evs(safe, 'zombie.reached_wall').length >= 1);
  // one hit from a walker (damage 2 - armor 1 = 1) breaks a wall with 1 health: from then on every survivor is prey, wherever she stands
  const breached = sim('stage1_line', 1, (st) => { at(st, 'survivor_1', 10, 7); wallOf(st).health = 1; wallOf(st).condition = 'damaged'; });
  runTo(breached, duskTick(6) + 260);
  assert.equal(evs(breached, 'wall.breached').length, 1);
  assert.ok(reachedSurvivor(breached) >= 1, 'once the wall is down an inside survivor is prey');
});

test('a wall that falls is reported as a breach and the dawn outcome is "breached" (same rule as the perimeter)', () => {
  const s = sim('stage1_line', 1, (st) => { wallOf(st).health = 1; wallOf(st).condition = 'damaged'; });
  runTo(s, duskTick(6) + DAY / 2 + 4);
  const resolved = evs(s, 'raid.resolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].outcome, 'breached');
  assert.equal(wallOf(s.snapshot()).health, 0, 'the wall is destroyed (it must be repaired like the perimeter fence)');
});

function fakeCanvas(w = 960, h = 640) {
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  return { width: w, height: h, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h }) };
}

test('render: the line becomes 15 fence pieces (the gate cell is open), joined north-south; every wall cell can be picked; ground has no walled yard', () => {
  const s = sim();
  const frame = s.renderProjection();
  const fence = frame.buildings.find((b) => b.type === 'fence');
  assert.deepEqual(fence.bounds, { x1: 16, y1: 0, x2: 16, y2: 15, shape: 'line' }, 'the projection keeps the shape');
  const pieces = fenceCells(frame);
  assert.equal(pieces.length, 15);
  assert.ok(pieces.every((p) => p.x === 16 && p.y !== 7));
  assert.notEqual(pieces.find((p) => p.y === 0).mask, pieces.find((p) => p.y === 3).mask, 'the end piece differs from a straight piece');
  const ground = groundGrid(frame);
  assert.notEqual(ground[7][10], 'dirt', 'no trodden yard rectangle for a line wall');
  const hash = s.stateHash();
  const r = mountRenderer(fakeCanvas(), { manifest: placeholderManifestFor(weak), createCanvas: () => fakeCanvas() });
  r.draw(frame);
  assert.equal(r.lastDrawList.filter((e) => e.layer === 'fence').length, 15);
  assert.equal(s.stateHash(), hash, 'drawing is presentation only');
  assert.equal(perimeterCells(fence.bounds).length, 16);
});

test('determinism + soak: the same seed gives the same hash; two weeks behind a line wall keep the ledger balanced', () => {
  const a = sim('stage1_line', 4), b = sim('stage1_line', 4);
  runTo(a, duskTick(6) + 120); runTo(b, duskTick(6) + 120);
  assert.equal(a.stateHash(), b.stateHash());
  const soak = sim('stage1_line', 2);
  runTo(soak, DAY * 14);
  assert.deepEqual(ledgerViolations(soak.snapshot()), []);
  assert.ok(soak.snapshot().threats.history.length >= 1);
});
