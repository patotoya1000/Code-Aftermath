// The painted OUTPOST map (stage1_outpost): layout from the author's guideline sketch, backdrop art, and the renderer's use of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createDefinitions, validateDefinitions } from '../src/modules/definitions/index.js';
import { createInitialState } from '../src/modules/world/index.js';
import { renderProjection } from '../src/modules/projection/index.js';
import { createBackdropArt, BACKDROP_FILES } from '../src/modules/assets/index.js';

const defs = createDefinitions();
const state = () => createInitialState({ defs, scenarioId: 'stage1_outpost', seed: 1 });

test('the scenario validates and keeps the 40x16 grid the picture was drawn for', () => {
  assert.doesNotThrow(() => validateDefinitions(defs));
  assert.deepEqual(defs.scenarios.stage1_outpost.map, { width: 40, height: 16 });
  assert.ok(existsSync(new URL('../assets/backdrops/outpost.jpg', import.meta.url)));
  const jpg = readFileSync(new URL('../assets/backdrops/outpost.jpg', import.meta.url));
  const h = jpg.readUInt16BE(jpg.indexOf(Buffer.from([0xff, 0xc0])) + 5); const w = jpg.readUInt16BE(jpg.indexOf(Buffer.from([0xff, 0xc0])) + 7);
  assert.equal(w * 16, h * 40, 'picture aspect equals the map aspect (one cell = one share of the picture)');
});

test('layout follows the sketch: wall line + gate on the road at the left, tower beside the wall, hq top-left, trees and rocks only outside', () => {
  const s = defs.scenarios.stage1_outpost; const by = (id) => s.buildings.find((b) => b.id === id);
  assert.deepEqual(by('fence').bounds, { x1: 9, y1: 0, x2: 9, y2: 15, shape: 'line' });
  assert.equal(by('gate').x, 9); assert.equal(by('gate').y, 6);
  assert.equal(by('tower_1').x, 8, 'the tower stands right beside the wall (inside)');
  assert.ok(by('hq').x < 9 && by('hq').y <= 3, 'the main building is inside, top-left');
  for (const b of s.buildings) if (!b.bounds && b.id !== 'gate') { assert.ok(b.x < 9, `${b.id} is inside the wall`); assert.ok(b.y !== 6 && b.y !== 7, `${b.id} leaves the road rows free`); }
  assert.ok(s.nodes.length >= 20 && s.nodes.every((n) => n.x > 12 && n.y !== 6 && n.y !== 7), 'nodes are outside the wall and off the road');
  assert.ok(s.nodes.some((n) => n.type === 'rock') && s.nodes.some((n) => n.type === 'tree'));
  assert.equal(new Set(s.nodes.map((n) => `${n.x},${n.y}`)).size, s.nodes.length, 'no two nodes share a cell');
});

test('the projection carries the backdrop id and road line; plain scenarios carry none', () => {
  const t = renderProjection(state(), defs).terrain;
  assert.equal(t.backdrop, 'outpost'); assert.equal(t.roadY, 6.7); assert.deepEqual(t.zones, []); assert.deepEqual(t.paths, []);
  const old = renderProjection(createInitialState({ defs, scenarioId: 'stage1_long', seed: 1 }), defs).terrain;
  assert.equal(old.backdrop, null); assert.equal(old.roadY, null);
});

test('backdrop art: null until loaded or when missing, the image once loaded, null for unknown ids', () => {
  const imgs = []; const art = createBackdropArt({ loadImage: (url) => { const i = { url, complete: false, naturalWidth: 0 }; imgs.push(i); return i; } });
  assert.equal(art.get('outpost'), null); assert.equal(imgs[0].url, `assets/backdrops/${BACKDROP_FILES.outpost}`);
  imgs[0].complete = true; imgs[0].naturalWidth = 1640; assert.equal(art.get('outpost'), imgs[0]);
  assert.equal(art.get('nope'), null); assert.equal(imgs.length, 1);
  const broken = createBackdropArt({ loadImage: () => ({ complete: true, naturalWidth: 0 }) }); assert.equal(broken.get('outpost'), null);
});

test('the app starts on the outpost map and the server knows .jpg', () => {
  assert.ok(readFileSync(new URL('../src/app/mainscreen.js', import.meta.url), 'utf8').includes("backdropArt: createBackdropArt()"));
  assert.ok(readFileSync(new URL('../scripts/serve.mjs', import.meta.url), 'utf8').includes("'.jpg': 'image/jpeg'"));
});
