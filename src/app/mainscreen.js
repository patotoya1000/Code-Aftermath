// CODE: AFTERMATH — Main Game Screen Controller
// Every value shown is a read-only projection of the simulation. The UI never mutates GameState,
// never parses commands itself, and never invents gameplay numbers.
//   editor → app.runCode() → Safety Validator → Worker → Game API → live simulation (strategy points)
//   animation frame → clock driver → sim.step(n) → projections → renderer / inspector / event feed
// Time is continuous: survivors keep working until their command stops by itself. PLAY / PAUSE / speed only
// decide how fast wall-clock time becomes simulation ticks; they never change a gameplay rule.

import { mountRenderer } from '../modules/render/index.js';
import { placeholderManifestFor, createNodeArt, createBackdropArt, createBuildingArt, createNpcArt, iconUrl } from '../modules/assets/index.js'; // createNodeArt: painted tree / rock sprites (assets/sprites/nodes)
import { createIndexedDbAdapter } from '../modules/persistence/index.js';
import { createApp } from './index.js';
import { renderCompactList, renderNav, renderEntry } from './ui/codebook.js';
import { buildingActionList, survivorActionList, actionButtons, addressSurvivor } from './ui/actions.js'; // buttons that mirror the real command rules
import { SCREENS, screenOf, arrowState, alertLevel } from './ui/screens.js'; // MAP 1 TOWN / MAP 2 OUTPOST / MAP 3 FRONT (presentation only)
import { townSceneSvg, frontSceneSvg } from './ui/scenes.js';
import { recruitHtml, trainHtml, housingHtml, scavengeHeadHtml, scavengeRowsHtml, scavengeLostHtml, raidHtml } from './ui/panels.js';
import { bindMapGestures } from './ui/gestures.js'; // drag to pan, wheel / pinch to zoom, click to pick
import { mountHud } from './hud/hud.js'; // HUD skin: card folding, inspector tabs, tactical overlay (presentation only)

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

let app; let renderer; let hooks = null; let hud = null;
let freeSim; let clock;
let lastActorId = null; // the survivor commands go to while a tree / rock (not a survivor) is picked
let selected = null; // { kind: 'npc' | 'building' | 'node', id }
let cardOpen = false; // the selection card is only on screen after the learner picks something (or opens it from a list)
let isCodePanelOpen = false;
let isLessonMode = false;
let currentLessonId = null;
let lessonAttempt = null;
let stepInspectorActive = false;
let stepStep = 0;
let feed = []; // recent event lines (newest last)
let eventCursor = 0;
let lastFrame = 0; let lastPanelRefresh = 0;
let activeMobileTab = 'world';

// Presentation-only icon hints for action types (no gameplay meaning).
const TASK_ICON = { gather: '🌲', move: '🚶', rest: '💤', eat: '🍎', drink: '💧', repair: '🔧', upgrade: '🔨', deposit: '📦', cook: '🍞' };

async function init() {
  let adapter;
  // IndexedDB can be missing or blocked (some private-browsing modes); then saves live in memory for this page only.
  try { adapter = typeof indexedDB !== 'undefined' ? createIndexedDbAdapter() : undefined; } catch { adapter = undefined; }
  app = createApp(adapter ? { adapter } : {});
  renderer = mountRenderer($('map-canvas'), { manifest: placeholderManifestFor(app.defs), nodeArt: createNodeArt(), npcArt: createNpcArt(), backdropArt: createBackdropArt(), buildingArt: createBuildingArt(), debug: new URLSearchParams(location.search).has('debug'), smoothing: true });
  hud = mountHud({ renderer, getView: () => freeSim?.studentView(), select: (kind, id) => selectEntity(kind, id), getSelected: () => selected, getCommands: () => app.codebook.entries.filter((e) => e.kind === 'command' && e.example) });
  await startScenario();
  renderHints();
  renderCodeAPI();
  bindEvents();
  refreshMobileLayout();
  requestAnimationFrame(loop);
}

async function startScenario() {
  const { sim } = await app.createFreeSim({ scenarioId: 'stage1_outpost', seed: 1 }); // the 40x16 painted outpost: wall + gate near the left, the outside (trees, rocks, wave walk-in) to the right
  freeSim = sim;
  clock = app.createClock(sim);
  hooks = app.createHooks(sim);
  feed = []; eventCursor = 0; projKey = '';
  const first = freeSim.studentView().survivors[0];
  selected = first ? { kind: 'npc', id: first.id } : null; // she is who commands go to by default; her card stays closed until picked
  if (selected) renderer.select('npc', first.id); else renderer.clearSelection();
  cardOpen = false; paintCard();
  refreshUI();
}

// Every frame: advance the simulation by however many ticks the clock says, then draw. Panels refresh a few times a
// second (and on every user action) instead of every frame.
function loop(now) {
  if (freeSim) {
    const dt = lastFrame ? now - lastFrame : 0; lastFrame = now;
    const ran = clock.update(dt);
    hooks?.pump().catch(() => {}); // learner event hooks run in the sandbox Worker; commands arrive a moment later
    renderer.draw(currentProjection());
    placeEdgeArrows(currentProjection());
    hud?.frame(currentProjection(), now);
    if (ran > 0 && now - lastPanelRefresh >= 250) { lastPanelRefresh = now; refreshUI(); }
  }
  requestAnimationFrame(loop);
}

// The screen-edge arrows sit on the road line of the painted map (terrain.roadY, in cell rows), so they read as the road leaving the screen.
// Presentation only: it reads the renderer's viewport and moves two buttons; scenarios without a roadY keep the centred arrows from the CSS.
let arrowTop = null;
function placeEdgeArrows(proj) {
  const roadY = proj.terrain?.roadY; const vp = renderer.viewport; const canvas = $('map-canvas'); const region = $('world-region');
  let top = null;
  if (Number.isFinite(roadY) && vp?.cell > 0 && canvas && region) top = Math.round(canvas.getBoundingClientRect().top - region.getBoundingClientRect().top + vp.oy + roadY * vp.cell);
  if (top === arrowTop) return;
  arrowTop = top;
  for (const id of ['screen-west', 'screen-east']) { const el = $(id); if (el) el.style.top = top === null ? '' : `${top}px`; }
}

// The render projection is deep-frozen on every call; rebuild it only when the world actually changed.
let proj = null; let projKey = '';
function currentProjection() {
  const key = `${freeSim.tick}:${freeSim.log.length}`;
  if (key !== projKey) { proj = freeSim.renderProjection(); projKey = key; }
  return proj;
}

function refreshUI() {
  if (!freeSim) return;
  paintScreens();
  updateTopBar();
  renderInspector();
  updateTutor();
  collectEvents();
  renderFeed();
  if (isLessonMode) {
    renderLessonList();
    renderLessonInstructions();
    if (lessonAttempt) renderLessonResult();
  }
}

function renderUI() {
  refreshUI();
  if (isLessonMode) {
    renderLessonList();
    renderLessonInstructions();
    renderProgressScreen();
    if (lessonAttempt) renderLessonResult();
  }
}

