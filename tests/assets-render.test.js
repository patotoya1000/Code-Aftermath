import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssetResolver, buildPlaceholderManifest, placeholderManifestFor, directionsByCloseness, frameIndexAt, npcKey } from '../src/modules/assets/index.js';
import { mountRenderer, perimeterCells } from '../src/modules/render/index.js';
import { newSim, call, runUntilIdle, defs } from './helpers.js';

// Minimal recording canvas so the renderer can run in Node.
function fakeCanvas(w = 960, h = 640) {
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  const c = { width: w, height: h, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h }) };
  return c;
}
const mount = (opts = {}) => mountRenderer(fakeCanvas(), { manifest: placeholderManifestFor(defs), createCanvas: () => fakeCanvas(), ...opts });

test('asset keys follow the semantic naming convention', () => {
  assert.equal(npcKey('walk', 'DOWN_RIGHT'), 'npc_survivor_walk_down_right');
  const r = createAssetResolver(placeholderManifestFor(defs));
  assert.equal(r.resolveNpc({ animation: 'WALK', direction: 'DOWN_RIGHT' }).key, 'npc_survivor_walk_down_right');
  assert.equal(r.resolveBuilding({ type: 'fence', level: 1, condition: 'ruined' }).key, 'building_fence_lv1_ruined');
});

test('placeholder atlas: fixed frame size, shared pivot, all 8 directions', () => {
  const m = buildPlaceholderManifest({});
  for (const f of Object.values(m.frames)) { assert.equal(f.w, m.frame.w); assert.equal(f.h, m.frame.h); }
  for (const d of ['UP', 'UP_RIGHT', 'RIGHT', 'DOWN_RIGHT', 'DOWN', 'DOWN_LEFT', 'LEFT', 'UP_LEFT']) assert.ok(m.animations[npcKey('idle', d)], d);
});

test('fallback chain: missing frame → nearest direction → generic → idle → safe default', () => {
  const m = buildPlaceholderManifest({});
  const steps = (mm, req) => createAssetResolver(mm).resolveNpc(req);
  assert.equal(steps(m, { animation: 'WALK', direction: 'UP' }).step, 1);

  delete m.animations[npcKey('walk', 'UP')];
  const near = steps(m, { animation: 'WALK', direction: 'UP' });
  assert.equal(near.step, 2);
  assert.match(near.key, /^npc_survivor_walk_(up_right|up_left)$/);

  for (const d of Object.keys(m.animations).filter((k) => k.startsWith('npc_survivor_walk_'))) delete m.animations[d];
  const idle = steps(m, { animation: 'WALK', direction: 'UP' });
  assert.equal(idle.step, 4);
  assert.equal(idle.key, npcKey('idle', 'UP'));

  for (const d of Object.keys(m.animations).filter((k) => k !== npcKey('idle', 'DOWN'))) delete m.animations[d];
  assert.equal(steps(m, { animation: 'GATHER', direction: 'LEFT' }).step, 5);

  delete m.animations[npcKey('idle', 'DOWN')];
  assert.equal(steps(m, { animation: 'WALK', direction: 'LEFT' }).step, 6, 'nothing left: renderer draws a marker, never throws');
});

test('nearest-direction ordering is circular', () => {
  assert.deepEqual(directionsByCloseness('UP').slice(0, 3), ['UP', 'UP_RIGHT', 'UP_LEFT']);
  assert.equal(directionsByCloseness('UP_LEFT')[1], 'UP');
});

test('animation player is presentation-only and loops frames by time', () => {
  const e = createAssetResolver(buildPlaceholderManifest({})).resolveNpc({ animation: 'WALK', direction: 'DOWN' });
  assert.equal(e.frames.length, 2);
  assert.notEqual(frameIndexAt(e, 0), frameIndexAt(e, 1000 / e.fps + 1));
  assert.equal(frameIndexAt(createAssetResolver(buildPlaceholderManifest({})).resolveNpc({ animation: 'IDLE', direction: 'DOWN' }), 5000), 0);
});

