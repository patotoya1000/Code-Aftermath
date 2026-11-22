import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssetResolver, buildPlaceholderManifest, placeholderManifestFor, fenceCells, fencePieceKey, objectSpec, footprintCells, OBJECT_SPECS } from '../src/modules/assets/index.js';
import { paintFencePiece, perimeterOf } from '../src/modules/assets/objects.js';
import { N, E, S, W } from '../src/modules/assets/terrain.js';
import { mountRenderer, perimeterCells } from '../src/modules/render/index.js';
import { cellCenter } from '../src/modules/viewport/index.js';
import { newSim, defs } from './helpers.js';

function fakeCanvas(w = 960, h = 640) {
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  return { width: w, height: h, getContext: () => ctx, getBoundingClientRect: () => ({ width: w, height: h }) };
}
const mount = (opts = {}) => mountRenderer(fakeCanvas(), { manifest: placeholderManifestFor(defs), createCanvas: () => fakeCanvas(), ...opts });
const clone = (o) => JSON.parse(JSON.stringify(o));
const pieceAt = (frame, x, y) => fenceCells(frame).find((p) => p.x === x && p.y === y);

test('PA-4: fence pieces — corners, straights, the gate opening, all from neighbours on the fence line', () => {
  const frame = newSim().renderProjection();
  const pieces = fenceCells(frame);
  assert.equal(pieces.length, 37, '38 perimeter cells minus the one the gate stands on');
  assert.equal(pieceAt(frame, 6, 3).key, 'fence_corner_es_lv1_ruined');
  assert.equal(pieceAt(frame, 16, 3).key, 'fence_corner_sw_lv1_ruined');
  assert.equal(pieceAt(frame, 6, 12).key, 'fence_corner_ne_lv1_ruined');
  assert.equal(pieceAt(frame, 16, 12).key, 'fence_corner_nw_lv1_ruined');
  assert.equal(pieceAt(frame, 9, 3).key, 'fence_straight_h_lv1_ruined');
  assert.equal(pieceAt(frame, 6, 8).key, 'fence_straight_v_lv1_ruined');
  assert.equal(pieceAt(frame, 16, 6).key, 'fence_straight_v_lv1_ruined', 'the cell above the gate joins the gate');
  assert.equal(pieceAt(frame, 16, 8).key, 'fence_straight_v_lv1_ruined');
  assert.equal(pieceAt(frame, 16, 7), undefined, 'the gate cell is open');
  assert.equal(new Set(pieces.map((p) => `${p.x},${p.y}`)).size, 37);
  assert.deepEqual(pieces.map((p) => [p.x, p.y]).sort().join(), perimeterCells({ x1: 6, y1: 3, x2: 16, y2: 12 }).filter(([x, y]) => !(x === 16 && y === 7)).sort().join());
});

test('PA-4: a non-gate building on the fence line ends the fence on both sides; a missing gate leaves ends too', () => {
  const frame = clone(newSim().renderProjection());
  frame.buildings.push({ id: 'shed', type: 'storage', level: 1, x: 10, y: 3, condition: 'repaired' });
  assert.equal(pieceAt(frame, 9, 3).key, 'fence_end_w_lv1_ruined');
  assert.equal(pieceAt(frame, 11, 3).key, 'fence_end_e_lv1_ruined');
  const noGate = clone(newSim().renderProjection()); noGate.buildings = noGate.buildings.filter((b) => b.type !== 'gate');
  assert.equal(pieceAt(noGate, 16, 7).key, 'fence_straight_v_lv1_ruined', 'without a gate the cell is ordinary fence');
});

test('PA-4: level and condition choose the piece; repairing changes the art, not the layout', () => {
  const sim = newSim('stage1', 5, (s) => { s.ledger['stock.wood'].total = 10; });
  const before = fenceCells(sim.renderProjection());
  assert.ok(before.every((p) => p.condition === 'ruined' && p.level === 1));
  const f = clone(sim.renderProjection()); const fence = f.buildings.find((b) => b.id === 'fence'); fence.condition = 'repaired'; fence.level = 2;
  const after = fenceCells(f);
  assert.deepEqual(after.map((p) => [p.x, p.y, p.mask]), before.map((p) => [p.x, p.y, p.mask]));
  assert.ok(after.every((p) => p.key.endsWith('_lv2_repaired')));
});

