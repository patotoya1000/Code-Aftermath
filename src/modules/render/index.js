import { createAssetResolver, paintPlaceholderAtlas, frameIndexAt, buildPlaceholderManifest } from '../assets/index.js';

// Production world renderer. Input: the RENDER PROJECTION only (never GameState). Output: pixels.
// Pipeline: projection → semantic state → asset resolver → atlas frame → animation player → canvas.
// It is read-only with respect to gameplay: animation timing, selection and debug overlays live here and nowhere else.

const DEFAULT_MANIFEST = () => buildPlaceholderManifest({ buildings: { hq: [1], fence: [1], tent: [1], storage: [1], gate: [1] }, nodes: { tree: true, rock: true } });
const COLORS = {
  terrain: '#1d2420', grid: '#2a342e', select: '#ffd46b', event: '#ef7d74', label: '#e8e4d8', debug: 'rgba(120,200,255,0.9)',
  zone: 'rgba(63,143,79,0.14)', zoneEdge: 'rgba(63,143,79,0.45)', path: '#4a4333', labelOutline: 'rgba(15,14,12,0.85)',
};
const LABEL_MIN_TILE = 26; // below this tile size world labels would only add clutter

/** Cells on the perimeter of an inclusive rectangle. */
export function perimeterCells({ x1, y1, x2, y2 }) {
  const out = [];
  for (let x = x1; x <= x2; x++) { out.push([x, y1]); if (y2 > y1) out.push([x, y2]); }
  for (let y = y1 + 1; y < y2; y++) { out.push([x1, y]); if (x2 > x1) out.push([x2, y]); }
  return out;
}

const stagger = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 400; };