// ---------- Top bar (projection data only) ----------
function updateTopBar() {
  const proj = currentProjection();
  const view = freeSim.studentView();
  const info = freeSim.getClockInfo();

  const fresh = (key) => (view.base.perishables ?? []).filter((p) => p.item === key).map((p) => `${p.qty} with ${p.daysLeft} day(s) left${p.cold ? ' (cold)' : ''}`).join('; ');
  let html = Object.entries(proj.stock).map(([key, val]) => `
    <div class="resource" title="${esc(cap(key))}${fresh(key) ? ` — ${esc(fresh(key))}` : ''}"><div class="icon ${esc(key)}">${esc(key.slice(0, 2).toUpperCase())}</div><b>${val}</b></div>`).join('');
  html += `<div class="resource" title="Survivors"><div class="icon survivor">SV</div><b>${view.survivors.length}</b></div>`;
  if (view.hq) {
    const pct = Math.round((view.hq.health / view.hq.maxHealth) * 100);
    const cls = pct >= 80 ? 'pos' : pct >= 50 ? 'warn' : 'neg';
    html += `<div class="resource" title="Headquarters condition"><div class="icon base">BS</div><b><span class="delta ${cls}">${pct}%</span></b></div>`;
  }
  $('resources').innerHTML = html;

  $('clock-label').textContent = `${clock.paused ? 'PAUSED' : 'RUNNING'} · ${clock.speed}×`;
  $('clock-detail').textContent = `STRATEGY ${info.strategyPoints}/${info.maxStrategyPoints} · TICK ${info.tick}`;
  const w = view.world;
  if (w?.time) {
    const hh = String(w.time.hour).padStart(2, '0'); const mm = String(w.time.minute).padStart(2, '0');
    const next = w.nextChange ? ` · next: ${w.nextChange.weatherInfo?.icon ?? ''}${cap(w.nextChange.weather)} in ${w.nextChange.inDays}d` : '';
    $('env-label').textContent = `DAY ${w.time.day} · ${cap(w.time.season)} · ${hh}:${mm} ${w.time.isNight ? '🌙' : '☀'} · ${w.weatherInfo.icon} ${w.weatherInfo.name}${next}`;
    renderCalendar(w);
  }
  $('btn-play').textContent = clock.paused ? '▶ PLAY' : '⏸ PAUSE';
  $('btn-speed').textContent = `${clock.speed}×`;
}

// ---------- Inspector / Survivor Card (projection-driven) ----------
function bar(label, val, max = 100, cls = '') {
  const pct = Math.max(0, Math.min(100, (val / max) * 100));
  return `<div class="need-row"><div class="label">${esc(cap(label))}</div><div class="bar-flex"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div><div class="value">${Math.round(val)}</div></div>`;
}
const itemIcon = (id) => { const u = iconUrl(id); return u ? `<img class="item-icon" src="${u}" alt="">` : ''; }; // equipment picture (assets/equipments) when the item has one, else nothing: the text row stays
const section = (icon, title, body) => `<div class="section"><h3><span class="icon">${icon}</span>${esc(title)}</h3>${body}</div>`;
const muted = (t) => `<span style="color:var(--muted);font-size:11px;">${esc(t)}</span>`;

function survivorSections(card, view) {
  const needs = Object.entries(card.needs).map(([k, v]) => bar(k, v, 100, v <= 20 ? 'bad' : v <= 40 ? 'warn' : 'good')).join('');
  const attrs = Object.entries(card.attributes).map(([k, v]) => `<div class="attr-cell"><span class="attr-name">${esc(cap(k))}</span><span class="attr-val">${v}</span></div>`).join('');
  const skills = Object.entries(card.skills);
  const equip = Object.entries(card.equipment);
  const inv = card.inventoryDetail.map((i) => `<div class="inv-item"><span class="name">${itemIcon(i.id)}${esc(i.name)} × ${i.quantity}</span><span class="qty">${i.weight} wt</span></div>`).join('');
  return [
    section('❤', 'Needs', `<div class="needs-grid">${needs}</div>`),
    card.conditions.length ? section('⚠', 'Conditions', card.conditions.map((c) => `<span class="status-pill" style="margin-right:6px;">${esc(c)}</span>`).join('')) : '',
    section('⚡', 'Attributes', `<div class="attrs-grid">${attrs}</div>`),
    section('🎓', 'Skills', skills.length ? `<div class="attrs-grid">${skills.map(([k, v]) => { const pr = card.skillProgress?.[k]; const pct = pr && pr.next ? Math.min(100, Math.round((pr.xp / pr.next) * 100)) : 100; return `<div class="attr-cell" title="${pr ? `${pr.xp} XP${pr.next ? ` / ${pr.next} for level ${v + 1}` : ' (max level)'}` : ''}"><span class="attr-name">${esc(cap(k))}</span><span class="attr-val">${v}</span><span class="skill-xp"><i style="width:${pct}%"></i></span></div>`; }).join('')}</div>` : muted('No skills tracked.')),
    card.traits.length ? section('🏷', 'Traits', card.traits.map((t) => `<span class="status-pill">${esc(t)}</span>`).join(' ')) : '',
    section('🎒', 'Equipment', equip.length ? `<div class="equip-grid">${equip.map(([slot, item]) => `<div class="equip-slot"><span class="slot-label">${esc(slot.toUpperCase())}</span><span class="slot-val">${itemIcon(item)}${esc(item)}</span></div>`).join('')}</div>` : muted('Nothing equipped.')),
    section('📦', 'Inventory', `<div class="inv-list">${inv || muted('Empty')}</div><div style="margin-top:6px;">${muted(`Carrying ${card.carry.load} / ${card.carry.capacity} wt. Encumbrance does not slow her yet.`)}</div>`),
    taskSection(card.task, card.queued, card.lastTask),
    section('⌨', 'Commands', `${actionButtons(survivorActionList(card, view), { view, survivorId: card.id })}${muted('Buttons add a command to the editor; nothing runs until you press Run.')}`),
    policySection(card.policies),
    hookSection(card.hooks),
  ].join('');
}

function policySection(policies = {}) {
  const rows = Object.entries(policies).map(([k, p]) => `<span class="status-pill" style="margin-right:6px;">${esc(k)} &lt; ${p.below}${p.until ? ` → ${p.until}` : ''}${p.prefer ? ` (${esc(p.prefer)} first)` : ''}${p.blocked ? ` ⚠ ${esc(p.blocked)}` : ''}</span>`);
  return section('🧭', 'Policies', rows.length ? rows.join('') : muted('None. Try survivor.policy("eat", { below: 30 })'));
}

function hookSection(hooks = []) {
  return section('🪝', 'Hooks', hooks.length ? hooks.map((h) => `<span class="status-pill" style="margin-right:6px;">on ${esc(h)}</span>`).join('') : muted('None. Try survivor.on("hungry", () => { survivor.eat(); })'));
}

function taskSection(task, queued = 0, lastTask = null) {
  const stopReason = lastTask?.reason ?? task?.reason ?? null;
  const target = task?.targetId ?? lastTask?.targetId ?? null;
  const route = target ? `Route: ${esc(target)}` : 'Route: none';
  const reasonText = stopReason ? `<div class="task-meta">Stop reason: ${esc(stopReason)}</div>` : '';
  if (!task) {
    const last = lastTask
      ? `Last: ${esc(lastTask.type)} ${esc(lastTask.status.toLowerCase())}${lastTask.reason ? ` — ${esc(lastTask.reason)}` : ''}${lastTask.gathered ? ` (${lastTask.gathered} gathered)` : ''}${lastTask.crafted ? ` (${lastTask.crafted} cooked)` : ''}`
      : 'Waiting for command';
    return section('📋', 'Current Task', `<div class="current-task"><div class="task-icon">—</div><div class="task-info"><div class="task-title">No active task</div><div class="task-target">${esc(route)}</div><div class="task-progress"><div class="task-progress-fill" style="width:0%"></div></div><div class="task-meta">${last}</div>${reasonText}</div></div>`);
  }
  const pct = Math.round((task.fraction ?? 0) * 100);
  const stats = !task.stats ? '' : task.stats.crafted !== undefined ? ` · cooked ${task.stats.crafted} batch(es)` : ` · gathered ${task.stats.gathered} in ${task.stats.trips} trip(s)`;
  return section('📋', 'Current Task', `<div class="current-task"><div class="task-icon">${TASK_ICON[task.type] ?? '⏳'}</div><div class="task-info"><div class="task-title">${esc(task.type)}</div><div class="task-target">Target: ${esc(task.targetId ?? 'base')} · ${esc(route)}</div><div class="task-progress"><div class="task-progress-fill" style="width:${pct}%"></div></div><div class="task-meta">${esc(task.status)} · ${pct}%${esc(stats)} · queued: ${queued}</div>${reasonText}</div></div>`);
}

