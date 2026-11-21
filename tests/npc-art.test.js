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

// ---- chopping / mining swing: she moves back and forth toward her tree / rock (presentation only) ----
import { workSwing, facingVector, isStoneWork, WORK_SWING_MS, WORK_LUNGE_CELLS, WORK_TILT_RAD } from '../src/modules/assets/index.js';

test('the swing winds up (leans back), strikes (lunges in), presses, recovers, and repeats every WORK_SWING_MS', () => {
  const at = (f) => workSwing(f * WORK_SWING_MS);
  assert.equal(at(0).lunge, 0); assert.ok(at(0.4).lunge < -0.2 && at(0.4).lunge >= -0.35, 'wind-up leans back');
  assert.ok(Math.abs(at(0.5).lunge + 0.35) < 1e-9, 'the deepest wind-up is just before the strike');
  assert.ok(at(0.56).lunge > at(0.5).lunge && at(0.62).lunge > 0.99, 'the strike is fast and lands at 1');
  assert.equal(at(0.66).lunge, 1); assert.ok(at(0.85).lunge < 1 && at(0.85).lunge > 0, 'then recovers'); assert.ok(Math.abs(at(0.999).lunge) < 0.01);
  assert.deepEqual(workSwing(123), workSwing(123 + WORK_SWING_MS), 'periodic'); assert.deepEqual(workSwing(-50), workSwing(WORK_SWING_MS - 50), 'negative time is fine');
  assert.ok(at(0.62).impact === 1 && at(0.7).impact < 1 && at(0.7).impact > 0 && at(0.9).impact === 0 && at(0.3).impact === 0, 'chips only right after the hit');
  const all = Array.from({ length: 200 }, (_, i) => workSwing(i * 4.5).lunge); assert.ok(Math.min(...all) >= -0.35 - 1e-9 && Math.max(...all) <= 1 + 1e-9);
});

test('survivors are staggered, the facing vector points at the target, and stone work is told from tree work', () => {
  assert.notEqual(workSwing(300, 0).lunge, workSwing(300, 250).lunge);
  assert.deepEqual(facingVector('LEFT'), [-1, 0]); assert.deepEqual(facingVector('DOWN'), [0, 1]); assert.deepEqual(facingVector('nonsense'), [0, 1]);
  assert.ok(Math.abs(Math.hypot(...facingVector('UP_RIGHT')) - 1) < 1e-9);
  assert.equal(isStoneWork('stone'), true); assert.equal(isStoneWork('wood'), false); assert.equal(isStoneWork(null), false);
  assert.equal(toolPoseFor('GATHER', 'stone'), 'tool_pickaxe'); assert.equal(toolPoseFor('GATHER', 'wood'), 'tool_axe');
});

function swingRig(animation, resource = 'wood', direction = 'RIGHT') {
  const base = newSim().renderProjection(); const frame = { ...base, npcs: base.npcs.map((n, i) => (i === 0 ? { ...n, animation, direction, resource } : { ...n })) };
  const drawn = []; const ctxOps = [];
  const ctx = new Proxy({}, { get: (t, p) => (p === 'drawImage' ? (...a) => drawn.push({ a, at: ctxOps.filter((o) => o[0] === 'translate').at(-1) }) : p in t ? t[p] : (...a) => { ctxOps.push([p, ...a]); }), set: (t, p, v) => { t[p] = v; return true; } });
  const canvas = { width: 960, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ width: 960, height: 640 }) };
  let clock = 0; const art = createNpcArt({ loadImage: () => ({ complete: true, naturalWidth: 70, naturalHeight: 112 }), now: () => clock });
  const r = mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => canvas, npcArt: art, now: () => clock });
  const survivorPos = () => { ctxOps.length = 0; drawn.length = 0; r.draw(frame); const t = ctxOps.filter((o) => o[0] === 'translate' && o.length === 3); return { t, drawn: drawn.length, ops: [...ctxOps] }; };
  return { survivorPos, tick: (ms) => { clock = ms; }, frame };
}

test('a gathering survivor is moved toward her node in time; an idle or walking one never is', () => {
  const g = swingRig('GATHER', 'wood', 'RIGHT'); const xs = new Set();
  for (const ms of [0, 200, 450, 560, 600, 700, 850]) { g.tick(ms); const { ops } = g.survivorPos(); const tr = ops.find((o) => o[0] === 'translate' && Math.abs(o[1]) > 0 && o.length === 3 && o[1] > 0); xs.add(tr && Math.round(tr[1] * 100)); }
  assert.ok(xs.size > 3, `the body moves through the swing (saw ${xs.size} distinct positions)`);
  for (const a of ['IDLE', 'WALK', 'REST']) { const w = swingRig(a); const seen = new Set(); for (const ms of [0, 300, 600, 900]) { w.tick(ms); seen.add(w.survivorPos().ops.filter((o) => o[0] === 'rotate').length); } assert.deepEqual([...seen], [0], `${a}: no swing rotation`); }
});

test('the swing leans toward the node (rotate sign follows the facing side) and the chips only appear at the hit', () => {
  // each survivor's swing is staggered by her id, so scan the whole cycle instead of guessing the phase
  const scan = (dir, res = 'wood') => { const w = swingRig('GATHER', res, dir); const rows = []; for (let ms = 0; ms < WORK_SWING_MS; ms += 30) { w.tick(ms); const o = w.survivorPos().ops; rows.push({ rot: o.find((q) => q[0] === 'rotate')?.[1] ?? 0, fills: o.filter((q) => q[0] === 'fillRect').length }); } return rows; };
  const right = scan('RIGHT'); const left = scan('LEFT'); const down = scan('DOWN');
  assert.ok(Math.max(...right.map((r) => r.rot)) > 0.8 * WORK_TILT_RAD && Math.min(...right.map((r) => r.rot)) < 0, 'facing right: leans +  at the hit, a little - in the wind-up');
  assert.ok(Math.min(...left.map((r) => r.rot)) < -0.8 * WORK_TILT_RAD && Math.max(...left.map((r) => r.rot)) <= 0.35 * WORK_TILT_RAD + 1e-9, 'facing left: leans - at the hit, a little + in the wind-up');
  assert.ok(down.every((r) => r.rot === 0), 'facing straight down or up: no tilt');
  const base = Math.min(...right.map((r) => r.fills)); const peak = Math.max(...right.map((r) => r.fills));
  assert.equal(peak - base, 4, 'four chips at the hit, none the rest of the time'); assert.ok(right.filter((r) => r.fills > base).length < right.length * 0.3, 'only for a short moment');
});