test('renderer draws the fence perimeter from authoritative bounds (not one tile)', () => {
  const sim = newSim();
  const r = mount();
  r.draw(sim.renderProjection());
  const fence = sim.renderProjection().buildings.find((b) => b.id === 'fence');
  const drawn = r.lastDrawList.filter((e) => e.layer === 'fence');
  assert.equal(perimeterCells({ x1: 6, y1: 3, x2: 16, y2: 12 }).length, 38);
  assert.equal(drawn.length, perimeterCells(fence.bounds).length - 1, 'every perimeter cell except the one the gate stands on');
  assert.ok(!drawn.some((e) => e.x === 16 && e.y === 7), 'the gate cell is left open');
  assert.ok(r.lastDrawList.some((e) => e.kind === 'building' && e.id === 'hq'));
  assert.ok(r.lastDrawList.some((e) => e.kind === 'building' && e.id === 'tent_1'));
  assert.ok(r.lastDrawList.some((e) => e.kind === 'building' && e.id === 'gate' && e.condition === 'damaged'));
  assert.ok(r.lastDrawList.some((e) => e.kind === 'building' && e.id === 'storage_1' && e.condition === 'ruined'));
  assert.equal(r.lastDrawList.filter((e) => e.kind === 'node').length, 4);
  assert.equal(r.lastDrawList.filter((e) => e.kind === 'npc').length, 1);
});

test('renderer is projection-only: it runs from plain data with no GameState', () => {
  const frame = JSON.parse(JSON.stringify(newSim().renderProjection()));
  const r = mount();
  assert.doesNotThrow(() => r.draw(frame));
});

test('building visual changes only through simulation state (ruined → damaged → repaired)', () => {
  const sim = newSim('stage1', 5, (s) => { s.ledger['stock.wood'].total = 10; });
  const r = mount();
  r.draw(sim.renderProjection());
  assert.equal(r.lastDrawList.find((e) => e.layer === 'fence').key, 'building_fence_lv1_ruined');
  call(sim, 'repair', 'fence'); runUntilIdle(sim);
  r.draw(sim.renderProjection());
  assert.equal(r.lastDrawList.find((e) => e.layer === 'fence').key, 'building_fence_lv1_damaged');
  call(sim, 'repair', 'fence'); runUntilIdle(sim);
  r.draw(sim.renderProjection());
  assert.equal(r.lastDrawList.find((e) => e.layer === 'fence').key, 'building_fence_lv1_repaired');
});

test('NPC projection goes IDLE → WALK → GATHER → IDLE and the renderer follows without deciding anything', () => {
  const sim = newSim();
  const r = mount();
  const seen = [];
  call(sim, 'gather', 'wood', 5, 5);
  for (let i = 0; i < 400; i++) {
    sim.step(1);
    r.draw(sim.renderProjection());
    const a = r.lastDrawList.find((e) => e.kind === 'npc').animation;
    if (seen[seen.length - 1] !== a) seen.push(a);
    if (sim.isIdle()) break;
  }
  assert.deepEqual(seen, ['WALK', 'GATHER', 'IDLE']);
});

test('deleting an animation frame does not change gameplay and the renderer falls back', () => {
  const a = newSim(); const b = newSim();
  call(a, 'gather', 'wood', 5, 5); call(b, 'gather', 'wood', 5, 5);
  const manifest = placeholderManifestFor(defs);
  delete manifest.animations[npcKey('walk', 'DOWN_RIGHT')];
  const ra = mount({ manifest }); const rb = mount();
  for (let i = 0; i < 400 && !a.isIdle(); i++) { a.step(1); b.step(1); ra.draw(a.renderProjection()); rb.draw(b.renderProjection()); }
  assert.equal(a.stateHash(), b.stateHash());
});

test('pick() selects survivors, nodes, buildings and the fence perimeter', () => {
  const sim = newSim();
  const r = mount(); const f = sim.renderProjection(); r.draw(f);
  const px = (tx, ty) => { const t = 960 / 24; const ox = 0; const oy = (640 - 16 * t) / 2; return [ox + tx * t + t / 2, oy + ty * t + t / 2]; };
  assert.deepEqual(r.pick(...px(11, 9), f), { kind: 'npc', id: 'survivor_1' });
  assert.deepEqual(r.pick(...px(20, 4), f), { kind: 'node', id: 'tree_1' });
  assert.deepEqual(r.pick(...px(11, 7), f), { kind: 'building', id: 'hq' });
  assert.deepEqual(r.pick(...px(6, 8), f), { kind: 'building', id: 'fence' });
  assert.equal(r.pick(...px(1, 1), f), null);
});
