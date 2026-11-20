// The single 8-direction vocabulary shared by simulation, projection and (later) asset resolver.
export const DIRECTIONS = Object.freeze([
  'UP', 'UP_RIGHT', 'RIGHT', 'DOWN_RIGHT', 'DOWN', 'DOWN_LEFT', 'LEFT', 'UP_LEFT',
]);

const TABLE = {
  '0,-1': 'UP', '1,-1': 'UP_RIGHT', '1,0': 'RIGHT', '1,1': 'DOWN_RIGHT',
  '0,1': 'DOWN', '-1,1': 'DOWN_LEFT', '-1,0': 'LEFT', '-1,-1': 'UP_LEFT',
};

export function directionFromDelta(dx, dy) {
  return TABLE[`${Math.sign(dx)},${Math.sign(dy)}`] ?? null;
}

export const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// ---- The wall's shape (W2, docs/game/21 section 5) ----
// A wall is a fence building's `bounds`. Without `shape` it is a PERIMETER: the edge of an inclusive rectangle (the original compound).
// With `shape: 'line'` it is a LINE: one column x = x1 (= x2) running from y1 to y2 (the whole map height), so nothing can walk around it.
// "Inside" a perimeter is the rectangle's interior; inside a line is everything WEST of it (x < x1). Pure functions, no state.
export const isLineWall = (b) => b?.shape === 'line';

/** Cells of the wall as [[x, y], ...] (the same order the renderer always used for a rectangle). */
export function wallCellsOf(b) {
  const out = [];
  if (!b) return out;
  if (isLineWall(b)) { for (let y = b.y1; y <= b.y2; y++) out.push([b.x1, y]); return out; }
  const { x1, y1, x2, y2 } = b;
  for (let x = x1; x <= x2; x++) { out.push([x, y1]); if (y2 > y1) out.push([x, y2]); }
  for (let y = y1 + 1; y < y2; y++) { out.push([x1, y]); if (x2 > x1) out.push([x2, y]); }
  return out;
}

/** True when (x, y) is a cell of the wall. */
export function onWall(b, x, y) {
  if (!b) return false;
  if (isLineWall(b)) return x === b.x1 && y >= b.y1 && y <= b.y2;
  return x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2 && (x === b.x1 || x === b.x2 || y === b.y1 || y === b.y2);
}

/** True when the point is on the protected side of the wall (the wall cells themselves are not inside). */
export function insideWall(b, p) {
  if (!b) return false;
  if (isLineWall(b)) return p.x < b.x1 && p.y >= b.y1 && p.y <= b.y2;
  return p.x > b.x1 && p.x < b.x2 && p.y > b.y1 && p.y < b.y2;
}
