// PA-4 static objects and fences. Presentation only (spec §4, §6, §17, §22 phase 4).
// 1. Object registry: every world object has an explicit LOGICAL footprint (grid cells) that is independent of how big its
//    sprite is drawn. A tree's canopy may reach over its neighbours; the tree still occupies exactly its own cell.
// 2. Fence autotiling: which fence piece a perimeter cell shows depends only on its neighbours on the fence line.
import { N, E, S, W, pathKeyForMask } from './terrain.js';

/** `footprint` = cells the object owns (w×h from its anchor cell, top-left). `spriteSize` = sprite size as a multiple of the cell. */
export const OBJECT_SPECS = Object.freeze({
  tree: Object.freeze({ footprint: Object.freeze({ w: 1, h: 1 }), spriteSize: 1.5 }),
  rock: Object.freeze({ footprint: Object.freeze({ w: 1, h: 1 }), spriteSize: 1 }),
});
const DEFAULT_OBJECT = OBJECT_SPECS.rock;
export const objectSpec = (type) => OBJECT_SPECS[type] ?? DEFAULT_OBJECT;

/** Logical cells an object owns, from its anchor. This — never the sprite size — is what interaction code may rely on. */
export function footprintCells(x, y, spec) {
  const out = [];
  for (let dy = 0; dy < spec.footprint.h; dy++) for (let dx = 0; dx < spec.footprint.w; dx++) out.push([x + dx, y + dy]);
  return out;
}

/** Cells on the perimeter of an inclusive rectangle (same order the renderer always used). */
export function perimeterOf({ x1, y1, x2, y2 }) {
  const out = [];
  for (let x = x1; x <= x2; x++) { out.push([x, y1]); if (y2 > y1) out.push([x, y2]); }
  for (let y = y1 + 1; y < y2; y++) { out.push([x1, y]); if (x2 > x1) out.push([x2, y]); }
  return out;
}

export const fencePieceKey = (mask, level, condition) => `fence_${pathKeyForMask(mask).slice(5)}_lv${level}_${condition}`;

/**
 * Fence pieces of a frame: one per perimeter cell, except cells a standing building (the gate) occupies.
 * A side connects to the next perimeter cell or to a gate on the line. Returns [{ id, x, y, mask, level, condition, key }].
 */
export function fenceCells(frame) {
  const out = [];
  const buildings = frame.buildings || [];
  const standing = new Set(buildings.filter((q) => !q.bounds).map((q) => `${q.x},${q.y}`));
  for (const b of buildings) {
    if (!b.bounds) continue;
    const line = new Set(perimeterOf(b.bounds).map(([x, y]) => `${x},${y}`));
    const gates = new Set(buildings.filter((q) => q.type === 'gate').map((q) => `${q.x},${q.y}`));
    const joins = (x, y) => (line.has(`${x},${y}`) && !standing.has(`${x},${y}`)) || gates.has(`${x},${y}`);
    for (const [x, y] of perimeterOf(b.bounds)) {
      if (standing.has(`${x},${y}`)) continue;
      const mask = (joins(x, y - 1) ? N : 0) | (joins(x + 1, y) ? E : 0) | (joins(x, y + 1) ? S : 0) | (joins(x - 1, y) ? W : 0);
      out.push({ id: b.id, x, y, mask, level: b.level, condition: b.condition, key: fencePieceKey(mask, b.level, b.condition) });
    }
  }
  return out;
}

// ---- placeholder painter for a fence piece: a post in the middle, rails toward every connected side ----
const COND = { ruined: '#8a3b36', damaged: '#b8893a', repaired: '#5f8a5a' };
export function paintFencePiece(c, ox, oy, { mask, level, condition }, size = 32) {
  const u = size / 32; const mid = 16 * u; const tint = COND[condition] ?? '#888';
  const reach = condition === 'ruined' ? 0.45 : condition === 'damaged' ? 0.75 : 1; // how much of each arm still stands
  const post = level > 1 ? 6 * u : 4 * u; const half = post / 2;
  c.fillStyle = tint;
  const rail = (dx, dy, offset) => { // an arm from the centre toward (dx,dy), `offset` px off the centre line
    const len = mid * reach;
    if (dx) c.fillRect(dx > 0 ? ox + mid : ox + mid - len, oy + mid - u + offset, len, 2 * u);
    else c.fillRect(ox + mid - u + offset, dy > 0 ? oy + mid : oy + mid - len, 2 * u, len);
  };
  for (const [bit, dx, dy] of [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]]) {
    if (!(mask & bit)) continue;
    rail(dx, dy, -4 * u); if (condition !== 'ruined' || level > 1) rail(dx, dy, 4 * u);
    if (level > 1) rail(dx, dy, 0);
  }
  c.fillStyle = level > 1 ? '#8b8f94' : '#5b4730'; c.fillRect(ox + mid - half, oy + mid - 10 * u, post, 20 * u); // the post
  if (condition !== 'repaired') { c.fillStyle = 'rgba(20,12,8,0.7)'; c.fillRect(ox + mid - half, oy + mid + (condition === 'ruined' ? 0 : 4 * u), post, 2 * u); }
}

// ---- PA-5 multi-cell buildings: where a building's sprite goes ----
/** Inclusive rectangle a building occupies: its declared footprint, else just its own cell. */
export const buildingRect = (b) => b.footprint ?? { x1: b.x, y1: b.y, x2: b.x, y2: b.y };
/** Cells of a building (row-major). The door is the building's own (x, y); it is one of these cells. */
export function buildingCells(b) {
  const r = buildingRect(b); const out = [];
  for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) out.push([x, y]);
  return out;
}
/**
 * Sprite placement in GRID units: horizontally centred on the footprint, feet on its bottom row, drawn `size` cells wide
 * (a 1-cell frame is stretched to the footprint width, so a 3x3 building draws a 3x3 sprite). Pure; no pixels here.
 */
export function buildingPlacement(b) {
  const r = buildingRect(b); const w = r.x2 - r.x1 + 1;
  return { gx: (r.x1 + r.x2) / 2, gy: r.y2, size: w };
}
