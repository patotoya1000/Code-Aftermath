import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { blockedTiles, findPath } from '../src/modules/buildings/index.js';
import { buildingRect, buildingCells, buildingPlacement, groundGrid } from '../src/modules/assets/index.js';
import { mountRenderer } from '../src/modules/render/index.js';
import { cellCenter } from '../src/modules/viewport/index.js';
import { placeholderManifestFor } from '../src/modules/assets/index.js';

const HQ_CELLS = []; for (let y = 5; y <= 7; y++) for (let x = 10; x <= 12; x++) HQ_CELLS.push([x, y]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const rejects = (mutate, pattern) => { const d = structuredClone(defs); mutate(d); assert.throws(() => createDefinitions({ scenarios: d.scenarios, buildings: d.buildings }), pattern); };
const pos = (sim) => ({ ...sim.snapshot().survivors.survivor_1.position });

function recordingCanvas(w = 960, h = 640) {
  const calls = { drawImage: [], strokeRect: [] };
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : p === 'drawImage' ? (...a) => calls.drawImage.push(a) : p === 'strokeRect' ? (...a) => calls.strokeRect.push(a) : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  return { calls, canvas: { width: w, height: h, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h }) } };
}
const mount = () => { const { calls, canvas } = recordingCanvas(); const r = mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => recordingCanvas().canvas }); return { r, calls }; };

// ---------- logic ----------
test('PA-5: the HQ owns a 3x3 footprint; its (x, y) stays the door; other buildings stay 1x1', () => {
  const st = newSim().snapshot();
  assert.deepEqual(st.buildings.hq.footprint, { x1: 10, y1: 5, x2: 12, y2: 7 });
  assert.deepEqual([st.buildings.hq.x, st.buildings.hq.y], [11, 7], 'the door cell');
  for (const id of Object.keys(st.buildings).filter((i) => i !== 'hq')) assert.equal(st.buildings[id].footprint, undefined, id);
});

test('PA-5: every footprint cell blocks walking; the rest of the base is unchanged', () => {
  const b = blockedTiles(newSim().snapshot());
  for (const [x, y] of HQ_CELLS) assert.ok(b.has(`${x},${y}`), `${x},${y}`);
  assert.ok(!b.has('11,8') && !b.has('10,8') && !b.has('9,7'), 'cells just outside are open');
  assert.ok(b.has('8,6') && b.has('14,5'), 'tent and storehouse still block their own tile');
});

test('PA-5: survivors walk to the door, never through the building', () => {
  const sim = newSim();
  call(sim, 'moveTo', 'hq'); runUntilIdle(sim);
  assert.deepEqual(pos(sim), { x: 11, y: 7 }, 'arrived at the door');
  const st = sim.snapshot();
  const west = findPath(st, { x: 9, y: 6 }, { x: 13, y: 6 });
  assert.ok(west && west.length > 4, 'a route from one side to the other goes around');
  for (const t of west) assert.ok(!HQ_CELLS.some(([x, y]) => x === t.x && y === t.y), `route enters the HQ at ${t.x},${t.y}`);
  const toDoor = findPath(st, { x: 15, y: 9 }, { x: 11, y: 7 });
  assert.equal(toDoor.at(-1).x, 11); assert.equal(toDoor.at(-1).y, 7);
  assert.ok(toDoor.slice(0, -1).every((t) => !HQ_CELLS.some(([x, y]) => x === t.x && y === t.y)), 'only the last step (the door) is inside');
});

test('PA-5: the work loop still works with a blocked HQ (gather → carry → deposit)', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood', 5, 5); runUntilIdle(sim, 3000);
  const st = sim.snapshot();
  assert.ok(st.survivors.survivor_1.lastTask, 'finished with a reason');
  assert.equal(st.ledger['stock.wood'].total, 5, 'all five units reached base stock through the HQ door');
  assert.equal(st.survivors.survivor_1.lastTask.reason, 'TARGET_REACHED');
});

test('PA-5: same scenario + seed ⇒ same hash (footprint is part of state, deterministically)', () => {
  assert.equal(newSim().stateHash(), newSim().stateHash());
  const a = newSim(); const b = newSim(); call(a, 'moveTo', 'hq'); call(b, 'moveTo', 'hq'); runUntilIdle(a); runUntilIdle(b);
  assert.equal(a.stateHash(), b.stateHash());
});

test('PA-5: definition + layout validation for footprints', () => {
  rejects((d) => { d.buildings.hq.footprint = { x: 1, y: 0, w: 2, h: 1 }; }, /must contain the door cell/);
  rejects((d) => { d.buildings.hq.footprint = { x: 0, y: 0, w: 0, h: 1 }; }, /footprint needs whole numbers/);
  rejects((d) => { d.buildings.gate.footprint = { x: 0, y: 0, w: 1, h: 1 }; }, /perimeter building/);
  rejects((d) => { d.scenarios.stage1.buildings.find((b) => b.id === 'tent_1').x = 10; d.scenarios.stage1.buildings.find((b) => b.id === 'tent_1').y = 5; }, /overlaps|shares a tile/);
  rejects((d) => { d.scenarios.stage1.buildings.find((b) => b.id === 'hq').y = 3; }, /touches the fence line|outside the map/);
  rejects((d) => { d.scenarios.stage1.survivors[0].x = 11; d.scenarios.stage1.survivors[0].y = 6; }, /starts inside the footprint/);
  rejects((d) => { d.scenarios.stage1.buildings.find((b) => b.id === 'hq').x = 0; }, /outside the map|touches the fence/);
});

