// PA-2 terrain: which ground each grid cell shows, and which tile variant. Pure functions over plain data (the render
// projection). Presentation only: nothing here is read by gameplay, and nothing here uses the simulation RNG — variety comes
// from a hash of the cell coordinates, so a cell always looks the same (no flicker, no save-file impact).
// Spec: docs/game/18-grid-asset-integration.md §5.1, §22 phase 2.

/** Ground kinds and how many interchangeable tile variants each has. */
export const GROUND_VARIANTS = Object.freeze({ grass: 4, dirt: 3, soil: 2, damaged: 2 });
export const GROUND_KINDS = Object.freeze(Object.keys(GROUND_VARIANTS));
export const DEFAULT_GROUND = 'grass';

export const terrainKey = (kind, variant) => `terrain_${kind}_${String(variant).padStart(2, '0')}`;

/** Deterministic variant 1..count for a cell (integer hash of x, y). */
export function tileVariant(x, y, count) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) % Math.max(1, count) + 1;
}

const inRect = (r, x, y) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;

/**
 * Ground kind for every cell: rows of kind names, `grid[y][x]`.
 * - outside: grass · trodden yard inside the fence bounds: dirt · path cells: dirt
 * - the cell under a ruined/damaged building: damaged ground (it returns to dirt once the building is repaired)
 * - a terrain zone may name its own `ground` (e.g. a future field = 'soil'); unknown names are ignored.
 */
export function groundGrid(frame) {
  const { width, height } = frame.map;
  const grid = Array.from({ length: height }, () => Array(width).fill(DEFAULT_GROUND));
  const set = (x, y, kind) => { if (x >= 0 && y >= 0 && x < width && y < height) grid[y][x] = kind; };
  const terrain = frame.terrain || {};
  for (const z of terrain.zones || []) if (GROUND_VARIANTS[z.ground]) for (let y = z.y1; y <= z.y2; y++) for (let x = z.x1; x <= z.x2; x++) set(x, y, z.ground);
  const buildings = frame.buildings || [];
  for (const b of buildings) if (b.bounds && b.bounds.shape !== 'line') for (let y = b.bounds.y1 + 1; y < b.bounds.y2; y++) for (let x = b.bounds.x1 + 1; x < b.bounds.x2; x++) if (grid[y]?.[x] === DEFAULT_GROUND) set(x, y, 'dirt');
  for (const p of terrain.paths || []) for (const [x, y] of p.cells) set(x, y, 'dirt');
  for (const b of buildings) if (!b.bounds && (b.condition === 'ruined' || b.condition === 'damaged')) {
    const r = b.footprint ?? { x1: b.x, y1: b.y, x2: b.x, y2: b.y }; // PA-5: the whole footprint, not just the door
    for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) set(x, y, 'damaged');
  }
  return grid;
}

/** Tile key for one cell of a ground grid. */
export const tileKeyAt = (grid, x, y) => { const kind = grid[y][x]; return terrainKey(kind, tileVariant(x, y, GROUND_VARIANTS[kind])); };

// ---- placeholder painter: opaque, seamless 32x32 tiles built from 4px "pixels" (no text) ----
const PALETTE = {
  grass: ['#2f5a34', '#33613a', '#2b5230', '#386a3f'],
  dirt: ['#6b5638', '#73603f', '#634f33', '#7a6644'],
  soil: ['#4a3624', '#503b27', '#44311f', '#563f2b'],
  damaged: ['#4d4338', '#554a3e', '#463d33', '#5c5144'],
};
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Paint one terrain tile at (ox, oy) of size `size`. Features stay inside the tile so neighbours always tile without seams. */
export function paintTerrainTile(c, ox, oy, { ground, i }, size = 32) {
  const colors = PALETTE[ground] ?? PALETTE.grass;
  const rnd = lcg(ground.length * 7919 + i * 104729);
  const px = size / 8;
  for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) { c.fillStyle = colors[Math.floor(rnd() * colors.length)]; c.fillRect(ox + bx * px, oy + by * px, px, px); }
  if (ground === 'grass') { // tufts: two short blades
    c.fillStyle = '#4c8a4f';
    for (let n = 0; n < 2 + (i % 2); n++) { const x = ox + px * (1 + Math.floor(rnd() * 5)); const y = oy + px * (1 + Math.floor(rnd() * 5)); c.fillRect(x, y, px / 2, px); c.fillRect(x + px / 2, y + px / 2, px / 2, px / 2); }
  } else if (ground === 'dirt') { // pebbles
    c.fillStyle = '#968466';
    for (let n = 0; n < 2; n++) c.fillRect(ox + px * (1 + Math.floor(rnd() * 5)), oy + px * (1 + Math.floor(rnd() * 5)), px / 2, px / 2);
  } else if (ground === 'soil') { // furrows: fixed rows so every soil tile lines up with its neighbours
    c.fillStyle = '#33241a';
    for (const row of [2, 5]) c.fillRect(ox, oy + row * px, size, px / 2);
  } else if (ground === 'damaged') { // rubble and a crack
    c.fillStyle = '#2d2620'; c.fillRect(ox + px * (1 + (i % 3)), oy + px * 2, px * 2, px / 2); c.fillRect(ox + px * 3, oy + px * 2.5, px / 2, px * 2);
    c.fillStyle = '#7d7266'; c.fillRect(ox + px * 5, oy + px * 5, px, px / 2);
  }
}

