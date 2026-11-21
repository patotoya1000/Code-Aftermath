import { wallCellsOf } from '../../kernel/index.js';
import { createAssetResolver, paintPlaceholderAtlas, frameIndexAt, buildPlaceholderManifest, groundGrid, tileKeyAt, pathCells, fenceCells, objectSpec, buildingRect, buildingPlacement, nodeStage, wallSections, artLevel, bandLayout, BAND_TUNING, REF_W, NPC_REF_H, NPC_CELLS, npcPose, walkFrameAt, workSwing, facingVector, isStoneWork, WORK_LUNGE_CELLS, WORK_TILT_RAD } from '../assets/index.js';
import { createViewport, withView, gridToScreen, cellRect, cellRectCovering, visibleCells, cellCenter, cellFoot, screenToGrid, panBy, panByPixels, zoomAt, setZoom, centerOn, resetCamera } from '../viewport/index.js';

// Production world renderer. Input: the RENDER PROJECTION only (never GameState). Output: pixels.
// Pipeline: projection → semantic state → asset resolver → atlas frame → animation player → canvas.
// Every grid↔pixel conversion goes through the viewport module (PA-1); this file has no coordinate math of its own.
// It is read-only with respect to gameplay: animation timing, selection and debug overlays live here and nowhere else.

const DEFAULT_MANIFEST = () => buildPlaceholderManifest({ buildings: { hq: [1], fence: [1, 2], tent: [1], storage: [1, 2, 3], gate: [1], well: [1, 2], water_tank: [1, 2], kitchen: [1, 2, 3], workshop: [1, 2, 3], generator: [1, 2], solar_panel: [1], battery: [1, 2] }, nodes: { tree: true, rock: true } });
// Placeholder colours of the loot sacks (Z4) until the item art exists.
const LOOT_COLORS = { bones: '#e8e2cf', hide: '#a0693b', rags: '#9aa3ad', scrap: '#7c8794', gland: '#7ed957', noise_lure: '#e8b04a', boss_core: '#c24ee8', arrows: '#d9c07a', bolts: '#d9c07a', bullets: '#d9c07a' };
const COLORS = {
  terrain: '#1d2420', grid: 'rgba(0,0,0,0.16)', select: '#ffd46b', glow: '#4ade80', hover: '#8ec8ff', event: '#ef7d74', label: '#e8e4d8', debug: 'rgba(120,200,255,0.9)',
  zone: 'rgba(63,143,79,0.14)', zoneEdge: 'rgba(63,143,79,0.45)', path: '#4a4333', labelOutline: 'rgba(15,14,12,0.85)',
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const LABEL_MIN_TILE = 26; // below this tile size world labels would only add clutter

/** Cells on the perimeter of an inclusive rectangle. */
export function perimeterCells(bounds) {
  return wallCellsOf(bounds); // W2: a rectangle's edge, or one full-height line (bounds.shape 'line')
}

const stagger = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 400; };

