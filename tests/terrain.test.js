import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssetResolver, buildPlaceholderManifest, placeholderManifestFor, GROUND_VARIANTS, terrainKey, tileVariant, groundGrid, tileKeyAt } from '../src/modules/assets/index.js';
import { paintTerrainTile } from '../src/modules/assets/terrain.js';
import { mountRenderer } from '../src/modules/render/index.js';
import { createViewport, cellRectCovering } from '../src/modules/viewport/index.js';
import { newSim, defs } from './helpers.js';

function fakeCanvas(w = 960, h = 640) {
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  return { width: w, height: h, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h }) };
}
const mount = (opts = {}) => mountRenderer(fakeCanvas(), { manifest: placeholderManifestFor(defs), createCanvas: () => fakeCanvas(), ...opts });
const clone = (o) => JSON.parse(JSON.stringify(o));

test('PA-2: tile variants are deterministic, in range, and every variant is used', () => {
  for (const [kind, n] of Object.entries(GROUND_VARIANTS)) {
    const seen = new Set();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++) { const v = tileVariant(x, y, n); assert.ok(v >= 1 && v <= n); assert.equal(v, tileVariant(x, y, n)); seen.add(v); }
    assert.equal(seen.size, n, `${kind}: all ${n} variants appear on a 24x16 map`);
  }
  assert.equal(tileVariant(3, 4, 1), 1);
});

test('PA-2: ground grid — grass outside, dirt yard and path, damaged under ruins, forest stays grass', () => {
  const frame = newSim().renderProjection();
  const g = groundGrid(frame);
  assert.equal(g.length, 16); assert.equal(g[0].length, 24);
  assert.equal(g[1][1], 'grass');
  assert.equal(g[4][7], 'dirt', 'inside the fence');
  assert.equal(g[7][18], 'dirt', 'forest path');
  assert.equal(g[5][14], 'damaged', 'ruined storehouse cell');
  assert.equal(g[7][11], 'dirt', 'repaired/standing HQ cell is plain yard');
  assert.equal(g[4][20], 'grass', 'forest');
});

test('PA-2: ground follows building state — a repaired building stops showing damaged ground', () => {
  const frame = clone(newSim().renderProjection());
  assert.equal(groundGrid(frame)[5][14], 'damaged');
  frame.buildings.find((b) => b.id === 'storage_1').condition = 'repaired';
  assert.equal(groundGrid(frame)[5][14], 'dirt');
});

test('PA-2: a zone may name its ground (soil for future fields); unknown names are ignored', () => {
  const frame = clone(newSim().renderProjection());
  frame.terrain.zones.push({ id: 'field', label: 'Field', x1: 1, y1: 1, x2: 2, y2: 2, ground: 'soil' }, { id: 'odd', label: 'Odd', x1: 4, y1: 1, x2: 4, y2: 1, ground: 'lava' });
  const g = groundGrid(frame);
  assert.equal(g[1][1], 'soil'); assert.equal(g[2][2], 'soil'); assert.equal(g[1][4], 'grass');
  assert.match(tileKeyAt(g, 1, 1), /^terrain_soil_0[12]$/);
});

test('PA-2: manifest has every terrain tile, fixed frame size; resolver fallback chain', () => {
  const m = buildPlaceholderManifest({});
  for (const [kind, n] of Object.entries(GROUND_VARIANTS)) for (let i = 1; i <= n; i++) { const f = m.frames[terrainKey(kind, i)]; assert.ok(f, `${kind} ${i}`); assert.equal(f.w, m.frame.w); assert.equal(f.h, m.frame.h); }
  const r = createAssetResolver(m);
  assert.equal(r.resolveTerrain('terrain_dirt_02').step, 1);
  delete m.animations.terrain_dirt_03;
  const same = createAssetResolver(m).resolveTerrain('terrain_dirt_03');
  assert.equal(same.step, 2); assert.equal(same.key, 'terrain_dirt_01');
  const unknown = createAssetResolver(m).resolveTerrain('terrain_lava_01');
  assert.equal(unknown.step, 3); assert.equal(unknown.key, 'terrain_grass_01');
  assert.equal(createAssetResolver({ ...m, animations: {}, frames: {} }).resolveTerrain('terrain_grass_01').key, null);
});

