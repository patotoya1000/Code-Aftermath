import { DIRECTIONS } from '../../kernel/index.js';
import { GROUND_VARIANTS, terrainKey, paintTerrainTile, PATH_KEYS, paintPathTile } from './terrain.js';

import { paintFencePiece, fencePieceKey } from './objects.js';
export { NODE_ART_DIR, REF_W, WORN_BELOW, NODE_FAMILIES, TREE_FAMILIES, NODE_VARIANTS, nodeStage, nodeSpriteKey, createNodeArt } from './nodeart.js';
export { NPC_ART_DIR, NPC_REF_H, NPC_CELLS, NPC_POSES, NPC_ANCHORS, VIEW_OF, npcPose, toolPoseFor, walkFrameAt, createNpcArt, isStoneWork, workSwing, facingVector, WORK_SWING_MS, WORK_LUNGE_CELLS, WORK_TILT_RAD } from './npcart.js';
export { BUILDING_ART_DIR, BUILDING_ART, ART_CONDITIONS, LEVEL_ART, LEVEL_TINT, createBuildingArt } from './buildingart.js';
export { WALL_SECTION_CELLS, WALL_ART_LEVELS, wallSections, artLevel } from './wallart.js';
export { BACKDROP_DIR, BACKDROP_FILES, BACKDROP_BANDS, BAND_TUNING, createBackdropArt, bandLayout } from './backdrops.js';
export { ICON_DIR, ITEM_ICONS, ICON_FILES, hasIcon, iconUrl } from './icons.js';
export { OBJECT_SPECS, objectSpec, footprintCells, fenceCells, fencePieceKey, buildingRect, buildingCells, buildingPlacement } from './objects.js';
export { GROUND_KINDS, GROUND_VARIANTS, terrainKey, tileVariant, groundGrid, tileKeyAt, pathKeyForMask, pathCells, PATH_KEYS } from './terrain.js';

// Asset module: semantic state → asset key → atlas frame(s). Pure data + pure functions, no DOM, no gameplay.
// The renderer asks "what does NPC walking down-right look like?"; this module answers with a frame rect.
// Real art drops in by supplying a different manifest + image; nothing in gameplay changes.

// one atlas frame per road piece: PATH_KEYS has 16 distinct keys, one per connection mask
const PATH_KEYS_MASK = Object.fromEntries(PATH_KEYS.map((k, m) => [k, m]));

export const NPC_VARIANT = 'survivor';
export const FRAME = Object.freeze({ w: 32, h: 32 });
export const PIVOT = Object.freeze({ x: 16, y: 30 }); // stable foot pivot (frame coordinates)

// Semantic animation request (from the render projection) → asset action name.
export const NPC_ACTIONS = Object.freeze(['idle', 'walk', 'gather', 'repair', 'rest', 'eat', 'drink', 'consume', 'work', 'guard', 'attack', 'hurt', 'downed', 'dead']);
const FRAME_COUNT = { idle: 1, walk: 2, gather: 2, repair: 2, rest: 1, eat: 1, drink: 1, consume: 1, work: 2, guard: 1, attack: 2, hurt: 1, downed: 1, dead: 1 };
const FPS = { walk: 6, gather: 4, repair: 4, work: 4, attack: 6, hurt: 4 };
export const ZOMBIE_ACTIONS = Object.freeze(['idle', 'walk', 'attack', 'hurt', 'dead']);
const ZOMBIE_FRAME_COUNT = { idle: 1, walk: 2, attack: 2, hurt: 1, dead: 1 };
const ZOMBIE_FPS = { walk: 5, attack: 6, hurt: 4 };

// Step 3 of the fallback chain: if an action has no frames, a compatible generic action may stand in.
const GENERIC_ACTION = { gather: 'work', repair: 'work', upgrade: 'work', craft: 'work', eat: 'consume', drink: 'consume', rest: 'idle', guard: 'guard', attack: 'attack', hit: 'hurt', hurt: 'hurt', dead: 'dead', downed: 'downed', work: 'work' };