// A well: reservoir bar, how fast the aquifer refills right now (weather changes it), and the siphon's connection status.
const SIPHON_TEXT = {
  OFF: 'No siphon yet. Upgrade the well to add one.', BROKEN: 'Siphon is down: repair the well.',
  NO_POWER: 'Not pumping: the grid is not powering the pump. Repair a generator or solar panel and keep it fuelled.', NO_STORAGE: 'Not connected: no working water storage within reach. Repair a water tank near the well.', FULL: 'Connected, but base water storage is full.', ACTIVE: 'Connected: it fills base storage by itself.',
};
function waterSection(b) {
  const w = b.water;
  if (!w) return '';
  const every = w.recharge.percent > 0 ? Math.round((w.recharge.every * 100) / w.recharge.percent) : null;
  const refill = !w.working ? 'Ruined: the well gives and refills nothing until it is repaired.'
    : every === null ? 'The aquifer is dry right now (no refill in this weather).'
    : `Refills +${w.recharge.amount} every ~${every} ticks now (${w.recharge.percent}% of normal, about ${w.recharge.perDay}/day).`;
  const siphon = w.siphon ? `Siphon ${esc(w.siphon.status)} (reach ${w.siphon.reach}${w.siphon.target ? `, feeds ${esc(w.siphon.target)}` : ''}): ${esc(SIPHON_TEXT[w.siphon.status] ?? '')}` : esc(SIPHON_TEXT.OFF);
  return section('💧', 'Water', `<div class="needs-grid">${bar('reservoir', w.amount, w.capacity, !w.working ? 'bad' : w.amount < 5 ? 'warn' : 'good').replace(/<div class="value">\d+<\/div>/, `<div class="value">${w.amount}/${w.capacity}</div>`)}</div><div style="margin-top:6px;font-size:11px;">${esc(refill)}</div><div style="margin-top:4px;font-size:11px;">${siphon}</div>`);
}

// Power (O11): a producer's output and status (and fuel), or a consumer's use and whether the grid powers it.
const POWER_TEXT = {
  RUNNING: 'Running: it is feeding the grid.', IDLE: 'Idle: nothing needs power (or nothing to store), so it burns no fuel.', NO_FUEL: 'Out of fuel: keep wood in base stock.',
  DARK: 'No light right now (night or heavy cloud): a panel makes nothing.', BROKEN: 'Ruined: repair it.', OFF: 'Not running yet.',
  CHARGING: 'Charging from surplus power.', DISCHARGING: 'Discharging: covering demand before any generator burns fuel.',
  POWERED: 'Powered.', NO_POWER: 'Not enough power: it is switched off until the grid can supply it.',
};
function powerSection(b) {
  const p = b.power;
  if (!p) return '';
  const status = esc(POWER_TEXT[p.status] ?? p.status);
  const body = p.role === 'storage'
    ? `Battery: ${p.charge}/${p.capacity} stored, up to ${p.rate} per tick. <b>${esc(p.status)}</b>: ${status}`
    : p.role === 'consumer'
    ? `Uses ${p.use} power per tick. <b>${esc(p.status)}</b>: ${status}`
    : `${esc(p.kind === 'solar' ? 'Solar panel' : 'Generator')}: up to ${p.output} power, making ${p.producing} now. <b>${esc(p.status)}</b>: ${status}${p.fuel ? `<div style="margin-top:4px;">Fuel: 1 ${esc(p.fuel.item)} lasts ${p.fuel.every} ticks (${p.fuel.inStock} in stock, ${p.fuel.burnLeft} ticks left in the current one).</div>` : ''}`;
  return section('⚡', 'Power', `<div style="font-size:11px;">${body}</div>`);
}

function buildingSections(b, view) {
  const pct = Math.round((b.health / b.maxHealth) * 100);
  const storage = b.storageInfo
    ? Object.entries(b.storageInfo.capacity).map(([k, c]) => bar(k, b.storageInfo.current[k] ?? 0, c, 'good').replace(/<div class="value">\d+<\/div>/, `<div class="value">${b.storageInfo.current[k] ?? 0}/${c}</div>`)).join('')
    : '';
  return [
    section('🏗', 'Building', `<div class="needs-grid">${bar('health', b.health, b.maxHealth, pct < 25 ? 'bad' : pct < 60 ? 'warn' : 'good')}</div><div style="margin-top:6px;font-size:11px;">Condition: <b>${esc(b.condition)}</b> · Level ${b.level}</div>`),
    storage ? section('📦', 'Storage', `<div class="needs-grid">${storage}</div>`) : '',
    waterSection(b),
    powerSection(b),
    b.cold ? section('❄', 'Cold storage', `<div style="font-size:11px;">${b.cold.working ? `Keeps the ${b.cold.capacity} oldest food units fresh: they age ${b.cold.factor}× slower.${b.cold.needsPower ? ' Powered.' : ' Needs no power.'}` : b.cold.needsPower && b.condition !== 'ruined' ? 'Freezer is off: it needs power, so food ages at the normal rate. Repair a generator or solar panel and keep it fuelled.' : 'Ruined: it protects nothing until it is repaired.'}</div>`) : '',
    section('🔧', 'Actions', `${actionButtons(buildingActionList(b, view), { view, survivorId: selectedActor(view) })}${muted('Buttons add a command to the editor; nothing runs until you press Run.')}`),
  ].join('');
}

function renderInspector() {
  if (!selected || !freeSim) { $('inspector-card').innerHTML = `<div class="header"><div class="portrait">?</div><div class="info"><div class="name">—</div><div class="sub">Select a survivor, building or resource</div></div></div>`; return; }
  const view = freeSim.studentView();
  let header; let body = '';
  if (selected.kind === 'npc') {
    const card = freeSim.inspector(selected.id);
    if (!card) { selected = null; return renderInspector(); }
    header = { glyph: '<img class="npc-portrait" src="assets/sprites/npc/idle_down.png" alt="">', name: card.identity.name, sub: `${card.status} · ${card.identity.background}`, meta: `<span>ID: ${esc(card.id)}</span><span>Age: ${card.identity.age}</span><span>Pos: ${card.x},${card.y}</span><span>Dir: ${card.direction}</span>` };
    body = survivorSections(card, view);
  } else if (selected.kind === 'building') {
    const b = view.buildings.find((x) => x.id === selected.id);
    if (!b) { selected = null; return renderInspector(); }
    header = { glyph: '🏗', name: b.name, sub: `${b.condition} · Lvl ${b.level}`, meta: `<span>ID: ${esc(b.id)}</span><span>Type: ${esc(b.type)}</span>` };
    body = buildingSections(b, view);
  } else {
    const n = view.nodes.find((x) => x.id === selected.id);
    if (!n) { selected = null; return renderInspector(); }
    header = { glyph: n.type === 'tree' ? '🌲' : '🪨', name: cap(n.type), sub: `${n.amount} ${n.resource} left`, meta: `<span>ID: ${esc(n.id)}</span><span>Pos: ${n.x},${n.y}</span>` };
    body = section('⛏', 'Resource', `<div class="needs-grid">${bar(n.resource, n.amount, Math.max(n.amount, 1), n.amount ? 'good' : 'bad')}</div><div style="margin-top:6px;">${muted(`Use survivor.gather("${n.resource}") to harvest.`)}</div>`);
  }
  $('inspector-card').innerHTML = `<div class="header"><div class="portrait selected">${header.glyph}</div><div class="info"><div class="name">${esc(header.name)}</div><div class="sub">${esc(header.sub)}</div><div class="meta-row" id="inspector-meta">${header.meta}</div></div></div>${body}`;
}

