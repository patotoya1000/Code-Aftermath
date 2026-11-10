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
