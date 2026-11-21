// Wall + gate LEVEL pictures (wall_level1-5, gate_level1-5) and the top / bottom silhouette bands: layout maths, art loading, what the renderer draws, and the files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { wallSections, artLevel, WALL_SECTION_CELLS, createBuildingArt, createBackdropArt, bandLayout, BACKDROP_BANDS, BAND_TUNING, placeholderManifestFor } from '../src/modules/assets/index.js';
import { mountRenderer } from '../src/modules/render/index.js';
import { createDefinitions } from '../src/modules/definitions/index.js';

const defs = createDefinitions();
const png = (rel) => { const b = readFileSync(new URL(`../${rel}`, import.meta.url)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), sig: b.subarray(1, 4).toString() }; };

// ---------------------------------------------------------------- layout maths
test('wall sections cover the wall exactly: no gap, no overlap, the gate section centred on the gate', () => {
  const s = wallSections({ top: 0, bottom: 16, gates: [6] });
  assert.equal(s[0].y0, 0); assert.equal(s.at(-1).y1, 16);
  for (let i = 1; i < s.length; i++) assert.ok(Math.abs(s[i].y0 - s[i - 1].y1) < 1e-9, `section ${i} meets the one above it`);
  const gates = s.filter((q) => q.kind === 'gate'); assert.equal(gates.length, 1);
  assert.equal(gates[0].gateY, 6); assert.equal((gates[0].y0 + gates[0].y1) / 2, 6.5, 'centred on the gate cell');
  assert.equal(gates[0].y1 - gates[0].y0, WALL_SECTION_CELLS);
});

test('the outpost wall (16 rows, gate at row 6) stretches every wall section by well under 20 %', () => {
  for (const q of wallSections({ top: 0, bottom: 16, gates: [6] }).filter((x) => x.kind === 'wall')) {
    const k = (q.y1 - q.y0) / WALL_SECTION_CELLS; assert.ok(k > 0.8 && k < 1.2, `a wall section is ${(q.y1 - q.y0).toFixed(2)} cells`);
  }
});

test('a gate near an edge slides inwards instead of leaving the wall; no gate = only wall sections; no wall = nothing', () => {
  const top = wallSections({ top: 0, bottom: 16, gates: [0] }); assert.equal(top[0].kind, 'gate'); assert.equal(top[0].y0, 0);
  const bottom = wallSections({ top: 0, bottom: 16, gates: [15] }); assert.equal(bottom.at(-1).kind, 'gate'); assert.equal(bottom.at(-1).y1, 16);
  assert.ok(wallSections({ top: 0, bottom: 16 }).every((q) => q.kind === 'wall'));
  assert.deepEqual(wallSections({ top: 3, bottom: 3 }), []);
  const two = wallSections({ top: 0, bottom: 20, gates: [5, 7] }); assert.equal(two.filter((q) => q.kind === 'gate').length, 2);
  for (let i = 1; i < two.length; i++) assert.ok(Math.abs(two[i].y0 - two[i - 1].y1) < 1e-9);
});

test('the art level is the building level, kept within 1-5', () => {
  assert.deepEqual([0, 1, 2.9, 5, 9, undefined, 'x'].map(artLevel), [1, 1, 2, 5, 5, 1, 1]);
});

// ---------------------------------------------------------------- level art loading
const fakeLoader = (urls, { ready = true, fail = [] } = {}) => (url) => { const i = { url, complete: ready, naturalWidth: ready ? 340 : 0, naturalHeight: ready ? 670 : 0 }; urls.push(i); if (fail.some((f) => url.includes(f))) { i.complete = true; i.naturalWidth = 0; setTimeout(() => i.onerror?.(), 0); } return i; };