function selectEntity(kind, id) {
  selected = { kind, id };
  if (kind === 'npc') lastActorId = id;
  renderer.select(kind, id);
  cardOpen = kind !== 'node'; paintCard(); // a picked tree / rock shows its name + resource bar on the map (glowing green); it opens no card
  refreshUI();
}
/** The GATHER button on a picked tree / rock: like every action button it only puts the command in the editor (addressed to the last survivor you picked). */
function gatherFromTag(resource) {
  const view = freeSim?.studentView(); if (!view || !resource) return;
  insertSnippet(addressSurvivor(`survivor.gather("${resource}", 20);`, view, selectedActor(view)));
}
/** Drop a tree / rock pick (empty click, Esc) and go back to the default survivor, who commands go to. Returns true if there was one. */
function clearNodePick() {
  if (selected?.kind !== 'node') return false;
  const crew = freeSim?.studentView().survivors ?? []; const first = crew.find((x) => x.id === lastActorId) ?? crew[0];
  selected = first ? { kind: 'npc', id: first.id } : null;
  if (selected) renderer.select('npc', first.id); else renderer.clearSelection();
  refreshUI(); return true;
}

// The card floats over the map and never takes width from it. Phones keep their own tab layout, where the card is a tab.
function paintCard() {
  const region = $('inspector-region'); if (!region) return;
  const mobile = isMobileLayout();
  const show = Boolean(cardOpen && selected) || mobile;
  region.hidden = !show;
  document.body?.classList?.toggle('card-open', Boolean(cardOpen && selected) && !mobile);
}
function setCardOpen(on) { cardOpen = Boolean(on); paintCard(); }

// ---------- Tutor (contextual, read-only) ----------
function relevantCommandButtons(card, kind = 'npc') {
  if (!card) return '';
  const names = [];
  if (kind === 'npc') {
    if (card.needs?.hunger <= 45) names.push('eat');
    if (card.needs?.thirst <= 45) names.push('drink');
    if (card.needs?.energy <= 45) names.push('rest');
    if (card.needs?.hunger <= 70 || card.needs?.thirst <= 70 || card.needs?.energy <= 70) names.push('policy');
    if (card.task?.status === 'EXECUTING') names.push('stop');
    else names.push('gather');
  } else if (kind === 'building') {
    names.push('repair', 'upgrade');
  } else {
    names.push('gather', 'moveTo');
  }
  const unique = [...new Set(names.filter((name) => Boolean(app?.entryForCommand?.(name))))];
  if (!unique.length) return '';
  const buttons = unique.slice(0, 4).map((name) => `<button type="button" class="cmd-chip ok" data-action="open-book" data-entry="command.${esc(name)}" title="Open ${esc(name)}() in the Codebook">📖 ${esc(name)}()</button>`).join('');
  return `<div class="context-help"><div class="helper-label">Relevant commands</div>${buttons}</div>`;
}

function updateTutor() {
  const content = $('tutor-content'); const empty = $('tutor-empty');
  if (!content) return;
  if (!selected) { if (empty) empty.style.display = 'block'; content.innerHTML = ''; return; }
  let msg = '';
  if (selected.kind === 'npc') {
    const c = freeSim.inspector(selected.id);
    const stopNote = c?.lastTask?.reason ? ` Stop reason: <span class="highlight">${esc(c.lastTask.reason)}</span>.` : '';
    const routeNote = c?.task?.targetId ? ` Route target: <span class="highlight">${esc(c.task.targetId)}</span>.` : '';
    if (c?.task?.status === 'EXECUTING') msg = `<p>${esc(c.name)} is <span class="highlight">${esc(c.task.type)}</span> and will keep going until it stops by itself (storage full, nothing left, or too tired).${routeNote}</p>`;
    else if (c) msg = `<p>${esc(c.name)} is idle.${stopNote}${routeNote ? ` ${routeNote}` : ''} Run a command; the world is already running.</p><div class="example">survivor.gather("wood", 20);</div>${c.conditions.length ? `<p>Conditions: ${c.conditions.map(esc).join(', ')}.</p>` : ''}`;
    msg += relevantCommandButtons(c, 'npc');
  } else if (selected.kind === 'building') {
    const b = freeSim.studentView().buildings.find((x) => x.id === selected.id);
    if (b) msg = `<p>${esc(b.name)} — Level ${b.level}, ${esc(b.condition)}. Condition changes only through simulation actions such as repair.</p>`;
    msg += relevantCommandButtons(b, 'building');
  } else {
    const node = freeSim.studentView().nodes.find((x) => x.id === selected.id);
    msg = `<p>Resource nodes shrink as survivors gather from them.</p>`;
    msg += relevantCommandButtons(node, 'node');
  }
  if (empty) empty.style.display = 'none';
  content.innerHTML = msg;
}

// ---------- Code panel ----------
function toggleCodePanel() {
  isCodePanelOpen = !isCodePanelOpen;
  $('code-panel')?.classList.toggle('open', isCodePanelOpen);
  if (isCodePanelOpen) $('code-editor')?.focus();
}

function renderCodeAPI() {
  const list = $('code-api-list');
  if (!list) return;
  const q = $('code-api-search')?.value?.trim() ?? '';
  list.innerHTML = renderCompactList(app.codebook, q ? app.searchCodebook(q) : null);
}

// ---------- Codebook (UI-1): a read-only view generated from the Game API ----------
let bookEntryId = null;
function renderBook() {
  const q = $('codebook-search')?.value?.trim() ?? '';
  const nav = $('codebook-nav'); const entry = $('codebook-entry');
  if (nav) nav.innerHTML = renderNav(app.codebook, { results: q ? app.searchCodebook(q) : null, activeId: bookEntryId });
  if (entry) entry.innerHTML = renderEntry(app.codebook, bookEntryId);
}
function setBookOpen(on) { const p = $('codebook-panel'); if (p) p.style.display = on ? 'flex' : 'none'; document.body?.classList?.toggle('book-open', on); }
function isBookOpen() { return $('codebook-panel')?.style?.display === 'flex'; }
function openBook(entryId) {
  if (entryId) bookEntryId = entryId; else if (!bookEntryId) bookEntryId = app.codebook.sections[0].groups[0].entryIds[0];
  setBookOpen(true); renderBook();
}
function insertExample(entryId) {
  const e = app.codebook.entries.find((x) => x.id === entryId); const ed = $('code-editor');
  if (!e?.example || !ed) return;
  ed.value = `${ed.value.trim() ? `${ed.value.replace(/\s+$/, '')}\n` : ''}${e.example}\n`;
  setBookOpen(false);
  if (!isCodePanelOpen) toggleCodePanel(); else ed.focus?.();
}

/** An action button puts its command into the editor and opens the code panel. It never runs anything itself. */
function insertSnippet(text) {
  const ed = $('code-editor'); if (!ed || !text) return;
  ed.value = `${ed.value.trim() ? `${ed.value.replace(/\s+$/, '')}\n` : ''}${text}\n`;
  if (!isCodePanelOpen) toggleCodePanel(); else ed.focus?.();
}
/** Which survivor a building button's command should address: the selected one if a survivor is selected, else the first. */
function selectedActor(view) { const alive = (id) => view?.survivors?.some((x) => x.id === id); return selected?.kind === 'npc' ? selected.id : alive(lastActorId) ? lastActorId : view?.survivors?.[0]?.id; }

function renderHints() {
  $('cmd-hints').innerHTML = app.apiDocs.commands.map((c) => `<div class="hint-chip"><span class="api-glyph">${esc(c.signature.split('  or')[0])}</span></div>`).join('');
}