// ---------- rendering ----------
test('PA-5: building cells and sprite placement come from the footprint (1x1 when none)', () => {
  const frame = newSim().renderProjection();
  const hq = frame.buildings.find((b) => b.id === 'hq'); const tent = frame.buildings.find((b) => b.id === 'tent_1');
  assert.deepEqual(buildingRect(hq), { x1: 10, y1: 5, x2: 12, y2: 7 });
  assert.deepEqual(buildingCells(hq), HQ_CELLS);
  assert.deepEqual(buildingPlacement(hq), { gx: 11, gy: 7, size: 3 });
  assert.deepEqual(buildingCells(tent), [[8, 6]]);
  assert.deepEqual(buildingPlacement(tent), { gx: 8, gy: 6, size: 1 });
});

test('PA-5: the HQ sprite is drawn three cells wide, centred on its footprint, resting on its bottom row', () => {
  const frame = newSim().renderProjection(); const { r, calls } = mount(); r.draw(frame);
  const cell = r.viewport.cell; const c = cellCenter(r.viewport, 11, 7);
  const hit = calls.drawImage.find((a) => a.length === 9 && Math.abs(a[7] - 3 * cell) < 0.01);
  assert.ok(hit, 'a sprite exactly 3 cells wide');
  assert.ok(Math.abs(hit[5] + hit[7] / 2 - c.x) < 0.01, 'centred on the middle column');
  assert.ok(hit[6] + hit[8] <= cellCenter(r.viewport, 11, 7).y + cell * 0.5 + 0.01, 'does not hang below the footprint');
  assert.ok(r.lastDrawList.find((e) => e.id === 'hq').footprint, 'draw list carries the footprint');
});

test('PA-5: tapping any footprint cell selects the building; the cell next to it does not', () => {
  const frame = newSim().renderProjection(); const { r } = mount(); r.draw(frame);
  for (const [x, y] of HQ_CELLS) { const p = cellCenter(r.viewport, x, y); assert.deepEqual(r.pick(p.x, p.y, frame), { kind: 'building', id: 'hq' }, `${x},${y}`); }
  const out = cellCenter(r.viewport, 13, 6); assert.notDeepEqual(r.pick(out.x, out.y, frame), { kind: 'building', id: 'hq' });
  r.setZoom(2.2); r.draw(frame);
  const p = cellCenter(r.viewport, 12, 5); assert.deepEqual(r.pick(p.x, p.y, frame), { kind: 'building', id: 'hq' }, 'also under a zoomed camera');
});

test('PA-5: the selection outline covers the whole footprint', () => {
  const frame = newSim().renderProjection(); const { r, calls } = mount(); r.select('building', 'hq'); r.draw(frame);
  const cell = r.viewport.cell; const tl = cellCenter(r.viewport, 10, 5);
  const o = calls.strokeRect.find((a) => Math.abs(a[2] - (3 * cell - 2)) < 0.01 && Math.abs(a[3] - (3 * cell - 2)) < 0.01);
  assert.ok(o, 'a 3x3 outline'); assert.ok(Math.abs(o[0] - (tl.x - cell / 2 + 1)) < 0.01);
});

test('PA-5: ground under a ruined or damaged multi-cell building is damaged ground, all of it', () => {
  const frame = clone(newSim().renderProjection());
  const hq = frame.buildings.find((b) => b.id === 'hq');
  hq.condition = 'repaired'; assert.ok(HQ_CELLS.every(([x, y]) => groundGrid(frame)[y][x] === 'dirt'));
  hq.condition = 'ruined'; assert.ok(HQ_CELLS.every(([x, y]) => groundGrid(frame)[y][x] === 'damaged'));
});

test('PA-5: the camera never changes a footprint; the simulation never sees the renderer', () => {
  const sim = newSim(); const hash = sim.stateHash(); const frame = sim.renderProjection(); const { r } = mount();
  r.draw(frame); const base = JSON.stringify(r.lastDrawList.find((e) => e.id === 'hq'));
  r.setZoom(3); r.pan(2, 1); r.draw(frame);
  assert.equal(JSON.stringify(r.lastDrawList.find((e) => e.id === 'hq')), base);
  assert.equal(sim.stateHash(), hash);
});

test('PA-5: upgrading changes the art, not the footprint (the HQ keeps its 3x3 at level 2)', () => {
  const sim = newSim(); const frame = clone(sim.renderProjection());
  const hq = frame.buildings.find((b) => b.id === 'hq'); hq.level = 2; hq.condition = 'repaired'; hq.assetKey = 'building_hq_lv2_repaired';
  const { r } = mount(); r.draw(frame);
  const e = r.lastDrawList.find((d) => d.id === 'hq');
  assert.equal(e.key, 'building_hq_lv2_repaired');
  assert.deepEqual(e.footprint, { x1: 10, y1: 5, x2: 12, y2: 7 });
});
