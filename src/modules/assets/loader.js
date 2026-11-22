// Loader animation for art that has not arrived yet (presentation only, no DOM needed to import it).
// While a painted picture is still LOADING, the renderer shows a calm pulse / shimmer instead of the old placeholder drawing (green tiles, mock tree, mock fence).
// If a picture FAILED to load (or no picture exists), the plain placeholder stays as the last-resort fallback: a loader must never loop forever.
//
// `artState` words used by every art cache's `state()`:  'none' (no art for this thing / no DOM)  |  'loading'  |  'ready'  |  'failed'.

export const LOADER = Object.freeze({
  pulseMs: 1400,        // one breath of the spot loader
  shimmerMs: 2200,      // one sweep of the map shimmer
  ground: '#1b2128',    // neutral dark ground: deliberately not the old green
  spot: '120,190,230',  // rgb of the pulse
  label: 'Loading map…',
});

/** 0..1 smooth breathing value; `phase` (ms) staggers neighbours so a forest does not blink in unison. */
export function loaderPulse(time, phase = 0, period = LOADER.pulseMs) {
  const t = (((time + phase) % period) + period) % period / period;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
}

/** x of the shimmer band's left edge for a surface `width` wide: it enters left of the surface and leaves right of it, then repeats. */
export function shimmerX(time, width, period = LOADER.shimmerMs) {
  const t = (((time % period) + period) % period) / period;
  return -0.4 * width + t * 1.8 * width;
}

/** Whether a state means "show the loader": only while the picture is really on its way. */
export const isLoading = (state) => state === 'loading';

/** The whole map rectangle while its backdrop loads: neutral ground, a sweeping highlight band and a small label. */
export function drawLoaderMap(ctx, rect, time, label = LOADER.label) {
  ctx.save();
  ctx.fillStyle = LOADER.ground; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  const bw = rect.w * 0.35; const x = rect.x + shimmerX(time, rect.w);
  const g = ctx.createLinearGradient?.(x, 0, x + bw, 0);
  if (g?.addColorStop) { g.addColorStop(0, `rgba(${LOADER.spot},0)`); g.addColorStop(0.5, `rgba(${LOADER.spot},0.16)`); g.addColorStop(1, `rgba(${LOADER.spot},0)`); ctx.fillStyle = g; ctx.fillRect(x, rect.y, bw, rect.h); }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = `rgba(${LOADER.spot},${0.45 + 0.4 * loaderPulse(time)})`; ctx.font = `${Math.max(11, Math.min(22, rect.h * 0.04))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.restore();
}

/** A small pulsing spot where one thing (tree, rock, building, wall strip) will appear: `box` = { x, y, w, h } of the area it will fill. */
export function drawLoaderSpot(ctx, box, time, phase = 0) {
  const p = loaderPulse(time, phase);
  ctx.save();
  ctx.fillStyle = `rgba(${LOADER.spot},${0.08 + 0.14 * p})`; ctx.strokeStyle = `rgba(${LOADER.spot},${0.25 + 0.35 * p})`; ctx.lineWidth = 1;
  const r = Math.min(box.w, box.h) * 0.18;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, r); else ctx.rect(box.x, box.y, box.w, box.h);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