test('level art: preload asks for every wall and gate level, the picture is null until loaded, and its width is in grid cells', () => {
  const imgs = []; const art = createBuildingArt({ loadImage: fakeLoader(imgs, { ready: false }) });
  art.preload();
  assert.deepEqual(imgs.map((i) => i.url).sort(), [1, 2, 3, 4, 5].flatMap((n) => [`assets/sprites/buildings/gate_level${n}.png`, `assets/sprites/buildings/wall_level${n}.png`]).sort());
  assert.equal(art.getLevel('fence', 1, 'repaired'), null, 'still loading: the old piece stands in');
  for (const i of imgs) { i.complete = true; i.naturalWidth = 340; i.naturalHeight = 670; }
  const g = art.getLevel('fence', 3, 'repaired'); assert.equal(g.level, 3); assert.equal(g.alpha, 1);
  assert.ok(Math.abs(g.w - 340 / (670 / WALL_SECTION_CELLS)) < 1e-9, 'a 340 px wide picture of a 670 px tall section is ~2 cells wide');
  assert.equal(art.getLevel('tower', 1, 'repaired'), null, 'no level art for other buildings');
  assert.equal(art.hasLevelArt('gate'), true); assert.equal(art.hasLevelArt('tent'), false);
});

test('a level without a picture falls back to the next lower one, never to a higher one', () => {
  const imgs = []; const art = createBuildingArt({ loadImage: fakeLoader(imgs, { fail: ['wall_level4', 'wall_level5'] }) });
  art.getLevel('fence', 5, 'repaired'); art.getLevel('fence', 4, 'repaired');
  for (const i of imgs) i.onerror?.();
  assert.equal(art.getLevel('fence', 5, 'repaired').level, 3, 'levels 5 and 4 are missing, so level 3 is used');
  assert.equal(art.getLevel('fence', 2, 'repaired').level, 2, 'level 2 exists and is used as it is');
  assert.equal(art.getLevel('fence', 99, 'repaired').level, 3, 'a level beyond the art is clamped, then falls back');
});

test('damaged and ruined walls are the same picture darkened (a copy made once); repaired draws the picture itself', () => {
  const made = []; const createCanvas = (w, h) => { const ops = []; const c = { w, h, ops, getContext: () => new Proxy({}, { get: (t, p) => (p in t ? t[p] : (...a) => ops.push([p, ...a])), set: (t, p, v) => { t[p] = v; ops.push(['set', p, v]); return true; } }) }; made.push(c); return c; };
  const imgs = []; const art = createBuildingArt({ loadImage: fakeLoader(imgs), createCanvas });
  const ok = art.getLevel('gate', 1, 'repaired'); assert.equal(ok.img, imgs.find((i) => i.url.endsWith('gate_level1.png'))); assert.equal(made.length, 0);
  const dmg = art.getLevel('gate', 1, 'damaged'); const rn = art.getLevel('gate', 1, 'ruined');
  assert.equal(made.length, 2); assert.notEqual(dmg.img, ok.img); assert.ok(rn.alpha < 1 && dmg.alpha === 1);
  assert.ok(made[0].ops.some((o) => o[0] === 'set' && o[1] === 'globalCompositeOperation' && o[2] === 'source-atop'), 'the shade only paints where the picture already has pixels');
  assert.equal(art.getLevel('gate', 1, 'ruined').img, rn.img); assert.equal(made.length, 2, 'cached');
});

// ---------------------------------------------------------------- silhouette bands
const SPEC = BACKDROP_BANDS.outpost;
const lay = (side, o = {}) => bandLayout({ side, view: { w: 1600, h: 900 }, world: { y: 130, h: 640 }, cell: 40, image: side === 'top' ? { w: 1344, h: 294 } : { w: 1344, h: 212 }, spec: SPEC[side], ...o });

test('the top band stands on the map\'s top edge, the bottom band hangs from its bottom edge (both overlap the map a little)', () => {
  const t = lay('top'); const b = lay('bottom'); const ov = BAND_TUNING.overlapCells * 40;
  assert.ok(Math.abs(t.edgeY - (130 + ov)) < 1e-9); assert.ok(Math.abs(t.y + SPEC.top.edge * t.scale - t.edgeY) < 1e-9, 'the mass\'s flat bottom row lies on the edge');
  assert.ok(Math.abs(b.edgeY - (770 - ov)) < 1e-9); assert.ok(Math.abs(b.y + SPEC.bottom.edge * b.scale - b.edgeY) < 1e-9, 'the tree line lies on the edge');
  assert.ok(t.y < 130 && t.y + t.h > 130, 'the top band reaches above the map and down onto it');
});

