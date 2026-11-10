// Phase 1 debug view: a plain canvas that draws a render projection. Phase 2 replaces this with the real
// renderer + asset resolver; it consumes the same projection, so gameplay code never changes.
const DIR_VEC = { UP: [0, -1], UP_RIGHT: [1, -1], RIGHT: [1, 0], DOWN_RIGHT: [1, 1], DOWN: [0, 1], DOWN_LEFT: [-1, 1], LEFT: [-1, 0], UP_LEFT: [-1, -1] };
const CONDITION_COLOR = { ruined: '#c0504d', damaged: '#d9a441', repaired: '#4f9d5d' };

export function mountDebugView(canvas) {
  const ctx = canvas.getContext('2d');
  const css = (n, f) => getComputedStyle(canvas).getPropertyValue(n).trim() || f;

  function draw(frame) {
    const { width: mw, height: mh } = frame.map;
    const t = Math.floor(Math.min(canvas.width / mw, canvas.height / mh));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = css('--map-bg', '#1d2420');
    ctx.fillRect(0, 0, mw * t, mh * t);
    ctx.strokeStyle = css('--map-grid', '#2a342e');
    ctx.lineWidth = 1;
    for (let x = 0; x <= mw; x++) { ctx.beginPath(); ctx.moveTo(x * t + 0.5, 0); ctx.lineTo(x * t + 0.5, mh * t); ctx.stroke(); }
    for (let y = 0; y <= mh; y++) { ctx.beginPath(); ctx.moveTo(0, y * t + 0.5); ctx.lineTo(mw * t, y * t + 0.5); ctx.stroke(); }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(9, t * 0.38)}px system-ui, sans-serif`;

    for (const b of frame.buildings) {
      const col = CONDITION_COLOR[b.condition];
      if (b.bounds) {
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash(b.condition === 'ruined' ? [6, 5] : []);
        ctx.strokeRect(b.bounds.x1 * t, b.bounds.y1 * t, (b.bounds.x2 - b.bounds.x1 + 1) * t, (b.bounds.y2 - b.bounds.y1 + 1) * t);
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = col; ctx.globalAlpha = 0.85;
        ctx.fillRect(b.x * t + 2, b.y * t + 2, t - 4, t - 4); ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff'; ctx.fillText(b.type === 'hq' ? 'HQ' : 'T', b.x * t + t / 2, b.y * t + t / 2);
      }
    }
    for (const n of frame.nodes) {
      ctx.globalAlpha = n.visual === 'depleted' ? 0.3 : 1;
      ctx.fillStyle = n.type === 'tree' ? '#3f8f4f' : '#8b8f94';
      ctx.beginPath(); ctx.arc(n.x * t + t / 2, n.y * t + t / 2, t * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(String(n.amount), n.x * t + t / 2, n.y * t + t / 2);
      ctx.globalAlpha = 1;
    }
    for (const p of frame.npcs) {
      const cx = p.x * t + t / 2; const cy = p.y * t + t / 2;
      ctx.fillStyle = p.status === 'downed' ? '#777' : '#e0a458';
      ctx.beginPath(); ctx.arc(cx, cy, t * 0.34, 0, Math.PI * 2); ctx.fill();
      const [dx, dy] = DIR_VEC[p.direction] ?? [0, 1];
      ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * t * 0.34, cy + dy * t * 0.34); ctx.stroke();
      ctx.fillStyle = css('--fg', '#ddd'); ctx.fillText(`${p.name} · ${p.animation}`, cx, cy - t * 0.62);
    }
  }
  return { draw };
}
