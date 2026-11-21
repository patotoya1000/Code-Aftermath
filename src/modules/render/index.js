import { wallCellsOf } from '../../kernel/index.js';
import { createAssetResolver, paintPlaceholderAtlas, frameIndexAt, buildPlaceholderManifest, groundGrid, tileKeyAt, pathCells, fenceCells, objectSpec, buildingRect, buildingPlacement, nodeStage, REF_W } from '../assets/index.js';
import { createViewport, withView, gridToScreen, cellRect, cellRectCovering, visibleCells, cellCenter, cellFoot, screenToGrid, panBy, panByPixels, zoomAt, setZoom, centerOn, resetCamera } from '../viewport/index.js';

// Production world renderer. Input: the RENDER PROJECTION only (never GameState). Output: pixels.
// Pipeline: projection → semantic state → asset resolver → atlas frame → animation player → canvas.
// Every grid↔pixel conversion goes through the viewport module (PA-1); this file has no coordinate math of its own.
// It is read-only with respect to gameplay: animation timing, selection and debug overlays live here and nowhere else.

const DEFAULT_MANIFEST = () => buildPlaceholderManifest({ buildings: { hq: [1], fence: [1, 2], tent: [1], storage: [1, 2, 3], gate: [1], well: [1, 2], water_tank: [1, 2], kitchen: [1, 2, 3], workshop: [1, 2, 3], generator: [1, 2], solar_panel: [1], battery: [1, 2] }, nodes: { tree: true, rock: true } });
// Placeholder colours of the loot sacks (Z4) until the item art exists.
const LOOT_COLORS = { bones: '#e8e2cf', hide: '#a0693b', rags: '#9aa3ad', scrap: '#7c8794', gland: '#7ed957', noise_lure: '#e8b04a', boss_core: '#c24ee8', arrows: '#d9c07a', bolts: '#d9c07a', bullets: '#d9c07a' };
const COLORS = {
  terrain: '#1d2420', grid: 'rgba(0,0,0,0.16)', select: '#ffd46b', hover: '#8ec8ff', event: '#ef7d74', label: '#e8e4d8', debug: 'rgba(120,200,255,0.9)',
  zone: 'rgba(63,143,79,0.14)', zoneEdge: 'rgba(63,143,79,0.45)', path: '#4a4333', labelOutline: 'rgba(15,14,12,0.85)',
};
const LABEL_MIN_TILE = 26; // below this tile size world labels would only add clutter

/** Cells on the perimeter of an inclusive rectangle. */
export function perimeterCells(bounds) {
  return wallCellsOf(bounds); // W2: a rectangle's edge, or one full-height line (bounds.shape 'line')
}

const stagger = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 400; };

