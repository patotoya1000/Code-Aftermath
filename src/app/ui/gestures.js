// Map gestures (presentation only): they move the camera, never the world.
//   drag            → pan            (a press that moves less than DRAG_THRESHOLD pixels is still a click)
//   wheel / pinch   → zoom at the pointer
//   click           → pick what is under it, or tell the screen the ground was empty
//   double-click    → on bare ground, reset the view
// The canvas, the camera and the picker are passed in, so this file has no DOM or renderer import and is unit-tested
// with fakes (tests/gestures.test.js).

export const DRAG_THRESHOLD = 5; // pixels
export const WHEEL_STEP = 1.15;

/**
 * @param canvas  anything with addEventListener / getBoundingClientRect (and optionally setPointerCapture / classList)
 * @param camera  { panPixels(dx, dy), zoomAt(factor, x, y), resetCamera() }
 * @param pick    (x, y) → hit | null          (screen pixels, relative to the canvas)
 * @param onHit   (hit) → void   a click that landed on something
 * @param onEmpty ()    → void   a click that landed on bare ground
 */
export function bindMapGestures(canvas, { camera, pick, onHit = () => {}, onEmpty = () => {} }) {
  const points = new Map(); let drag = null; let pinch = null; let moved = false; let swallowClick = false;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const two = () => { const [a, b] = [...points.values()]; return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button > 0) return; // only the primary button drags
    canvas.setPointerCapture?.(e.pointerId);
    points.set(e.pointerId, local(e));
    if (points.size === 1) { drag = { start: local(e), last: local(e) }; moved = false; }
    else if (points.size === 2) { pinch = { d: two().d }; moved = true; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!points.has(e.pointerId)) return;
    const p = local(e); points.set(e.pointerId, p);
    if (points.size === 2 && pinch) {
      const t = two(); if (pinch.d > 0 && t.d > 0) camera.zoomAt(t.d / pinch.d, t.mx, t.my); pinch.d = t.d; return;
    }
    if (drag && points.size === 1) {
      if (!moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < DRAG_THRESHOLD) return;
      moved = true; canvas.classList?.add('panning');
      camera.panPixels(p.x - drag.last.x, p.y - drag.last.y); drag.last = p;
    }
  });
  const release = (e) => {
    points.delete(e.pointerId);
    if (points.size < 2) pinch = null;
    if (points.size === 1) { const rest = [...points.values()][0]; drag = { start: rest, last: rest }; }
    if (points.size === 0) { drag = null; canvas.classList?.remove('panning'); swallowClick = moved; setTimeout(() => { swallowClick = false; }, 0); }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault?.(); const p = local(e);
    camera.zoomAt(e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, p.x, p.y);
  }, { passive: false });
  canvas.addEventListener('click', (e) => {
    if (swallowClick) return; // the press was a drag, not a click
    const p = local(e); const hit = pick(p.x, p.y);
    if (hit) onHit(hit); else onEmpty();
  });
  canvas.addEventListener('dblclick', (e) => {
    const p = local(e);
    if (!pick(p.x, p.y)) camera.resetCamera();
  });
}
