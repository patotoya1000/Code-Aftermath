// HUD controller (presentation only). It never writes GameState and never issues commands.
//   • folding: every `.hud-card` (and each inspector section) collapses; the state is remembered in localStorage when it is available
//   • inspector tabs: the existing inspector card is regrouped into Info / Stats / Equipment / Bag / Command after every refresh
//   • roster + selector: quick selection built from the render projection; picking goes through the screen's own selectEntity()
//   • event log: tags/colours on the existing event feed, gate status, CLR
//   • tactical overlay: a transparent canvas over the map (compound wash, road, gate + tower readouts, zombie health bars)
// The overlay uses the renderer's own viewport, so it stays aligned with the sprites under pan/zoom/resize.
import { cellRect, cellCenter, gridToScreen } from '../../modules/viewport/index.js';
import { buildingActionList, survivorActionList, townActionList, trainActionList, actionButtons, addressSurvivor } from '../ui/actions.js';

const STORE_KEY = 'aftermath.hud.v1';
const CORE_RESOURCES = new Set(['wood', 'stone', 'food', 'water', 'survivor', 'base']);
// Which inspector tab each section (by its heading) belongs to; anything not listed stays on Info so nothing is ever hidden for good.
const TAB_OF = [[/^(needs|conditions|attributes|skills|traits)/i, 'stats'], [/^equipment/i, 'equipment'], [/^(inventory|storage)/i, 'bag'], [/^(policies|hooks|actions)/i, 'command']];
const KEY_ORDER = ['hq', 'tower', 'gate', 'workshop', 'kitchen', 'field', 'well', 'storage'];

const noop = { frame() {}, foldAll() {}, get state() { return {}; } };

function readStore() { try { const v = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
function writeStore(s) { try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* storage can be blocked: the HUD simply forgets between visits */ } }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** `renderer` = the map renderer; `getView()` = read-only student view (or undefined); `select(kind,id)` / `getSelected()` = the screen's selection. */
export function mountHud({ renderer, getView = () => null, select = () => {}, getSelected = () => null, getCommands = () => [] } = {}) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc || typeof doc.querySelectorAll !== 'function' || typeof doc.createElement !== 'function' || typeof MutationObserver === 'undefined') return noop; // no real DOM (unit-test fake): nothing to do
  try { return build(doc, { renderer, getView, select, getSelected, getCommands }); } catch (e) { console.warn('HUD disabled:', e); return noop; }
}

