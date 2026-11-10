// CODE: AFTERMATH — Canvas Renderer (Phase 2)
// Reads the render projection (read-only GameState view) and draws the top-down
// simulation map. Animation never determines gameplay. Building visuals are
// resolved from Building Type + Level + Condition (data-driven asset keys).
// No hardcoded image paths — uses semantic IDs with a fallback chain.

const DIR_VEC = {
  UP: [0, -1], UP_RIGHT: [1, -1], RIGHT: [1, 0], DOWN_RIGHT: [1, 1],
  DOWN: [0, 1], DOWN_LEFT: [-1, 1], LEFT: [-1, 0], UP_LEFT: [-1, -1],
};

const BUILDING_COLOR = {
  hq: '#e08a4b', tent: '#6b8e6b', fence: '#8a7a5a',
};
const NODE_COLOR = { tree: '#3f8f4f', rock: '#8b8f94' };
const CONDITION_COLOR = { ruined: '#c0504d', damaged: '#d9a441', repaired: '#4f9d5d' };

export function mountRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let selectedId = null;
  let selectedKind = null;

  const assetResolver = new Map();

  function registerAsset(kind, type, level, condition, drawFn) {
    const key = `${kind}_${type}_lv${level ?? 0}_${condition ?? 'default'}`;
    assetResolver.set(key, drawFn);
  }

  function resolveAsset(kind, type, level, condition) {
    const candidates = [
      `${kind}_${type}_lv${level ?? 0}_${condition ?? 'default'}`,
      `${kind}_${type}_lv${level ?? 0}_default`,
      `${kind}_${type}_default_default`,
      `${kind}_default_default_default`,
      `default_default_default_default`,
    ];
    for (const key of candidates) {
      const fn = assetResolver.get(key);
      if (fn) return fn;
    }
    return drawDefaultEntity;
  }

  registerAsset('building', 'hq', 1, 'repaired', (ctx, t, b) => {
    ctx.fillStyle = BUILDING_COLOR.hq;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(b.x * t + 2, b.y * t + 2, t - 4, t - 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#141311';
    ctx.font = `bold ${t * 0.4}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('HQ', b.x * t + t / 2, b.y * t + t / 2);
  });
  registerAsset('building', 'tent', 1, 'repaired', (ctx, t, b) => {
    ctx.fillStyle = BUILDING_COLOR.tent;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(b.x * t + t / 2, b.y * t + 2);
    ctx.lineTo(b.x * t + t - 2, b.y * t + t - 2);
    ctx.lineTo(b.x * t + 2, b.y * t + t - 2);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#141311'; ctx.lineWidth = 1;
    ctx.stroke();
  });
  registerAsset('building', 'fence', 1, 'repaired', (ctx, t, b) => {
    ctx.strokeStyle = BUILDING_COLOR.fence; ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(b.x * t + 2, b.y * t + 2, t - 4, t - 4);
    ctx.setLineDash([]);
  });
  registerAsset('building', 'default', 0, 'default', (ctx, t, b) => {
    ctx.fillStyle = '#5a554d'; ctx.globalAlpha = 0.8;
    ctx.fillRect(b.x * t + 3, b.y * t + 3, t - 6, t - 6);
    ctx.globalAlpha = 1;
  });

  function drawDefaultEntity(ctx, t, e) {
    ctx.fillStyle = '#5a554d'; ctx.globalAlpha = 0.7;
    ctx.fillRect(e.x * t + 3, e.y * t + 3, t - 6, t - 6);
    ctx.globalAlpha = 1;
  }

  function drawBuilding(ctx, t, b) {
    const fn = resolveAsset('building', b.type, b.level, b.condition);
    fn(ctx, t, b);
    if (b.condition !== 'repaired') {
      ctx.fillStyle = CONDITION_COLOR[b.condition] || '#d9a441';
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(b.x * t + t - 4, b.y * t + 4, t * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (b.level > 1) {
      ctx.fillStyle = '#fff'; ctx.font = `${t * 0.3}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`L${b.level}`, b.x * t + t / 2, b.y * t + t * 0.78);
    }
  }

  function drawNode(ctx, t, n) {
    ctx.fillStyle = NODE_COLOR[n.type] || '#6b6d6b';
    ctx.globalAlpha = n.visual === 'depleted' ? 0.35 : 1;
    ctx.beginPath();
    ctx.arc(n.x * t + t / 2, n.y * t + t / 2, t * 0.4, 0, Math.PI * 2);
    ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = `${t * 0.32}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n.amount), n.x * t + t / 2, n.y * t + t / 2);
  }

  function drawNPC(ctx, t, p) {
    const cx = p.x * t + t / 2; const cy = p.y * t + t / 2;
    const isDowned = p.status === 'downed';
    ctx.fillStyle = isDowned ? '#777' : '#e0a458';
    ctx.beginPath(); ctx.arc(cx, cy, t * 0.3, 0, Math.PI * 2); ctx.fill();
    const [dx, dy] = DIR_VEC[p.direction] ?? [0, 1];
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * t * 0.28, cy + dy * t * 0.28); ctx.stroke();
    if (p.animation !== 'IDLE') {
      ctx.fillStyle = '#ffd46b'; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(cx, cy - t * 0.5, t * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#141311'; ctx.font = `${t * 0.28}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.animation[0], cx, cy - t * 0.5);
    }
    ctx.fillStyle = '#e8e4d8'; ctx.font = `${t * 0.32}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(p.name, cx, cy - t * 0.55);
  }

  function drawSelectionRing(ctx, t, x, y) {
    const cx = x * t + t / 2; const cy = y * t + t / 2;
    const r = t * 0.42;
    const time = Date.now() / 1000;
    const pulse = 1 + 0.15 * Math.sin(time * 4);
    ctx.strokeStyle = '#ffd46b'; ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,212,107,.35)';
    ctx.beginPath(); ctx.arc(cx, cy, r * pulse * 1.6, 0, Math.PI * 2); ctx.stroke();
  }

  function drawEventMarker(ctx, t, x, y, label) {
    const cx = x * t + t / 2; const cy = y * t + t / 2;
    const time = Date.now() / 1000;
    const pulse = 1 + 0.2 * Math.sin(time * 5);
    ctx.fillStyle = '#ef7d74';
    ctx.beginPath(); ctx.arc(cx, cy, t * 0.25 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, t * 0.35 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${t * 0.3}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy);
  }

  function drawFrame(frame) {
    const { width: mw, height: mh } = frame.map;
    const rect = ctx.canvas.getBoundingClientRect();
    const tw = rect.width / mw;
    const th = rect.height / mh;
    const t = Math.min(tw, th);
    scale = t; offsetX = (rect.width - mw * t) / 2; offsetY = (rect.height - mh * t) / 2;

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#1d2420';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = '#2a342e'; ctx.lineWidth = 1;
    for (let x = 0; x <= mw; x++) {
      ctx.beginPath(); ctx.moveTo(offsetX + x * t, offsetY); ctx.lineTo(offsetX + x * t, offsetY + mh * t); ctx.stroke();
    }
    for (let y = 0; y <= mh; y++) {
      ctx.beginPath(); ctx.moveTo(offsetX, offsetY + y * t); ctx.lineTo(offsetX + mw * t, offsetY + y * t); ctx.stroke();
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    for (const b of frame.buildings || []) drawBuilding(ctx, t, b);
    for (const n of frame.nodes || []) drawNode(ctx, t, n);
    for (const p of frame.npcs || []) drawNPC(ctx, t, p);

    if (selectedId) {
      const ent = (frame.npcs || []).find((p) => p.id === selectedId && selectedKind === 'npc')
        || (frame.buildings || []).find((b) => b.id === selectedId && selectedKind === 'building')
        || (frame.nodes || []).find((n) => n.id === selectedId && selectedKind === 'node');
      if (ent) drawSelectionRing(ctx, t, ent.x, ent.y);
    }

    if (frame.events) {
      for (const ev of frame.events) {
        if (ev.x !== undefined && ev.y !== undefined) {
          drawEventMarker(ctx, t, ev.x, ev.y, ev.label || '!');
        }
      }
    }
  }

  function screenToTile(sx, sy) {
    return { x: Math.floor((sx - offsetX) / scale), y: Math.floor((sy - offsetY) / scale) };
  }

  function select(kind, id) { selectedKind = kind; selectedId = id; }
  function clearSelection() { selectedKind = null; selectedId = null; }
  function getSelected() { return { kind: selectedKind, id: selectedId }; }

  return {
    draw: drawFrame,
    select, clearSelection, getSelected,
    screenToTile,
    resize: (w, h) => { ctx.canvas.width = w; ctx.canvas.height = h; },
  };
}