function friendlyError(res) {
  const e = res.error;
  if (e.code === 'SAFETY_VIOLATION' && res.violations?.length) return res.violations.map((v) => v.message).join('\n');
  const hints = {
    SYNTAX_ERROR: 'Check brackets, quotes and semicolons.',
    EXECUTION_TIMEOUT: 'Your code never finished. Look for a loop that does not end.',
    RUNTIME_ERROR: 'Your code threw an error while running. Survivor data is read-only; use commands to act.',
    INVALID_ARGUMENT: 'A command received arguments it does not accept. Check the API list.',
  };
  return `${e.message}${hints[e.code] ? `\n${hints[e.code]}` : ''}`;
}

const chip = (s) => `<span class="cmd-chip ${s.ok ? 'ok' : 'fail'}"${!s.ok && app.entryForCommand(s.name) ? ` data-action="open-book" data-entry="command.${esc(s.name)}" title="Open ${esc(s.name)}() in the Codebook"` : ''}>${esc(s.name)}(${s.args.map((a) => JSON.stringify(a)).join(', ')})<small>${s.ok ? (s.mode === 'replace' ? 'now' : 'queued') : esc(s.error?.code ?? 'rejected')}</small></span>`;

async function runCode() {
  const editor = $('code-editor'); const result = $('code-execution-result'); const list = $('code-commands'); const btn = $('btn-run-code');
  if (!editor || !freeSim) return;
  btn.disabled = true; result.className = 'execution-result'; result.textContent = 'Running in sandbox…';
  try {
    const res = await app.runCode(freeSim, editor.value, { actorId: selected?.kind === 'npc' ? selected.id : null });
    if (!res.ok) {
      result.className = 'execution-result fail'; result.textContent = friendlyError(res);
      // INVALID_ARGUMENT messages start with the command name ("gather(): …"): link to that Codebook entry
      const name = res.error.code === 'INVALID_ARGUMENT' ? /^(\w+)\(\)/.exec(res.error.message ?? '')?.[1] : null;
      list.innerHTML = name && app.entryForCommand(name) ? `<span class="cmd-chip fail" data-action="open-book" data-entry="command.${esc(name)}" title="Open in the Codebook">📖 How ${esc(name)}() works</span>` : '';
      return;
    }
    const okCount = res.submitted.filter((s) => s.ok).length;
    const bad = res.submitted.filter((s) => !s.ok);
    result.className = `execution-result ${bad.length ? 'fail' : 'ok'}`;
    result.textContent = res.submitted.length === 0
      ? 'Code ran but issued no commands.'
      : `${okCount} command(s) sent${bad.length ? `, ${bad.length} rejected: ${bad.map((b) => b.error.message).join(' ')}` : ''}.${okCount && clock.paused ? ' Simulation resumed.' : ' Working now.'}`;
    list.innerHTML = res.submitted.map(chip).join('') + (res.logs.length ? `<pre>${esc(res.logs.join('\n'))}</pre>` : '');
    if (okCount && clock.paused) clock.play(); // running code means "let it happen"; PAUSE is always one click away
  } finally { btn.disabled = false; refreshUI(); }
}

// ---------- Lesson Player ----------

// The lesson drawer sits on the left; while it is open the code panel is pushed right (body class) so nothing is covered.
function setLessonPanel(open) {
  const el = $('lesson-player-panel');
  if (el) el.style.display = open ? 'block' : 'none';
  document.body?.classList?.toggle('lesson-open', open);
}

function lessonList() {
  if (!app || !app.defs || !app.defs.lessons) return [];
  return Object.values(app.defs.lessons);
}

// Completed = the app's progress record, which only ever grows. A later failed attempt never un-completes a lesson.
const lessonDone = (id) => Boolean(app?.progress?.completed?.[id]);

function renderLessonList() {
  const container = $('lesson-list');
  if (!container) return;
  const lessons = lessonList();
  container.innerHTML = lessons.map((l) => {
    const prog = lessonDone(l.id) ? 'passed' : lessonAttempt && lessonAttempt.lessonId === l.id ? 'attempted' : '';
    const cls = `lesson-item ${prog}${currentLessonId === l.id ? ' active' : ''}`;
    return `<button type="button" class="${cls}" data-action="start-lesson" data-lesson="${esc(l.id)}" aria-label="Start lesson ${l.title}">
      <div class="lesson-title">${esc(l.title)}</div>
      <div class="lesson-brief">${esc(l.brief)}</div>
      <div class="lesson-progress">${prog === 'passed' ? '✓ Completed' : prog === 'attempted' ? 'Attempted, not passed yet' : 'Not started'}</div>
    </button>`;
  }).join('');
}

function lessonCommandLinks(starter = '') {
  const names = [...new Set([...starter.matchAll(/survivor\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]))];
  const unique = names.filter((name) => Boolean(app?.entryForCommand?.(name)));
  if (!unique.length) return '';
  const buttons = unique.slice(0, 4).map((name) => `<button type="button" class="cmd-chip ok" data-action="open-book" data-entry="command.${esc(name)}" title="Open ${esc(name)}() in the Codebook">📖 ${esc(name)}()</button>`).join('');
  return `<div class="context-help"><div class="helper-label">Lesson commands</div>${buttons}</div>`;
}

function renderLessonInstructions() {
  const content = $('lesson-instructions');
  const brief = $('lesson-brief');
  if (!currentLessonId || !content) return;
  const l = lessonList().find((x) => x.id === currentLessonId);
  if (!l) return;
  content.innerHTML = `
    <div class=\"lesson-header\">
      <div class=\"lesson-title\">${esc(l.title)}</div>
      <div class=\"lesson-id\">Seed ${l.seed} · Max ${l.maxTicks} ticks</div>
    </div>
    <div class=\"lesson-brief\">${esc(l.brief)}</div>
    <div class=\"lesson-goals\">
      <h4>Goals:</h4>
      <ul>${l.goals.map((g) => `<li><span class=\"goal-status\" id=\"goal-${g.id}\">○</span> ${esc(g.message)}</li>`).join('')}</ul>
    </div>
    <div class=\"lesson-starter\">Starter code:<br><pre>${esc(l.starter)}</pre></div>    ${lessonCommandLinks(l.starter)}  `;
  if (brief) brief.textContent = l.brief;
}

function renderLessonResult() {
  const result = $('lesson-result');
  if (!result || !lessonAttempt) return;
  const l = lessonList().find((x) => x.id === lessonAttempt.lessonId);
  const passed = lessonAttempt.passed;
  const doneBefore = !passed && lessonDone(lessonAttempt.lessonId);
  result.style.display = 'block';
  result.className = `lesson-result ${passed ? 'passed' : doneBefore ? 'retry' : 'failed'}`;
  queueMicrotask(() => result.scrollIntoView?.({ block: 'nearest' })); // the drawer scrolls; keep the verdict in view
  result.innerHTML = `
    <div class="lesson-result-header">${passed ? '✓ Lesson Passed' : doneBefore ? '✗ This attempt did not pass' : '✗ Lesson Not Yet Passed'}</div>
    ${doneBefore ? '<div class="lesson-feedback">You already completed this lesson, so your progress is safe. This was only a retry.</div>' : ''}
    <div class="lesson-result-details">
      ${lessonAttempt.results?.map((r) => `<div class="goal-row"><span class="goal-tag ${r.passed ? 'ok' : 'fail'}">${r.passed ? '✓' : '✗'}</span><span class="goal-msg">${esc(r.message)}</span>${r.detail ? `<span class="goal-detail">(${esc(r.detail)})</span>` : ''}</div>`).join('')}
      ${lessonAttempt.feedback?.length ? `<div class="lesson-feedback">${lessonAttempt.feedback.join('<br>')}</div>` : ''}
    </div>
    <div class="lesson-result-actions">
      <button type="button" class="btn-small" data-action="restart-lesson">Restart Lesson</button>
      <button type="button" class="btn-small" data-action="exit-lesson">Exit Lesson Mode</button>
    </div>
  `;
}