test('a band fills the margin it is given and never gets wider than the picture\'s natural fit', () => {
  const t = lay('top'); assert.ok(t.y <= 0 + 1e-6 || t.scale <= (1600 * 1.25) / 1344 + 1e-9);
  const tall = bandLayout({ side: 'top', view: { w: 1600, h: 2400 }, world: { y: 880, h: 640 }, cell: 40, image: { w: 1344, h: 294 }, spec: SPEC.top });
  assert.ok(tall.scale <= (1600 * (1 + BAND_TUNING.parallaxExtra * 0.5)) / 1344 + 1e-9, 'a huge margin does not blow the picture up past the cover width');
});

test('with no margin at all a band is still minCells tall (it overlaps the map instead of vanishing)', () => {
  const t = bandLayout({ side: 'top', view: { w: 1600, h: 640 }, world: { y: 0, h: 640 }, cell: 40, image: { w: 1344, h: 294 }, spec: SPEC.top });
  assert.ok(Math.abs((SPEC.top.edge - SPEC.top.first) * t.scale - BAND_TUNING.minCells * 40) < 1e-6);
});

test('tiles cover the whole canvas width, neighbours are mirrored, and parallax 0 never slides', () => {
  const l = lay('top', { view: { w: 1600, h: 900 } });
  assert.ok(l.tiles[0].x <= 0 + 1e-6); const last = l.tiles.at(-1); assert.ok(last.x + l.tileW >= 1600 - 1e-6);
  for (let i = 1; i < l.tiles.length; i++) { assert.ok(Math.abs(l.tiles[i].x - (l.tiles[i - 1].x + l.tileW)) < 1e-6); assert.notEqual(l.tiles[i].flip, l.tiles[i - 1].flip); }
  const still = lay('bottom', { parallax: 0, t: 0 }); const still2 = lay('bottom', { parallax: 0, t: 1 }); assert.deepEqual(still.tiles, still2.tiles);
  const a = lay('top', { parallax: 1, t: 0 }); const b = lay('top', { parallax: 1, t: 1 }); assert.ok(a.tiles[0].x > b.tiles[0].x, 'panning right slides the layer left, slower than the map');
  const c = lay('top', { parallax: 1, t: 0.5 }); assert.ok(a.tiles[0].x >= c.tiles[0].x && c.tiles[0].x >= b.tiles[0].x);
});

test('backdrop art serves the silhouettes: absent until loaded, present once loaded, none for a backdrop without them', () => {
  const imgs = []; const art = createBackdropArt({ loadImage: (url) => { const i = { url, complete: false, naturalWidth: 0, naturalHeight: 0 }; imgs.push(i); return i; } });
  assert.deepEqual(art.bands('outpost'), {}); assert.deepEqual(imgs.map((i) => i.url).sort(), ['assets/backdrops/bottom_silhouette.png', 'assets/backdrops/top_silhouette.png']);
  imgs[0].complete = true; imgs[0].naturalWidth = 1344; imgs[0].naturalHeight = 294;
  const got = art.bands('outpost'); assert.equal(Object.keys(got).length, 1); assert.equal(got.top.edge, SPEC.top.edge);
  assert.deepEqual(art.bands('nope'), {}); assert.deepEqual(art.bands(null), {});
});

// ---------------------------------------------------------------- the files
test('the wall, gate and silhouette pictures exist where the game loads them, are real PNGs, and the band rows lie inside their pictures', () => {
  for (const n of [1, 2, 3, 4, 5]) for (const t of ['wall', 'gate']) {
    const f = `assets/sprites/buildings/${t}_level${n}.png`; assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), f);
    const { w, h, sig } = png(f); assert.equal(sig, 'PNG'); assert.ok(h > w * 1.8 && h < w * 2.2, `${f} is a tall section (${w}x${h})`);
  }
  assert.equal(existsSync(new URL('../assets/building', import.meta.url)), false, 'the old drop folder is gone (the pictures live in assets/sprites/buildings)');
  for (const side of ['top', 'bottom']) {
    const f = `assets/backdrops/${SPEC[side].file}`; const { w, h } = png(f);
    assert.equal(w, 1344, `${f} width`); assert.ok(SPEC[side].first >= 0 && SPEC[side].first < SPEC[side].edge && SPEC[side].edge < h, `${f}: first < edge < height`);
  }
});

