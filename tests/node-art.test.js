import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { nodeStage, nodeSpriteKey, createNodeArt, NODE_FAMILIES, REF_W, placeholderManifestFor } from '../src/modules/assets/index.js';
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