test('PA-2: placeholder tiles are fully opaque (64 blocks cover the tile) and leave the context untouched outside it', () => {
  const rects = []; const ctx = { fillRect: (x, y, w, h) => rects.push([x, y, w, h]) };
  for (const [ground, n] of Object.entries(GROUND_VARIANTS)) for (let i = 1; i <= n; i++) {
    rects.length = 0; paintTerrainTile(ctx, 100, 200, { ground, i });
    assert.equal(rects.slice(0, 64).length, 64);
    for (const [x, y, w, h] of rects) { assert.ok(x >= 100 && y >= 200 && x + w <= 132 + 1e-9 && y + h <= 232 + 1e-9, `${ground}_${i} stays inside its 32x32 frame`); }
  }
});

test('PA-2: the renderer draws exactly one tile per visible cell, all with exact assets', () => {
  const frame = newSim().renderProjection();
  const r = mount(); r.draw(frame);
  assert.equal(r.lastTerrain.length, 24 * 16);
  assert.ok(r.lastTerrain.every((t) => t.step === 1));
  assert.equal(new Set(r.lastTerrain.map((t) => `${t.x},${t.y}`)).size, 24 * 16, 'no cell drawn twice or skipped');
  assert.ok(new Set(r.lastTerrain.map((t) => t.key)).size > 4, 'variation, not one repeated tile');
  r.zoomAt(3, 480, 320); r.draw(frame);
  assert.ok(r.lastTerrain.length < 24 * 16, 'zoomed in: only visible cells are drawn');
});

test('PA-2: terrain is presentation only — same entity draw list, same state hash, any camera', () => {
  const sim = newSim(); const hash = sim.stateHash(); const frame = sim.renderProjection();
  const r = mount(); r.draw(frame);
  const base = r.lastDrawList.map((d) => [d.kind, d.id, d.x, d.y]);
  assert.ok(!r.lastDrawList.some((d) => d.kind === 'terrain'), 'ground tiles are not entities');
  r.setZoom(2.5); r.pan(2, 1); r.draw(frame);
  assert.deepEqual(r.lastDrawList.map((d) => [d.kind, d.id, d.x, d.y]), base);
  assert.equal(sim.stateHash(), hash);
});

test('PA-2: a manifest without terrain frames still draws (flat colour underneath)', () => {
  const m = placeholderManifestFor(defs);
  const bare = { ...m, frames: {}, animations: {} };
  const r = mountRenderer(fakeCanvas(), { manifest: bare, createCanvas: () => fakeCanvas() });
  assert.doesNotThrow(() => r.draw(newSim().renderProjection()));
  assert.ok(r.lastTerrain.every((t) => t.key === null));
});

test('PA-2: covering rects leave no gap or seam between neighbours at awkward cell sizes and zoom', () => {
  for (const [w, h, zoom] of [[960, 640, 1], [813, 517, 1], [390, 700, 1], [960, 640, 2.37], [411, 731, 3.1]]) {
    const vp = createViewport({ map: { width: 24, height: 16 }, view: { width: w, height: h }, zoom });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 23; x++) {
      const a = cellRectCovering(vp, x, y); const b = cellRectCovering(vp, x + 1, y);
      assert.ok(a.x + a.w >= b.x, `horizontal seam at ${x},${y} (${w}x${h} z${zoom})`);
      assert.ok(a.x + a.w - b.x < 1.0001, 'overlap stays under one pixel');
      if (y < 15) { const c = cellRectCovering(vp, x, y + 1); assert.ok(a.y + a.h >= c.y, `vertical seam at ${x},${y}`); }
    }
  }
});