// ---------------------------------------------------------------- the renderer
function recorder(w = 1600, h = 900) {
  const draws = []; const ctx = new Proxy({ imageSmoothingEnabled: false }, { get: (t, p) => (p === 'drawImage' ? (...a) => draws.push({ img: a[0], a: a.slice(1), alpha: t.globalAlpha, smooth: t.imageSmoothingEnabled }) : p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  return { draws, canvas: { width: w, height: h, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h }) } };
}
const loaded = (name, w = 340, h = 670) => ({ name, complete: true, naturalWidth: w, naturalHeight: h });
function frame({ condition = 'repaired', level = 1, gate = true } = {}) {
  return { tick: 1, map: { width: 40, height: 16 }, environment: { isNight: false, hour: 8, weather: 'clear' }, terrain: { zones: [], paths: [], backdrop: 'outpost', roadY: 6.7 },
    buildings: [
      { id: 'fence', type: 'fence', name: 'Perimeter Fence', level, condition, x: 12, y: 12, health: 100, maxHealth: 100, bounds: { x1: 12, y1: 0, x2: 12, y2: 15, shape: 'line' } },
      ...(gate ? [{ id: 'gate', type: 'gate', name: 'Gate', level: 1, condition, x: 12, y: 6, health: 80, maxHealth: 80 }] : []) ],
    nodes: [], npcs: [], zombies: [], stock: {}, events: [] };
}
function setup({ levelsReady = true, bands = true, opts = {} } = {}) {
  const { draws, canvas } = recorder();
  const buildingArt = createBuildingArt({ loadImage: (url) => (url.includes('_level') ? loaded(url) : loaded(url, 120, 120)), createCanvas: (w, h) => ({ w, h, getContext: () => new Proxy({}, { get: () => () => {} }) }) });
  if (!levelsReady) buildingArt.getLevel = () => null;
  const backdropImgs = { 'outpost.jpg': loaded('backdrop', 1600, 640), 'top_silhouette.png': loaded('top', 1344, 294), 'bottom_silhouette.png': loaded('bottom', 1344, 212) };
  const backdropArt = createBackdropArt({ loadImage: (url) => (bands || url.endsWith('outpost.jpg') ? backdropImgs[url.split('/').pop()] : { complete: false, naturalWidth: 0 }) });
  const r = mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => recorder().canvas, buildingArt, backdropArt, ...opts });
  return { r, draws, backdropImgs, buildingArt };
}
const sectionDraws = (draws) => draws.filter((d) => d.a.length === 4 && (d.img.naturalHeight ?? d.img.h) === 670); // level pictures are 340x670; the old per-cell pieces get 120x120 below

test('the map picture is drawn exactly on the map rectangle (it used to be offset, so the road no longer lay under the gate)', () => {
  const { r, draws, backdropImgs } = setup(); r.draw(frame());
  const bd = draws.find((d) => d.img === backdropImgs['outpost.jpg']); assert.deepEqual(bd.a, [0, 130, 1600, 640], 'x = 0, y = (900 - 640) / 2');
});

test('a repaired line wall is drawn as level sections with the gate section on the road; the old per-cell pieces are not drawn', () => {
  const { r, draws } = setup(); r.draw(frame({ level: 2 }));
  const s = sectionDraws(draws); const gateSec = wallSections({ top: 0, bottom: 16, gates: [6] });
  assert.equal(s.length, gateSec.length, 'one picture per section');
  assert.equal(r.lastDrawList.filter((e) => e.layer === 'fence').length, 15, 'the logical wall is still 15 fence cells + the gate');
  const gate = s.at(-1); // the gate is drawn after the wall, with the buildings
  assert.ok(Math.abs(gate.a[1] - (130 + 4.5 * 40)) < 1e-6, 'the gate section starts at row 4.5');
  assert.ok(s.every((d) => d.smooth === true), 'scaled down smoothly, not nearest-neighbour');
});

