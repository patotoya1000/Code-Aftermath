// Viewport (PA-1): the ONE place that converts between grid cells (world logic) and canvas pixels (presentation).
// docs/game/18-grid-pixel-art-asset-integration.md §12–14, §26: "the game thinks in grid cells, the renderer in pixels";
// camera movement must never change a logical position. Pure functions over frozen values: no DOM, no state, no kernel.
//
// Model: the map is fitted into the canvas (as before), then a camera zooms and pans it.
//   cell   = fitScale × zoom           pixels per grid cell (whole pixels in `integer` mode, for crisp pixel art)
//   screen = origin + grid × cell      origin = canvas centre − camera centre × cell
// At zoom 1 the camera is locked to the map centre, which is exactly the original "fit and centre" layout.

export const FOOT = 0.92; // a unit's feet sit at 92% of the cell height (shared by every sprite anchor)
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function derive({ map, view, zoom, integer, anchor }) {
  const fit = Math.min(view.width / map.width, view.height / map.height);
  let cell = fit * zoom;
  if (integer && cell >= 1) cell = Math.floor(cell);
  // Keep the map covering the canvas when it is larger than the canvas; when it is smaller it stays centred.
  const halfW = cell > 0 ? view.width / (2 * cell) : Infinity; const halfH = cell > 0 ? view.height / (2 * cell) : Infinity; // empty canvas: stay centred
  const cx = map.width <= 2 * halfW ? map.width / 2 : clamp(anchor.x, halfW, map.width - halfW);
  const cy = map.height <= 2 * halfH ? map.height / 2 : clamp(anchor.y, halfH, map.height - halfH);
  let ox = view.width / 2 - cx * cell; let oy = view.height / 2 - cy * cell;
  if (integer) { ox = Math.round(ox); oy = Math.round(oy); }
  return Object.freeze({
    map: Object.freeze({ width: map.width, height: map.height }), view: Object.freeze({ width: view.width, height: view.height }),
    zoom, integer, anchor: Object.freeze({ x: anchor.x, y: anchor.y }), center: Object.freeze({ x: cx, y: cy }), cell, ox, oy,
  });
}

/** `map` = { width, height } in cells; `view` = { width, height } in CSS pixels. Camera defaults: zoom 1, centred. */
export function createViewport({ map, view, zoom = 1, center = null, integer = false }) {
  return derive({ map, view, zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX), integer, anchor: center ?? { x: map.width / 2, y: map.height / 2 } });
}

/** Same camera, new canvas size or map. A different map size recentres; otherwise zoom and camera survive a resize. */
export function withView(vp, { map = vp.map, view = vp.view } = {}) {
  const sameMap = map.width === vp.map.width && map.height === vp.map.height;
  return derive({ map, view, zoom: vp.zoom, integer: vp.integer, anchor: sameMap ? vp.anchor : { x: map.width / 2, y: map.height / 2 } });
}

// ---- grid → screen ----
/** Top-left pixel of a cell (fractional cells allowed: a smoothly moving survivor). */
export const gridToScreen = (vp, gx, gy) => ({ x: vp.ox + gx * vp.cell, y: vp.oy + gy * vp.cell });
export const cellRect = (vp, gx, gy, w = 1, h = 1) => ({ x: vp.ox + gx * vp.cell, y: vp.oy + gy * vp.cell, w: w * vp.cell, h: h * vp.cell });
export const cellCenter = (vp, gx, gy) => ({ x: vp.ox + (gx + 0.5) * vp.cell, y: vp.oy + (gy + 0.5) * vp.cell });
/** Where a sprite's feet go: horizontally centred, near the bottom of the cell. */
export const cellFoot = (vp, gx, gy) => ({ x: vp.ox + (gx + 0.5) * vp.cell, y: vp.oy + (gy + FOOT) * vp.cell });

// ---- screen → grid ----
/** Continuous grid coordinates under a pixel (a cell spans [n, n+1)). null when the canvas has no size. */
export function screenToGrid(vp, sx, sy) {
  if (!(vp.cell > 0)) return null;
  return { x: (sx - vp.ox) / vp.cell, y: (sy - vp.oy) / vp.cell };
}
/** The whole cell under a pixel, or null when the pixel is outside the map. */
export function screenToCell(vp, sx, sy) {
  const g = screenToGrid(vp, sx, sy);
  if (!g) return null;
  const x = Math.floor(g.x); const y = Math.floor(g.y);
  return x >= 0 && y >= 0 && x < vp.map.width && y < vp.map.height ? { x, y } : null;
}
/** Inclusive range of cells that touch the canvas (for drawing only what can be seen). */
export function visibleCells(vp) {
  if (!(vp.cell > 0)) return { x1: 0, y1: 0, x2: -1, y2: -1 };
  return {
    x1: clamp(Math.floor(-vp.ox / vp.cell), 0, vp.map.width - 1), x2: clamp(Math.ceil((vp.view.width - vp.ox) / vp.cell) - 1, 0, vp.map.width - 1),
    y1: clamp(Math.floor(-vp.oy / vp.cell), 0, vp.map.height - 1), y2: clamp(Math.ceil((vp.view.height - vp.oy) / vp.cell) - 1, 0, vp.map.height - 1),
  };
}

// ---- camera (each returns a NEW viewport; none of them can touch a logical position) ----
const moved = (vp, anchor, zoom = vp.zoom) => derive({ map: vp.map, view: vp.view, zoom, integer: vp.integer, anchor });
export const centerOn = (vp, gx, gy) => moved(vp, { x: gx, y: gy });
export const panBy = (vp, dxCells, dyCells) => moved(vp, { x: vp.center.x + dxCells, y: vp.center.y + dyCells });
export const panByPixels = (vp, dx, dy) => (vp.cell > 0 ? panBy(vp, -dx / vp.cell, -dy / vp.cell) : vp);
export const setZoom = (vp, zoom) => moved(vp, vp.center, clamp(zoom, ZOOM_MIN, ZOOM_MAX));
export const resetCamera = (vp) => createViewport({ map: vp.map, view: vp.view, integer: vp.integer });
/** Zoom by a factor while the grid point under (sx, sy) stays under it (pinch / wheel zoom). */
export function zoomAt(vp, factor, sx, sy) {
  const g = screenToGrid(vp, sx, sy);
  const zoom = clamp(vp.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  if (!g || zoom === vp.zoom) return vp;
  const next = moved(vp, vp.center, zoom);
  if (!(next.cell > 0)) return next;
  return moved(vp, { x: g.x - (sx - vp.view.width / 2) / next.cell, y: g.y - (sy - vp.view.height / 2) / next.cell }, zoom);
}
