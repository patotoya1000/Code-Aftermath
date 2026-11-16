import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle } from './helpers.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { findPath, blockedTiles } from '../src/modules/buildings/index.js';

const pos = (sim) => ({ ...sim.snapshot().survivors.survivor_1.position });
const walk = (sim, until = 400) => { const seen = []; while (!sim.isIdle() && sim.tick < until) { sim.step(1); seen.push(pos(sim)); } return seen; };

test('the fence perimeter blocks, the gate tile and the interior are open', () => {
  const sim = newSim();
  const b = blockedTiles(sim.snapshot());
  assert.ok(b.has('6,3') && b.has('16,12') && b.has('11,12'), 'fence corners and edge are blocked');
  assert.ok(!b.has('16,7'), 'the gate is an opening');
  assert.ok(!b.has('10,8'), 'the interior is open');
  assert.ok(b.has('11,7') && b.has('8,6') && b.has('14,5'), 'hq, tent and storehouse tiles are blocked');
});

test('findPath: deterministic, no corner cutting, null when walled in, [] when already there', () => {
  const sim = newSim();
  const p1 = findPath(sim.snapshot(), { x: 11, y: 9 }, { x: 20, y: 7 });
  const p2 = findPath(sim.snapshot(), { x: 11, y: 9 }, { x: 20, y: 7 });
  assert.deepEqual(p1, p2);
  assert.deepEqual(findPath(sim.snapshot(), { x: 11, y: 9 }, { x: 11, y: 9 }), []);
  assert.ok(p1.some((t) => t.x === 16 && t.y === 7), 'the only way out of the fence is the gate');
  let prev = { x: 11, y: 9 };
  for (const t of p1) { assert.equal(Math.max(Math.abs(t.x - prev.x), Math.abs(t.y - prev.y)), 1); prev = t; }
  const walled = newSim('stage1', 1, (st) => { st.buildings.gate.blocks = true; });
  assert.equal(findPath(walled.snapshot(), { x: 11, y: 9 }, { x: 20, y: 7 }), null);
  assert.ok(findPath(walled.snapshot(), { x: 11, y: 9 }, { x: 20, y: 7 }, new Set()) !== null, 'sanity: open ground is reachable');
});

test('moveTo outside the base walks through the gate, never through the fence or a building', () => {
  const sim = newSim();
  const blocked = blockedTiles(sim.snapshot());
  call(sim, 'moveTo', 21, 9);
  const steps = walk(sim);
  assert.deepEqual(pos(sim), { x: 21, y: 9 });
  assert.ok(steps.some((p) => p.x === 16 && p.y === 7), 'passed through the gate');
  for (const p of steps) if (!(p.x === 16 && p.y === 7)) assert.ok(!blocked.has(`${p.x},${p.y}`), `stepped on blocked tile ${p.x},${p.y}`);
  assert.ok(steps.length >= 10, 'never shorter than the straight line');
});

test('the destination itself may be a blocked tile (walk up to the HQ)', () => {
  const sim = newSim();
  call(sim, 'moveTo', 'hq');
  walk(sim);
  assert.deepEqual(pos(sim), { x: 11, y: 7 });
});

test('no way through → the move fails with NO_PATH (and costs nothing more)', () => {
  const sim = newSim('stage1', 1, (st) => { st.buildings.gate.blocks = true; });
  call(sim, 'moveTo', 21, 9);
  runUntilIdle(sim, 100);
  const failed = sim.log.all().find((e) => e.type === 'action.failed');
  assert.ok(failed, 'an action.failed event');
  assert.equal(JSON.stringify(failed).includes('NO_PATH'), true);
  assert.deepEqual(pos(sim), { x: 11, y: 9 });
});

test('gather works through the gate: trips go out and come back, units conserved', () => {
  const sim = newSim();
  const blocked = blockedTiles(sim.snapshot());
  call(sim, 'gather', 'wood', 5, 5);
  const steps = [];
  while (!sim.isIdle() && sim.tick < 1500) { sim.step(1); steps.push(pos(sim)); }
  assert.equal(Object.keys(sim.snapshot().survivors.survivor_1.inventory.items).length, 0);
  for (const p of steps) if (!(p.x === 16 && p.y === 7)) assert.ok(!blocked.has(`${p.x},${p.y}`) || (p.x === 14 && p.y === 5) || (p.x === 11 && p.y === 7), `walked through ${p.x},${p.y}`);
  assert.ok(steps.some((p) => p.x === 16 && p.y === 7));
});

test('determinism: same inputs, same route and state hash', () => {
  const run = () => { const s = newSim('stage1', 7); call(s, 'gather', 'wood', 5, 10); s.step(300); return s.stateHash(); };
  assert.equal(run(), run());
});

test('a route is replanned when the next tile becomes blocked', () => {
  const state = createInitialState({ defs, scenarioId: 'stage1', seed: 1 });
  const sim = createSimulation({ defs, state });
  call(sim, 'moveTo', 21, 9);
  sim.step(3);
  state.buildings.gate.blocks = true; // the gate closes while she walks
  runUntilIdle(sim, 200);
  assert.ok(!(pos(sim).x > 16), 'she never gets out');
});
