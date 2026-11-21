import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { nodeStage, nodeSpriteKey, createNodeArt, NODE_FAMILIES, TREE_FAMILIES, REF_W, placeholderManifestFor } from '../src/modules/assets/index.js';
import { mountRenderer } from '../src/modules/render/index.js';
import { newSim, defs } from './helpers.js';

const SPRITES = new URL('../assets/sprites/nodes/', import.meta.url);

test('node stage follows the ledger amount: full -> worn -> gone', () => {
  assert.equal(nodeStage(35, 35), 'full');
  assert.equal(nodeStage(17, 35), 'worn');
  assert.equal(nodeStage(1, 35), 'worn');
  assert.equal(nodeStage(0, 35), 'gone');
  assert.equal(nodeStage(5, 0), 'full', 'unknown capacity never shows a worn look');
});

test('every sprite key a node can ask for exists as a transparent PNG', () => {
  for (const [type, families] of Object.entries(NODE_FAMILIES)) for (let i = 0; i < 12; i++) for (const st of ['full', 'worn', 'gone']) {
    const key = nodeSpriteKey(type, `${type}_${i}`, st);
    assert.ok(existsSync(new URL(`${key}.png`, SPRITES)), key);
    const png = readFileSync(new URL(`${key}.png`, SPRITES));
    assert.equal(png[25], 6, `${key} is RGBA (colour type 6)`);
  }
  assert.equal(nodeSpriteKey('bush', 'x', 'full'), null, 'a type without art falls back to the placeholder');
});

test('every tree picture (all four families, both looks, both felled looks) is a transparent PNG measured in sizes.json, and REF_W is the widest', () => {
  const sizes = JSON.parse(readFileSync(new URL('sizes.json', SPRITES), 'utf8'));
  const names = [];
  for (const fam of TREE_FAMILIES) for (const n of [1, 2]) names.push(`tree_${fam}_full_${n}`);
  for (const n of [1, 2]) names.push(`tree_cut_${n}`);
  for (const key of names) {
    assert.ok(existsSync(new URL(`${key}.png`, SPRITES)), key);
    const png = readFileSync(new URL(`${key}.png`, SPRITES));
    assert.equal(png[25], 6, `${key} is RGBA (colour type 6)`);
    assert.equal(png.readUInt32BE(16), sizes[key].w, `${key} width matches sizes.json`); assert.equal(png.readUInt32BE(20), sizes[key].h, `${key} height matches sizes.json`);
  }
  assert.equal(Math.max(...names.filter((n) => n.includes('_full_')).map((n) => sizes[n].w)), REF_W.tree, 'REF_W.tree = the widest tree picture (scripts/prepare-tree-sprites.py REF_W)');
  assert.ok(sizes.tree_cut_1.w < REF_W.tree, 'a felled tree is drawn smaller than a standing one');
});

test('a tree shows the whole tree while standing and the felled tree once depleted; a season can be chosen', () => {
  const full = nodeSpriteKey('tree', 'tree_1', 'full'); const worn = nodeSpriteKey('tree', 'tree_1', 'worn'); const gone = nodeSpriteKey('tree', 'tree_1', 'gone');
  assert.match(full, /^tree_green_full_[12]$/); assert.equal(worn, full); assert.match(gone, /^tree_cut_[12]$/);
  assert.match(nodeSpriteKey('tree', 'tree_1', 'full', { tree: ['winter'] }), /^tree_winter_full_[12]$/);
  const looks = new Set(Array.from({ length: 12 }, (_, i) => nodeSpriteKey('tree', `tree_${i}`, 'full')));
  assert.equal(looks.size, 2, 'both green looks are used');
});

test('the same node id always picks the same look', () => {
  assert.equal(nodeSpriteKey('rock', 'rock_1', 'full'), nodeSpriteKey('rock', 'rock_1', 'full'));
  const looks = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => nodeSpriteKey('rock', id, 'full')));
  assert.ok(looks.size > 1, 'rocks vary');
});

test('projection nodes carry the type capacity; the painted sprite is drawn only once loaded', () => {
  const sim = newSim();
  const frame = sim.renderProjection();
  const tree = frame.nodes.find((n) => n.type === 'tree');
  assert.equal(tree.capacity, defs.nodeTypes.tree.amount);

  const drawn = [];
  const ctx = new Proxy({}, { get: (t, p) => (p === 'drawImage' ? (...a) => drawn.push(a) : p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  const canvas = { width: 960, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ width: 960, height: 640 }) };
  const fake = { complete: false, naturalWidth: 0, naturalHeight: 0 };
  const art = createNodeArt({ loadImage: () => fake });
  const r = mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => canvas, nodeArt: art });
  r.draw(frame);
  assert.ok(!drawn.some((a) => a[0] === fake), 'not loaded yet: placeholder atlas only');
  Object.assign(fake, { complete: true, naturalWidth: REF_W.tree, naturalHeight: 150 });
  drawn.length = 0; r.draw(frame);
  assert.ok(drawn.some((a) => a[0] === fake), 'loaded: the painted sprite is drawn');
});

test('without a DOM there is no loader: the art stays off and nothing throws', () => {
  assert.equal(createNodeArt().get('tree_green_full'), null);
});