export function mountRenderer(canvas, {
  manifest = DEFAULT_MANIFEST(), atlasImage = null, nodeArt = null, npcArt = null, backdropArt = null, buildingArt = null, createCanvas = null, now = () => (typeof performance !== 'undefined' ? performance.now() : 0), debug = false, smoothing = false, integerScale = false, backdropParallaxRatio = 0.5, wallArtLevel = null,
} = {}) {
  const ctx = canvas.getContext('2d');
  const resolver = createAssetResolver(manifest);
  buildingArt?.preload?.(); // the wall and gate level pictures too, so the first frame already shows them
  npcArt?.preload?.(); // load every painted survivor pose now, so no pose waits for its first use (the placeholder survivor must not flash)
  let atlas = atlasImage;
  if (!atlas) {
    const make = createCanvas ?? ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
    atlas = make(manifest.sheet.w, manifest.sheet.h);
    paintPlaceholderAtlas(atlas.getContext('2d'), manifest);
  }

  let vp = createViewport({ map: { width: 1, height: 1 }, view: { width: 1, height: 1 }, integer: integerScale }); // camera state lives here
  let selected = { kind: null, id: null };
  let hover = { kind: null, id: null };
  const nodePeak = new Map(); let lastTick = -1; let selNode = null; let tagBtn = null; let worldW = 0; const nodeGeo = new Map(); const npcGeo = new Map(); const bldGeo = new Map(); const gateBoxes = new Map(); // nodePeak: highest amount seen per node, the full mark of its resource bar (presentation only)
  let debugOn = debug;
  let drawList = [];
  const lastPose = new Map(); // survivor id -> the last painted pose that was actually drawn for her (the stand-in while a new pose is still loading)
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

  /** Run a draw call with smooth (bilinear) scaling: the big painted wall, gate and silhouette pictures are scaled down several times and would alias without it. */
  const smoothly = (draw) => { if (!('imageSmoothingEnabled' in ctx)) return draw(); ctx.save(); ctx.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high'; try { draw(); } finally { ctx.restore(); } };

  /** The backdrop's top / bottom silhouettes: they frame the map from the canvas margin above and below it (bandLayout has the placement maths). Drawn before every
   *  object, so a survivor or a tree standing on the map edge is never covered. Panning slides them slower than the map (parallax); at zoom 1 the camera is fixed and they sit centred. */
  function drawBands(backdropId, world, rect) {
    const bands = backdropArt?.bands?.(backdropId) ?? {};
    const t = vp.map.width > 0 ? clamp(vp.center.x / vp.map.width, 0, 1) : 0.5;
    for (const side of ['top', 'bottom']) {
      const band = bands[side]; if (!band) continue;
      const L = bandLayout({ side, view: { w: rect.width, h: rect.height }, world, cell: vp.cell, image: { w: band.img.naturalWidth, h: band.img.naturalHeight }, spec: band, t, parallax: backdropParallaxRatio });
      smoothly(() => {
        for (const tile of L.tiles) {
          if (tile.flip) { ctx.save(); ctx.transform(-1, 0, 0, 1, tile.x + L.tileW, 0); ctx.drawImage(band.img, 0, L.y, L.tileW, L.h); ctx.restore(); } // mirrored: neighbouring tiles meet on their own edge
          else ctx.drawImage(band.img, tile.x, L.y, L.tileW, L.h);
        }
      });
      if (side === 'top') { // the dark mass ends in a straight line: a soft shadow below it lets it melt into the ground instead
        const vh = BAND_TUNING.vignetteCells * vp.cell; const g = ctx.createLinearGradient?.(0, L.edgeY, 0, L.edgeY + vh);
        if (g?.addColorStop) { g.addColorStop(0, 'rgba(12,14,12,0.6)'); g.addColorStop(1, 'rgba(12,14,12,0)'); ctx.fillStyle = g; ctx.fillRect(world.x, L.edgeY, world.w, vh); }
      }
    }
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
    const world = cellRect(vp, 0, 0, mw, mh); worldW = world.w;
    const time = now();
    if ((frame.tick ?? 0) < lastTick) nodePeak.clear(); lastTick = frame.tick ?? 0; selNode = null; nodeGeo.clear(); npcGeo.clear(); bldGeo.clear(); gateBoxes.clear(); // a restart / load rewinds the clock: forget old peaks
    for (const n of frame.nodes || []) if ((n.amount ?? 0) > (nodePeak.get(n.id) ?? 0)) nodePeak.set(n.id, n.amount);

    // 1 terrain
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = COLORS.terrain; ctx.fillRect(0, 0, rect.width, rect.height);
    const terrain = frame.terrain || { zones: [], paths: [] };
    // 1a ground tiles (PA-2): the ground grid is derived from the projection; only visible cells are drawn, edges cover whole pixels
    terrainList = []; pathList = [];
    const backdrop = terrain.backdrop && backdropArt ? backdropArt.get(terrain.backdrop) : null; // a painted picture replaces the tiles, zones, road pieces and grid
    const ground = backdrop ? [] : groundGrid(frame); const vis = visibleCells(vp);
    if (backdrop) { // the picture IS the map rectangle: it is never offset, or the road in it would no longer lie under the gate and the buildings
      ctx.drawImage(backdrop, world.x, world.y, world.w, world.h);
      drawBands(terrain.backdrop, world, rect);
    }
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
    /** Run a draw call with a green glow around whatever it paints (the "this is picked" cue for survivors, buildings, trees and rocks). */
    const glowed = (draw, passes = 2) => { ctx.save(); ctx.shadowColor = COLORS.glow; ctx.shadowBlur = Math.max(10, vp.cell * 0.6); for (let k = 0; k < passes; k++) draw(); ctx.restore(); };
    const gateDraws = new Map(); // gate id -> draw call (filled with the line walls below, used when the gate itself is drawn)
    const drawBuilding = (b, x, y, layer) => {
      const e = resolver.resolveBuilding({ type: b.type, level: b.level, condition: b.condition });
      note(layer, 'building', b.id, e, { x, y, condition: b.condition, ...(b.footprint ? { footprint: { ...b.footprint } } : {}) });
      if (layer === 'building' && gateDraws.has(b.id)) { gateDraws.get(b.id)(); return; } // a gate standing in a line wall is drawn with its level picture
      const art = layer === 'building' && buildingArt ? buildingArt.get(b.type, b.condition) : null;
      if (art) { // painted picture: horizontally centred on the footprint, standing on the bottom edge of its lowest row
        const pl = buildingPlacement(b); const w = vp.cell * art.cells; const h = w * (art.img.naturalHeight / art.img.naturalWidth);
        const ax = cellCenter(vp, pl.gx, 0).x - w / 2; const ay = gridToScreen(vp, 0, pl.gy + 1).y - h + vp.cell * 0.04;
        bldGeo.set(b.id, { b, cx: ax + w / 2, top: ay });
        if (selected.kind === 'building' && selected.id === b.id) glowed(() => ctx.drawImage(art.img, ax, ay, w, h));
        ctx.drawImage(art.img, ax, ay, w, h);
      } else if (b.footprint && layer === 'building') { // PA-5: a multi-cell building is drawn across its whole footprint
        // frame bottom (not the foot pivot) rests on the footprint's bottom edge, so a scaled sprite never hangs below its cells
        const pl = buildingPlacement(b); const at = { x: cellCenter(vp, pl.gx, 0).x, y: gridToScreen(vp, 0, pl.gy + 1).y - (manifest.frame.h - manifest.pivot.y) * k() * pl.size };
        bldGeo.set(b.id, { b, cx: at.x, top: gridToScreen(vp, 0, buildingRect(b).y1).y - vp.cell * 0.2 });
        if (selected.kind === 'building' && selected.id === b.id && layer === 'building') glowed(() => { if (!blit(e, 0, at.x, at.y, pl.size)) marker(at.x, at.y); });
        if (!blit(e, 0, at.x, at.y, pl.size)) marker(at.x, at.y);
      } else {
        bldGeo.set(b.id, { b, cx: tileCenterX(x), top: tileFootY(y) - vp.cell * 1.1 });
        if (selected.kind === 'building' && selected.id === b.id && layer === 'building') glowed(() => { if (!blit(e, 0, tileCenterX(x), tileFootY(y))) marker(tileCenterX(x), tileFootY(y)); });
        if (!blit(e, 0, tileCenterX(x), tileFootY(y))) marker(tileCenterX(x), tileFootY(y));
      }
      if (b.water?.working) { // reservoir gauge under a working well (presentation only; the amount comes from the projection)
        const gw = vp.cell * 0.7; const gx = tileCenterX(x) - gw / 2; const gy = gridToScreen(vp, x, y + 1).y - vp.cell * 0.1;
        ctx.fillStyle = 'rgba(10,18,28,0.75)'; ctx.fillRect(gx, gy, gw, Math.max(2, vp.cell * 0.08));
        ctx.fillStyle = '#4da3e8'; ctx.fillRect(gx, gy, gw * Math.min(1, b.water.amount / Math.max(1, b.water.capacity)), Math.max(2, vp.cell * 0.08));
      }
    };
    // 2 fence / settlement boundary (uses authoritative bounds, not just the origin tile). A building standing on the
    //   fence line (the gate) replaces that fence cell, leaving the opening.
    //   PA-4: the piece shown depends on the neighbours on the fence line (straight / corner / end), the building's level and condition.
    const lateFence = [];
    // 2a LINE walls with level pictures (wall_level<n>, gate_level<n>): a stack of wall sections with the gate section replacing one (assets/wallart.js). A wall (or a gate) whose
    //    picture has not loaded, and every rectangular wall, keeps the old per-cell pieces below.
    const lineWalls = new Map();
    if (buildingArt?.getLevel) for (const fb of buildings) {
      if (!fb.bounds || fb.bounds.shape !== 'line') continue;
      const wallArt = buildingArt.getLevel('fence', artLevel(wallArtLevel ?? fb.level), fb.condition); if (!wallArt) continue;
      const gates = [];
      for (const g of buildings) if (g.type === 'gate' && !g.bounds && g.x === fb.bounds.x1 && g.y >= fb.bounds.y1 && g.y <= fb.bounds.y2) {
        const ga = buildingArt.getLevel('gate', artLevel(wallArtLevel ?? g.level), g.condition); if (ga) gates.push({ g, ga });
      }
      lineWalls.set(fb.id, { fb, wallArt, gates, sections: wallSections({ top: fb.bounds.y1, bottom: fb.bounds.y2 + 1, gates: gates.map((q) => q.g.y) }) });
    }
    const drawSection = (art, cx, sec, glow) => { // one section picture, stretched vertically to meet its neighbours
      const w = vp.cell * art.w; const y0 = gridToScreen(vp, 0, sec.y0).y; const h = (sec.y1 - sec.y0) * vp.cell;
      smoothly(() => {
        ctx.globalAlpha = art.alpha;
        if (glow) glowed(() => ctx.drawImage(art.img, cx - w / 2, y0, w, h), 1);
        ctx.drawImage(art.img, cx - w / 2, y0, w, h);
      });
      return { y0, h, w };
    };
    for (const { fb, wallArt, gates, sections } of lineWalls.values()) {
      const cx = tileCenterX(fb.bounds.x1); const picked = selected.kind === 'building' && selected.id === fb.id;
      for (const sec of sections) if (sec.kind === 'wall') { const r = drawSection(wallArt, cx, sec, picked); if (!bldGeo.has(fb.id) || r.y0 < bldGeo.get(fb.id).top) bldGeo.set(fb.id, { b: fb, cx, top: r.y0 }); }
      for (const { g, ga } of gates) {
        const sec = sections.find((q) => q.kind === 'gate' && q.gateY === g.y); if (!sec) continue;
        gateDraws.set(g.id, () => {
          const r = drawSection(ga, cx, sec, selected.kind === 'building' && selected.id === g.id);
          bldGeo.set(g.id, { b: g, cx, top: r.y0 });
          gateBoxes.set(g.id, { x0: cx - vp.cell * 0.55, x1: cx + vp.cell * 0.55, y0: r.y0, y1: r.y0 + r.h }); // the painted gate is what the pointer sees, so it is what picks the gate
        });
      }
    }
    for (const p of fenceCells(frame)) {
      const b = buildings.find((q) => q.id === p.id);
      const e = resolver.resolveFence({ mask: p.mask, level: p.level, condition: p.condition });
      const whole = resolver.resolveBuilding({ type: b.type, level: b.level, condition: b.condition });
      note('fence', 'building', b.id, whole, { x: p.x, y: p.y, condition: b.condition, piece: e.key ?? p.key, mask: p.mask, pieceStep: e.step });
      if (lineWalls.has(p.id)) continue; // drawn as sections above
      const cx = tileCenterX(p.x); const fy = tileFootY(p.y);
      const art = buildingArt ? buildingArt.get(b.type, p.condition ?? b.condition) : null;
      if (art) { // painted wall piece / gate: the gate is drawn after the whole wall so a neighbouring piece never covers it
        const w = vp.cell * art.cells; const h = w * (art.img.naturalHeight / art.img.naturalWidth); const ay = gridToScreen(vp, 0, p.y + 1).y - h + vp.cell * 0.08; const picked = selected.kind === 'building' && selected.id === b.id;
        const draw = () => { if (picked) glowed(() => ctx.drawImage(art.img, cx - w / 2, ay, w, h), 1); ctx.drawImage(art.img, cx - w / 2, ay, w, h); };
        if (!bldGeo.has(b.id) || ay < bldGeo.get(b.id).top) bldGeo.set(b.id, { b, cx, top: ay }); // a tag over a wall sits on its top end; over the gate, on the gate
        if (b.type === 'fence') draw(); else lateFence.push(draw);
      } else if (!blit(e.key ? e : whole, 0, cx, fy)) marker(cx, fy);
    }
    for (const draw of lateFence) draw();
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
        const picked = selected.kind === 'node' && selected.id === n.id; // a picked tree / rock glows green and carries a name + resource bar (drawn in drawSelection)
        if (art) { // painted sprite: bottom-centre on the cell's foot, width relative to the type's biggest sprite (stump < tree)
          const w = vp.cell * spec.spriteSize * (art.naturalWidth / (REF_W[n.type] ?? art.naturalWidth)); const h = w * (art.naturalHeight / art.naturalWidth);
          if (picked) { ctx.save(); ctx.shadowColor = COLORS.glow; ctx.shadowBlur = Math.max(10, vp.cell * 0.6); for (let k = 0; k < 2; k++) ctx.drawImage(art, tileCenterX(n.x) - w / 2, tileFootY(n.y) - h, w, h); ctx.restore(); }
          ctx.drawImage(art, tileCenterX(n.x) - w / 2, tileFootY(n.y) - h, w, h);
          nodeGeo.set(n.id, { n, cx: tileCenterX(n.x), top: tileFootY(n.y) - h });
        } else {
          if (picked) { ctx.save(); ctx.fillStyle = 'rgba(74,222,128,0.35)'; ctx.shadowColor = COLORS.glow; ctx.shadowBlur = Math.max(10, vp.cell * 0.6); ctx.beginPath(); ctx.ellipse(tileCenterX(n.x), tileFootY(n.y) - vp.cell * 0.4, vp.cell * 0.5, vp.cell * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); selNode = { n, cx: tileCenterX(n.x), top: tileFootY(n.y) - vp.cell * spec.spriteSize }; }
          nodeGeo.set(n.id, { n, cx: tileCenterX(n.x), top: tileFootY(n.y) - vp.cell * spec.spriteSize });
          if (!blit(e, 0, tileCenterX(n.x), tileFootY(n.y), spec.spriteSize)) marker(tileCenterX(n.x), tileFootY(n.y));
        }
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
      // painted survivor (assets/sprites/npc): drawn feet-on-the-cell, mirrored for left-facing work poses; until it has loaded the placeholder atlas draws
      const wanted = npcArt ? npcPose({ animation: p.animation, direction: p.direction, resource: p.resource, frame: walkFrameAt(time, stagger(p.id)) }) : null;
      let pose = wanted; let art = wanted ? npcArt.get(wanted.key) : null;
      if (art) lastPose.set(p.id, wanted);
      else if (wanted) { // the wanted picture is not ready: a painted stand-in (her last drawn pose, else the standing picture of this view) beats the mock model
        for (const cand of [lastPose.get(p.id), npcPose({ animation: 'IDLE', direction: p.direction }), { key: 'idle_down', mirror: false }]) {
          const a = cand ? npcArt.get(cand.key) : null; if (a) { art = a; pose = cand; break; }
        }
      }
      const loading = !art && Boolean(npcArt?.pending?.()); // nothing painted is ready yet but pictures are on the way: draw no body (never the mock) until they arrive
      const sc = vp.cell * NPC_CELLS / NPC_REF_H; // one size factor for every pose, so a tool pose is as big as the idle one
      // chopping / mining: the tool picture is a still, so she is moved back and forth toward her tree / rock (assets/npcart.js workSwing); only while a gather pose is actually drawn
      const swing = art && String(p.animation).toUpperCase() === 'GATHER' && pose.key.startsWith('tool_') ? workSwing(time, stagger(p.id)) : null;
      const face = swing ? facingVector(p.direction) : null;
      const drawArt = () => {
        const w = art.img.naturalWidth * sc; const h = art.img.naturalHeight * sc;
        if (swing) { // lunge along the facing direction, leaning toward it, pivoting on her feet
          ctx.save(); ctx.translate(cx + face[0] * swing.lunge * WORK_LUNGE_CELLS * vp.cell, fy + face[1] * swing.lunge * WORK_LUNGE_CELLS * vp.cell * 0.6); ctx.rotate(Math.sign(face[0]) * swing.lunge * WORK_TILT_RAD); ctx.translate(-cx, -fy);
        }
        if (pose.mirror) { ctx.save(); ctx.transform(-1, 0, 0, 1, cx, 0); ctx.drawImage(art.img, -art.ax * sc, fy - h, w, h); ctx.restore(); } // mirrored about the foot anchor
        else ctx.drawImage(art.img, cx - art.ax * sc, fy - h, w, h);
        if (swing) ctx.restore();
      };
      npcGeo.set(p.id, { p, cx, top: art ? fy - art.img.naturalHeight * sc : fy - vp.cell * 1.3 });
      if (art) {
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, fy - vp.cell * 0.03, vp.cell * 0.3, vp.cell * 0.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); // ground shadow
        if (selected.kind === 'npc' && selected.id === p.id) glowed(drawArt); // the picked survivor glows green
        drawArt();
        if (swing && swing.impact > 0) { // the hit: a few chips (wood-brown for a tree, grey for a rock) fly out from where the tool lands and fade
          const grow = 1 - swing.impact; const hx = cx + face[0] * vp.cell * 0.62; const hy = fy - vp.cell * 0.5 + face[1] * vp.cell * 0.3;
          ctx.save(); ctx.globalAlpha = swing.impact; ctx.fillStyle = isStoneWork(p.resource) ? '#c9c7bd' : '#b98a52';
          for (let i = 0; i < 4; i++) { const ang = -Math.PI / 2 + (i - 1.5) * 0.7; const r = vp.cell * (0.1 + 0.42 * grow); const sz = Math.max(1.5, vp.cell * 0.07); ctx.fillRect(hx + Math.cos(ang) * r - face[0] * r * 0.4, hy + Math.sin(ang) * r + grow * vp.cell * 0.18, sz, sz); }
          ctx.restore();
        }
      } else if (!loading) { // no painted picture exists at all (files missing / failed): the placeholder keeps her visible
        if (selected.kind === 'npc' && selected.id === p.id) glowed(() => { if (!blit(e, idx, cx, fy)) marker(cx, fy); }); // the picked survivor glows green
        if (!blit(e, idx, cx, fy)) marker(cx, fy);
      }
      ctx.fillStyle = COLORS.label; ctx.font = `${Math.max(9, t * 0.3)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.name, cx, npcGeo.get(p.id).top - 3);
    }
    selNode = selected.kind === 'node' ? nodeGeo.get(selected.id) ?? null : null;
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
  /** The little label card used by every hover / pick tag: bold title (left), optional right text, optional rows. Returns the card's box. */
  function card(cx, top, w, h) {
    const x = Math.max(vp.ox + 2, Math.min(cx - w / 2, vp.ox + worldW - w - 2)); const y = Math.max(world_top() + 2, top - h - 6);
    ctx.fillStyle = 'rgba(8,20,12,0.88)'; ctx.strokeStyle = COLORS.glow; ctx.lineWidth = 1.5;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, 7); else ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    return { x, y };
  }
  /** Name + resource bar (+ who is working it, + a GATHER button when picked) floating above a tree / rock. The bar's full mark is the most this node has held
   *  (or its type's typical amount). The button is only drawn here; the screen asks `pickTag(x, y)` whether a click landed on it (it inserts code, it never runs it). */
  function drawNodeTag(geo, withButton) {
    if (!geo) return;
    const { n, cx, top } = geo;
    const full = Math.max(nodePeak.get(n.id) ?? 0, n.capacity ?? 0, n.amount ?? 0, 1); const frac = Math.max(0, Math.min(1, (n.amount ?? 0) / full));
    const has = (n.amount ?? 0) > 0; const crew = n.workers ?? []; const btn = withButton && has;
    const fs = Math.max(10, vp.cell * 0.34); const w = Math.max(104, vp.cell * 3.3); const btnH = fs * 1.75;
    const h = fs * 2.9 + (crew.length ? fs * 1.35 : 0) + (btn ? btnH + 6 : 0);
    const { x, y } = card(cx, top, w, h);
    ctx.save();
    ctx.fillStyle = '#eafbee'; ctx.font = `700 ${fs}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(n.name ?? n.type, x + 8, y + 5);
    ctx.font = `${fs * 0.9}px system-ui`; ctx.textAlign = 'right'; ctx.fillStyle = has ? '#bbf7d0' : '#fca5a5';
    ctx.fillText(has ? `${n.amount} ${n.resource ?? ''}`.trim() : 'depleted', x + w - 8, y + 5 + fs * 0.05);
    const bx = x + 8; const by = y + 5 + fs * 1.35; const bw = w - 16; const bh = fs * 0.62;
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = frac > 0.35 ? '#4ade80' : frac > 0 ? '#fbbf24' : '#f87171'; ctx.fillRect(bx, by, bw * frac, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    if (crew.length) { // who is working this node right now, e.g. "Mara is gathering"
      const who = crew.length > 2 ? `${crew[0]}, ${crew[1]} +${crew.length - 2}` : crew.join(' & ');
      ctx.font = `italic ${fs * 0.9}px system-ui`; ctx.textAlign = 'left'; ctx.fillStyle = '#86efac';
      ctx.fillText(`${who} ${crew.length > 1 ? 'are' : 'is'} gathering`, bx, by + bh + 5);
    }
    if (btn) { // the GATHER button: sends a survivor for this resource (the screen turns a click on it into the gather command)
      const gy = y + h - btnH - 6; const label = `⛏ Gather ${n.resource ?? ''}`.trim();
      ctx.fillStyle = '#22c55e'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, gy, bw, btnH, 5); else ctx.rect(bx, gy, bw, btnH); ctx.fill();
      ctx.fillStyle = '#052e16'; ctx.font = `700 ${fs * 0.95}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + bw / 2, gy + btnH / 2 + 0.5);
      tagBtn = { x: bx, y: gy, w: bw, h: btnH, id: n.id, resource: n.resource ?? null };
    }
    ctx.restore();
  }
  /** Two-line hover tag for a survivor or a building: bold name, then a coloured status line. */
  function drawPill(geo, title, sub, subColor) {
    if (!geo) return;
    const fs = Math.max(10, vp.cell * 0.32); ctx.save(); ctx.font = `700 ${fs}px system-ui`;
    const wid = (t) => ctx.measureText?.(t)?.width ?? t.length * fs * 0.58; const w = Math.max(wid(title), wid(sub) * 0.92) + 18; const h = fs * 2.7;
    const { x, y } = card(geo.cx, geo.top, w, h);
    ctx.fillStyle = '#eafbee'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(title, x + 9, y + 5);
    ctx.font = `${fs * 0.92}px system-ui`; ctx.fillStyle = subColor; ctx.fillText(sub, x + 9, y + 5 + fs * 1.25);
    ctx.restore();
  }
  /** The hover tag: what is under the pointer, so nothing has to be clicked just to read its name and state. */
  function drawHoverTag(frame) {
    if (!hover.id || (selected.kind === hover.kind && selected.id === hover.id && hover.kind === 'node')) return; // a picked node already carries its tag
    if (hover.kind === 'node') return drawNodeTag(nodeGeo.get(hover.id), false);
    if (hover.kind === 'npc') { const g = npcGeo.get(hover.id); return drawPill(g, g?.p.name ?? '', g?.p.doing ?? 'idle', g?.p.doing ? '#86efac' : '#cbd5c8'); }
    if (hover.kind === 'building') {
      const g = bldGeo.get(hover.id); if (!g) return; const b = g.b;
      const cond = { repaired: ['working', '#86efac'], damaged: ['damaged', '#fbbf24'], ruined: ['ruined', '#f87171'] }[b.condition] ?? [String(b.condition ?? ''), '#cbd5c8'];
      return drawPill(g, `${b.name ?? b.type}${b.level > 1 ? ` · Lv ${b.level}` : ''}`, cond[0], cond[1]);
    }
  }
  const world_top = () => vp.oy;
  function drawSelection(frame) {
    tagBtn = null;
    drawHoverTag(frame);
    drawNodeTag(selNode, true); // a picked tree / rock: tag with the GATHER button
    // survivors, buildings and nodes glow when picked (drawn with the sprites); the dashed box stays for zombies and for a building's footprint
    const selectedRect = (selected.kind === 'zombie' || selected.kind === 'building') && selected.id ? entityRect(frame, selected.kind, selected.id) : null;
    const hoverRect = hover.kind === 'zombie' && hover.id && (!selected.id || selected.id !== hover.id) ? entityRect(frame, hover.kind, hover.id) : null;
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
    for (const [id, r] of gateBoxes) if (sx >= r.x0 && sx <= r.x1 && sy >= r.y0 && sy <= r.y1) return { kind: 'building', id }; // the painted gate (taller than its one logical cell)
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
    /** The picked node's GATHER button, if the click (canvas pixels) landed on it: { kind: 'node-gather', id, resource } or null. */
    pickTag: (px, py) => (tagBtn && px >= tagBtn.x && px <= tagBtn.x + tagBtn.w && py >= tagBtn.y && py <= tagBtn.y + tagBtn.h ? { kind: 'node-gather', id: tagBtn.id, resource: tagBtn.resource } : null),
    select(kind, id) { selected = { kind, id }; },
    clearSelection() { selected = { kind: null, id: null }; tagBtn = null; },
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
    // Silhouette parallax: ratio 0-1. 0 = the top / bottom bands are exactly canvas-wide and never slide, 1 = widest slide when the camera pans (zoomed in). Default 0.5.
    // Both bands use the same ratio and the same camera position, so they always move together; the map picture itself never moves (it IS the map).
    get backdropParallaxRatio() { return backdropParallaxRatio; },
    set backdropParallaxRatio(r) { backdropParallaxRatio = clamp(r, 0, 1); },
    // Preview: draw the wall and gate pictures of this level (1-5) whatever the building's real level is (null = the real level). Presentation only; for looking at art.
    get wallArtLevel() { return wallArtLevel; },
    set wallArtLevel(l) { wallArtLevel = l == null ? null : artLevel(l); },
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
