// Loader animation for art that is still loading (presentation only): pure helpers, the art caches' state(), and what the renderer draws.
// Loading = a calm pulse / shimmer; failed or no art = the plain placeholder (a loader must never loop forever).
import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim, defs } from './helpers.js';
import { mountRenderer } from '../src/modules/render/index.js';
import { nodeStage, placeholderManifestFor, createNodeArt, createBackdropArt, createBuildingArt, LOADER, loaderPulse, shimmerX, isLoading, nodeSpriteKey } from '../src/modules/assets/index.js';

test('loaderPulse breathes between 0 and 1, repeats every period and phase staggers neighbours', () => {
  assert.equal(loaderPulse(0), 0);
  assert.ok(Math.abs(loaderPulse(LOADER.pulseMs / 2) - 1) < 1e-9);
  assert.ok(Math.abs(loaderPulse(300) - loaderPulse(300 + LOADER.pulseMs)) < 1e-9);
  assert.notEqual(loaderPulse(300, 0), loaderPulse(300, 400));
  for (let t = -3000; t < 3000; t += 137) { const v = loaderPulse(t, 77); assert.ok(v >= 0 && v <= 1); }
});

test('shimmerX sweeps from left of the surface to right of it, then repeats', () => {
  assert.ok(shimmerX(0, 1000) < 0);
  assert.ok(shimmerX(LOADER.shimmerMs * 0.99, 1000) > 1000);
  assert.ok(shimmerX(500, 1000) < shimmerX(900, 1000));
  assert.ok(Math.abs(shimmerX(10, 800) - shimmerX(10 + LOADER.shimmerMs, 800)) < 1e-9);
});

test('isLoading is true only for the loading state', () => {
  assert.deepEqual(['none', 'loading', 'ready', 'failed', undefined].map(isLoading), [false, true, false, false, false]);
});

// A stand-in image: `complete` false = still loading, `fail()` = the file is missing.
const pendingImage = () => { const imgs = []; const make = () => { const img = { complete: false, naturalWidth: 0, width: 0 }; imgs.push(img); return img; }; return { make, imgs }; };

test('node art: state() is none without a loader, loading while pending, ready when loaded, failed on error', () => {
  const { make, imgs } = pendingImage(); const art = createNodeArt({ loadImage: make });
  assert.equal(art.state(null), 'none');
  assert.equal(art.state('tree_green_full_1'), 'loading'); assert.equal(art.get('tree_green_full_1'), null);
  Object.assign(imgs[0], { complete: true, naturalWidth: 10, width: 10 });
  assert.equal(art.state('tree_green_full_1'), 'ready'); assert.ok(art.get('tree_green_full_1'));
  assert.equal(art.state('tree_cut_1'), 'loading'); imgs[1].onerror();
  assert.equal(art.state('tree_cut_1'), 'failed'); assert.equal(art.get('tree_cut_1'), null);
});

test('backdrop and building art report the same four states; a wall level falls back to a lower one before it counts as failed', () => {
  const b = pendingImage(); const bd = createBackdropArt({ loadImage: b.make });
  assert.equal(bd.state('nope'), 'none'); assert.equal(bd.state('outpost'), 'loading');
  b.imgs[0].onerror(); assert.equal(bd.state('outpost'), 'failed');
  const c = pendingImage(); const ba = createBuildingArt({ loadImage: c.make });
  assert.equal(ba.state('hq', 'repaired'), 'loading'); assert.equal(ba.state('tower_x', 'repaired'), 'none');
  assert.equal(ba.levelState('fence', 3), 'loading');
  const l3 = c.imgs.length - 1; c.imgs[l3].onerror(); // level 3 file missing: level 2 is next in line, still loading
  assert.equal(ba.levelState('fence', 3), 'loading');
  assert.equal(ba.levelState('hq', 1), 'none', 'only walls and gates have level art');
});

// ---- renderer ----
function recorder(w = 1000, h = 640) {
  const log = { fillText: [], fillStyles: [], roundRect: 0, drawImage: 0 };
  const ctx = new Proxy({}, {
    get: (t, p) => (p in t ? t[p] : p === 'fillText' ? (...a) => log.fillText.push(a[0]) : p === 'roundRect' ? () => { log.roundRect++; } : p === 'drawImage' ? () => { log.drawImage++; } : () => {}),
    set: (t, p, v) => { if (p === 'fillStyle') log.fillStyles.push(v); t[p] = v; return true; },
  });
  return { log, canvas: { width: w, height: h, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h }) } };
}
const stub = (state, extra = {}) => ({ state: () => state, get: () => null, has: () => true, bands: () => ({}), key: (t, id, st) => nodeSpriteKey(t, id, st), getLevel: () => null, levelState: () => state, preload() {}, ...extra });
function draw(arts, scenario = 'stage1_outpost') {
  const { log, canvas } = recorder();
  const r = mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => recorder().canvas, now: () => 700, ...arts });
  r.draw(newSim(scenario).renderProjection());
  return log;
}

test('renderer: a loading backdrop shows the map loader (neutral ground + label), not the old green tiles', () => {
  const loading = draw({ backdropArt: stub('loading') });
  assert.ok(loading.fillText.includes(LOADER.label) && loading.fillStyles.includes(LOADER.ground));
  const failed = draw({ backdropArt: stub('failed') });
  assert.ok(!failed.fillText.includes(LOADER.label), 'a failed picture falls back to the plain tiles, no endless loader');
  assert.ok(failed.drawImage > 0, 'tiles are drawn instead');
  const none = draw({});
  assert.ok(!none.fillText.includes(LOADER.label));
});

test('renderer: trees, rocks and buildings that are still loading get pulsing spots; failed ones fall back to placeholders', () => {
  const loadingNodes = draw({ nodeArt: stub('loading'), buildingArt: stub('loading'), backdropArt: stub('ready', { get: () => ({ naturalWidth: 10, naturalHeight: 10 }) }) });
  const failedNodes = draw({ nodeArt: stub('failed'), buildingArt: stub('failed'), backdropArt: stub('ready', { get: () => ({ naturalWidth: 10, naturalHeight: 10 }) }) });
  const nodes = defs.scenarios.stage1_outpost.nodes.length;
  assert.ok(loadingNodes.roundRect >= nodes, `spots ${loadingNodes.roundRect} for ${nodes} nodes`);
  assert.equal(failedNodes.roundRect, 0, 'no loader once the picture failed');
  assert.ok(failedNodes.drawImage > loadingNodes.drawImage, 'the placeholder atlas draws for failed art, not for loading art');
});

test('renderer: a loading line-wall picture shows one pulsing strip instead of per-cell mock pieces', () => {
  const wall = draw({ buildingArt: stub('loading') });
  const ready = draw({ buildingArt: stub('failed') });
  assert.ok(wall.roundRect >= 1 && ready.roundRect === 0);
});

test('R0: a drained tree (amount 0) shows the cut tree picture, a full or worn one the standing tree', () => {
  assert.equal(nodeStage(0, 35), 'gone');
  for (const id of ['tree_1', 'tree_2', 'tree_7']) {
    assert.match(nodeSpriteKey('tree', id, nodeStage(0, 35)), /^tree_cut_[12]$/);
    assert.match(nodeSpriteKey('tree', id, nodeStage(10, 35)), /^tree_green_full_[12]$/);
  }
});