function renderProgressScreen() {
  const container = $('progress-screen');
  if (!container) return;
  const done = app.progress.completed; // the app's record: only ever grows, survives switching lessons
  const completed = lessonList().filter((l) => done[l.id]).length;
  container.innerHTML = `
    <h3>📊 Progress</h3>
    <div class="progress-summary">
      Lessons completed: ${completed} / ${lessonList().length}
    </div>
    <div class="progress-list">
      ${lessonList().map((l) => {
        const a = lessonAttempt && lessonAttempt.lessonId === l.id ? lessonAttempt : null;
        const status = done[l.id] ? 'passed' : a ? 'failed' : 'not-started';
        return `<div class="progress-item ${status}"><span>${esc(l.title)}</span><span class="status-badge">${status}</span></div>`;
      }).join('')}
    </div>
  `;
}

async function startLesson(lessonId) {
  if (!app || !freeSim) return;
  currentLessonId = lessonId;
  isLessonMode = true;
  stepInspectorActive = false;
  stepStep = 0;
  lessonAttempt = null;
  setLessonPanel(true);
  const codePanel = $('code-panel');
  if (codePanel) codePanel.classList.add('open');
  isCodePanelOpen = true;
  const editor = $('code-editor');
  const l = lessonList().find((x) => x.id === lessonId);
  if (editor && l) editor.value = l.starter;
  paintRunButton();
  setRunStatus('', 'Lesson mode: Run tests your code on the lesson world. Your base is not touched.');
  renderLessonList();
  renderLessonInstructions();
  renderUI();
}

function restartLesson() {
  if (currentLessonId) startLesson(currentLessonId);
}

function exitLesson() {
  isLessonMode = false;
  currentLessonId = null;
  lessonAttempt = null;
  stepInspectorActive = false;
  stepStep = 0;
  setLessonPanel(false);
  paintRunButton();
  setRunStatus('', 'Ready. Commands start working as soon as you run them; use PLAY if the simulation is paused.');
  const result = $('lesson-result');
  if (result) result.style.display = 'none';
  renderLessonList();
  renderUI();
}

// In lesson mode Run tests the code on the lesson's own hidden world (fixed seed, so the verdict is repeatable); the
// learner's base is never touched. The code panel says so, because nothing moves on the map during a lesson test.
function setRunStatus(cls, text) {
  const r = $('code-execution-result'); if (!r) return;
  r.className = `execution-result ${cls}`.trim(); r.textContent = text; r.title = text;
}
function goalChips(results = []) {
  return results.map((g) => `<span class="cmd-chip ${g.passed ? 'ok' : 'fail'}">${g.passed ? '✓' : '✗'} ${esc(g.message)}${g.detail ? `<small>${esc(g.detail)}</small>` : ''}</span>`).join('');
}

async function runLessonAttempt(code) {
  if (!app || !currentLessonId) return;
  const l = lessonList().find((x) => x.id === currentLessonId);
  if (!l) return;
  const btn = $('btn-run-code'); const list = $('code-commands');
  if (btn) btn.disabled = true;
  setRunStatus('', 'Testing your code on the lesson world… (your base is not touched)');
  try {
    const res = await app.runLesson(l.id, code);
    lessonAttempt = {
      lessonId: l.id,
      passed: res.evaluation.passed,
      results: res.evaluation.results,
      feedback: res.evaluation.feedback,
      attempt: res.attempt,
    };
    const met = res.evaluation.results.filter((r) => r.passed).length; const total = res.evaluation.results.length;
    setRunStatus(res.evaluation.passed ? 'ok' : 'fail', res.evaluation.passed
      ? `✓ Lesson passed (${met}/${total} goals). This ran on the lesson's test world, so your base is unchanged.`
      : `✗ ${met}/${total} goals met. Details and hints are in the Lesson panel. Your base is unchanged.`);
    if (list) list.innerHTML = goalChips(res.evaluation.results);
    renderLessonResult();
    renderLessonList();
    renderUI();
  } catch (e) {
    setRunStatus('fail', `Lesson failed to run: ${e.message}`);
    const result = $('lesson-result');
    if (result) {
      result.style.display = 'block';
      result.className = 'lesson-result failed';
      result.textContent = `Lesson failed to run: ${e.message}`;
    }
  } finally { if (btn) btn.disabled = false; }
}

function paintRunButton() { const b = $('btn-run-code'); if (b) b.textContent = isLessonMode ? 'Run Lesson Test' : 'Run Code'; }

async function handleRunCode() {
  if (isLessonMode && currentLessonId) {
    const editor = $('code-editor');
    if (!editor) return;
    await runLessonAttempt(editor.value);
    return;
  }
  return runCode();
}
// The weather calendar: the whole current season, today highlighted. The forecast is public on purpose - plan with it.
const WEATHER_ICON = { clear: '☀', rain: '🌧', storm: '⛈', heatwave: '🔥', cold: '❄' };
let calKey = '';
function renderCalendar(w) {
  const panel = $('calendar-panel');
  if (!panel) return;
  const key = `${w.calendar.season}:${w.time.day}`;
  if (key === calKey) return;
  calKey = key;
  panel.innerHTML = `<div class="cal-title">${esc(w.calendar.name)} · year ${w.time.year}</div><div class="cal-grid">${w.calendar.days.map((d) =>
    `<div class="cal-day${d.today ? ' today' : ''}" title="${esc(cap(d.weather))}"><span class="cal-n">${d.seasonDay}</span><span class="cal-w">${WEATHER_ICON[d.weather] ?? '?'}</span></div>`).join('')}</div>`;
}

const nameOf = (id) => freeSim.studentView().survivors.find((x) => x.id === id)?.name ?? id;
const SHOWN_EVENTS = {
  'task.started': (e) => `${nameOf(e.actorId)} started ${e.taskType} ${e.resource}`,
  'resource.gathered': (e) => `+${e.amount} ${e.resource}`,
  'task.stopped': (e) => `${nameOf(e.actorId)} stopped ${e.taskType}: ${e.reason} (${e.crafted !== undefined ? `${e.crafted} batch(es) cooked` : `${e.gathered} gathered in ${e.trips} trip(s)`})`,
  'item.crafted': (e) => `${nameOf(e.actorId)} cooked ${Object.entries(e.outputs).map(([k, v]) => `${v} ${k}`).join(', ')}`,
  'action.failed': (e) => `${nameOf(e.actorId)}: ${e.actionType} failed: ${e.reason}`,
  'action.cancelled': (e) => `${nameOf(e.actorId)}: ${e.actionType} cancelled (${e.reason})`,
  'command.rejected': (e) => `${e.name}() rejected: ${e.code}`,
  'policy.set': (e) => `${nameOf(e.actorId)}: ${e.policy} policy set (below ${e.below}${e.until ? `, until ${e.until}` : ''})`,
  'policy.cleared': (e) => `${nameOf(e.actorId)}: ${e.policy} policy cleared`,
  'policy.triggered': (e) => `${nameOf(e.actorId)}: ${e.policy} policy fired (${e.need} ${e.value})`,
  'policy.blocked': (e) => `${nameOf(e.actorId)}: ${e.policy} policy blocked: ${e.reason}`,
  'hook.set': (e) => `${nameOf(e.actorId)}: hook on "${e.event}" set`,
  'hook.cleared': (e) => `${nameOf(e.actorId)}: hook on "${e.event}" removed`,
  'hook.ran': (e) => `${nameOf(e.actorId)}: "${e.event}" hook ran (${e.commands} command(s))`,
  'hook.failed': (e) => `${nameOf(e.actorId)}: "${e.event}" hook switched off: ${e.code}`,
  'task.resumed': (e) => `${nameOf(e.actorId)} resumed ${e.taskType}`,
  'node.depleted': (e) => `${e.nodeId} is empty`,
  'siphon.status': (e) => `${e.buildingId} siphon: ${e.to}`,
  'power.status': (e) => `${e.buildingId} power: ${e.to}`,
  'building.upgraded': (e) => `${e.buildingId} upgraded to level ${e.to}`,
  'building.condition_changed': (e) => `${e.buildingId}: ${e.from} → ${e.to}`,
  'food.spoiled': (e) => `${e.qty} ${e.item} spoiled`,
  'survivor.consumed': (e) => `consumed ${e.item}`,
  'survivor.downed': () => 'survivor downed',
};