const dirName = (d) => String(d).toLowerCase();
export const npcKey = (action, direction, variant = NPC_VARIANT) => `npc_${variant}_${dirName(action)}_${dirName(direction)}`;
export const zombieKey = (action, direction) => `zombie_${dirName(action)}_${dirName(direction)}`;
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
  for (const dir of DIRECTIONS) {
    for (const action of ZOMBIE_ACTIONS) {
      const n = ZOMBIE_FRAME_COUNT[action];
      const list = [];
      for (let i = 0; i < n; i++) { const k = `${zombieKey(action, dir)}_${i}`; add(k, { kind: 'npc', action, dir, i, zombie: true }); list.push(k); }
      animations[zombieKey(action, dir)] = { frames: list, fps: ZOMBIE_FPS[action] ?? 0 };
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
  for (const [ground, count] of Object.entries(GROUND_VARIANTS)) {
    for (let i = 1; i <= count; i++) { const k = terrainKey(ground, i); add(k, { kind: 'terrain', ground, i }); animations[k] = { frames: [k], fps: 0 }; }
  }
  for (const key of PATH_KEYS) if (!frames[key]) { add(key, { kind: 'path', mask: PATH_KEYS_MASK[key] }); animations[key] = { frames: [key], fps: 0 }; }
  for (const level of buildings.fence ?? []) for (const condition of CONDITIONS) for (let mask = 0; mask < 16; mask++) {
    const k = fencePieceKey(mask, level, condition); add(k, { kind: 'fence', mask, level, condition }); animations[k] = { frames: [k], fps: 0 };
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

  function resolveZombie({ animation = 'IDLE', direction = 'DOWN' } = {}) {
    const action = dirName(animation);
    const requested = zombieKey(action, direction);
    if (has(requested)) return pack(requested, 1, requested);
    for (const d of directionsByCloseness(direction)) { const k = zombieKey(action, d); if (has(k)) return pack(k, 2, requested); }
    const generic = ZOMBIE_GENERIC_ACTION[action] ?? 'idle';
    for (const d of directionsByCloseness(direction)) { const k = zombieKey(generic, d); if (has(k)) return pack(k, 3, requested); }
    const idle = zombieKey('idle', direction); if (has(idle)) return pack(idle, 4, requested);
    const safe = zombieKey('idle', 'DOWN'); if (has(safe)) return pack(safe, 5, requested);
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

  /** Terrain chain: exact variant · variant 1 of the same ground · grass variant 1 · nothing (the renderer fills a flat colour). */
  function resolveTerrain(key) {
    if (has(key)) return pack(key, 1, key);
    const m = /^terrain_([a-z]+)_\d+$/.exec(key);
    if (m) { const k = terrainKey(m[1], 1); if (has(k)) return pack(k, 2, key); }
    const g = terrainKey('grass', 1);
    if (has(g)) return pack(g, 3, key);
    return none(key);
  }

  /** Path chain: exact piece · the isolated piece · nothing (the renderer draws a plain band). */
  function resolvePath(key) {
    if (has(key)) return pack(key, 1, key);
    if (has('path_isolated')) return pack('path_isolated', 2, key);
    return none(key);
  }

  /** Fence piece chain: exact · same shape and condition at another level · isolated post of that level/condition · nothing (renderer uses the whole-fence building art). */
  function resolveFence({ mask = 0, level = 1, condition = 'repaired' }) {
    const requested = fencePieceKey(mask, level, condition);
    if (has(requested)) return pack(requested, 1, requested);
    for (let l = level - 1; l >= 1; l--) { const k = fencePieceKey(mask, l, condition); if (has(k)) return pack(k, 2, requested); }
    for (let l = level + 1; l <= 9; l++) { const k = fencePieceKey(mask, l, condition); if (has(k)) return pack(k, 2, requested); }
    const k = fencePieceKey(0, level, condition);
    if (has(k)) return pack(k, 3, requested);
    return none(requested);
  }

  return { manifest, resolveNpc, resolveZombie, resolveBuilding, resolveNode, resolveTerrain, resolvePath, resolveFence };
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

function paintNpc(c, ox, oy, { action, dir, i, zombie = false }) {
  const [dx, dy] = DIR_VEC[dir.toUpperCase?.() ?? dir] ?? [0, 1];
  const cx = ox + PIVOT.x; const foot = oy + PIVOT.y;
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(cx, foot, 8, 3, 0, 0, Math.PI * 2); c.fill();

  if (action === 'downed' || action === 'dead') {
    c.fillStyle = action === 'dead' ? '#7b7b7b' : '#8a8a8a'; c.beginPath(); c.ellipse(cx, foot - 5, 11, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = action === 'dead' ? '#b0b0b0' : '#b8b8b8'; c.beginPath(); c.arc(cx - 8, foot - 6, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2b2118'; c.beginPath(); c.arc(cx + dx * 2.5, foot - 22, 1.4, 0, Math.PI * 2); c.fill();
    return;
  }

  const bob = action === 'walk' ? (i === 0 ? -1 : 1) : 0;
  const lower = action === 'rest' ? 4 : 0;
  const hurt = action === 'hurt';
  const bodyTint = zombie ? (hurt ? '#a35f4e' : '#5f7a4e') : hurt ? '#d77a64' : '#d99a4e'; // a placeholder zombie is grey-green, so it is never mistaken for a survivor
  const skinTint = zombie ? (hurt ? '#c79a8c' : '#9db586') : hurt ? '#f5b5a7' : '#f0c48a';
  const stance = action === 'attack' ? 2 : 0;

  c.fillStyle = bodyTint; c.beginPath(); c.ellipse(cx, foot - 10 + lower + bob, 7, 9 - lower / 2, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = skinTint; c.beginPath(); c.arc(cx, foot - 22 + lower + bob, 5, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2b2118'; c.beginPath(); c.arc(cx + dx * 2.5, foot - 22 + lower + bob + dy * 2, 1.4, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#2b2118'; c.lineWidth = 2; c.beginPath();
  if (action === 'gather' || action === 'work') { c.moveTo(cx + dx * 4, foot - 12); c.lineTo(cx + dx * 9 + (i ? 2 : 0), foot - 4 + (i ? 2 : 0)); }
  else if (action === 'repair') { c.moveTo(cx + dx * 4, foot - 14); c.lineTo(cx + dx * 10, foot - 20 + (i ? 4 : 0)); }
  else if (action === 'eat' || action === 'drink' || action === 'consume') { c.moveTo(cx + dx * 3, foot - 14); c.lineTo(cx + dx * 4, foot - 20); }
  else if (action === 'attack') { c.moveTo(cx + dx * 4, foot - 12); c.lineTo(cx + dx * 12 + stance, foot - 16 + (i ? 2 : 0)); }
  else if (action === 'guard') { c.moveTo(cx - 6, foot - 10); c.lineTo(cx + 2, foot - 14); c.moveTo(cx + 6, foot - 10); c.lineTo(cx - 2, foot - 14); }
  else if (action === 'hurt') { c.moveTo(cx - 3, foot - 12); c.lineTo(cx - 8, foot - 5); c.moveTo(cx + 3, foot - 12); c.lineTo(cx + 8, foot - 5); }
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
    if (level > 1) { c.fillStyle = '#9fc4e0'; c.fillRect(ox + 4, oy + 26, w - 8, 3); } // cold cellar: a frosty band
    if (level > 2) { c.fillStyle = '#e8f4ff'; c.fillRect(ox + 4, oy + 20, w - 8, 2); c.fillStyle = '#5d6168'; c.fillRect(ox + w - 10, oy + 4, 4, 8); } // freezer: a second band and a vent
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
  } else if (type === 'well') {
    // Deep well: a round stone rim with a crossbeam roof. Ruined = planks over the opening and a sagging beam; damaged = water visible,
    // roof leaning; repaired = open water and a level roof. Level 2 adds the siphon tube leaving to the right.
    c.fillStyle = '#7b7f85'; c.fillRect(ox + 7, oy + 16, w - 14, 11);
    c.fillStyle = '#5d6168'; c.beginPath(); c.ellipse(ox + w / 2, oy + 27, (w - 14) / 2, 3, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = condition === 'ruined' ? '#4a3a2a' : '#2a5f8f'; c.beginPath(); c.ellipse(ox + w / 2, oy + 16, (w - 14) / 2 - 2, 3.5, 0, 0, Math.PI * 2); c.fill();
    if (condition === 'ruined') { c.fillStyle = '#6b523a'; c.fillRect(ox + 9, oy + 14, w - 18, 3); }
    c.fillStyle = '#5b4730'; c.fillRect(ox + 8, oy + 5, 3, 12); c.fillRect(ox + w - 11, oy + 5, 3, 12);
    c.fillStyle = tint; c.beginPath();
    if (condition === 'ruined') { c.moveTo(ox + 5, oy + 9); c.lineTo(ox + w - 7, oy + 6); c.lineTo(ox + w - 5, oy + 10); c.lineTo(ox + 5, oy + 12); }
    else if (condition === 'damaged') { c.moveTo(ox + 5, oy + 4); c.lineTo(ox + w - 5, oy + 7); c.lineTo(ox + w - 5, oy + 10); c.lineTo(ox + 5, oy + 7); }
    else { c.moveTo(ox + 5, oy + 4); c.lineTo(ox + w - 5, oy + 4); c.lineTo(ox + w - 5, oy + 8); c.lineTo(ox + 5, oy + 8); }
    c.closePath(); c.fill();
    if (level > 1) { c.strokeStyle = '#9fb6c9'; c.lineWidth = 3; c.beginPath(); c.moveTo(ox + w - 9, oy + 22); c.lineTo(ox + w - 1, oy + 22); c.stroke(); c.fillStyle = '#9fb6c9'; c.fillRect(ox + w - 4, oy + 19, 4, 6); }
  } else if (type === 'water_tank') {
    // Water tank: a barrel on short legs with a pipe stub. Ruined = split and tilted (shorter); level 2 is taller with a second band.
    const top = condition === 'ruined' ? 12 : level > 1 ? 4 : 7;
    c.fillStyle = '#5b4730'; c.fillRect(ox + 8, oy + 24, 3, 6); c.fillRect(ox + w - 11, oy + 24, 3, 6);
    c.fillStyle = '#6f8fa8'; c.fillRect(ox + 7, oy + top, w - 14, 24 - top);
    c.fillStyle = tint; c.fillRect(ox + 7, oy + top + 4, w - 14, 3); if (level > 1) c.fillRect(ox + 7, oy + top + 12, w - 14, 3);
    c.fillStyle = '#4d6b82'; c.beginPath(); c.ellipse(ox + w / 2, oy + top, (w - 14) / 2, 3, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9fb6c9'; c.fillRect(ox + w - 6, oy + 21, 5, 3);
  } else if (type === 'generator') {
    // Generator: an engine block on a base with an exhaust pipe. Ruined = tilted, no pipe; damaged = pipe stub, dented; repaired = pipe with a
    // glowing indicator. Level 2 (advanced) is bigger with a second cooling fin bank.
    const lift = level > 1 ? 4 : 0;
    c.fillStyle = '#4a4f55'; c.fillRect(ox + 4, oy + h - 8, w - 8, 5);
    c.fillStyle = condition === 'ruined' ? '#5f5a52' : '#7d8a96'; c.fillRect(ox + 6, oy + 12 - lift, w - 12, h - 20 + lift);
    c.fillStyle = tint; c.fillRect(ox + 6, oy + 12 - lift, w - 12, 4);
    c.fillStyle = '#3a3f45'; for (let i = 0; i < (level > 1 ? 4 : 2); i++) c.fillRect(ox + 9 + i * 5, oy + 19 - lift, 3, 8 + lift);
    if (condition !== 'ruined') { c.fillStyle = '#5d6168'; c.fillRect(ox + w - 10, oy + (condition === 'repaired' ? 3 : 7), 4, condition === 'repaired' ? 11 : 6); }
    c.fillStyle = condition === 'repaired' ? '#7fe07f' : '#3a2f2a'; c.fillRect(ox + w - 12, oy + 22, 4, 3);
  } else if (type === 'solar_panel') {
    // Solar panel: a tilted blue panel on a stand. Ruined = cracked and fallen flat; damaged = half the cells dark; repaired = bright grid.
    c.fillStyle = '#5b4730'; c.fillRect(ox + w / 2 - 1.5, oy + 18, 3, h - 22);
    c.fillStyle = condition === 'ruined' ? '#3a3f4a' : '#2f5fa8';
    c.beginPath(); c.moveTo(ox + 4, oy + 18); c.lineTo(ox + 9, oy + (condition === 'ruined' ? 14 : 7)); c.lineTo(ox + w - 4, oy + (condition === 'ruined' ? 16 : 7)); c.lineTo(ox + w - 7, oy + 18); c.closePath(); c.fill();
    if (condition !== 'ruined') { c.strokeStyle = condition === 'repaired' ? '#9fc4e0' : '#5f7fa8'; c.lineWidth = 1; c.beginPath(); c.moveTo(ox + w / 2, oy + 7); c.lineTo(ox + w / 2 - 2, oy + 18); c.moveTo(ox + 7, oy + 12); c.lineTo(ox + w - 6, oy + 12); c.stroke(); }
    c.strokeStyle = tint; c.lineWidth = 2; c.beginPath(); c.moveTo(ox + 4, oy + 18); c.lineTo(ox + w - 7, oy + 18); c.stroke();
  } else if (type === 'tower') {
    // Watchtower: legs, a platform and a rail. Level 1 is a low lookout; level 2 is taller with a roof; level 3 has a stone base, a roof and a beacon.
    // Ruined = leaning legs and no platform; damaged = a broken rail; repaired = whole.
    const top = 18 - level * 4; const lean = condition === 'ruined' ? 3 : 0;
    c.fillStyle = level > 2 ? '#7d7f84' : '#5b4730'; c.fillRect(ox + 8 + lean, oy + top + 6, 3, h - top - 10); c.fillRect(ox + w - 11 - lean, oy + top + 6, 3, h - top - 10);
    if (level > 2) { c.fillStyle = '#6a6c71'; c.fillRect(ox + 6, oy + h - 8, w - 12, 5); }
    if (condition !== 'ruined') { c.fillStyle = '#7a6244'; c.fillRect(ox + 5, oy + top + 3, w - 10, 4); c.fillStyle = tint; c.fillRect(ox + 5, oy + top - (condition === 'repaired' ? 1 : 0), w - 10, 2); }
    if (level > 1 && condition !== 'ruined') { c.fillStyle = tint; c.beginPath(); c.moveTo(ox + 4, oy + top - 1); c.lineTo(ox + w / 2, oy + top - 8); c.lineTo(ox + w - 4, oy + top - 1); c.closePath(); c.fill(); }
    if (level > 2 && condition === 'repaired') { c.fillStyle = '#ffd060'; c.fillRect(ox + w / 2 - 1, oy + top - 12, 3, 3); }
  } else if (type === 'battery') {
    // Battery bank: stacked cells with a terminal cap. Ruined = tipped, dark; repaired = bright cells (level 2 has a third cell).
    const cells = level > 1 ? 3 : 2;
    for (let i = 0; i < cells; i++) {
      const cx = ox + 6 + i * 8; const lean = condition === 'ruined' ? 3 : 0;
      c.fillStyle = condition === 'ruined' ? '#3a3f45' : '#4f6f58'; c.fillRect(cx, oy + 10 + lean, 7, h - 18);
      c.fillStyle = condition === 'repaired' ? '#7fe07f' : '#2b2f33'; c.fillRect(cx + 1, oy + 13 + lean, 5, 3);
      c.fillStyle = '#9aa0a6'; c.fillRect(cx + 2, oy + 7 + lean, 3, 3);
    }
    c.fillStyle = tint; c.fillRect(ox + 4, oy + h - 9, w - 8, 3);
  } else if (type === 'kitchen') {
    // Kitchen: a small hut with a chimney and an oven opening. Ruined = no chimney, roof caved in; damaged = chimney stub, sagging roof;
    // repaired = chimney with a puff of smoke and a lit oven.
    c.fillStyle = '#7a6244'; c.fillRect(ox + 4, oy + 12, w - 8, h - 16);
    c.fillStyle = condition === 'repaired' ? '#e0a040' : '#2b2118'; c.fillRect(ox + 11, oy + 19, 10, 9);
    if (condition !== 'ruined') { c.fillStyle = '#5d6168'; c.fillRect(ox + w - 11, oy + (condition === 'repaired' ? 3 : 7), 5, condition === 'repaired' ? 10 : 6); }
    if (condition === 'repaired') { c.fillStyle = 'rgba(220,220,220,0.8)'; c.beginPath(); c.arc(ox + w - 8, oy + 3, 2.5, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = tint; c.beginPath();
    if (condition === 'ruined') { c.moveTo(ox + 3, oy + 15); c.lineTo(ox + w - 6, oy + 11); c.lineTo(ox + w - 3, oy + 16); c.lineTo(ox + 3, oy + 18); }
    else if (condition === 'damaged') { c.moveTo(ox + 2, oy + 12); c.lineTo(ox + w / 2, oy + 6); c.lineTo(ox + w - 2, oy + 12); c.lineTo(ox + w - 2, oy + 15); c.lineTo(ox + 2, oy + 15); }
    else { c.moveTo(ox + 2, oy + 12); c.lineTo(ox + w / 2, oy + 4); c.lineTo(ox + w - 2, oy + 12); }
    c.closePath(); c.fill();
  } else if (type === 'workshop') {
    // Workshop: an open-front shed with a workbench and an anvil. Ruined = roof collapsed, no anvil; damaged = sagging roof; repaired = anvil and a
    // lit window. Level 2 (forge) adds a chimney stack with a glowing furnace mouth.
    c.fillStyle = '#6e5a40'; c.fillRect(ox + 4, oy + 12, w - 8, h - 16);
    c.fillStyle = '#2b2118'; c.fillRect(ox + 8, oy + 18, w - 16, 10);
    if (condition !== 'ruined') { c.fillStyle = '#9aa0a6'; c.fillRect(ox + 11, oy + 22, 9, 3); c.fillRect(ox + 13, oy + 25, 5, 3); }
    if (level > 1 && condition !== 'ruined') { c.fillStyle = '#5d6168'; c.fillRect(ox + w - 10, oy + 2, 5, 12); c.fillStyle = condition === 'repaired' ? '#ff8a3c' : '#5a3a28'; c.fillRect(ox + w - 12, oy + 22, 5, 4); }
    if (level > 2 && condition !== 'ruined') { c.fillStyle = '#3d4046'; c.fillRect(ox + 5, oy + 14, 4, 12); c.fillStyle = '#c9ced4'; c.fillRect(ox + 5, oy + 12, 4, 2); c.fillStyle = '#e8c04a'; c.fillRect(ox + 12, oy + 14, 7, 2); } // Armory: a rack of weapons on the wall
    c.fillStyle = tint; c.beginPath();
    if (condition === 'ruined') { c.moveTo(ox + 3, oy + 15); c.lineTo(ox + w - 6, oy + 11); c.lineTo(ox + w - 3, oy + 17); c.lineTo(ox + 3, oy + 19); }
    else if (condition === 'damaged') { c.moveTo(ox + 2, oy + 13); c.lineTo(ox + w / 2, oy + 7); c.lineTo(ox + w - 2, oy + 13); c.lineTo(ox + w - 2, oy + 16); c.lineTo(ox + 2, oy + 16); }
    else { c.moveTo(ox + 2, oy + 12); c.lineTo(ox + w / 2, oy + 5); c.lineTo(ox + w - 2, oy + 12); }
    c.closePath(); c.fill();
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
    else if (spec.kind === 'fence') paintFencePiece(ctx, f.x, f.y, spec, FRAME.w);
    else if (spec.kind === 'path') paintPathTile(ctx, f.x, f.y, spec, FRAME.w);
    else if (spec.kind === 'terrain') paintTerrainTile(ctx, f.x, f.y, spec, FRAME.w);
    else if (spec.kind === 'building') paintBuilding(ctx, f.x, f.y, spec);
    else paintNode(ctx, f.x, f.y, spec);
  }
}
