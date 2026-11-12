import { DIRECTIONS } from '../../kernel/index.js';

// Asset module: semantic state → asset key → atlas frame(s). Pure data + pure functions, no DOM, no gameplay.
// The renderer asks "what does NPC walking down-right look like?"; this module answers with a frame rect.
// Real art drops in by supplying a different manifest + image; nothing in gameplay changes.

export const NPC_VARIANT = 'survivor';
export const FRAME = Object.freeze({ w: 32, h: 32 });
export const PIVOT = Object.freeze({ x: 16, y: 30 }); // stable foot pivot (frame coordinates)

// Semantic animation request (from the render projection) → asset action name.
export const NPC_ACTIONS = Object.freeze(['idle', 'walk', 'gather', 'repair', 'rest', 'eat', 'drink', 'downed']);
const FRAME_COUNT = { idle: 1, walk: 2, gather: 2, repair: 2, rest: 1, eat: 1, drink: 1, downed: 1 };
const FPS = { walk: 6, gather: 4, repair: 4 };

// Step 3 of the fallback chain: if an action has no frames, a compatible generic action may stand in.
const GENERIC_ACTION = { gather: 'work', repair: 'work', craft: 'work', eat: 'consume', drink: 'consume', rest: 'idle', guard: 'idle', attack: 'idle', hit: 'idle', dead: 'downed' };

const dirName = (d) => String(d).toLowerCase();
export const npcKey = (action, direction, variant = NPC_VARIANT) => `npc_${variant}_${dirName(action)}_${dirName(direction)}`;
export const buildingKey = (type, level, condition) => `building_${type}_lv${level}_${condition}`;
export const nodeKey = (type, visual) => `node_${type}_${visual}`;
export const CONDITIONS = Object.freeze(['ruined', 'damaged', 'repaired']);

/**
 * Placeholder atlas manifest generated from data. Frames are laid out on a grid; transparent background,
 * fixed frame size, shared foot pivot. `buildings` = { type: [levels...] }, `nodes` = { type: true }.
 */
export function buildPlaceholderManifest({ buildings = {}, nodes = {} } = {}) {
  const frames = {};
  const animations = {};
  const order = [];
  const add = (key, spec) => { frames[key] = { spec }; order.push(key); };

  for (const dir of DIRECTIONS) {
    for (const action of NPC_ACTIONS) {
      const n = FRAME_COUNT[action];
      const list = [];
      for (let i = 0; i < n; i++) { const k = `${npcKey(action, dir)}_${i}`; add(k, { kind: 'npc', action, dir, i }); list.push(k); }
      animations[npcKey(action, dir)] = { frames: list, fps: FPS[action] ?? 0 };
    }
  }
  for (const [type, levels] of Object.entries(buildings)) {
    for (const level of levels) for (const condition of CONDITIONS) {
      const k = buildingKey(type, level, condition);
      add(k, { kind: 'building', type, level, condition });
      animations[k] = { frames: [k], fps: 0 };
    }
  }
  for (const type of Object.keys(nodes)) {
    for (const visual of ['available', 'depleted']) {
      const k = nodeKey(type, visual);
      add(k, { kind: 'node', type, visual });
      animations[k] = { frames: [k], fps: 0 };
    }
  }
  const cols = 12;
  order.forEach((k, idx) => { Object.assign(frames[k], { x: (idx % cols) * FRAME.w, y: Math.floor(idx / cols) * FRAME.h, w: FRAME.w, h: FRAME.h }); });
  return {
    version: 1, frame: { ...FRAME }, pivot: { ...PIVOT },
    sheet: { w: cols * FRAME.w, h: Math.ceil(order.length / cols) * FRAME.h },
    frames, animations,
  };
}

/** Manifest for the buildings/nodes that exist in the loaded definitions. */
export function placeholderManifestFor(defs) {
  const buildings = Object.fromEntries(Object.entries(defs.buildings).map(([t, b]) => [t, Object.keys(b.levels).map(Number)]));
  const nodes = Object.fromEntries(Object.keys(defs.nodeTypes).map((t) => [t, true]));
  return buildPlaceholderManifest({ buildings, nodes });
}

