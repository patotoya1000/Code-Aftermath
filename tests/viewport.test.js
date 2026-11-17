import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createViewport, withView, gridToScreen, cellRect, cellCenter, cellFoot, screenToGrid, screenToCell, visibleCells,
  panBy, panByPixels, zoomAt, setZoom, centerOn, resetCamera, FOOT, ZOOM_MAX,
} from '../src/modules/viewport/index.js';
import { mountRenderer } from '../src/modules/render/index.js';
import { placeholderManifestFor } from '../src/modules/assets/index.js';
import { newSim, defs } from './helpers.js';

const MAP = { width: 24, height: 16 };
const view = (width, height) => ({ width, height });
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('PA-1: the default viewport is exactly the old "fit and centre" layout', () => {
  for (const [w, h] of [[960, 640], [800, 600], [375, 500], [1200, 300]]) {
    const vp = createViewport({ map: MAP, view: view(w, h) });
    const cell = Math.min(w / MAP.width, h / MAP.height);
    near(vp.cell, cell); near(vp.ox, (w - MAP.width * cell) / 2); near(vp.oy, (h - MAP.height * cell) / 2);
    near(cellFoot(vp, 3, 5).y, vp.oy + 5 * cell + cell * 0.92); assert.equal(FOOT, 0.92);
  }
});

test('PA-1: every cell has a stable position, cells tile with no gaps, and screen ↔ grid round-trips', () => {
  for (const integer of [false, true]) {
    let vp = createViewport({ map: MAP, view: view(960, 640), integer });
    for (const cam of [vp, zoomAt(vp, 2, 300, 200), panBy(setZoom(vp, 3), 4, -2)]) {
      for (let y = 0; y < MAP.height; y++) for (let x = 0; x < MAP.width; x++) {
        const r = cellRect(cam, x, y); const right = cellRect(cam, x + 1, y); const below = cellRect(cam, x, y + 1);
        near(r.x + r.w, right.x, 1e-6); near(r.y + r.h, below.y, 1e-6); // neighbours touch exactly
        const c = cellCenter(cam, x, y);
        assert.deepEqual(screenToCell(cam, c.x, c.y), { x, y });
        const g = screenToGrid(cam, c.x, c.y); near(g.x, x + 0.5, 1e-9); near(g.y, y + 0.5, 1e-9);
      }
    }
    assert.equal(screenToCell(vp, -5, -5), null, 'outside the map is a miss, never a clamped cell');
  }
});

test('PA-1: integer mode gives whole-pixel cells and origins (crisp pixel art)', () => {
  const vp = createViewport({ map: MAP, view: view(1000, 700), integer: true });
  assert.equal(vp.cell, Math.floor(1000 / 24)); assert.ok(Number.isInteger(vp.ox) && Number.isInteger(vp.oy));
  const z = zoomAt(vp, 2.5, 500, 350);
  assert.ok(Number.isInteger(z.cell) && Number.isInteger(z.ox) && Number.isInteger(z.oy));
  assert.ok(Number.isInteger(cellRect(z, 7, 9).x) && Number.isInteger(cellRect(z, 7, 9).w));
});

test('PA-1: camera rules — locked at zoom 1, clamped to the map, zoom keeps the point under the finger, bounded zoom', () => {
  const vp = createViewport({ map: MAP, view: view(960, 640) });
  assert.deepEqual(panBy(vp, 5, 5).center, vp.center, 'nothing to pan at zoom 1');
  const z = setZoom(vp, 2);
  const left = panBy(z, -100, -100); near(left.ox, 0, 1e-9); near(left.oy, 0, 1e-9); // top-left of the map reaches the canvas corner, no further
  const right = panBy(z, 100, 100); near(right.ox + MAP.width * right.cell, 960, 1e-9);
  const before = screenToGrid(z, 300, 200); const zoomed = zoomAt(z, 1.5, 300, 200); const after = screenToGrid(zoomed, 300, 200);
  near(before.x, after.x, 1e-9); near(before.y, after.y, 1e-9);
  assert.equal(setZoom(vp, 99).zoom, ZOOM_MAX); assert.equal(setZoom(vp, 0.1).zoom, 1);
  assert.equal(centerOn(z, 12, 8).center.x, 12);
  assert.deepEqual(resetCamera(z).center, { x: 12, y: 8 }); assert.equal(resetCamera(z).zoom, 1);
  near(panByPixels(z, -96, 0).center.x, z.center.x + 96 / z.cell, 1e-9);
});