export function mountRenderer(canvas, {
  manifest = DEFAULT_MANIFEST(), atlasImage = null, createCanvas = null, now = () => (typeof performance !== 'undefined' ? performance.now() : 0), debug = false, smoothing = false,
} = {}) {
  const ctx = canvas.getContext('2d');
  const resolver = createAssetResolver(manifest);
  let atlas = atlasImage;
  if (!atlas) {
    const make = createCanvas ?? ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
    atlas = make(manifest.sheet.w, manifest.sheet.h);
    paintPlaceholderAtlas(atlas.getContext('2d'), manifest);
  }

  let scale = 1; let offsetX = 0; let offsetY = 0;
  let selected = { kind: null, id: null };
  let debugOn = debug;
  let drawList = [];

  const k = () => scale / manifest.frame.w;
  const tileCenterX = (x) => offsetX + x * scale + scale / 2;
  const tileFootY = (y) => offsetY + y * scale + scale * 0.92;

  function blit(entry, frameIdx, cx, footY, sizeMul = 1) {
    const f = entry.frames[frameIdx] ?? entry.frames[0];
    if (!f) return false;
    const s = k() * sizeMul;
    ctx.drawImage(atlas, f.x, f.y, f.w, f.h, cx - manifest.pivot.x * s, footY - manifest.pivot.y * s, f.w * s, f.h * s);
    return true;
  }
  function worldLabel(text, x, y, size, align) { // readable on any ground: light text with a dark outline
    ctx.font = `600 ${size}px system-ui`; ctx.textAlign = align; ctx.textBaseline = 'top';
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = COLORS.labelOutline; ctx.strokeText(text, x, y);
    ctx.fillStyle = COLORS.label; ctx.fillText(text, x, y);
  }
  function marker(cx, footY) { // step-6 safety net: nothing resolved, still draw something visible
    ctx.fillStyle = 'rgba(160,160,160,0.7)'; ctx.fillRect(cx - scale * 0.25, footY - scale * 0.5, scale * 0.5, scale * 0.5);
  }
  const note = (layer, kind, id, entry, extra = {}) => drawList.push({ layer, kind, id, key: entry.key, requested: entry.requested, step: entry.step, ...extra });

  // Optional presentation-only smoothing: the simulation moves survivors one whole tile per tick; when the game runs in
  // real time the renderer glides between those tiles. It never feeds back into gameplay and is off unless asked for.
  const shown = new Map();
  const SMOOTH_MS = 110;
  function smoothed(frame) {
    if (!smoothing || !frame.npcs) return frame;
    const t0 = now();
    const npcs = frame.npcs.map((p) => {
      let s = shown.get(p.id);
      if (!s) { s = { x: p.x, y: p.y, t: t0 }; shown.set(p.id, s); }
      const k = 1 - Math.exp(-Math.min(200, Math.max(0, t0 - s.t)) / SMOOTH_MS);
      s.t = t0;
      s.x = Math.abs(p.x - s.x) > 3 ? p.x : s.x + (p.x - s.x) * k; // teleports (restart) snap instead of gliding across the map
      s.y = Math.abs(p.y - s.y) > 3 ? p.y : s.y + (p.y - s.y) * k;
      return { ...p, x: s.x, y: s.y };
    });
    return { ...frame, npcs };
  }

  function drawFrame(rawFrame, { events = rawFrame.events } = {}) {
    const frame = smoothed(rawFrame);
    drawList = [];
    const { width: mw, height: mh } = frame.map;
    const rect = canvas.getBoundingClientRect();
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (rect.width && (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr))) {
      canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    }
    ctx.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;
    const t = Math.min(rect.width / mw, rect.height / mh);
    scale = t; offsetX = (rect.width - mw * t) / 2; offsetY = (rect.height - mh * t) / 2;
    const time = now();

    // 1 terrain
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = COLORS.terrain; ctx.fillRect(0, 0, rect.width, rect.height);
    const terrain = frame.terrain || { zones: [], paths: [] };
    for (const z of terrain.zones) { // presentation-only ground areas (the forest)
      ctx.fillStyle = COLORS.zone; ctx.fillRect(offsetX + z.x1 * t, offsetY + z.y1 * t, (z.x2 - z.x1 + 1) * t, (z.y2 - z.y1 + 1) * t);
      ctx.strokeStyle = COLORS.zoneEdge; ctx.lineWidth = 1; ctx.strokeRect(offsetX + z.x1 * t + 0.5, offsetY + z.y1 * t + 0.5, (z.x2 - z.x1 + 1) * t - 1, (z.y2 - z.y1 + 1) * t - 1);
    }
    ctx.fillStyle = COLORS.path;
    for (const p of terrain.paths) for (const [x, y] of p.cells) ctx.fillRect(offsetX + x * t + t * 0.08, offsetY + y * t + t * 0.2, t * 0.84, t * 0.6);
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
    for (let x = 0; x <= mw; x++) { ctx.beginPath(); ctx.moveTo(offsetX + x * t, offsetY); ctx.lineTo(offsetX + x * t, offsetY + mh * t); ctx.stroke(); }
    for (let y = 0; y <= mh; y++) { ctx.beginPath(); ctx.moveTo(offsetX, offsetY + y * t); ctx.lineTo(offsetX + mw * t, offsetY + y * t); ctx.stroke(); }

    const buildings = frame.buildings || [];
    const drawBuilding = (b, x, y, layer) => {
      const e = resolver.resolveBuilding({ type: b.type, level: b.level, condition: b.condition });
      note(layer, 'building', b.id, e, { x, y, condition: b.condition });
      if (!blit(e, 0, tileCenterX(x), tileFootY(y))) marker(tileCenterX(x), tileFootY(y));
    };
    // 2 fence / settlement boundary (uses authoritative bounds, not just the origin tile). A building standing on the
    //   fence line (the gate) replaces that fence cell, leaving the opening.
    const standing = new Set(buildings.filter((q) => !q.bounds).map((q) => `${q.x},${q.y}`));
    for (const b of buildings.filter((q) => q.bounds)) for (const [x, y] of perimeterCells(b.bounds)) if (!standing.has(`${x},${y}`)) drawBuilding(b, x, y, 'fence');
    // 3 buildings
    for (const b of buildings.filter((q) => !q.bounds)) drawBuilding(b, b.x, b.y, 'building');
    // 3b world labels (names come from definitions via the projection)
    if (scale >= LABEL_MIN_TILE) {
      const size = Math.max(9, scale * 0.26);
      for (const b of buildings.filter((q) => !q.bounds && q.name)) worldLabel(b.name, tileCenterX(b.x), offsetY + (b.y + 1) * scale + 1, size, 'center');
      for (const z of terrain.zones) worldLabel(z.label, offsetX + z.x1 * scale + 5, offsetY + z.y1 * scale + 4, size, 'left');
    }
    // 4 resource nodes
    for (const n of frame.nodes || []) {
      const e = resolver.resolveNode({ type: n.type, visual: n.visual });
      note('node', 'node', n.id, e, { x: n.x, y: n.y, visual: n.visual });
      if (!blit(e, 0, tileCenterX(n.x), tileFootY(n.y))) marker(tileCenterX(n.x), tileFootY(n.y));
    }
    // 5 NPCs (back to front)
    for (const p of [...(frame.npcs || [])].sort((a, b) => a.y - b.y)) {
      const e = resolver.resolveNpc({ animation: p.animation, direction: p.direction });
      const idx = frameIndexAt(e, time, stagger(p.id));
      note('npc', 'npc', p.id, e, { x: p.x, y: p.y, animation: p.animation, direction: p.direction, frameIndex: idx });
      const cx = tileCenterX(p.x); const fy = tileFootY(p.y);
      if (!blit(e, idx, cx, fy)) marker(cx, fy);
      ctx.fillStyle = COLORS.label; ctx.font = `${Math.max(9, t * 0.3)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.name, cx, fy - scale * 0.95);
    }
    // 6 event markers (only if the projection carries them)
    for (const ev of events || []) if (ev.x !== undefined && ev.y !== undefined) {
      ctx.fillStyle = COLORS.event; ctx.beginPath(); ctx.arc(tileCenterX(ev.x), offsetY + ev.y * t + t / 2, t * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    // 7 selection
    drawSelection(frame);
    // 8 optional debug overlay
    if (debugOn) drawDebug(frame, mw, mh);
  }

  function selectionRect(frame) {
    if (!selected.id) return null;
    const find = { npc: frame.npcs, building: frame.buildings, node: frame.nodes }[selected.kind];
    const ent = (find || []).find((e) => e.id === selected.id);
    if (!ent) return null;
    if (ent.bounds) { const { x1, y1, x2, y2 } = ent.bounds; return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 }; }
    return { x: ent.x, y: ent.y, w: 1, h: 1 };
  }
  function drawSelection(frame) {
    const r = selectionRect(frame);
    if (!r) return;
    ctx.strokeStyle = COLORS.select; ctx.lineWidth = 2.5; ctx.setLineDash?.([6, 5]);
    ctx.strokeRect(offsetX + r.x * scale + 1, offsetY + r.y * scale + 1, r.w * scale - 2, r.h * scale - 2);
    ctx.setLineDash?.([]);
  }
  function drawDebug(frame, mw, mh) {
    ctx.fillStyle = COLORS.debug; ctx.font = `${Math.max(8, scale * 0.22)}px ui-monospace, monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let x = 0; x < mw; x += 4) ctx.fillText(String(x), offsetX + x * scale + 2, offsetY + 2);
    for (let y = 4; y < mh; y += 4) ctx.fillText(String(y), offsetX + 2, offsetY + y * scale + 2);
    for (const b of frame.buildings || []) {
      if (b.bounds) ctx.strokeRect(offsetX + b.bounds.x1 * scale, offsetY + b.bounds.y1 * scale, (b.bounds.x2 - b.bounds.x1 + 1) * scale, (b.bounds.y2 - b.bounds.y1 + 1) * scale);
      ctx.fillText(`${b.id} ${b.assetKey ?? ''}`, offsetX + b.x * scale, offsetY + b.y * scale + scale);
    }
    for (const n of frame.nodes || []) ctx.fillText(`${n.id}:${n.amount}`, offsetX + n.x * scale, offsetY + n.y * scale + scale);
    for (const e of drawList) if (e.kind === 'npc') ctx.fillText(`${e.key} s${e.step}`, offsetX + e.x * scale, offsetY + e.y * scale + scale * 1.1);
  }

  const screenToTile = (sx, sy) => ({ x: Math.floor((sx - offsetX) / scale), y: Math.floor((sy - offsetY) / scale) });

  /** Hit-test a point (canvas CSS pixels) against a projection: survivors first, then nodes, buildings, fence perimeter. */
  function pick(sx, sy, frame) {
    const tx = (sx - offsetX) / scale - 0.5; const ty = (sy - offsetY) / scale - 0.5; // tile-center coordinates
    for (const n of frame.npcs || []) if (Math.abs(n.x - tx) < 0.7 && Math.abs(n.y - ty) < 0.7) return { kind: 'npc', id: n.id };
    const { x, y } = screenToTile(sx, sy);
    for (const n of frame.nodes || []) if (n.x === x && n.y === y) return { kind: 'node', id: n.id };
    for (const b of frame.buildings || []) if (!b.bounds && b.x === x && b.y === y) return { kind: 'building', id: b.id };
    for (const b of frame.buildings || []) if (b.bounds && perimeterCells(b.bounds).some(([cx, cy]) => cx === x && cy === y)) return { kind: 'building', id: b.id };
    return null;
  }

  return {
    draw: drawFrame,
    pick, screenToTile,
    select(kind, id) { selected = { kind, id }; },
    clearSelection() { selected = { kind: null, id: null }; },
    getSelected: () => ({ ...selected }),
    setDebug(on) { debugOn = Boolean(on); },
    get debug() { return debugOn; },
    get lastDrawList() { return drawList; },
    resolver,
  };
}