test('PA-4: atlas holds every piece (16 masks × levels × conditions); fallback chain', () => {
  const m = placeholderManifestFor(defs);
  for (const level of [1, 2]) for (const c of ['ruined', 'damaged', 'repaired']) for (let mask = 0; mask < 16; mask++) {
    const f = m.frames[fencePieceKey(mask, level, c)]; assert.ok(f, `${mask} ${level} ${c}`); assert.equal(f.w, m.frame.w);
  }
  const r = createAssetResolver(m);
  assert.equal(r.resolveFence({ mask: E | W, level: 1, condition: 'ruined' }).step, 1);
  assert.equal(r.resolveFence({ mask: E | W, level: 9, condition: 'ruined' }).step, 2, 'unknown level → another level of the same shape');
  const bare = buildPlaceholderManifest({ buildings: { fence: [1] } });
  for (const k of Object.keys(bare.animations).filter((k) => k.startsWith('fence_') && !k.includes('isolated'))) delete bare.animations[k];
  const iso = createAssetResolver(bare).resolveFence({ mask: N | S, level: 1, condition: 'repaired' });
  assert.equal(iso.step, 3); assert.equal(iso.key, 'fence_isolated_lv1_repaired');
  assert.equal(createAssetResolver(buildPlaceholderManifest({})).resolveFence({ mask: 0, level: 1, condition: 'ruined' }).key, null);
});

test('PA-4: painted fence arms run to the edge only toward connected sides when repaired; nothing leaves the frame', () => {
  for (const level of [1, 2]) for (const condition of ['ruined', 'damaged', 'repaired']) for (let mask = 0; mask < 16; mask++) {
    const rects = []; paintFencePiece({ fillRect: (x, y, w, h) => rects.push([x, y, w, h]), set fillStyle(v) {} }, 0, 0, { mask, level, condition });
    for (const [x, y, w, h] of rects) assert.ok(x >= 0 && y >= 0 && x + w <= 32 && y + h <= 32, `${mask}/${level}/${condition}`);
    if (condition === 'repaired') {
      const t = { N: rects.some(([, y]) => y === 0), S: rects.some(([, y, , h]) => y + h === 32), W: rects.some(([x]) => x === 0), E: rects.some(([x, , w]) => x + w === 32) };
      assert.deepEqual(t, { N: !!(mask & N), S: !!(mask & S), W: !!(mask & W), E: !!(mask & E) }, `mask ${mask} level ${level}`);
    }
  }
});

test('PA-4: the renderer draws one fence piece per fence cell and keeps the whole-building key for the draw list', () => {
  const sim = newSim(); const hash = sim.stateHash();
  const r = mount(); r.draw(sim.renderProjection());
  const fence = r.lastDrawList.filter((e) => e.layer === 'fence');
  assert.equal(fence.length, 37);
  assert.ok(fence.every((e) => e.key === 'building_fence_lv1_ruined' && /^fence_[a-z_]+_lv1_ruined$/.test(e.piece) && e.pieceStep === 1));
  assert.equal(sim.stateHash(), hash);
  const stripped = buildPlaceholderManifest({ buildings: { fence: [1] } });
  for (const k of Object.keys(stripped.animations).filter((k) => k.startsWith('fence_'))) delete stripped.animations[k];
  const r2 = mountRenderer(fakeCanvas(), { manifest: stripped, createCanvas: () => fakeCanvas() });
  assert.doesNotThrow(() => r2.draw(sim.renderProjection()), 'no piece art: the whole-fence art is drawn instead');
  assert.equal(r2.lastDrawList.filter((e) => e.layer === 'fence').length, 37);
});

