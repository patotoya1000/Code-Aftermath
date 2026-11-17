// Walking rules (O3). Pure functions over GameState — nothing here mutates state or touches the RNG, so every path is
// deterministic. Movement is 8-directional on the tile grid; every step costs 1 (same as the old straight-line walk).
//
// What blocks a survivor:
//   - a building with `blocks: true` (copied from its definition) blocks its own tile — or, with a `footprint` (PA-5), every tile of it;
//     the building's (x, y) stays its DOOR: the place survivors walk to,
//   - a fence (a building with `bounds`) blocks every tile of its rectangle's PERIMETER,
//   - except a tile where a non-blocking building stands (the gate): that perimeter tile is open.
// Nodes (trees, rocks) do not block; they are things you walk up to. The DESTINATION tile is always enterable, so
// `moveTo(hq)` and "walk to the storehouse" still work even though those tiles are blocked for passing through.

const key = (x, y) => `${x},${y}`;

const DIRS = Object.freeze([[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]);

/** Tiles survivors cannot walk through right now, as a Set of "x,y". */
export function blockedTiles(state) {
  const open = new Set();
  const blocked = new Set();
  const all = Object.values(state.buildings);
  for (const b of all) if (!b.bounds && b.blocks === false) open.add(key(b.x, b.y));
  for (const b of all) {
    if (b.blocks === false) continue;
    if (b.bounds) {
      const { x1, y1, x2, y2 } = b.bounds;
      for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) if (x === x1 || x === x2 || y === y1 || y === y2) blocked.add(key(x, y));
    } else if (b.footprint) {
      const { x1, y1, x2, y2 } = b.footprint;
      for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) blocked.add(key(x, y));
    } else blocked.add(key(b.x, b.y));
  }
  for (const k of open) blocked.delete(k);
  return blocked;
}

/**
 * Shortest path from `from` to `to` (exclusive of `from`, inclusive of `to`), as a list of {x,y}; [] when already there;
 * null when there is no way. A* with a Chebyshev heuristic. Diagonal steps may not cut the corner of a blocked tile.
 * Ties are broken by (f, h, y, x) so the same map always gives the same path.
 */
export function findPath(state, from, to, blocked = blockedTiles(state)) {
  if (from.x === to.x && from.y === to.y) return [];
  const { width, height } = state.map;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  if (!inMap(to.x, to.y)) return null;
  const passable = (x, y) => inMap(x, y) && (!blocked.has(key(x, y)) || (x === to.x && y === to.y));
  const h = (x, y) => Math.max(Math.abs(x - to.x), Math.abs(y - to.y));

  const g = new Map([[key(from.x, from.y), 0]]);
  const prev = new Map();
  const open = [{ x: from.x, y: from.y, f: h(from.x, from.y), h: h(from.x, from.y) }];
  const closed = new Set();
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i], b = open[bi];
      if (a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && (a.y < b.y || (a.y === b.y && a.x < b.x)))))) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      for (let k = ck; k !== key(from.x, from.y); k = prev.get(k)) { const [x, y] = k.split(',').map(Number); path.push({ x, y }); }
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!passable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!passable(cur.x + dx, cur.y) || !passable(cur.x, cur.y + dy))) continue; // no corner cutting
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = g.get(ck) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        prev.set(nk, ck);
        open.push({ x: nx, y: ny, f: ng + h(nx, ny), h: h(nx, ny) });
      }
    }
  }
  return null;
}
