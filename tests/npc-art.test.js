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

// ---- the placeholder ("mock") survivor must not show while the painted one is loading or changing pose ----
function npcRig(extra = {}) {
  const frame = newSim().renderProjection();
  const drawn = [];
  const ctx = new Proxy({}, { get: (t, p) => (p === 'drawImage' ? (...a) => drawn.push(a) : p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  const canvas = { width: 960, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ width: 960, height: 640 }) };
  const imgs = new Map(); // url -> fake image
  let clock = 0;
  const art = createNpcArt({ loadImage: (url) => { const i = { url, complete: false, naturalWidth: 0, naturalHeight: 0 }; imgs.set(url, i); return i; }, now: () => clock, ...extra });
  const r = mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => canvas, npcArt: art, now: () => clock });
  const mockDrawn = () => { // did the placeholder atlas draw the survivor? (its frame rect in the atlas is unique to the npc frames)
    const p = frame.npcs[0]; const f = r.resolver.resolveNpc({ animation: p.animation, direction: p.direction }).frames[0];
    return drawn.some((a) => a[0] === canvas && a[1] === f.x && a[2] === f.y && a[3] === f.w);
  };
  const load = (re) => { for (const [url, i] of imgs) if (re.test(url)) Object.assign(i, { complete: true, naturalWidth: 70, naturalHeight: 112 }); };
  return { frame, drawn, imgs, art, r, mockDrawn, load, tick: (ms) => { clock += ms; }, fresh: () => { drawn.length = 0; } };
}

test('mounting the renderer preloads every survivor pose, idle pictures first', () => {
  const { imgs } = npcRig();
  assert.equal(imgs.size, NPC_POSES.length, 'one image per pose, requested up front');
  assert.ok([...imgs.keys()].slice(0, 4).every((u) => /idle_/.test(u)), 'the standing pictures are requested first');
});

test('while the painted pictures are still loading the mock survivor is not drawn; if they fail, it is (so she is never invisible)', () => {
  const { frame, r, art, mockDrawn, imgs, fresh, tick } = npcRig();
  r.draw(frame); assert.ok(art.pending(), 'pictures are on the way'); assert.ok(!mockDrawn(), 'loading: no mock model');
  for (const i of imgs.values()) i.onerror();           // every file failed
  fresh(); r.draw(frame); assert.ok(!art.pending()); assert.ok(mockDrawn(), 'nothing painted exists: the placeholder keeps her visible');
  const slow = npcRig(); slow.r.draw(slow.frame); assert.ok(!slow.mockDrawn());
  slow.tick(5000); slow.fresh(); slow.r.draw(slow.frame); assert.ok(slow.mockDrawn(), 'a picture that never arrives stops blocking after the timeout');
});

test('a pose that is still loading is replaced by her last painted pose (or the standing picture), never by the mock', () => {
  const { frame, r, load, drawn, mockDrawn, fresh } = npcRig();
  load(/idle_(down|up|left|right)\.png/);               // only the standing pictures have arrived
  r.draw(frame); assert.ok(!mockDrawn()); assert.ok(drawn.some((a) => a[0] && /idle_/.test(a[0].url ?? '')), 'her standing picture is drawn');
  const walking = { ...frame, npcs: frame.npcs.map((n) => ({ ...n, animation: 'WALK' })) };
  fresh(); r.draw(walking); assert.ok(!mockDrawn(), 'walk frames not loaded yet: the standing picture stands in');
  load(/walk_/); fresh(); r.draw(walking); assert.ok(drawn.some((a) => /walk_/.test(a[0]?.url ?? '')), 'once the walk frames load they are used');
  fresh(); r.draw({ ...frame, npcs: frame.npcs.map((n) => ({ ...n, animation: 'GATHER', resource: 'wood' })) });
  assert.ok(!mockDrawn(), 'the axe picture is still loading: no mock either');
});

test('a placeholder zombie is tinted differently from the placeholder survivor', () => {
  const m = placeholderManifestFor(defs);
  assert.ok(Object.entries(m.frames).filter(([k]) => k.startsWith('zombie_')).every(([, f]) => f.spec.zombie === true));
  assert.ok(Object.entries(m.frames).filter(([k]) => k.startsWith('npc_')).every(([, f]) => !f.spec.zombie));
});