test('PA-1: resizing keeps the camera; a different map recentres; empty canvases never produce NaN', () => {
  const z = panBy(setZoom(createViewport({ map: MAP, view: view(960, 640) }), 2), 3, 1);
  const r = withView(z, { view: view(480, 320) });
  assert.equal(r.zoom, 2); assert.ok(r.center.x > MAP.width / 2);
  assert.equal(withView(z, { map: { width: 10, height: 10 } }).zoom, 2);
  assert.deepEqual(withView(z, { map: { width: 10, height: 10 } }).center, { x: 5, y: 5 });
  const empty = createViewport({ map: MAP, view: view(0, 0) });
  assert.equal(screenToGrid(empty, 5, 5), null); assert.equal(screenToCell(empty, 5, 5), null);
  for (const v of [empty.cell, empty.ox, empty.oy, empty.center.x]) assert.ok(Number.isFinite(v));
  assert.equal(panBy(empty, 1, 1).cell, 0);
});

test('PA-1: visibleCells only lists what the canvas can show', () => {
  const vp = createViewport({ map: MAP, view: view(960, 640) });
  assert.deepEqual(visibleCells(vp), { x1: 0, y1: 0, x2: 23, y2: 15 });
  const z = setZoom(vp, 4);
  const v = visibleCells(z);
  assert.ok(v.x2 - v.x1 + 1 <= 7 && v.y2 - v.y1 + 1 <= 5, JSON.stringify(v));
  assert.ok(Object.isFrozen(vp) && Object.isFrozen(vp.center));
});

// ---- the renderer uses it, and the camera cannot reach gameplay ----
function fakeCanvas(w = 960, h = 640) {
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  return { width: w, height: h, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h }) };
}
const mount = (opts = {}) => mountRenderer(fakeCanvas(), { manifest: placeholderManifestFor(defs), createCanvas: () => fakeCanvas(), ...opts });
const logical = (r) => r.lastDrawList.map((d) => [d.kind, d.id, d.x, d.y]);

test('PA-1: moving or zooming the camera changes pixels only — logical positions and the state hash stay identical', () => {
  const sim = newSim();
  const hash = sim.stateHash();
  const frame = sim.renderProjection();
  const r = mount(); r.draw(frame);
  const base = logical(r);
  assert.ok(base.length > 5);
  r.zoomAt(2, 300, 200); r.pan(3, 2); r.draw(frame);
  assert.deepEqual(logical(r), base, 'the draw list names the same entities at the same grid cells');
  r.setZoom(3.5); r.panPixels(40, -25); r.draw(frame);
  assert.deepEqual(logical(r), base);
  assert.equal(sim.stateHash(), hash, 'the simulation never saw the camera');
});

test('PA-1: picking follows the camera — the same tap on the same cell finds the same thing at any zoom or pan', () => {
  const frame = newSim().renderProjection();
  const r = mount(); r.draw(frame);
  const target = frame.buildings.find((b) => !b.bounds); // hq, tent, …
  const at = () => cellCenter(r.viewport, target.x, target.y);
  const plain = r.pick(at().x, at().y, frame);
  assert.deepEqual(plain, { kind: 'building', id: target.id });
  r.zoomAt(2.5, at().x, at().y); r.pan(1, 1); r.draw(frame);
  assert.deepEqual(r.pick(at().x, at().y, frame), plain);
  assert.deepEqual(r.screenToTile(at().x, at().y), { x: target.x, y: target.y });
  r.resetCamera(); r.draw(frame);
  assert.deepEqual(r.pick(at().x, at().y, frame), plain);
});

test('PA-1: the renderer has no coordinate math of its own', () => {
  const src = readFileSync(new URL('../src/modules/render/index.js', import.meta.url), 'utf8');
  for (const w of ['offsetX', 'offsetY']) assert.equal(new RegExp(`\\b${w}\\b`).test(src), false, `${w} is back in the renderer`);
  assert.match(src, /from '\.\.\/viewport\/index\.js'/);
  assert.equal(/\bscale\b/.test(src), false, 'a stray private scale variable');
});

test('PA-1: the "nothing resolved" marker still draws (it once referenced a removed variable)', () => {
  const frame = newSim().renderProjection();
  const empty = { ...placeholderManifestFor(defs), frames: {}, animations: {}, sheet: placeholderManifestFor(defs).sheet };
  assert.doesNotThrow(() => { const r = mountRenderer(fakeCanvas(), { manifest: empty, createCanvas: () => fakeCanvas() }); r.draw(frame); });
});