function build(doc, { renderer, getView, select, getSelected, getCommands }) {
  const $ = (id) => doc.getElementById(id);
  const state = { collapsed: {}, collapseSections: false, tab: 'info', tactical: true, showZero: false, ...readStore() };
  state.collapsed = state.collapsed && typeof state.collapsed === 'object' ? state.collapsed : {};
  if (!('system' in state.collapsed)) state.collapsed.system = true; // the system buttons start tucked away; the map stays clear
  for (const k of ['selector', 'roster']) if (!(k in state.collapsed)) state.collapsed[k] = true; // the on-map card starts compact; the roster and picker are one click away
  const save = () => writeStore({ collapsed: state.collapsed, collapseSections: state.collapseSections, tab: state.tab, tactical: state.tactical, showZero: state.showZero });

  // ---------- folding ----------
  const cards = () => [...doc.querySelectorAll('.hud-card[data-card]')];
  function paintCard(card) {
    const id = card.dataset.card; const off = state.collapsed[id] === true;
    card.classList.toggle('is-collapsed', off);
    card.querySelector('.hud-fold')?.setAttribute('aria-expanded', String(!off));
  }
  cards().forEach(paintCard);
  doc.addEventListener('click', (e) => {
    const fold = e.target?.closest?.('.hud-fold'); if (!fold) return;
    const sec = fold.closest('.section'); const card = fold.closest('.hud-card[data-card]');
    if (sec && sec.dataset.key) { // inspector section
      const off = !sec.classList.contains('is-collapsed');
      state.collapsed[sec.dataset.key] = off; sec.classList.toggle('is-collapsed', off); fold.setAttribute('aria-expanded', String(!off));
    } else if (card) {
      state.collapsed[card.dataset.card] = !card.classList.contains('is-collapsed'); paintCard(card);
    } else return;
    save();
  });
  function foldAll() {
    const anyOpen = cards().some((c) => !c.classList.contains('is-collapsed')) || !state.collapseSections;
    for (const c of cards()) state.collapsed[c.dataset.card] = anyOpen;
    for (const k of Object.keys(state.collapsed)) if (k.startsWith('sec:')) delete state.collapsed[k];
    state.collapseSections = anyOpen;
    cards().forEach(paintCard); decorateInspector(); save();
  }
  $('btn-fold-all')?.addEventListener('click', foldAll);

  // ---------- inspector tabs + section folds ----------
  const card = $('inspector-card');
  function decorateInspector() {
    if (!card) return;
    const secs = [...card.querySelectorAll('.section')];
    let shown = 0;
    for (const sec of secs) {
      const h3 = sec.querySelector('h3'); if (!h3) continue;
      const title = h3.textContent.replace(h3.querySelector('.icon')?.textContent ?? '', '').trim();
      const tab = (TAB_OF.find(([re]) => re.test(title)) ?? [null, 'info'])[1];
      sec.dataset.tab = tab; sec.dataset.key = `sec:${title}`;
      if (!h3.querySelector('.hud-fold')) {
        const btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'hud-fold';
        while (h3.firstChild) btn.appendChild(h3.firstChild);
        h3.appendChild(btn);
      }
      const off = state.collapsed[sec.dataset.key] ?? state.collapseSections;
      sec.classList.toggle('is-collapsed', off === true);
      h3.querySelector('.hud-fold').setAttribute('aria-expanded', String(off !== true));
      sec.hidden = tab !== state.tab;
      if (!sec.hidden) shown++;
    }
    const header = card.querySelector('.header'); if (header) header.hidden = false;
    if (!shown && !card.querySelector('.hud-empty') && state.tab !== 'info') {
      const empty = doc.createElement('div'); empty.className = 'hud-empty'; empty.textContent = 'Nothing to show on this tab for the current selection.'; card.appendChild(empty);
    }
  }
  function setTab(tab) {
    state.tab = tab;
    for (const b of doc.querySelectorAll('.inspector-tab')) { const on = b.dataset.tab === tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); }
    decorateInspector(); save();
  }
  for (const b of doc.querySelectorAll('.inspector-tab')) b.addEventListener('click', () => setTab(b.dataset.tab));
  if (card) new MutationObserver(decorateInspector).observe(card, { childList: true });

  // ---------- resources: hide items at zero (ALL shows them) ----------
  const res = $('resources');
  function decorateResources() {
    if (!res) return;
    for (const r of res.querySelectorAll('.resource')) {
      const kind = [...(r.querySelector('.icon')?.classList ?? [])].find((c) => c !== 'icon') ?? '';
      r.classList.toggle('is-zero', r.querySelector('b')?.textContent?.trim() === '0' && !CORE_RESOURCES.has(kind));
    }
  }
  if (res) new MutationObserver(decorateResources).observe(res, { childList: true });
  const allBtn = $('btn-res-all');
  function paintAll() { $('card-resources')?.classList.toggle('show-zero', state.showZero); allBtn?.setAttribute('aria-pressed', String(state.showZero)); }
  allBtn?.addEventListener('click', () => { state.showZero = !state.showZero; paintAll(); save(); });
  paintAll();

  // ---------- event log ----------
  const feed = $('event-feed'); let clearedTick = -1;
  function tagOf(text) {
    if (/failed|rejected|downed|breach/i.test(text)) return ['FAIL', 'bad'];
    if (/spoiled|ruined|broken|no_power|blocked|switched off|cancelled/i.test(text)) return ['WARN', 'warn'];
    if (/ \+\d+ /.test(` ${text} `)) return ['SUPPLY', 'ok'];
    if (/upgraded|repaired|→/i.test(text)) return ['BUILD', 'ok'];
    if (/started|stopped|resumed|cooked|consumed/i.test(text)) return ['TASK', 'info'];
    if (/^(Saved|Loaded|No saved)/.test(text)) return ['SYS', 'info'];
    return ['EVENT', 'info'];
  }
  function decorateFeed() {
    if (!feed) return;
    const chips = [...feed.querySelectorAll('.cmd-chip')];
    const ticks = chips.map((c) => Number(/^t(\d+) /.exec(c.textContent)?.[1] ?? NaN)).filter(Number.isFinite);
    if (ticks.length && Math.max(...ticks) < clearedTick) clearedTick = -1; // the world restarted: ticks began again from 0
    for (const c of chips) {
      const text = c.textContent; const [tag, tone] = tagOf(text);
      c.dataset.tag = tag; c.dataset.tone = tone;
      const t = /^t(\d+) /.exec(text); if (t && Number(t[1]) <= clearedTick) c.dataset.cleared = '1';
    }
    feed.scrollTop = feed.scrollHeight;
  }
  if (feed) new MutationObserver(decorateFeed).observe(feed, { childList: true });
  $('btn-log-clear')?.addEventListener('click', () => {
    const ticks = [...(feed?.querySelectorAll('.cmd-chip') ?? [])].map((c) => Number(/^t(\d+) /.exec(c.textContent)?.[1] ?? NaN)).filter(Number.isFinite);
    if (ticks.length) clearedTick = Math.max(...ticks);
    decorateFeed();
  });

  // ---------- tactical toggle ----------
  const tacBtn = $('btn-tactical');
  function paintTactical() { tacBtn?.setAttribute('aria-pressed', String(state.tactical)); }
  tacBtn?.addEventListener('click', () => { state.tactical = !state.tactical; paintTactical(); save(); });
  paintTactical();

  // ---------- roster + selector ----------
  const sel = $('entity-selector'); const roster = $('roster-mini-grid'); let rosterKey = '';
  const pickOf = (el) => { const [kind, ...rest] = String(el).split(':'); return { kind, id: rest.join(':') }; };
  sel?.addEventListener('change', () => { const p = pickOf(sel.value); if (p.id) select(p.kind, p.id); });
  roster?.addEventListener('click', (e) => { const b = e.target?.closest?.('[data-pick]'); if (b) { const p = pickOf(b.dataset.pick); select(p.kind, p.id); } });
  function syncRoster(proj) {
    const cur = getSelected(); const curKey = cur ? `${cur.kind}:${cur.id}` : '';
    const entries = [
      ...(proj.npcs ?? []).map((n) => ({ key: `npc:${n.id}`, label: n.name, tag: 'SURVIVOR', short: n.name })),
      ...(proj.buildings ?? []).map((b) => ({ key: `building:${b.id}`, label: b.name, tag: b.type.toUpperCase(), short: b.name.split(' ')[0], type: b.type })),
    ];
    const sig = entries.map((e) => e.key).join('|') + `#${curKey}`;
    if (sig === rosterKey) return; rosterKey = sig;
    if (sel) sel.innerHTML = entries.map((e) => `<option value="${esc(e.key)}"${e.key === curKey ? ' selected' : ''}>${esc(e.label)} (${esc(e.tag)})</option>`).join('');
    if (roster) {
      const rank = (e) => (e.tag === 'SURVIVOR' ? -1 : (KEY_ORDER.indexOf(e.type) + 1 || 99));
      const quick = entries.filter((e) => e.tag === 'SURVIVOR' || KEY_ORDER.includes(e.type)).sort((a, b) => rank(a) - rank(b)).slice(0, 8);
      roster.innerHTML = quick.map((e) => `<button type="button" data-pick="${esc(e.key)}" class="${e.key === curKey ? 'on' : ''}" title="${esc(e.label)}">${esc(e.short)}</button>`).join('');
    }
  }


  // ---------- navigation panels: Task / Assign / Building / Survivors (read the real view; buttons only insert code) ----------
  const panel = $('nav-panel'); const panelBody = $('nav-panel-body'); const panelTitle = $('nav-panel-title');
  const NAV = { task: 'Task board', assign: 'Assign a command', build: 'Buildings', survivors: 'Survivors', town: 'Town' };
  let navMode = null; let navSig = ''; const assignPick = { survivor: null, command: 'command.gather' };
  const npBar = (v) => `<span class="np-bar"><i style="width:${Math.max(0, Math.min(100, v))}%" class="${v <= 20 ? 'bad' : v <= 40 ? 'warn' : 'good'}"></i></span>`;
  const first = (list, ids) => list.filter((a) => ids.includes(a.id));
  const pick = (kind, id, text) => `<button type="button" class="np-link" data-pick="${esc(kind)}:${esc(id)}">${esc(text)}</button>`;

  function navHtml(view) {
    const survivors = view.survivors ?? [];
    if (navMode === 'task') {
      return survivors.map((s) => {
        const t = s.task; const pct = Math.round((t?.fraction ?? 0) * 100);
        const now = t ? `${esc(t.type)}${t.targetId ? ` → ${esc(t.targetId)}` : ''} · ${pct}%` : 'Idle';
        const last = !t && s.lastTask ? `<div class="np-sub">Last: ${esc(s.lastTask.type)} ${esc(String(s.lastTask.status).toLowerCase())}${s.lastTask.reason ? ` — ${esc(s.lastTask.reason)}` : ''}</div>` : '';
        const btns = actionButtons(first(survivorActionList(s, view), ['stop', 'queue']), { view, survivorId: s.id });
        return `<div class="np-row"><div class="np-main">${pick('npc', s.id, s.name)}<span>${now}</span><span class="np-sub">${s.queued ? `${s.queued} queued` : 'nothing queued'}</span>${last}</div>${btns}</div>`;
      }).join('') || '<div class="np-sub">No survivors.</div>';
    }
    if (navMode === 'build') {
      return (view.buildings ?? []).filter((b) => b.type !== 'fence').map((b) => {
        const list = buildingActionList(b, view).filter((a) => a.id === 'repair' || a.id === 'upgrade');
        const pct = Math.round((b.health / b.maxHealth) * 100);
        return `<div class="np-row"><div class="np-main">${pick('building', b.id, b.name)}<span>L${b.level} · ${esc(b.condition)}</span>${npBar(pct)}</div>${actionButtons(list, { view, survivorId: view.survivors?.[0]?.id })}</div>`;
      }).join('');
    }
    if (navMode === 'survivors') {
      const rows = survivors.map((s) => `<div class="np-row"><div class="np-main">${pick('npc', s.id, s.name)}<span>${esc(s.status)}${s.task ? ` · ${esc(s.task.type)}` : ''}</span>
        <span class="np-needs">${['health', 'hunger', 'thirst', 'energy'].map((k) => `<label>${k.slice(0, 3)}${npBar(s.needs[k])}</label>`).join('')}</span></div></div>`).join('');
      return `${rows}<div class="np-sub">${view.town?.open ? `${view.town.survivors} survivors, ${view.town.freeBeds} free bed${view.town.freeBeds === 1 ? '' : 's'}. Open TOWN to recruit.` : 'The town opens soon.'}</div>`;
    }
    if (navMode === 'town') {
      const t = view.town;
      if (!t?.open) return `<div class="np-sub">The town sends nobody before day ${esc(t?.opensOnDay ?? '?')}.</div>`;
      const list = townActionList(view);
      const head = `<div class="np-sub">Day ${t.day} · ${t.survivors} survivors · ${t.freeBeds} free bed${t.freeBeds === 1 ? '' : 's'} · new board in ${t.nextBoardInDays} day${t.nextBoardInDays === 1 ? '' : 's'}. The town takes supplies only.</div>`;
      const rows = list.map((a) => {
        const o = a.offer;
        const stats = [...Object.entries(o.skills).map(([k, v]) => `${k} ${v}`), ...o.traits].join(' · ') || 'no skills yet';
        const cost = a.price.map((p) => `<span class="${p.ok ? 'good' : 'bad'}">${p.qty} ${esc(p.item)}</span>`).join(' / ');
        return `<div class="np-row"><div class="np-main"><strong>${esc(o.name)}${o.train ? ' 🚆' : ''}</strong><span>${esc(stats)}</span><span class="np-sub">STR ${o.attributes.strength} AGI ${o.attributes.agility} END ${o.attributes.endurance} · worth ${o.worth}</span><span class="np-sub">${cost}</span></div>${actionButtons([a], {})}</div>`;
      }).join('');
      const tr = t.train;
      const trainHead = tr?.present
        ? `<div class="np-sub"><strong>TRAIN IN</strong> · leaves in ${tr.leavesInDays} day${tr.leavesInDays === 1 ? '' : 's'}. Extra recruits are marked above; goods below.</div>`
        : `<div class="np-sub">Next train: day ${t.train?.nextArrivalDay} (in ${t.train?.arrivesInDays} day${t.train?.arrivesInDays === 1 ? '' : 's'}).</div>`;
      const goods = trainActionList(view).map((a) => {
        const g = a.goods;
        const cost = a.price.map((p) => `<span class="${p.ok ? 'good' : 'bad'}">${p.qty} ${esc(p.item)}</span>`).join(' / ');
        return `<div class="np-row"><div class="np-main"><strong>${esc(g.name)}</strong><span>${g.left} of ${g.qty} left</span><span class="np-sub">each: ${cost}</span></div>${actionButtons([a], {})}</div>`;
      }).join('');
      return `${head}${rows}${trainHead}${goods}`;
    }
    if (navMode === 'assign') {
      const cmds = getCommands(); const cmd = cmds.find((c) => c.id === assignPick.command) ?? cmds[0];
      const sid = survivors.some((s) => s.id === assignPick.survivor) ? assignPick.survivor : survivors[0]?.id;
      if (!cmd || !sid) return '<div class="np-sub">Nothing to assign.</div>';
      const snippet = addressSurvivor(cmd.example, view, sid);
      return `<div class="np-form"><label>Survivor <select data-assign="survivor">${survivors.map((s) => `<option value="${esc(s.id)}"${s.id === sid ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label>Command <select data-assign="command">${cmds.map((c) => `<option value="${esc(c.id)}"${c.id === cmd.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
        <div class="np-sub">${esc(cmd.effect ?? cmd.summary ?? '')}</div>
        ${cmd.requires?.length ? `<div class="np-sub">Needs: ${esc(cmd.requires.join(' · '))}</div>` : ''}
        <pre class="np-code">${esc(snippet)}</pre>
        <button type="button" class="act-btn" data-action="insert" data-snippet="${esc(snippet)}">Add to editor</button>`;
    }
    return '';
  }
  function renderNav(force = false) {
    if (!panel || !panelBody) return;
    panel.hidden = !navMode;
    for (const b of doc.querySelectorAll('[data-nav]')) { const on = b.dataset.nav === navMode; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }
    if (!navMode) { navSig = ''; return; }
    if (panelTitle) panelTitle.textContent = NAV[navMode];
    const view = getView?.(); if (!view) return;
    const html = navHtml(view); if (!force && html === navSig) return; navSig = html;
    // keep keyboard focus on a select the user is changing (it is rebuilt only when its data changed)
    panelBody.innerHTML = html;
  }
  for (const b of doc.querySelectorAll('[data-nav]')) b.addEventListener('click', () => { navMode = navMode === b.dataset.nav ? null : b.dataset.nav; if (navMode && state.collapsed.navpanel) { state.collapsed.navpanel = false; save(); cards().forEach(paintCard); } renderNav(true); });
  $('nav-panel-close')?.addEventListener('click', () => { navMode = null; renderNav(true); });
  panelBody?.addEventListener('click', (e) => { const b = e.target?.closest?.('[data-pick]'); if (b) { const p = pickOf(b.dataset.pick); select(p.kind, p.id); } });
  panelBody?.addEventListener('change', (e) => { const k = e.target?.dataset?.assign; if (!k) return; assignPick[k] = e.target.value; renderNav(true); });

  // ---------- tactical overlay ----------
  const mapCanvas = $('map-canvas'); const ov = $('tactical-overlay'); const ctx = ov?.getContext?.('2d');
  let view = null;
  const mono = (px, w = 600) => `${w} ${px}px ${getComputedStyle(doc.body).getPropertyValue('--font-mono') || 'monospace'}`;
  const hpColor = (p) => (p > 0.55 ? '#10b981' : p > 0.3 ? '#f59e0b' : '#ef4444');

  function bar(x, y, w, h, p, color) {
    ctx.fillStyle = 'rgba(8,12,18,.85)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, p)), h);
  }

  function drawOverlay(proj) {
    if (!ctx || !mapCanvas) return;
    const rect = mapCanvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const dpr = globalThis.devicePixelRatio || 1; const W = Math.round(rect.width * dpr); const H = Math.round(rect.height * dpr);
    if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    if (!state.tactical) return;
    const vp = renderer.viewport; const cell = vp?.cell; if (!(cell > 0)) return;
    const { width: mw, height: mh } = proj.map; const world = cellRect(vp, 0, 0, mw, mh);
    const fs = Math.max(9, Math.min(13, cell * 0.3));
    const buildings = proj.buildings ?? [];

    // compound: darker wasteland outside, a faint tactical wash + grid inside the fence line
    const fence = buildings.find((b) => b.type === 'fence' && b.bounds);
    if (fence) {
      // W2: a line wall protects everything west of it (the wash covers x 0..line); a perimeter wash covers its rectangle
      const fb = fence.bounds; const { x1, y1, x2, y2 } = fb.shape === 'line' ? { x1: 0, y1: fb.y1, x2: fb.x1, y2: fb.y2 } : fb; const r = cellRect(vp, x1, y1, x2 - x1 + 1, y2 - y1 + 1);
      ctx.save(); ctx.beginPath(); ctx.rect(world.x, world.y, world.w, world.h); ctx.rect(r.x, r.y, r.w, r.h); ctx.fillStyle = 'rgba(6,9,14,.30)'; ctx.fill('evenodd'); ctx.restore();
      ctx.fillStyle = 'rgba(56,189,248,.045)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(56,189,248,.07)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = x1; x <= x2 + 1; x++) { const sx = gridToScreen(vp, x, 0).x; ctx.moveTo(sx, r.y); ctx.lineTo(sx, r.y + r.h); }
      for (let y = y1; y <= y2 + 1; y++) { const sy = gridToScreen(vp, 0, y).y; ctx.moveTo(r.x, sy); ctx.lineTo(r.x + r.w, sy); }
      ctx.stroke();
      ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(56,189,248,.38)'; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); ctx.setLineDash([]);
      if (cell >= 22) { ctx.font = mono(fs - 1, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(125,211,252,.7)'; ctx.fillText('COMPOUND', r.x + 6, r.y + 5); }
    }

    // road: the dirt path that leaves the gate, with a dashed approach lane running on to the map edge
    for (const p of proj.terrain?.paths ?? []) {
      const cells = p.cells; if (!cells?.length) continue;
      for (const [cx, cy] of cells) {
        const r = cellRect(vp, cx, cy - 0.2, 1, 1.4);
        ctx.fillStyle = 'rgba(120,95,70,.20)'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = 'rgba(148,124,98,.38)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.x, r.y + 0.5); ctx.lineTo(r.x + r.w, r.y + 0.5); ctx.moveTo(r.x, r.y + r.h - 0.5); ctx.lineTo(r.x + r.w, r.y + r.h - 0.5); ctx.stroke();
      }
      const last = cells.reduce((a, c) => (c[0] > a[0] ? c : a), cells[0]); const from = cellCenter(vp, last[0] + 0.5, last[1]);
      ctx.setLineDash([10, 12]); ctx.strokeStyle = 'rgba(251,191,36,.20)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(world.x + world.w, from.y); ctx.stroke(); ctx.setLineDash([]);
    }

    // gate: readout and condition bar
    const gate = buildings.find((b) => b.type === 'gate');
    if (gate) {
      const vb = view?.buildings?.find((b) => b.id === gate.id); const c = cellCenter(vp, gate.x, gate.y);
      const p = vb && vb.maxHealth ? vb.health / vb.maxHealth : null; const closed = view?.threats?.wave?.active && view.threats.wave.gateClosed;
      const label = p === null ? 'GATE' : `GATE ${Math.round(p * 100)}%${closed ? ' · CLOSED' : ''}`;
      ctx.font = mono(fs, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = p !== null && p < 0.3 ? '#fb7185' : '#fbbf24';
      const lx = c.x + cell * 0.62; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(9,12,16,.85)'; ctx.strokeText(label, lx, c.y - cell * 0.12); ctx.fillText(label, lx, c.y - cell * 0.12);
      if (p !== null) bar(lx, c.y + cell * 0.12, cell * 2.1, Math.max(3, cell * 0.1), p, hpColor(p));
    }

    // towers: ring + label; a selected tower also shows its reach
    const cur = getSelected();
    buildings.filter((b) => b.type === 'tower').sort((a, b) => (a.id < b.id ? -1 : 1)).forEach((t, i) => {
      const c = cellCenter(vp, t.x, t.y); const ruined = t.condition === 'ruined'; const on = cur?.kind === 'building' && cur.id === t.id;
      if (on) {
        const info = view?.buildings?.find((b) => b.id === t.id)?.tower;
        const reach = info ? (Math.max(0, ...info.installed.map((m) => m.range ?? 0)) + (info.rangeBonus ?? 0)) : 0;
        if (reach > 0) { ctx.setLineDash([5, 5]); ctx.fillStyle = 'rgba(244,63,94,.06)'; ctx.strokeStyle = 'rgba(244,63,94,.38)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(c.x, c.y, reach * cell, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]); }
      }
      ctx.strokeStyle = on ? '#38bdf8' : ruined ? 'rgba(148,163,184,.55)' : '#f43f5e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, cell * 0.52, 0, Math.PI * 2); ctx.stroke();
      if (cell >= 20) {
        const label = `TOWER ${String(i + 1).padStart(2, '0')}${ruined ? ' · RUINED' : ''}`;
        ctx.font = mono(fs - 1, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(9,12,16,.85)'; ctx.fillStyle = '#94a3b8';
        ctx.strokeText(label, c.x + cell * 0.62, c.y); ctx.fillText(label, c.x + cell * 0.62, c.y);
      }
    });

    // zombies: health bars (the sprites themselves are the renderer's)
    for (const z of proj.zombies ?? []) {
      if (!z.maxHealth) continue; const c = cellCenter(vp, z.x, z.y); const w = cell * 0.7; const p = z.health / z.maxHealth;
      bar(c.x - w / 2, c.y - cell * 0.62, w, Math.max(3, cell * 0.08), p, '#f43f5e');
    }
  }

  // ---------- per-frame hook (called by the screen right after renderer.draw) ----------
  let lastSlow = -Infinity;
  const gateEl = $('hud-gate'); const waveEl = $('hud-wave');
  function slowUpdate(proj) {
    view = getView?.() ?? null;
    syncRoster(proj);
    renderNav();
    const gate = (proj.buildings ?? []).find((b) => b.type === 'gate'); const vb = gate && view?.buildings?.find((b) => b.id === gate.id);
    if (gateEl) {
      if (vb && vb.maxHealth) { const p = Math.round((vb.health / vb.maxHealth) * 100); gateEl.textContent = `GATE: ${p}%`; gateEl.className = `hud-gate${p < 30 ? ' bad' : p < 60 ? ' warn' : ''}`; }
      else { gateEl.textContent = 'GATE: —'; gateEl.className = 'hud-gate muted'; }
    }
    if (waveEl) {
      const w = view?.threats?.wave;
      if (w?.active) { waveEl.textContent = `WAVE ACTIVE · ${w.zombies.length} on field · ${w.remaining} queued${w.breached ? ' · BREACH' : ''}`; waveEl.className = 'clock wave active'; }
      else { waveEl.textContent = 'NO WAVE ACTIVE'; waveEl.className = 'clock wave'; }
    }
  }
  function frame(proj, now = 0) {
    if (!proj) return;
    if (now - lastSlow >= 250) { lastSlow = now; try { slowUpdate(proj); } catch { /* a read failing must never stop the render loop */ } }
    try { drawOverlay(proj); } catch { /* same */ }
  }

  setTab(state.tab); decorateResources(); decorateFeed(); decorateInspector();
  return { frame, foldAll, get state() { return state; } };
}