function collectEvents() {
  const fresh = freeSim.log.since(eventCursor);
  for (const e of fresh) if (SHOWN_EVENTS[e.type]) feed.push(`t${e.tick} ${SHOWN_EVENTS[e.type](e)}`);
  eventCursor += fresh.length;
  if (feed.length > 14) feed = feed.slice(-14);
}

function renderFeed() {
  $('event-feed').innerHTML = feed.length
    ? feed.map((l) => `<span class="cmd-chip">${esc(l)}</span>`).join('')
    : '<span class="hint">The world keeps running. Open CODE, run a command, and watch your survivors work. Events appear here.</span>';
}

function flash(msg) { // short status line in the event feed (presentation only)
  feed.push(msg); if (feed.length > 14) feed = feed.slice(-14); renderFeed();
}
async function saveSession() {
  if (!freeSim) return;
  try { const r = await app.saveFreePlay(freeSim); flash(`Saved: tick ${r.tick}, ${r.commands} command(s)`); } catch (e) { flash(`Save failed: ${e.message}`); }
}
async function loadSession() {
  try {
    const r = await app.loadFreePlay();
    if (!r) { flash('No saved session yet'); return; }
    freeSim = r.sim; clock = app.createClock(freeSim); hooks = app.createHooks(freeSim);
    feed = []; eventCursor = 0; projKey = '';
    const first = freeSim.studentView().survivors[0];
    selected = first ? { kind: 'npc', id: first.id } : null;
    if (selected) renderer.select('npc', first.id); else renderer.clearSelection();
    cardOpen = false; paintCard();
    refreshUI(); flash(`Loaded: tick ${r.savedTick}`);
  } catch (e) { flash(`Load failed: ${e.message}`); }
}

function togglePlay() { clock.toggle(); refreshUI(); }
function cycleSpeed() { clock.cycleSpeed(); refreshUI(); }

// ---- Map screens. MAP 1 TOWN and MAP 3 FRONT are static maps that slide over the live OUTPOST canvas; the edge arrows and the arrow keys move between them.
// Nothing here touches the simulation: it keeps running underneath, and every button on a map only inserts code into the editor. ----
let screenId = 'outpost'; const picked = { town: null, front: null }; const sceneSig = {}; let pressing = false;
const TITLES = { hall: 'Recruit hall', station: 'Train station', housing: 'Housing', raid: 'Raid road' };
function detailFor(kind, view) {
  const spot = picked[kind]; if (!spot) return null;
  if (spot === 'hall') return { title: TITLES.hall, html: recruitHtml(view) };
  if (spot === 'station') return { title: TITLES.station, html: trainHtml(view) };
  if (spot === 'housing') return { title: TITLES.housing, html: housingHtml(view) };
  if (spot === 'raid') return { title: TITLES.raid, html: raidHtml(view) };
  const site = (view.scavenge?.sites ?? []).find((s) => s.id === spot);
  return site ? { title: site.name, html: `${scavengeHeadHtml(view)}${scavengeRowsHtml(view, site.id)}${scavengeLostHtml(view)}` } : null;
}
function paintScreens(force = false) {
  if (!freeSim) return;
  const view = freeSim.studentView();
  const here = screenOf(screenId); const arrows = arrowState(screenId); const alert = alertLevel(view);
  const region = $('world-region'); if (region?.dataset) region.dataset.screen = screenId;
  const badge = $('screen-badge'); if (badge?.dataset) { badge.dataset.screen = screenId; badge.dataset.alert = alert; }
  if ($('sb-no')) $('sb-no').textContent = `MAP ${here.no}`;
  if ($('sb-name')) $('sb-name').textContent = here.label;
  Array.from($('sb-dots')?.children ?? []).forEach((d, i) => d.classList?.toggle('on', i === here.no - 1));
  for (const dir of ['west', 'east']) {
    const b = $(`screen-${dir}`); if (!b) continue; const a = arrows[dir];
    b.disabled = a.disabled; if (b.dataset) b.dataset.screenTo = a.to;
    b.setAttribute?.('aria-label', a.disabled ? 'No more maps this way' : `Go to the ${a.label.toLowerCase()} map`);
    // the red pulse warns about the FRONT: only an arrow that leads there (or sits on the way) carries the alert
    if (b.dataset) b.dataset.alert = dir === 'east' && !a.disabled && a.to === 'front' ? alert : 'none';
    if ($(`screen-${dir}-label`)) $(`screen-${dir}-label`).textContent = a.disabled ? '' : (dir === 'east' && alert === 'raid' ? 'RAID!' : a.label);
  }
  for (const [kind, build] of [['town', townSceneSvg], ['front', frontSceneSvg]]) {
    const pane = $(`screen-${kind}`); if (!pane) continue;
    pane.setAttribute?.('aria-hidden', String(screenId !== kind));
    if (screenId !== kind && !force && sceneSig[kind]) continue; // a map that is off screen is redrawn when it slides in
    if (pressing) continue; // never swap the DOM under a click in progress
    const svg = build(view, { active: picked[kind] });
    const d = detailFor(kind, view); const dsig = d ? `${d.title}|${d.html}` : '';
    const sig = `${svg}#${dsig}`;
    if (!force && sig === sceneSig[kind]) continue;
    sceneSig[kind] = sig;
    const wrap = $(`scene-${kind}`); if (wrap) wrap.innerHTML = svg;
    const det = $(`detail-${kind}`);
    if (det) { det.hidden = !d; if (d) { $(`detail-${kind}-title`).textContent = d.title; $(`detail-${kind}-body`).innerHTML = d.html; } }
    pane.classList.toggle('has-detail', Boolean(d));
  }
}
function setScreen(id) {
  if (!SCREENS.some((s) => s.id === id) || id === screenId) return;
  screenId = id; paintScreens(true);
  const pane = $(`screen-${id}`); if (pane) pane.querySelector?.('[data-spot]')?.focus?.({ preventScroll: true });
}
function stepScreen(dir) { const a = arrowState(screenId)[dir === -1 ? 'west' : 'east']; if (!a.disabled) setScreen(a.to); }
function pickSpot(kind, id) { picked[kind] = picked[kind] === id ? null : id; paintScreens(true); }
function bindScreens() {
  $('screen-west')?.addEventListener('click', () => stepScreen(-1));
  $('screen-east')?.addEventListener('click', () => stepScreen(1));
  for (const kind of ['town', 'front']) {
    const pane = $(`screen-${kind}`); if (!pane) continue;
    pane.addEventListener('pointerdown', () => { pressing = true; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) pane.addEventListener(ev, () => { pressing = false; });
    pane.addEventListener('click', (e) => {
      const close = e.target?.closest?.('[data-detail-close]'); if (close) { picked[kind] = null; paintScreens(true); return; }
      const spot = e.target?.closest?.('[data-spot]'); if (spot) pickSpot(kind, spot.dataset.spot);
    });
    pane.addEventListener('keydown', (e) => { const spot = e.target?.closest?.('[data-spot]'); if (spot && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault?.(); e.stopPropagation?.(); pickSpot(kind, spot.dataset.spot); } });
  }
}

function bindEvents() {
  bindScreens();
  bindMapGestures($('map-canvas'), { camera: renderer, pick: (x, y) => renderer.pickTag(x, y) ?? renderer.pick(x, y, currentProjection()), onHit: (hit) => (hit.kind === 'node-gather' ? gatherFromTag(hit.resource) : selectEntity(hit.kind, hit.id)), onEmpty: () => { setCardOpen(false); clearNodePick(); } });
  // hover tag: name + state of whatever is under the pointer (presentation only; it never selects anything)
  const mapEl = $('map-canvas');
  mapEl?.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || e.buttons) return;
    const r = mapEl.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top;
    if (renderer.pickTag(x, y)) { mapEl.style.cursor = 'pointer'; return; }
    const hit = renderer.pick(x, y, currentProjection());
    if (hit && hit.kind !== 'node-gather') renderer.setHover(hit.kind, hit.id); else renderer.clearHover();
    mapEl.style.cursor = hit ? 'pointer' : '';
  });
  mapEl?.addEventListener('pointerleave', () => { renderer.clearHover(); mapEl.style.cursor = ''; });
  $('inspector-toggle')?.addEventListener('click', () => setCardOpen(false));
  const zoomBy = (f) => { const r = $('map-canvas').getBoundingClientRect(); renderer.zoomAt(f, r.width / 2, r.height / 2); };
  $('btn-zoom-in')?.addEventListener('click', () => zoomBy(1.25));
  $('btn-zoom-out')?.addEventListener('click', () => zoomBy(1 / 1.25));
  $('btn-recenter')?.addEventListener('click', () => renderer.resetCamera());
  $('btn-code')?.addEventListener('click', toggleCodePanel);
  $('btn-book')?.addEventListener('click', () => (isBookOpen() ? setBookOpen(false) : openBook(null)));
  $('codebook-close')?.addEventListener('click', () => setBookOpen(false));
  $('codebook-search')?.addEventListener('input', renderBook);
  $('code-api-search')?.addEventListener('input', renderCodeAPI);
  $('code-close')?.addEventListener('click', toggleCodePanel);
  window.addEventListener('resize', refreshMobileLayout);
  $('btn-run-code')?.addEventListener('click', handleRunCode);
  $('btn-play')?.addEventListener('click', togglePlay);
  $('btn-speed')?.addEventListener('click', cycleSpeed);
  $('btn-restart')?.addEventListener('click', startScenario);
  $('btn-lessons')?.addEventListener('click', toggleLessonMode);
  $('btn-calendar')?.addEventListener('click', () => { const p = $('calendar-panel'); if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none'; });
  $('code-editor')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleRunCode(); } });
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT'; // shortcuts must never eat what the learner types
    if (e.key === 'Escape' && isBookOpen()) setBookOpen(false);
    else if (e.key === 'Escape' && isCodePanelOpen) toggleCodePanel();
    else if (e.key === 'Escape' && !typing && screenId !== 'outpost' && picked[screenId]) { picked[screenId] = null; paintScreens(true); }
    else if (e.key === 'Escape' && !typing && screenId !== 'outpost') setScreen('outpost');
    else if (e.key === 'Escape' && !typing && clearNodePick()) { /* the tree / rock glow is gone */ }
    else if (e.key === 'Escape' && cardOpen && !typing) setCardOpen(false);
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !typing && !e.altKey && !e.ctrlKey && !e.metaKey && !isCodePanelOpen && !isBookOpen()) { e.preventDefault?.(); stepScreen(e.key === 'ArrowLeft' ? -1 : 1); }
    if ((e.key === 'b' || e.key === 'B') && e.altKey) (isBookOpen() ? setBookOpen(false) : openBook(null)); // Alt+B: Codebook
    if (e.key === ' ' && !isCodePanelOpen && !typing && tag !== 'BUTTON') { e.preventDefault?.(); togglePlay(); } // Space: play / pause
    if ((e.key === 'd' || e.key === 'D') && e.altKey) renderer.setDebug(!renderer.debug); // Alt+D: optional debug overlay
    if ((e.key === 'l' || e.key === 'L') && e.altKey) toggleLessonMode(); // Alt+L: lesson mode toggle
  });
  // Delegated clicks for lesson buttons built as HTML strings (inline onclick is blocked by the CSP).
  document.addEventListener('click', (e) => {
    const el = e.target?.closest?.('[data-action]');
    if (!el) return;
    const action = el.dataset?.action;
    if (action === 'start-lesson') startLesson(el.dataset.lesson);
    else if (action === 'restart-lesson') restartLesson();
    else if (action === 'exit-lesson') exitLesson();
    else if (action === 'open-book') openBook(el.dataset.entry || null);
    else if (action === 'insert-example') insertExample(el.dataset.entry);
    else if (action === 'insert') insertSnippet(el.dataset.snippet);
    else if (action === 'lesson-list') { renderLessonList(); }
    else if (action === 'lesson-progress') renderProgressScreen();
    else if (action === 'mobile-tab') activateMobileTab(el.dataset.mobileTab || 'world');
  });
  $('btn-save')?.addEventListener('click', saveSession);
  $('btn-load')?.addEventListener('click', loadSession);
}