// Directions ordered by closeness to `dir` (ties go clockwise first), nearest first.
export function directionsByCloseness(dir) {
  const i = DIRECTIONS.indexOf(dir);
  if (i < 0) return [...DIRECTIONS];
  const out = [DIRECTIONS[i]];
  for (let d = 1; d <= 4; d++) {
    const cw = DIRECTIONS[(i + d) % 8]; const ccw = DIRECTIONS[(i - d + 8) % 8];
    out.push(cw); if (ccw !== cw) out.push(ccw);
  }
  return out;
}

export function createAssetResolver(manifest) {
  const has = (key) => Boolean(manifest.animations[key]);
  const pack = (key, step, requested) => {
    const anim = manifest.animations[key];
    return { key, step, requested, fps: anim.fps, frames: anim.frames.map((f) => ({ key: f, ...manifest.frames[f] })) };
  };
  const none = (requested) => ({ key: null, step: 6, requested, fps: 0, frames: [] });

  /**
   * NPC fallback chain:
   * 1 exact action+direction+variant · 2 same action, nearest supported direction · 3 compatible generic action ·
   * 4 IDLE in the current direction · 5 safe default idle · (6 nothing: renderer draws a procedural marker)
   */
  function resolveNpc({ animation = 'IDLE', direction = 'DOWN', variant = NPC_VARIANT } = {}) {
    const action = dirName(animation);
    const requested = npcKey(action, direction, variant);
    if (has(requested)) return pack(requested, 1, requested);
    for (const d of directionsByCloseness(direction)) { const k = npcKey(action, d, variant); if (has(k)) return pack(k, 2, requested); }
    const generic = GENERIC_ACTION[action];
    if (generic) for (const d of directionsByCloseness(direction)) { const k = npcKey(generic, d, variant); if (has(k)) return pack(k, 3, requested); }
    { const k = npcKey('idle', direction, variant); if (has(k)) return pack(k, 4, requested); }
    const safe = npcKey('idle', 'DOWN', variant);
    if (has(safe)) return pack(safe, 5, requested);
    return none(requested);
  }

  /** Building chain: exact · same condition at a lower level · same condition at any level of that type · nothing. */
  function resolveBuilding({ type, level = 1, condition = 'repaired' }) {
    const requested = buildingKey(type, level, condition);
    if (has(requested)) return pack(requested, 1, requested);
    for (let l = level - 1; l >= 1; l--) { const k = buildingKey(type, l, condition); if (has(k)) return pack(k, 2, requested); }
    for (let l = level + 1; l <= 9; l++) { const k = buildingKey(type, l, condition); if (has(k)) return pack(k, 3, requested); }
    return none(requested);
  }

  /** Node chain: exact · the 'available' look of the same type · nothing. */
  function resolveNode({ type, visual = 'available' }) {
    const requested = nodeKey(type, visual);
    if (has(requested)) return pack(requested, 1, requested);
    const k = nodeKey(type, 'available');
    if (has(k)) return pack(k, 2, requested);
    return none(requested);
  }

  return { manifest, resolveNpc, resolveBuilding, resolveNode };
}

/** Animation player (presentation only): which frame to show at `timeMs`. Never touches gameplay state. */
export function frameIndexAt(resolved, timeMs, offsetMs = 0) {
  const n = resolved.frames.length;
  if (n <= 1 || !resolved.fps) return 0;
  return Math.floor(((timeMs + offsetMs) / 1000) * resolved.fps) % n;
}

// ---- Placeholder painter (draws shapes into a 2D context; used to build the in-code atlas; no text) ----
const DIR_VEC = { UP: [0, -1], UP_RIGHT: [1, -1], RIGHT: [1, 0], DOWN_RIGHT: [1, 1], DOWN: [0, 1], DOWN_LEFT: [-1, 1], LEFT: [-1, 0], UP_LEFT: [-1, -1] };
const COND_TINT = { ruined: '#8a3b36', damaged: '#b8893a', repaired: '#5f8a5a' };