export function mountRenderer(canvas, {
  manifest = DEFAULT_MANIFEST(), atlasImage = null, nodeArt = null, backdropArt = null, createCanvas = null, now = () => (typeof performance !== 'undefined' ? performance.now() : 0), debug = false, smoothing = false, integerScale = false,
} = {}) {
  const ctx = canvas.getContext('2d');
  const resolver = createAssetResolver(manifest);
  let atlas = atlasImage;
  if (!atlas) {
    const make = createCanvas ?? ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
    atlas = make(manifest.sheet.w, manifest.sheet.h);
    paintPlaceholderAtlas(atlas.getContext('2d'), manifest);
  }

  let vp = createViewport({ map: { width: 1, height: 1 }, view: { width: 1, height: 1 }, integer: integerScale }); // camera state lives here
  let selected = { kind: null, id: null };
  let hover = { kind: null, id: null };
  let debugOn = debug;
  let drawList = [];
  let pathList = []; // PA-3: road pieces drawn
  let lootList = []; // Z4: loot piles drawn (presentation only)
  let terrainList = []; // PA-2: one entry per ground tile drawn (kept apart from drawList, which lists entities)

  const k = () => vp.cell / manifest.frame.w;
  const tileCenterX = (x) => cellFoot(vp, x, 0).x;
  const tileFootY = (y) => cellFoot(vp, 0, y).y;

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
    ctx.fillStyle = 'rgba(160,160,160,0.7)'; ctx.fillRect(cx - vp.cell * 0.25, footY - vp.cell * 0.5, vp.cell * 0.5, vp.cell * 0.5);
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
    vp = withView(vp, { map: frame.map, view: { width: rect.width, height: rect.height } });
    const t = vp.cell;
    const world = cellRect(vp, 0, 0, mw, mh);
    const time = now();

    // 1 terrain
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = COLORS.terrain; ctx.fillRect(0, 0, rect.width, rect.height);
    const terrain = frame.terrain || { zones: [], paths: [] };
    // 1a ground tiles (PA-2): the ground grid is derived from the projection; only visible cells are drawn, edges cover whole pixels
    terrainList = []; pathList = [];
    const backdrop = terrain.backdrop && backdropArt ? backdropArt.get(terrain.backdrop) : null; // a painted picture replaces the tiles, zones, road pieces and grid
    const ground = backdrop ? [] : groundGrid(frame); const vis = visibleCells(vp);
    if (backdrop) ctx.drawImage(backdrop, world.x, world.y, world.w, world.h);
    else for (let y = vis.y1; y <= vis.y2; y++) for (let x = vis.x1; x <= vis.x2; x++) {
      const e = resolver.resolveTerrain(tileKeyAt(ground, x, y)); const f = e.frames[0];
      terrainList.push({ x, y, ground: ground[y][x], key: e.key, step: e.step });
      if (!f) continue; // nothing resolved: the flat terrain colour underneath stays
      const r = cellRectCovering(vp, x, y);
      ctx.drawImage(atlas, f.x, f.y, f.w, f.h, r.x, r.y, r.w, r.h);
    }
    for (const z of backdrop ? [] : terrain.zones) { // presentation-only ground areas (the forest)
      const r = cellRect(vp, z.x1, z.y1, z.x2 - z.x1 + 1, z.y2 - z.y1 + 1);
      ctx.fillStyle = COLORS.zone; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = COLORS.zoneEdge; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    // 1b road pieces (PA-3): shape chosen from neighbouring road cells / the gate
    for (const p of backdrop ? [] : pathCells(frame)) {
      if (p.x < vis.x1 || p.x > vis.x2 || p.y < vis.y1 || p.y > vis.y2) continue;
      const e = resolver.resolvePath(p.key); const f = e.frames[0];
      pathList.push({ x: p.x, y: p.y, mask: p.mask, key: e.key, requested: p.key, step: e.step });
      const r = cellRectCovering(vp, p.x, p.y);
      if (f) ctx.drawImage(atlas, f.x, f.y, f.w, f.h, r.x, r.y, r.w, r.h);
      else { ctx.fillStyle = COLORS.path; ctx.fillRect(r.x + r.w * 0.08, r.y + r.h * 0.2, r.w * 0.84, r.h * 0.6); }
    }
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
    if (!backdrop || debugOn) for (let x = 0; x <= mw; x++) { const sx = gridToScreen(vp, x, 0).x; ctx.beginPath(); ctx.moveTo(sx, world.y); ctx.lineTo(sx, world.y + world.h); ctx.stroke(); }
    if (!backdrop || debugOn) for (let y = 0; y <= mh; y++) { const sy = gridToScreen(vp, 0, y).y; ctx.beginPath(); ctx.moveTo(world.x, sy); ctx.lineTo(world.x + world.w, sy); ctx.stroke(); }

    const buildings = frame.buildings || [];
    const drawBuilding = (b, x, y, layer) => {
      const e = resolver.resolveBuilding({ type: b.type, level: b.level, condition: b.condition });
      note(layer, 'building', b.id, e, { x, y, condition: b.condition, ...(b.footprint ? { footprint: { ...b.footprint } } : {}) });
      if (b.footprint && layer === 'building') { // PA-5: a multi-cell building is drawn across its whole footprint
        // frame bottom (not the foot pivot) rests on the footprint's bottom edge, so a scaled sprite never hangs below its cells
        const pl = buildingPlacement(b); const at = { x: cellCenter(vp, pl.gx, 0).x, y: gridToScreen(vp, 0, pl.gy + 1).y - (manifest.frame.h - manifest.pivot.y) * k() * pl.size };
        if (!blit(e, 0, at.x, at.y, pl.size)) marker(at.x, at.y);
      } else if (!blit(e, 0, tileCenterX(x), tileFootY(y))) marker(tileCenterX(x), tileFootY(y));
      if (b.water?.working) { // reservoir gauge under a working well (presentation only; the amount comes from the projection)
        const gw = vp.cell * 0.7; const gx = tileCenterX(x) - gw / 2; const gy = gridToScreen(vp, x, y + 1).y - vp.cell * 0.1;
        ctx.fillStyle = 'rgba(10,18,28,0.75)'; ctx.fillRect(gx, gy, gw, Math.max(2, vp.cell * 0.08));
        ctx.fillStyle = '#4da3e8'; ctx.fillRect(gx, gy, gw * Math.min(1, b.water.amount / Math.max(1, b.water.capacity)), Math.max(2, vp.cell * 0.08));
      }
    };
    // 2 fence / settlement boundary (uses authoritative bounds, not just the origin tile). A building standing on the
    //   fence line (the gate) replaces that fence cell, leaving the opening.
    //   PA-4: the piece shown depends on the neighbours on the fence line (straight / corner / end), the building's level and condition.
    for (const p of fenceCells(frame)) {
      const b = buildings.find((q) => q.id === p.id);
      const e = resolver.resolveFence({ mask: p.mask, level: p.level, condition: p.condition });
      const whole = resolver.resolveBuilding({ type: b.type, level: b.level, condition: b.condition });
      note('fence', 'building', b.id, whole, { x: p.x, y: p.y, condition: b.condition, piece: e.key ?? p.key, mask: p.mask, pieceStep: e.step });
      const cx = tileCenterX(p.x); const fy = tileFootY(p.y);
      if (!blit(e.key ? e : whole, 0, cx, fy)) marker(cx, fy);
    }
    // 3 buildings
    for (const b of buildings.filter((q) => !q.bounds)) drawBuilding(b, b.x, b.y, 'building');
    // 3b world labels (names come from definitions via the projection)
    if (vp.cell >= LABEL_MIN_TILE) {
      const size = Math.max(9, vp.cell * 0.26);
      for (const b of buildings.filter((q) => !q.bounds && q.name)) { const r = buildingRect(b); worldLabel(b.name, cellCenter(vp, (r.x1 + r.x2) / 2, 0).x, gridToScreen(vp, 0, r.y2 + 1).y + 1, size, 'center'); }
      for (const z of terrain.zones) { const o = gridToScreen(vp, z.x1, z.y1); worldLabel(z.label, o.x + 5, o.y + 4, size, 'left'); }
    }
    // 4+5 resource nodes and survivors, back to front by row (a tree in front of a survivor covers it; a survivor in front covers the trunk)
    const actors = [
      ...(frame.nodes || []).map((n) => ({ y: n.y, order: 0, n })),
      ...(frame.npcs || []).map((p) => ({ y: p.y, order: 1, p })),
      ...(frame.zombies || []).map((z) => ({ y: z.y, order: 2, z })),
    ].sort((u, v) => u.y - v.y || u.order - v.order);
    for (const a of actors) {
      if (a.n) {
        const n = a.n; const spec = objectSpec(n.type);
        const e = resolver.resolveNode({ type: n.type, visual: n.visual });
        note('node', 'node', n.id, e, { x: n.x, y: n.y, visual: n.visual, footprint: spec.footprint, spriteSize: spec.spriteSize });
        const art = nodeArt ? nodeArt.get(nodeArt.key(n.type, n.id, nodeStage(n.amount ?? (n.visual === 'available' ? 1 : 0), n.capacity))) : null;
        if (art) { // painted sprite: bottom-centre on the cell's foot, width relative to the type's biggest sprite (stump < tree)
          const w = vp.cell * spec.spriteSize * (art.naturalWidth / (REF_W[n.type] ?? art.naturalWidth)); const h = w * (art.naturalHeight / art.naturalWidth);
          ctx.drawImage(art, tileCenterX(n.x) - w / 2, tileFootY(n.y) - h, w, h);
        } else if (!blit(e, 0, tileCenterX(n.x), tileFootY(n.y), spec.spriteSize)) marker(tileCenterX(n.x), tileFootY(n.y));
        continue;
      }
      if (a.z) {
        const z = a.z;
        const e = resolver.resolveZombie({ animation: z.animation, direction: z.direction });
        const idx = frameIndexAt(e, time, stagger(z.id));
        note('zombie', 'zombie', z.id, e, { x: z.x, y: z.y, animation: z.animation, direction: z.direction, frameIndex: idx });
        const cx = tileCenterX(z.x); const fy = tileFootY(z.y);
        if (!blit(e, idx, cx, fy)) marker(cx, fy);
        ctx.fillStyle = COLORS.label; ctx.font = `${Math.max(9, t * 0.3)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        if (z.name) ctx.fillText(z.name, cx, fy - vp.cell * 0.95);
        continue;
      }
      const p = a.p;
      const e = resolver.resolveNpc({ animation: p.animation, direction: p.direction });
      const idx = frameIndexAt(e, time, stagger(p.id));
      note('npc', 'npc', p.id, e, { x: p.x, y: p.y, animation: p.animation, direction: p.direction, frameIndex: idx });
      const cx = tileCenterX(p.x); const fy = tileFootY(p.y);
      if (!blit(e, idx, cx, fy)) marker(cx, fy);
      ctx.fillStyle = COLORS.label; ctx.font = `${Math.max(9, t * 0.3)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.name, cx, fy - vp.cell * 0.95);
    }
    // 5b loot piles (Z4): a small sack with the amount, where a zombie died; no atlas art yet (placeholder drawing from the projection)
    lootList = [];
    for (const p of frame.loot || []) {
      if (p.x < vis.x1 || p.x > vis.x2 || p.y < vis.y1 || p.y > vis.y2) continue;
      lootList.push({ id: p.id, item: p.item, qty: p.qty, x: p.x, y: p.y });
      const c = cellCenter(vp, p.x, p.y); const s = Math.max(6, vp.cell * 0.4);
      ctx.fillStyle = 'rgba(20,14,8,0.85)'; ctx.fillRect(c.x - s / 2 - 1, c.y - s / 2 - 1, s + 2, s + 2);
      ctx.fillStyle = LOOT_COLORS[p.item] ?? '#c8a96a'; ctx.fillRect(c.x - s / 2, c.y - s / 2, s, s);
      ctx.fillStyle = COLORS.label; ctx.font = `${Math.max(8, vp.cell * 0.28)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(String(p.qty), c.x, c.y + s / 2 + 1);
    }
    // 6 event markers (only if the projection carries them)
    for (const ev of events || []) if (ev.x !== undefined && ev.y !== undefined) {
      ctx.fillStyle = COLORS.event; ctx.beginPath(); ctx.arc(cellCenter(vp, ev.x, ev.y).x, cellCenter(vp, ev.x, ev.y).y, t * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    // 6b time of day and weather: a tint over the world (presentation only, read from the projection)
    const env = frame.environment;
    if (env) {
      const tint = (env.isNight ? 0.34 : 0) + (env.weather === 'storm' ? 0.18 : env.weather === 'rain' ? 0.08 : 0);
      if (tint > 0) { ctx.fillStyle = `rgba(8,16,40,${Math.min(0.6, tint)})`; ctx.fillRect(world.x, world.y, world.w, world.h); }
    }
    // 7 selection
    drawSelection(frame);
    // 8 optional debug overlay
    if (debugOn) drawDebug(frame, mw, mh);
  }

  function entityRect(frame, kind, id) {
    if (!kind || !id) return null;
    const find = { npc: frame.npcs, zombie: frame.zombies, building: frame.buildings, node: frame.nodes }[kind];
    const ent = (find || []).find((e) => e.id === id);
    if (!ent) return null;
    if (ent.bounds || ent.footprint) { const { x1, y1, x2, y2 } = ent.bounds ?? ent.footprint; return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 }; }
    return { x: ent.x, y: ent.y, w: 1, h: 1 };
  }
  function selectionRect(frame) {
    return entityRect(frame, selected.kind, selected.id) ?? entityRect(frame, hover.kind, hover.id);
  }
  function drawSelection(frame) {
    const selectedRect = selected.id ? entityRect(frame, selected.kind, selected.id) : null;
    const hoverRect = hover.id && (!selected.id || selected.id !== hover.id) ? entityRect(frame, hover.kind, hover.id) : null;
    if (!selectedRect && !hoverRect) return;
    ctx.setLineDash?.([6, 5]);
    if (selectedRect) {
      ctx.strokeStyle = COLORS.select; ctx.lineWidth = 2.5;
      const px = cellRect(vp, selectedRect.x, selectedRect.y, selectedRect.w, selectedRect.h);
      ctx.strokeRect(px.x + 1, px.y + 1, px.w - 2, px.h - 2);
    }
    if (hoverRect) {
      ctx.strokeStyle = COLORS.hover; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
      const px = cellRect(vp, hoverRect.x, hoverRect.y, hoverRect.w, hoverRect.h);
      ctx.strokeRect(px.x + 3, px.y + 3, px.w - 6, px.h - 6);
      ctx.globalAlpha = 1;
    }
    ctx.setLineDash?.([]);
  }
  function drawDebug(frame, mw, mh) {
    ctx.fillStyle = COLORS.debug; ctx.font = `${Math.max(8, vp.cell * 0.22)}px ui-monospace, monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let x = 0; x < mw; x += 4) ctx.fillText(String(x), gridToScreen(vp, x, 0).x + 2, gridToScreen(vp, 0, 0).y + 2);
    for (let y = 4; y < mh; y += 4) ctx.fillText(String(y), gridToScreen(vp, 0, 0).x + 2, gridToScreen(vp, 0, y).y + 2);
    for (const b of frame.buildings || []) {
      if (b.footprint) { const r = cellRect(vp, b.footprint.x1, b.footprint.y1, b.footprint.x2 - b.footprint.x1 + 1, b.footprint.y2 - b.footprint.y1 + 1); ctx.strokeRect(r.x, r.y, r.w, r.h); const d = cellRect(vp, b.x, b.y); ctx.strokeRect(d.x + d.w * 0.25, d.y + d.h * 0.25, d.w * 0.5, d.h * 0.5); } // footprint + door
      if (b.bounds) { const r = cellRect(vp, b.bounds.x1, b.bounds.y1, b.bounds.x2 - b.bounds.x1 + 1, b.bounds.y2 - b.bounds.y1 + 1); ctx.strokeRect(r.x, r.y, r.w, r.h); }
      const o = gridToScreen(vp, b.x, b.y + 1); ctx.fillText(`${b.id} ${b.assetKey ?? ''}`, o.x, o.y);
    }
    for (const n of frame.nodes || []) { const o = gridToScreen(vp, n.x, n.y + 1); ctx.fillText(`${n.id}:${n.amount}`, o.x, o.y); }
    for (const e of drawList) if (e.kind === 'npc') { const o = gridToScreen(vp, e.x, e.y + 1.1); ctx.fillText(`${e.key} s${e.step}`, o.x, o.y); }
  }

  // Pixel → cell, unclamped (a tap just outside the map is a miss for pick(), never a wrong tile).
  const screenToTile = (sx, sy) => { const g = screenToGrid(vp, sx, sy); return g ? { x: Math.floor(g.x), y: Math.floor(g.y) } : { x: NaN, y: NaN }; };

  /** Hit-test a point (canvas CSS pixels) against a projection: survivors first, then nodes, buildings, fence perimeter. */
  function pick(sx, sy, frame) {
    const g = screenToGrid(vp, sx, sy); if (!g) return null;
    const tx = g.x - 0.5; const ty = g.y - 0.5; // tile-center coordinates
    for (const z of frame.zombies || []) if (Math.abs(z.x - tx) < 0.7 && Math.abs(z.y - ty) < 0.7) return { kind: 'zombie', id: z.id };
    for (const n of frame.npcs || []) if (Math.abs(n.x - tx) < 0.7 && Math.abs(n.y - ty) < 0.7) return { kind: 'npc', id: n.id };
    const { x, y } = screenToTile(sx, sy);
    for (const n of frame.nodes || []) if (n.x === x && n.y === y) return { kind: 'node', id: n.id };
    for (const b of frame.buildings || []) if (!b.bounds) { const r = buildingRect(b); if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) return { kind: 'building', id: b.id }; } // any cell of a footprint
    for (const b of frame.buildings || []) if (b.bounds && perimeterCells(b.bounds).some(([cx, cy]) => cx === x && cy === y)) return { kind: 'building', id: b.id };
    return null;
  }

  function lookup(kind, id, frame) {
    if (!kind || !id || !frame) return null;
    const find = { npc: frame.npcs, zombie: frame.zombies, building: frame.buildings, node: frame.nodes }[kind];
    return (find || []).find((e) => e.id === id) ?? null;
  }

  return {
    draw: drawFrame,
    pick, screenToTile,
    lookup,
    entityFor(kind, id, frame) { return lookup(kind, id, frame); },
    select(kind, id) { selected = { kind, id }; },
    clearSelection() { selected = { kind: null, id: null }; },
    getSelected: () => ({ ...selected }),
    setHover(kind, id) { hover = { kind, id }; },
    clearHover() { hover = { kind: null, id: null }; },
    getHover: () => ({ ...hover }),
    setDebug(on) { debugOn = Boolean(on); },
    get debug() { return debugOn; },
    get lastDrawList() { return drawList; },
    get lastTerrain() { return terrainList; },
    get lastPaths() { return pathList; },
    get lastLoot() { return lootList; },
    resolver,
    // Camera (PA-1): presentation only. None of these can change a logical position; picking and drawing both read the same viewport.
    get viewport() { return vp; },
    pan(dxCells, dyCells) { vp = panBy(vp, dxCells, dyCells); },
    panPixels(dx, dy) { vp = panByPixels(vp, dx, dy); },
    zoomAt(factor, sx, sy) { vp = zoomAt(vp, factor, sx, sy); },
    setZoom(z) { vp = setZoom(vp, z); },
    centerOn(gx, gy) { vp = centerOn(vp, gx, gy); },
    resetCamera() { vp = resetCamera(vp); },
  };
}
