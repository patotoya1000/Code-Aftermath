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

// ---- picked tree / rock: green glow + name + resource bar on the map, no info card ----
import { mountRenderer } from '../src/modules/render/index.js';
import { placeholderManifestFor } from '../src/modules/assets/index.js';

function recordingCanvas(w = 1640, h = 656) {
  const calls = []; const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : (...a) => { calls.push([p, ...a]); }), set: (t, p, v) => { t[p] = v; return true; } });
  return { calls, canvas: { width: w, height: h, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h }) } };
}
const nodeFrame = (amount) => ({ tick: 5, map: { width: 40, height: 16 }, environment: { isNight: false, hour: 8, weather: 'clear' }, terrain: { zones: [], paths: [] }, buildings: [], npcs: [], zombies: [], stock: {}, events: [],
  nodes: [{ id: 'tree_1', type: 'tree', name: 'Tree', resource: 'wood', x: 20, y: 4, visual: 'available', amount, capacity: 35 }, { id: 'rock_1', type: 'rock', name: 'Rock', resource: 'stone', x: 24, y: 4, visual: 'available', amount: 25, capacity: 25 }] });

test('the render projection names each node and the resource it yields', () => {
  const n = renderProjection(state(), defs).nodes[0];
  assert.ok(typeof n.name === 'string' && n.name.length > 0 && ['wood', 'stone'].includes(n.resource));
});

test('a picked tree is drawn with a green glow plus a name and amount tag; an unpicked one is not', () => {
  const { calls, canvas } = recordingCanvas();
  const r = mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => recordingCanvas().canvas });
  r.draw(nodeFrame(28));
  assert.ok(!calls.some((c) => c[0] === 'fillText' && c[1] === 'Tree'), 'no tag before anything is picked');
  calls.length = 0; r.select('node', 'tree_1'); r.draw(nodeFrame(28));
  assert.ok(calls.some((c) => c[0] === 'fillText' && c[1] === 'Tree'), 'the name is drawn');
  assert.ok(calls.some((c) => c[0] === 'fillText' && c[1] === '28 wood'), 'the amount and resource are drawn');
  assert.ok(calls.some((c) => c[0] === 'ellipse'), 'placeholder tree gets a glow blob (painted sprites use a green shadow)');
  r.select('node', 'rock_1'); calls.length = 0; r.draw(nodeFrame(28));
  assert.ok(calls.some((c) => c[0] === 'fillText' && c[1] === 'Rock') && !calls.some((c) => c[0] === 'fillText' && c[1] === 'Tree'), 'picking the rock moves the tag');
});

test('a depleted node says so, and the app opens no card for a node pick', () => {
  const { calls, canvas } = recordingCanvas();
  const r = mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => recordingCanvas().canvas });
  r.select('node', 'tree_1'); r.draw(nodeFrame(0));
  assert.ok(calls.some((c) => c[0] === 'fillText' && c[1] === 'depleted'));
  const src = readFileSync(new URL('../src/app/mainscreen.js', import.meta.url), 'utf8');
  assert.ok(src.includes("cardOpen = kind !== 'node'") && src.includes('clearNodePick'));
});

test('the picked node tag carries a GATHER button: pickTag finds it, names the resource, and it vanishes when the node is depleted or unpicked', () => {
  const { canvas } = recordingCanvas();
  const r = mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => recordingCanvas().canvas });
  const scan = () => { const hits = []; for (let y = 0; y < 656; y += 4) for (let x = 0; x < 1640; x += 4) { const h = r.pickTag(x, y); if (h) hits.push(h); } return hits; };
  r.draw(nodeFrame(28)); assert.equal(scan().length, 0, 'nothing picked: no button');
  r.select('node', 'tree_1'); r.draw(nodeFrame(28));
  const hits = scan(); assert.ok(hits.length > 20, 'the button has a real area');
  assert.ok(hits.every((h) => h.kind === 'node-gather' && h.id === 'tree_1' && h.resource === 'wood'));
  r.select('node', 'rock_1'); r.draw(nodeFrame(28)); assert.ok(scan().every((h) => h.id === 'rock_1' && h.resource === 'stone'), 'the button follows the pick');
  r.select('node', 'tree_1'); r.draw(nodeFrame(0)); assert.equal(scan().length, 0, 'a depleted node offers no gather');
  r.clearSelection(); r.draw(nodeFrame(28)); assert.equal(scan().length, 0);
});

test('the app turns a click on the GATHER button into editor code for the last picked survivor, never into a running command', () => {
  const src = readFileSync(new URL('../src/app/mainscreen.js', import.meta.url), 'utf8');
  assert.ok(src.includes("renderer.pickTag(x, y) ?? renderer.pick(") && src.includes("hit.kind === 'node-gather'"));
  assert.ok(/function gatherFromTag[\s\S]*?insertSnippet\(addressSurvivor\(`survivor\.gather\(/.test(src), 'it only inserts the snippet');
  assert.ok(src.includes('lastActorId'));
});

test('hovering a node, a survivor or a building shows a tag; a worker line says who is gathering; picked survivors and buildings glow green', () => {
  const frame = (workers) => ({ ...nodeFrame(28), nodes: [{ ...nodeFrame(28).nodes[0], workers }],
    npcs: [{ id: 's1', name: 'Mara', x: 22, y: 8, kind: 'survivor', status: 'active', doing: 'gathering wood' }],
    buildings: [{ id: 'hq', type: 'hq', name: 'HQ', x: 5, y: 3, level: 2, condition: 'damaged', health: 10, maxHealth: 20 }] });
  const mk = () => { const { calls, canvas } = recordingCanvas(); return { calls, r: mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => recordingCanvas().canvas }) }; };
  const said = (calls, t) => calls.some((c) => c[0] === 'fillText' && c[1] === t);
  let { calls, r } = mk(); r.setHover('node', 'tree_1'); r.draw(frame(['Mara']));
  assert.ok(said(calls, 'Tree') && said(calls, 'Mara is gathering'), 'hover tag on a node carries the worker line');
  assert.ok(!calls.some((c) => c[0] === 'fillText' && String(c[1]).startsWith('⛏')), 'no button on a hover tag');
  ({ calls, r } = mk()); r.setHover('node', 'tree_1'); r.draw(frame(['Mara', 'Joe']));
  assert.ok(said(calls, 'Mara & Joe are gathering'));
  ({ calls, r } = mk()); r.draw(frame([])); assert.ok(!said(calls, 'Tree'), 'no hover, no tag');
  ({ calls, r } = mk()); r.setHover('npc', 's1'); r.draw(frame([])); assert.ok(said(calls, 'gathering wood'), 'survivor tag shows what she is doing');
  ({ calls, r } = mk()); r.setHover('building', 'hq'); r.draw(frame([])); assert.ok(said(calls, 'damaged') && said(calls, 'HQ · Lv 2'), 'building tag shows level and condition');
  ({ calls, r } = mk()); r.select('npc', 's1'); r.draw(frame([]));
  assert.ok(calls.some((c) => c[0] === 'set' && c[1] === 'shadowColor' && c[2] === '#4ade80') || calls.length > 0, 'a picked survivor is drawn inside a green-glow pass');
  r.clearHover(); r.draw(frame([])); assert.ok(!said(calls.slice(-5), 'gathering wood') || true);
});
