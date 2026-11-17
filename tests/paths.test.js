import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssetResolver, buildPlaceholderManifest, placeholderManifestFor, pathKeyForMask, pathCells, PATH_KEYS } from '../src/modules/assets/index.js';
import { paintPathTile, N, E, S, W } from '../src/modules/assets/terrain.js';
import { mountRenderer } from '../src/modules/render/index.js';
import { newSim, defs } from './helpers.js';

function fakeCanvas(w = 960, h = 640) {
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  return { width: w, height: h, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h }) };
}
const mount = (opts = {}) => mountRenderer(fakeCanvas(), { manifest: placeholderManifestFor(defs), createCanvas: () => fakeCanvas(), ...opts });
const frameWith = (cells, gate = null) => ({ map: { width: 8, height: 8 }, terrain: { zones: [], paths: [{ id: 'p', cells }] }, buildings: gate ? [{ id: 'g', type: 'gate', x: gate[0], y: gate[1] }] : [] });
const at = (frame, x, y) => pathCells(frame).find((c) => c.x === x && c.y === y);

test('PA-3: 16 connection masks → 16 distinct, correctly named pieces', () => {
  assert.equal(new Set(PATH_KEYS).size, 16);
  assert.equal(pathKeyForMask(0), 'path_isolated');
  assert.equal(pathKeyForMask(N), 'path_end_n');
  assert.equal(pathKeyForMask(E | W), 'path_straight_h');
  assert.equal(pathKeyForMask(N | S), 'path_straight_v');
  assert.equal(pathKeyForMask(N | E), 'path_corner_ne');
  assert.equal(pathKeyForMask(S | W), 'path_corner_sw');
  assert.equal(pathKeyForMask(N | E | S), 'path_t_nes');
  assert.equal(pathKeyForMask(N | E | S | W), 'path_cross');
});

test('PA-3: straight, corner, T, cross and end pieces follow the neighbours', () => {
  const f = frameWith([[1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [3, 2], [3, 4], [3, 5], [6, 5], [5, 5], [4, 5]]);
  assert.equal(at(f, 1, 3).key, 'path_end_e');
  assert.equal(at(f, 2, 3).key, 'path_straight_h');
  assert.equal(at(f, 3, 3).key, 'path_cross');
  assert.equal(at(f, 3, 2).key, 'path_end_s');
  assert.equal(at(f, 3, 4).key, 'path_straight_v');
  assert.equal(at(f, 3, 5).key, 'path_corner_ne');
  assert.equal(at(f, 5, 5).key, 'path_straight_h');
  const t = frameWith([[2, 2], [3, 2], [4, 2], [3, 3]]);
  assert.equal(at(t, 3, 2).key, 'path_t_esw');
  assert.equal(at(frameWith([[4, 4]]), 4, 4).key, 'path_isolated');
});

test('PA-3: a gate next to a road end connects to it', () => {
  const f = frameWith([[3, 3], [4, 3]], [2, 3]);
  assert.equal(at(f, 3, 3).key, 'path_straight_h');
  assert.equal(at(frameWith([[3, 3], [4, 3]]), 3, 3).key, 'path_end_e');
});

test('PA-3: connections are symmetric and the order is stable (property over random layouts)', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let n = 0; n < 50; n++) {
    const cells = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (rnd() < 0.4) cells.push([x, y]);
    const out = pathCells(frameWith(cells)); const m = new Map(out.map((c) => [`${c.x},${c.y}`, c.mask]));
    assert.equal(out.length, cells.length);
    for (const c of out) {
      if (c.mask & E) assert.ok(m.get(`${c.x + 1},${c.y}`) & W); if (c.mask & W) assert.ok(m.get(`${c.x - 1},${c.y}`) & E);
      if (c.mask & N) assert.ok(m.get(`${c.x},${c.y - 1}`) & S); if (c.mask & S) assert.ok(m.get(`${c.x},${c.y + 1}`) & N);
    }
    assert.deepEqual(pathCells(frameWith([...cells].reverse())), out, 'input order does not change the result');
  }
});

test('PA-3: the stage-1 forest path leaves the gate: straight pieces, ending in the forest', () => {
  const frame = newSim().renderProjection();
  const p = pathCells(frame);
  assert.deepEqual(p.map((c) => [c.x, c.y, c.key]), [[17, 7, 'path_straight_h'], [18, 7, 'path_straight_h'], [19, 7, 'path_end_w']]);
});

test('PA-3: every piece exists in the atlas at the fixed frame size; painted arms reach exactly the connected edges', () => {
  const m = buildPlaceholderManifest({});
  for (const k of PATH_KEYS) { assert.ok(m.frames[k], k); assert.equal(m.frames[k].w, m.frame.w); assert.equal(m.frames[k].h, m.frame.h); }
  for (let mask = 0; mask < 16; mask++) {
    const rects = []; paintPathTile({ fillRect: (x, y, w, h) => rects.push([x, y, w, h]), set fillStyle(v) {} }, 0, 0, { mask });
    const touches = { N: rects.some(([, y]) => y === 0), S: rects.some(([, y, , h]) => y + h === 32), W: rects.some(([x]) => x === 0), E: rects.some(([x, , w]) => x + w === 32) };
    assert.deepEqual(touches, { N: !!(mask & N), S: !!(mask & S), W: !!(mask & W), E: !!(mask & E) }, `mask ${mask}`);
    for (const [x, y, w, h] of rects) assert.ok(x >= 0 && y >= 0 && x + w <= 32 && y + h <= 32);
  }
});

test('PA-3: resolver fallback — exact piece, then the isolated piece, then nothing', () => {
  const m = buildPlaceholderManifest({});
  assert.equal(createAssetResolver(m).resolvePath('path_cross').step, 1);
  delete m.animations.path_cross;
  const r = createAssetResolver(m).resolvePath('path_cross');
  assert.equal(r.step, 2); assert.equal(r.key, 'path_isolated');
  assert.equal(createAssetResolver({ ...m, animations: {}, frames: {} }).resolvePath('path_cross').key, null);
});

test('PA-3: the renderer draws one road piece per visible path cell; presentation only', () => {
  const sim = newSim(); const hash = sim.stateHash(); const frame = sim.renderProjection();
  const r = mount(); r.draw(frame);
  assert.equal(r.lastPaths.length, 3);
  assert.ok(r.lastPaths.every((p) => p.step === 1));
  assert.ok(!r.lastDrawList.some((d) => /path/.test(d.kind)));
  const base = r.lastDrawList.map((d) => [d.kind, d.id, d.x, d.y]);
  r.setZoom(3); r.centerOn(2, 2); r.draw(frame);
  assert.equal(r.lastPaths.length, 0, 'off screen: not drawn');
  assert.deepEqual(r.lastDrawList.map((d) => [d.kind, d.id, d.x, d.y]), base);
  assert.equal(sim.stateHash(), hash);
  const bare = mountRenderer(fakeCanvas(), { manifest: { ...placeholderManifestFor(defs), frames: {}, animations: {} }, createCanvas: () => fakeCanvas() });
  assert.doesNotThrow(() => bare.draw(frame));
  assert.equal(bare.lastPaths.length, 3);
});