test('PA-4: objects declare a logical footprint separate from sprite size', () => {
  assert.deepEqual(objectSpec('tree'), OBJECT_SPECS.tree);
  assert.deepEqual(objectSpec('tree').footprint, { w: 1, h: 1 });
  assert.ok(objectSpec('tree').spriteSize > 1, 'a tree looks bigger than its cell');
  assert.deepEqual(objectSpec('never-heard-of-it').footprint, { w: 1, h: 1 }, 'unknown types get a safe 1x1');
  assert.deepEqual(footprintCells(5, 6, { footprint: { w: 2, h: 2 } }), [[5, 6], [6, 6], [5, 7], [6, 7]]);
  assert.deepEqual(perimeterOf({ x1: 0, y1: 0, x2: 2, y2: 2 }).length, 8);
});

test('PA-4: a bigger tree sprite never changes where the tree is, what it occupies, or what a tap finds', () => {
  const frame = newSim().renderProjection();
  const r = mount(); r.draw(frame);
  const tree = frame.nodes.find((n) => n.type === 'tree');
  const entry = r.lastDrawList.find((e) => e.id === tree.id);
  assert.equal(entry.x, tree.x); assert.equal(entry.y, tree.y); assert.deepEqual(entry.footprint, { w: 1, h: 1 }); assert.equal(entry.spriteSize, 1.8);
  const c = (x, y) => cellCenter(r.viewport, x, y);
  assert.deepEqual(r.pick(c(tree.x, tree.y).x, c(tree.x, tree.y).y, frame), { kind: 'node', id: tree.id });
  const above = r.pick(c(tree.x, tree.y - 1).x, c(tree.x, tree.y - 1).y, frame);
  assert.ok(!above || above.id !== tree.id, 'the canopy overhang is not part of the footprint');
});

test('PA-4: trees and survivors are drawn back to front by row', () => {
  const frame = clone(newSim().renderProjection());
  const tree = frame.nodes.find((n) => n.type === 'tree'); const npc = frame.npcs[0];
  const order = () => { const r = mount(); r.draw(frame); return r.lastDrawList.filter((e) => e.id === tree.id || e.id === npc.id).map((e) => e.id); };
  npc.x = tree.x; npc.y = tree.y - 1; assert.deepEqual(order(), [npc.id, tree.id], 'survivor behind the tree is drawn first');
  npc.y = tree.y + 1; assert.deepEqual(order(), [tree.id, npc.id], 'survivor in front is drawn last');
  npc.y = tree.y; assert.deepEqual(order(), [tree.id, npc.id], 'same row: the survivor stands in front');
});

// ---- equipment icons (assets/equipments) ----
import { ITEM_ICONS, ICON_FILES, iconUrl, hasIcon } from '../src/modules/assets/index.js';
import { readFileSync as readIcon, existsSync as iconExists, readdirSync } from 'node:fs';
test('every equipment picture is connected to an item id, every id has a transparent PNG, and the weapons that exist in the game have one', () => {
  const dir = new URL('../assets/equipments/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();
  assert.deepEqual([...ICON_FILES].sort(), files, 'no picture is left unconnected and none is missing');
  for (const f of files) { assert.equal(readIcon(new URL(`${f}.png`, dir))[25], 6, `${f} is RGBA`); }
  for (const id of ['spear', 'bow', 'crossbow', 'rifle']) assert.ok(hasIcon(id), id);
  assert.equal(iconUrl('bow'), 'assets/equipments/bow.png'); assert.equal(iconUrl('wood'), null); assert.equal(iconUrl('toString'), null, 'only own ids');
  for (const id of ['spear', 'bow', 'crossbow', 'rifle']) assert.ok(id in defsForIcons().weapons, `${id} is a weapon id in the arsenal`);
});
import { createDefinitions as mkDefs } from '../src/modules/definitions/index.js';
function defsForIcons() { return mkDefs(); }
test('the survivor card shows an icon for an item that has one and keeps the text row for the rest', () => {
  const src = readIcon(new URL('../src/app/mainscreen.js', import.meta.url), 'utf8');
  assert.ok(src.includes('iconUrl') && src.includes('itemIcon(item)') && src.includes('itemIcon(i.id)'), 'equipment slots and inventory rows both use it');
  assert.ok(readIcon(new URL('../src/app/mainscreen.css', import.meta.url), 'utf8').includes('.item-icon'));
});
