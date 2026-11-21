import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { NPC_POSES, NPC_ANCHORS, VIEW_OF, npcPose, toolPoseFor, walkFrameAt, createNpcArt, NPC_REF_H, placeholderManifestFor } from '../src/modules/assets/index.js';
import { DIRECTIONS } from '../src/kernel/index.js';
import { mountRenderer } from '../src/modules/render/index.js';
import { newSim, defs } from './helpers.js';

const DIR = new URL('../assets/sprites/npc/', import.meta.url);
const sizes = JSON.parse(readFileSync(new URL('sizes.json', DIR), 'utf8'));

test('every survivor pose has a transparent PNG and a foot anchor', () => {
  for (const key of NPC_POSES) {
    assert.ok(existsSync(new URL(`${key}.png`, DIR)), key);
    assert.equal(readFileSync(new URL(`${key}.png`, DIR))[25], 6, `${key} is RGBA (colour type 6)`);
    const s = sizes[key]; assert.ok(s && s.w > 0 && s.h > 0 && s.ax > 0 && s.ax < s.w, `${key} has size + anchor`);
  }
  for (const key of NPC_POSES) assert.equal(NPC_ANCHORS[key].ax, sizes[key].ax, `${key}: NPC_ANCHORS matches sizes.json (re-run scripts/slice-npc-sprites.py and update the table)`);
  assert.equal(sizes.idle_down.h, NPC_REF_H, 'NPC_REF_H is the idle picture height');
});

test('all 8 simulation directions map to a painted view; the poses they ask for exist', () => {
  for (const d of DIRECTIONS) assert.ok(VIEW_OF[d], d);
  for (const d of DIRECTIONS) for (const a of ['IDLE', 'WALK', 'GATHER', 'REPAIR', 'REST', 'EAT', 'DRINK', 'DOWNED']) for (const f of [0, 1]) {
    const p = npcPose({ animation: a, direction: d, frame: f }); assert.ok(NPC_POSES.includes(p.key), `${a} ${d} -> ${p.key}`);
  }
});

test('walk alternates its two frames, per view; diagonals use the side views', () => {
  assert.equal(npcPose({ animation: 'WALK', direction: 'DOWN', frame: 0 }).key, 'walk_down_0');
  assert.equal(npcPose({ animation: 'WALK', direction: 'UP', frame: 1 }).key, 'walk_up_1');
  assert.equal(npcPose({ animation: 'WALK', direction: 'UP_LEFT', frame: 1 }).key, 'walk_left_1');
  assert.equal(npcPose({ animation: 'WALK', direction: 'DOWN_RIGHT', frame: 0 }).key, 'walk_right_0');
  assert.deepEqual([0, 100, 200, 300].map((t) => walkFrameAt(t)), [0, 0, 1, 1]);
});

test('work poses pick the tool from the resource and mirror when facing left', () => {
  assert.equal(toolPoseFor('GATHER', 'wood'), 'tool_axe');
  assert.equal(toolPoseFor('GATHER', 'stone'), 'tool_pickaxe');
  assert.equal(toolPoseFor('REPAIR'), 'tool_wrench');
  assert.deepEqual(npcPose({ animation: 'GATHER', direction: 'LEFT', resource: 'wood' }), { key: 'tool_axe', mirror: true });
  assert.deepEqual(npcPose({ animation: 'GATHER', direction: 'RIGHT', resource: 'wood' }), { key: 'tool_axe', mirror: false });
  assert.equal(npcPose({ animation: 'REST', direction: 'LEFT' }).key, 'idle_left');
  assert.equal(npcPose({ animation: 'DOWNED', direction: 'UP' }).key, 'downed');
});

test('projection npcs carry what the gather job is after (presentation only)', () => {
  const sim = newSim(); const frame = sim.renderProjection();
  assert.ok(frame.npcs.length > 0 && frame.npcs.every((n) => 'resource' in n));
});

test('the painted survivor is drawn only once loaded; the placeholder atlas draws until then', () => {
  const sim = newSim(); const frame = sim.renderProjection();
  const drawn = [];
  const ctx = new Proxy({}, { get: (t, p) => (p === 'drawImage' ? (...a) => drawn.push(a) : p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  const canvas = { width: 960, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ width: 960, height: 640 }) };
  const fake = { complete: false, naturalWidth: 0, naturalHeight: 0 };
  const r = mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => canvas, npcArt: createNpcArt({ loadImage: () => fake }) });
  r.draw(frame);
  assert.ok(!drawn.some((a) => a[0] === fake), 'not loaded yet: placeholder only');
  Object.assign(fake, { complete: true, naturalWidth: 70, naturalHeight: 112 });
  drawn.length = 0; r.draw(frame);
  assert.ok(drawn.some((a) => a[0] === fake), 'loaded: the painted survivor is drawn');
});