function paintNpc(c, ox, oy, { action, dir, i }) {
  const [dx, dy] = DIR_VEC[dir.toUpperCase?.() ?? dir] ?? [0, 1];
  const cx = ox + PIVOT.x; const foot = oy + PIVOT.y;
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(cx, foot, 8, 3, 0, 0, Math.PI * 2); c.fill();
  if (action === 'downed') {
    c.fillStyle = '#8a8a8a'; c.beginPath(); c.ellipse(cx, foot - 5, 11, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#b8b8b8'; c.beginPath(); c.arc(cx - 8, foot - 6, 4, 0, Math.PI * 2); c.fill();
    return;
  }
  const bob = action === 'walk' ? (i === 0 ? -1 : 1) : 0;
  const lower = action === 'rest' ? 4 : 0;
  c.fillStyle = '#d99a4e'; c.beginPath(); c.ellipse(cx, foot - 10 + lower + bob, 7, 9 - lower / 2, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f0c48a'; c.beginPath(); c.arc(cx, foot - 22 + lower + bob, 5, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2b2118'; c.beginPath(); c.arc(cx + dx * 2.5, foot - 22 + lower + bob + dy * 2, 1.4, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#2b2118'; c.lineWidth = 2; c.beginPath();
  if (action === 'gather') { c.moveTo(cx + dx * 4, foot - 12); c.lineTo(cx + dx * 9 + (i ? 2 : 0), foot - 4 + (i ? 2 : 0)); }
  else if (action === 'repair') { c.moveTo(cx + dx * 4, foot - 14); c.lineTo(cx + dx * 10, foot - 20 + (i ? 4 : 0)); }
  else if (action === 'eat' || action === 'drink') { c.moveTo(cx + dx * 3, foot - 14); c.lineTo(cx + dx * 4, foot - 20); }
  else { c.moveTo(cx - 5, foot - 10); c.lineTo(cx - 8, foot - 5); c.moveTo(cx + 5, foot - 10); c.lineTo(cx + 8, foot - 5); }
  c.stroke();
}

function paintBuilding(c, ox, oy, { type, level, condition }) {
  const tint = COND_TINT[condition] ?? '#888';
  const w = FRAME.w; const h = FRAME.h;
  if (type === 'hq') {
    c.fillStyle = '#6d5b49'; c.fillRect(ox + 3, oy + 10, w - 6, h - 13);
    c.fillStyle = tint; c.beginPath(); c.moveTo(ox + 1, oy + 11); c.lineTo(ox + w / 2, oy + 2); c.lineTo(ox + w - 1, oy + 11); c.closePath(); c.fill();
    c.fillStyle = '#2b2118'; c.fillRect(ox + w / 2 - 3, oy + 19, 6, h - 22);
    if (level > 1) { c.fillStyle = '#e8d9a8'; c.fillRect(ox + 5, oy + 13, 4, 4); c.fillRect(ox + w - 9, oy + 13, 4, 4); }
  } else if (type === 'tent') {
    c.fillStyle = tint; c.beginPath(); c.moveTo(ox + w / 2, oy + 4); c.lineTo(ox + w - 3, oy + h - 4); c.lineTo(ox + 3, oy + h - 4); c.closePath(); c.fill();
    c.fillStyle = '#2b2118'; c.beginPath(); c.moveTo(ox + w / 2, oy + 14); c.lineTo(ox + w / 2 + 4, oy + h - 4); c.lineTo(ox + w / 2 - 4, oy + h - 4); c.closePath(); c.fill();
  } else if (type === 'fence') {
    c.strokeStyle = tint; c.lineWidth = 3;
    const post = (x) => { c.beginPath(); c.moveTo(ox + x, oy + 8); c.lineTo(ox + x, oy + h - 6); c.stroke(); };
    post(6); post(w / 2); post(w - 6);
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(ox + 4, oy + 13); c.lineTo(ox + (condition === 'ruined' ? 12 : w - 4), oy + 13); c.stroke();
    c.beginPath(); c.moveTo(ox + 4, oy + 21); c.lineTo(ox + (condition === 'repaired' ? w - 4 : 14), oy + 21); c.stroke();
  } else if (type === 'storage') {
    // Storehouse: crates under a lean-to roof. Ruined = collapsed roof (tilted, short); damaged = sagging; repaired = flat.
    c.fillStyle = '#7a6244'; c.fillRect(ox + 4, oy + 14, w - 8, h - 18);
    c.fillStyle = '#5b4730'; c.fillRect(ox + 7, oy + 18, 8, 8); c.fillRect(ox + w - 15, oy + 18, 8, 8);
    c.fillStyle = tint; c.beginPath();
    if (condition === 'ruined') { c.moveTo(ox + 2, oy + 16); c.lineTo(ox + w - 6, oy + 12); c.lineTo(ox + w - 3, oy + 17); c.lineTo(ox + 2, oy + 19); }
    else if (condition === 'damaged') { c.moveTo(ox + 2, oy + 10); c.lineTo(ox + w - 2, oy + 13); c.lineTo(ox + w - 2, oy + 17); c.lineTo(ox + 2, oy + 14); }
    else { c.moveTo(ox + 2, oy + 9); c.lineTo(ox + w - 2, oy + 9); c.lineTo(ox + w - 2, oy + 14); c.lineTo(ox + 2, oy + 14); }
    c.closePath(); c.fill();
  } else if (type === 'gate') {
    // Gate: two posts and a door. Ruined = door gone; damaged = door hanging half open; repaired = closed door.
    c.fillStyle = '#6d5b49'; c.fillRect(ox + 3, oy + 8, 5, h - 12); c.fillRect(ox + w - 8, oy + 8, 5, h - 12);
    c.fillStyle = tint;
    if (condition === 'repaired') c.fillRect(ox + 8, oy + 12, w - 16, h - 18);
    else if (condition === 'damaged') { c.beginPath(); c.moveTo(ox + 8, oy + 12); c.lineTo(ox + 15, oy + 14); c.lineTo(ox + 15, oy + h - 8); c.lineTo(ox + 8, oy + h - 6); c.closePath(); c.fill(); }
    else { c.fillRect(ox + 9, oy + h - 9, 5, 3); }
  } else {
    c.fillStyle = tint; c.fillRect(ox + 4, oy + 4, w - 8, h - 8);
  }
  if (condition !== 'repaired') { // crack marks, no text
    c.strokeStyle = 'rgba(20,12,8,0.7)'; c.lineWidth = 1.5; c.beginPath();
    c.moveTo(ox + 10, oy + 12); c.lineTo(ox + 15, oy + 18); c.lineTo(ox + 12, oy + 25); c.stroke();
  }
}

function paintNode(c, ox, oy, { type, visual }) {
  const cx = ox + PIVOT.x; const foot = oy + PIVOT.y; const full = visual === 'available';
  if (type === 'tree') {
    c.fillStyle = '#5a3f27'; c.fillRect(cx - 2, foot - (full ? 12 : 5), 4, full ? 12 : 5);
    if (full) { c.fillStyle = '#3f8f4f'; c.beginPath(); c.arc(cx, foot - 18, 11, 0, Math.PI * 2); c.fill(); }
  } else {
    c.fillStyle = full ? '#8b8f94' : '#5f6368';
    c.beginPath(); c.moveTo(cx - 10, foot); c.lineTo(cx - 6, foot - (full ? 14 : 5)); c.lineTo(cx + 5, foot - (full ? 16 : 6)); c.lineTo(cx + 11, foot); c.closePath(); c.fill();
  }
}

/** Paint every frame of `manifest` onto a 2D context (transparent background). */
export function paintPlaceholderAtlas(ctx, manifest) {
  for (const f of Object.values(manifest.frames)) {
    const { spec } = f;
    if (spec.kind === 'npc') paintNpc(ctx, f.x, f.y, spec);
    else if (spec.kind === 'building') paintBuilding(ctx, f.x, f.y, spec);
    else paintNode(ctx, f.x, f.y, spec);
  }
}