test('a ruined or damaged wall draws the darkened picture, translucent when ruined', () => {
  const ruined = setup(); ruined.r.draw(frame({ condition: 'ruined' }));
  const alphas = sectionDraws(ruined.draws).map((d) => d.alpha); assert.ok(alphas.length > 0 && alphas.every((a) => a < 1));
});

test('until the level pictures are loaded (and for walls without art) the old per-cell pieces draw', () => {
  const { r, draws } = setup({ levelsReady: false }); r.draw(frame());
  assert.equal(sectionDraws(draws).length, 0); assert.equal(r.lastDrawList.filter((e) => e.layer === 'fence').length, 15);
});

test('the wallArtLevel preview forces a level; a rectangular wall never uses the vertical pictures', () => {
  const asked = []; const { r, buildingArt } = setup({ opts: { wallArtLevel: 5 } }); const real = buildingArt.getLevel; buildingArt.getLevel = (t, l, c) => { asked.push([t, l]); return real(t, l, c); };
  r.draw(frame({ level: 1 })); assert.ok(asked.every(([, l]) => l === 5)); r.wallArtLevel = null; asked.length = 0; r.draw(frame({ level: 2 })); assert.ok(asked.some(([, l]) => l === 2));
  const rect = frame(); rect.buildings[0].bounds = { x1: 6, y1: 3, x2: 16, y2: 12 }; rect.buildings[1].x = 16; rect.buildings[1].y = 7;
  const s2 = setup(); s2.r.draw(rect); assert.equal(sectionDraws(s2.draws).length, 0);
});

test('the silhouettes are drawn after the map picture and before anything stands on it; a missing one is simply skipped', () => {
  const { r, draws, backdropImgs } = setup(); r.draw(frame());
  const iBack = draws.findIndex((d) => d.img === backdropImgs['outpost.jpg']); const iTop = draws.findIndex((d) => d.img === backdropImgs['top_silhouette.png']); const iBottom = draws.findIndex((d) => d.img === backdropImgs['bottom_silhouette.png']);
  const iWall = draws.findIndex((d) => d.img.naturalHeight === 670 && d.a.length === 4);
  assert.ok(iBack >= 0 && iTop > iBack && iBottom > iBack && iWall > Math.max(iTop, iBottom), 'backdrop, bands, then the wall');
  const none = setup({ bands: false }); assert.doesNotThrow(() => none.r.draw(frame())); assert.equal(none.draws.filter((d) => d.img === none.backdropImgs['top_silhouette.png']).length, 0);
});

test('the parallax ratio can be set (it used to throw: clamp was never imported) and is kept within 0-1', () => {
  const { r } = setup(); r.backdropParallaxRatio = 3; assert.equal(r.backdropParallaxRatio, 1); r.backdropParallaxRatio = -1; assert.equal(r.backdropParallaxRatio, 0);
});

test('the painted gate (taller than its one cell) is what picks the gate; the rest of the wall still picks the wall', () => {
  const { r } = setup(); const f = frame(); r.draw(f);
  const px = (gx, gy) => [20 + gx * 40 + 0.0, 130 + gy * 40]; // cell column 12 centre = 12 * 40 + 20
  const at = (gy) => r.pick(12 * 40 + 20, 130 + gy * 40, f);
  assert.deepEqual(at(6.5), { kind: 'building', id: 'gate' }, 'the door');
  assert.deepEqual(at(5.2), { kind: 'building', id: 'gate' }, 'the gate\'s upper post, which is drawn over the wall\'s row 5');
  assert.deepEqual(at(8.2), { kind: 'building', id: 'gate' }, 'and its lower post, over row 8');
  assert.deepEqual(at(2.5), { kind: 'building', id: 'fence' }); assert.deepEqual(at(12.5), { kind: 'building', id: 'fence' });
  assert.equal(px(0, 0).length, 2);
});