function isMobileLayout() {
  const w = typeof window !== 'undefined' ? window : {};
  if (typeof w.matchMedia === 'function') return w.matchMedia('(max-width: 600px)').matches;
  return Number(w.innerWidth || 1200) <= 600;
}

function refreshMobileLayout() {
  const mobile = isMobileLayout();
  document.body?.classList?.toggle('mobile-layout', mobile);
  paintCard();
  const tabs = ['world', 'code', 'book', 'inspect', 'lessons'];
  tabs.forEach((tab) => {
    const el = $('mobile-tab-' + tab);
    if (el) el.classList.toggle('active', activeMobileTab === tab);
  });
  const tabDisplay = mobile ? 'flex' : 'none';
  const mobileTabs = $('mobile-tabs'); if (mobileTabs) mobileTabs.style.display = tabDisplay;

  const panelMap = {
    world: ['world-region'],
    code: ['command-region', 'code-panel'],
    book: ['codebook-panel'],
    inspect: ['inspector-region'],
    lessons: ['lesson-player-panel'],
  };
  const allPanels = ['world-region', 'inspector-region', 'command-region', 'tutor-region', 'code-panel', 'codebook-panel', 'lesson-player-panel'];
  allPanels.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.dataset.mobileVisible = 'false';
    if (!mobile) {
      el.style.display = '';
      el.classList?.remove('open');
    }
  });
  if (!mobile) {
    if ($('codebook-panel')) $('codebook-panel').style.display = 'none';
    if ($('lesson-player-panel')) $('lesson-player-panel').style.display = 'none';
    return;
  }
  const selection = panelMap[activeMobileTab] || panelMap.world;
  selection.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.dataset.mobileVisible = 'true';
    if (id === 'code-panel') {
      el.classList.add('open');
      isCodePanelOpen = true;
      el.style.display = 'flex';
    } else if (id === 'codebook-panel') {
      setBookOpen(true);
    } else if (id === 'lesson-player-panel') {
      setLessonPanel(true);
    } else {
      el.style.display = 'block';
    }
  });
  if (activeMobileTab !== 'code') {
    const panel = $('code-panel'); if (panel) { panel.classList.remove('open'); panel.style.display = 'none'; isCodePanelOpen = false; }
  }
  if (activeMobileTab !== 'book') setBookOpen(false);
  if (activeMobileTab !== 'lessons') setLessonPanel(false);
}

function activateMobileTab(tab) {
  activeMobileTab = tab;
  refreshMobileLayout();
}

function toggleLessonMode() {
  if (isLessonMode) exitLesson();
  else {
    const lessons = lessonList();
    if (lessons.length) startLesson(lessons[0].id);
  }
}

init();