// ================= PA-3 paths: road pieces chosen from the neighbouring cells =================
// A cell's mask says which of its four sides continue the road: N=1 E=2 S=4 W=8. Neighbours that count as "road": every other
// path cell, and any gate (the opening a road leaves through). Pure + presentation only. Spec §5.2, §22 phase 3.
export const N = 1; export const E = 2; export const S = 4; export const W = 8;
const SIDE_NAME = [[N, 'n'], [E, 'e'], [S, 's'], [W, 'w']];

/** Asset key for a connection mask (0..15). 16 masks → 16 distinct keys. */
export function pathKeyForMask(mask) {
  const sides = SIDE_NAME.filter(([bit]) => mask & bit).map(([, n]) => n).join('');
  if (mask === 0) return 'path_isolated';
  if (sides.length === 1) return `path_end_${sides}`;
  if (mask === (E | W)) return 'path_straight_h';
  if (mask === (N | S)) return 'path_straight_v';
  if (sides.length === 2) return `path_corner_${sides}`;
  if (sides.length === 3) return `path_t_${sides}`;
  return 'path_cross';
}
export const PATH_MASKS = Object.freeze(Array.from({ length: 16 }, (_, m) => m));
export const PATH_KEYS = Object.freeze(PATH_MASKS.map(pathKeyForMask));

/** Road cells of a frame → [{ x, y, mask, key }] (row-major, stable order). */
export function pathCells(frame) {
  const { width, height } = frame.map;
  const road = new Set(); const open = new Set();
  for (const p of frame.terrain?.paths || []) for (const [x, y] of p.cells) if (x >= 0 && y >= 0 && x < width && y < height) road.add(`${x},${y}`);
  for (const b of frame.buildings || []) if (b.type === 'gate') open.add(`${b.x},${b.y}`);
  const joins = (x, y) => road.has(`${x},${y}`) || open.has(`${x},${y}`);
  const out = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!road.has(`${x},${y}`)) continue;
    const mask = (joins(x, y - 1) ? N : 0) | (joins(x + 1, y) ? E : 0) | (joins(x, y + 1) ? S : 0) | (joins(x - 1, y) ? W : 0);
    out.push({ x, y, mask, key: pathKeyForMask(mask) });
  }
  return out;
}

const ROAD_EDGE = '#5a4e3a'; const ROAD_FILL = '#9a8a68'; const ROAD_SPECK = '#b3a47f';
/** Paint a road piece (transparent outside the road). The road band is 14px wide, centred; arms run to the tile edge so neighbours join exactly. */
export function paintPathTile(c, ox, oy, { mask }, size = 32) {
  const u = size / 32; const lo = 9 * u; const hi = 23 * u; const rim = 2 * u;
  const draw = (pad) => {
    c.fillRect(ox + lo - pad, oy + lo - pad, hi - lo + 2 * pad, hi - lo + 2 * pad);
    if (mask & N) c.fillRect(ox + lo - pad, oy, hi - lo + 2 * pad, lo);
    if (mask & S) c.fillRect(ox + lo - pad, oy + hi, hi - lo + 2 * pad, size - hi);
    if (mask & W) c.fillRect(ox, oy + lo - pad, lo, hi - lo + 2 * pad);
    if (mask & E) c.fillRect(ox + hi, oy + lo - pad, size - hi, hi - lo + 2 * pad);
  };
  c.fillStyle = ROAD_EDGE; draw(rim);
  c.fillStyle = ROAD_FILL; draw(0);
  c.fillStyle = ROAD_SPECK;
  c.fillRect(ox + 12 * u, oy + 13 * u, 2 * u, u); c.fillRect(ox + 18 * u, oy + 19 * u, 2 * u, u); c.fillRect(ox + 15 * u, oy + 16 * u, u, u);
}
