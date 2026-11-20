// Map zones for the navigation bar (W1, docs/game/21 sections 3 and 10). PRESENTATION ONLY: pure functions over the render projection that say where the
// camera should look for TOWN / OUTPOST / FRONT. The simulation grid is one map; the zones are regions of it, split by the wall.
//   TOWN     the town is a panel, not a place: its camera spot is the far (west) end of the settlement; opening it shows the TOWN panel
//   OUTPOST  the protected area (inside the wall: the rectangle of a perimeter wall, everything west of a line wall)
//   FRONT    everything beyond the wall (road, forest, loot, zombies); opening it shows the EXPEDITIONS panel
// A scenario without a fence has one zone (OUTPOST = the whole map).

export const ZONE_IDS = Object.freeze(['town', 'outpost', 'front']);

/** The wall's cell extent from a projection: { x1, x2 (the wall columns that bound the inside) } or null. */
function wallSpan(frame) {
  const f = (frame.buildings ?? []).find((b) => b.type === 'fence' && b.bounds);
  if (!f) return null;
  const b = f.bounds;
  return b.shape === 'line' ? { inside: [0, b.x1 - 1], outside: [b.x1 + 1, frame.map.width - 1], y: [0, frame.map.height - 1] }
    : { inside: [b.x1 + 1, b.x2 - 1], outside: [b.x2 + 1, frame.map.width - 1], y: [b.y1 + 1, b.y2 - 1] };
}

const mid = (a, b) => (a + b + 1) / 2; // the centre of the cells a..b inclusive, in cell units (cell k spans k..k+1)

/** [{ id, label, x, y, panel }] in west-to-east order. `x`, `y` are the camera centre in grid units. */
export function zonesFor(frame) {
  const { width, height } = frame.map;
  const w = wallSpan(frame);
  const cy = height / 2;
  if (!w) return [{ id: 'outpost', label: 'OUTPOST', x: width / 2, y: cy, panel: null }];
  const insideMid = mid(w.inside[0], w.inside[1]);
  const outsideMid = w.outside[0] <= w.outside[1] ? mid(w.outside[0], w.outside[1]) : width - 1;
  return [
    { id: 'town', label: 'TOWN', x: Math.max(1, w.inside[0] + 1), y: cy, panel: 'town' },
    { id: 'outpost', label: 'OUTPOST', x: insideMid, y: (w.y[0] + w.y[1] + 1) / 2, panel: null },
    { id: 'front', label: 'FRONT', x: outsideMid, y: cy, panel: 'scavenge' },
  ];
}

/** The zone the camera is looking at: the closest centre in x (the zones are a west-east strip). */
export function activeZone(zones, center) {
  return zones.reduce((best, z) => (Math.abs(z.x - center.x) < Math.abs(best.x - center.x) ? z : best), zones[0]);
}

/** The zone one step west (-1) or east (+1) of `id`; stays put at the ends. */
export function neighbourZone(zones, id, dir) {
  const i = zones.findIndex((z) => z.id === id);
  return zones[Math.max(0, Math.min(zones.length - 1, (i < 0 ? 0 : i) + dir))];
}
