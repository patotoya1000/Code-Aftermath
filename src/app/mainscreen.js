// CODE: AFTERMATH — Main Game Screen Controller
// Every value shown is a read-only projection of the simulation. The UI never mutates GameState,
// never parses commands itself, and never invents gameplay numbers.
//   editor → app.runCode() → Safety Validator → Worker → Game API → live simulation (strategy points)
//   animation frame → clock driver → sim.step(n) → projections → renderer / inspector / event feed
// Time is continuous: survivors keep working until their command stops by itself. PLAY / PAUSE / speed only
// decide how fast wall-clock time becomes simulation ticks; they never change a gameplay rule.

import { mountRenderer } from '../modules/render/index.js';
import { placeholderManifestFor } from '../modules/assets/index.js';
import { createIndexedDbAdapter } from '../modules/persistence/index.js';
import { createApp } from './index.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

let app; let renderer; let freeSim; let clock;
let selected = null; // { kind: 'npc' | 'building' | 'node', id }
let isInspectorOpen = true;
let isCodePanelOpen = false;
let isLessonMode = false;
let currentLessonId = null;
let lessonAttempt = null;
let stepInspectorActive = false;
let stepStep = 0;
let feed = []; // recent event lines (newest last)
let eventCursor = 0;
let lastFrame = 0; let lastPanelRefresh = 0;

// Presentation-only icon hints for action types (no gameplay meaning).
const TASK_ICON = { gather: '🌲', move: '🚶', rest: '💤', eat: '🍎', drink: '💧', repair: '🔧' };

async function init() {
  let adapter;
  try { adapter = createIndexedDbAdapter(); } catch { adapter = undefined; }
  app = createApp(adapter ? { adapter } : {});
  renderer = mountRenderer($('map-canvas'), { manifest: placeholderManifestFor(app.defs), debug: new URLSearchParams(location.search).has('debug'), smoothing: true });
  await startScenario();
  renderHints();
  renderCodeAPI();
  bindEvents();
  requestAnimationFrame(loop);
}

async function startScenario() {
  const { sim } = await app.createFreeSim({ scenarioId: 'stage1', seed: 1 });
  freeSim = sim;
  clock = app.createClock(sim);
  feed = []; eventCursor = 0;
  const first = freeSim.studentView().survivors[0];
  selected = first ? { kind: 'npc', id: first.id } : null;
  if (selected) renderer.select('npc', first.id); else renderer.clearSelection();
  refreshUI();
}

// Every frame: advance the simulation by however many ticks the clock says, then draw. Panels refresh a few times a
// second (and on every user action) instead of every frame.
function loop(now) {
  if (freeSim) {
    const dt = lastFrame ? now - lastFrame : 0; lastFrame = now;
    const ran = clock.update(dt);
    renderer.draw(freeSim.renderProjection());
    if (ran > 0 && now - lastPanelRefresh >= 250) { lastPanelRefresh = now; refreshUI(); }
  }
  requestAnimationFrame(loop);
}

function refreshUI() {
  if (!freeSim) return;
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
  const proj = freeSim.renderProjection();
  const view = freeSim.studentView();
  const info = freeSim.getClockInfo();

  let html = Object.entries(proj.stock).map(([key, val]) => `
    <div class="resource" title="${esc(cap(key))}"><div class="icon ${esc(key)}">${esc(key.slice(0, 2).toUpperCase())}</div><b>${val}</b></div>`).join('');
  html += `<div class="resource" title="Survivors"><div class="icon survivor">SV</div><b>${view.survivors.length}</b></div>`;
  if (view.hq) {
    const pct = Math.round((view.hq.health / view.hq.maxHealth) * 100);
    const cls = pct >= 80 ? 'pos' : pct >= 50 ? 'warn' : 'neg';
    html += `<div class="resource" title="Headquarters condition"><div class="icon base">BS</div><b><span class="delta ${cls}">${pct}%</span></b></div>`;
  }
  $('resources').innerHTML = html;

  $('clock-label').textContent = `${clock.paused ? 'PAUSED' : 'RUNNING'} · ${clock.speed}×`;
  $('clock-detail').textContent = `STRATEGY ${info.strategyPoints}/${info.maxStrategyPoints} · TICK ${info.tick}`;
  $('btn-play').textContent = clock.paused ? '▶ PLAY' : '⏸ PAUSE';
  $('btn-speed').textContent = `${clock.speed}×`;
}

// ---------- Inspector / Survivor Card (projection-driven) ----------
function bar(label, val, max = 100, cls = '') {
  const pct = Math.max(0, Math.min(100, (val / max) * 100));
  return `<div class="need-row"><div class="label">${esc(cap(label))}</div><div class="bar-flex"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div><div class="value">${Math.round(val)}</div></div>`;
}
const section = (icon, title, body) => `<div class="section"><h3><span class="icon">${icon}</span>${esc(title)}</h3>${body}</div>`;
const muted = (t) => `<span style="color:var(--muted);font-size:11px;">${esc(t)}</span>`;

function survivorSections(card) {
  const needs = Object.entries(card.needs).map(([k, v]) => bar(k, v, 100, v <= 20 ? 'bad' : v <= 40 ? 'warn' : 'good')).join('');
  const attrs = Object.entries(card.attributes).map(([k, v]) => `<div class="attr-cell"><span class="attr-name">${esc(cap(k))}</span><span class="attr-val">${v}</span></div>`).join('');
  const skills = Object.entries(card.skills);
  const equip = Object.entries(card.equipment);
  const inv = card.inventoryDetail.map((i) => `<div class="inv-item"><span class="name">${esc(i.name)} × ${i.quantity}</span><span class="qty">${i.weight} wt</span></div>`).join('');
  return [
    section('❤', 'Needs', `<div class="needs-grid">${needs}</div>`),
    card.conditions.length ? section('⚠', 'Conditions', card.conditions.map((c) => `<span class="status-pill" style="margin-right:6px;">${esc(c)}</span>`).join('')) : '',
    section('⚡', 'Attributes', `<div class="attrs-grid">${attrs}</div>`),
    section('🎓', 'Skills', skills.length ? `<div class="attrs-grid">${skills.map(([k, v]) => `<div class="attr-cell"><span class="attr-name">${esc(cap(k))}</span><span class="attr-val">${v}</span></div>`).join('')}</div>` : muted('No skills tracked yet (Phase I4).')),
    card.traits.length ? section('🏷', 'Traits', card.traits.map((t) => `<span class="status-pill">${esc(t)}</span>`).join(' ')) : '',
    section('🎒', 'Equipment', equip.length ? `<div class="equip-grid">${equip.map(([slot, item]) => `<div class="equip-slot"><span class="slot-label">${esc(slot.toUpperCase())}</span><span class="slot-val">${esc(item)}</span></div>`).join('')}</div>` : muted('Nothing equipped.')),
    section('📦', 'Inventory', `<div class="inv-list">${inv || muted('Empty')}</div><div style="margin-top:6px;">${muted('Carry capacity and encumbrance are not active yet (Phase I5).')}</div>`),
    taskSection(card.task, card.queued, card.lastTask),
  ].join('');
}

function taskSection(task, queued = 0, lastTask = null) {
  if (!task) {
    const last = lastTask
      ? `Last: ${esc(lastTask.type)} ${esc(lastTask.status.toLowerCase())}${lastTask.reason ? ` — ${esc(lastTask.reason)}` : ''}${lastTask.gathered ? ` (${lastTask.gathered} gathered)` : ''}`
      : 'Waiting for command';
    return section('📋', 'Current Task', `<div class="current-task"><div class="task-icon">—</div><div class="task-info"><div class="task-title">No active task</div><div class="task-target">Idle</div><div class="task-progress"><div class="task-progress-fill" style="width:0%"></div></div><div class="task-meta">${last}</div></div></div>`);
  }
  const pct = Math.round((task.fraction ?? 0) * 100);
  const stats = task.stats ? ` · gathered ${task.stats.gathered} in ${task.stats.trips} trip(s)` : '';
  return section('📋', 'Current Task', `<div class="current-task"><div class="task-icon">${TASK_ICON[task.type] ?? '⏳'}</div><div class="task-info"><div class="task-title">${esc(task.type)}</div><div class="task-target">Target: ${esc(task.targetId ?? 'base')}</div><div class="task-progress"><div class="task-progress-fill" style="width:${pct}%"></div></div><div class="task-meta">${esc(task.status)} · ${pct}%${esc(stats)} · queued: ${queued}</div></div></div>`);
}

function buildingSections(b) {
  const pct = Math.round((b.health / b.maxHealth) * 100);
  const storage = b.storageInfo
    ? Object.entries(b.storageInfo.capacity).map(([k, c]) => bar(k, b.storageInfo.current[k] ?? 0, c, 'good').replace(/<div class="value">\d+<\/div>/, `<div class="value">${b.storageInfo.current[k] ?? 0}/${c}</div>`)).join('')
    : '';
  return [
    section('🏗', 'Building', `<div class="needs-grid">${bar('health', b.health, b.maxHealth, pct < 25 ? 'bad' : pct < 60 ? 'warn' : 'good')}</div><div style="margin-top:6px;font-size:11px;">Condition: <b>${esc(b.condition)}</b> · Level ${b.level}</div>`),
    storage ? section('📦', 'Storage', `<div class="needs-grid">${storage}</div>`) : '',
    section('🔧', 'Actions', muted(`Use survivor.repair(${b.id}) from the code panel.`)),
  ].join('');
}

function renderInspector() {
  if (!selected || !freeSim) { $('inspector-card').innerHTML = `<div class="header"><div class="portrait">?</div><div class="info"><div class="name">—</div><div class="sub">Select a survivor, building or resource</div></div></div>`; return; }
  const view = freeSim.studentView();
  let header; let body = '';
  if (selected.kind === 'npc') {
    const card = freeSim.inspector(selected.id);
    if (!card) { selected = null; return renderInspector(); }
    header = { glyph: '👤', name: card.identity.name, sub: `${card.status} · ${card.identity.background}`, meta: `<span>ID: ${esc(card.id)}</span><span>Age: ${card.identity.age}</span><span>Pos: ${card.x},${card.y}</span><span>Dir: ${card.direction}</span>` };
    body = survivorSections(card);
  } else if (selected.kind === 'building') {
    const b = view.buildings.find((x) => x.id === selected.id);
    if (!b) { selected = null; return renderInspector(); }
    header = { glyph: '🏗', name: b.name, sub: `${b.condition} · Lvl ${b.level}`, meta: `<span>ID: ${esc(b.id)}</span><span>Type: ${esc(b.type)}</span>` };
    body = buildingSections(b);
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
  renderer.select(kind, id);
  refreshUI();
}

// ---------- Tutor (contextual, read-only) ----------
function updateTutor() {
  const content = $('tutor-content'); const empty = $('tutor-empty');
  if (!content) return;
  if (!selected) { if (empty) empty.style.display = 'block'; content.innerHTML = ''; return; }
  let msg = '';
  if (selected.kind === 'npc') {
    const c = freeSim.inspector(selected.id);
    if (c?.task?.status === 'EXECUTING') msg = `<p>${esc(c.name)} is <span class="highlight">${esc(c.task.type)}</span> and will keep going until it stops by itself (storage full, nothing left, or too tired).</p>`;
    else if (c) msg = `<p>${esc(c.name)} is idle.${c.lastTask?.reason ? ` Last job ended: <span class="highlight">${esc(c.lastTask.reason)}</span>.` : ''} Run a command; the world is already running.</p><div class="example">survivor.gather("wood", 20);</div>${c.conditions.length ? `<p>Conditions: ${c.conditions.map(esc).join(', ')}.</p>` : ''}`;
  } else if (selected.kind === 'building') {
    const b = freeSim.studentView().buildings.find((x) => x.id === selected.id);
    if (b) msg = `<p>${esc(b.name)} — Level ${b.level}, ${esc(b.condition)}. Condition changes only through simulation actions such as repair.</p>`;
  } else msg = '<p>Resource nodes shrink as survivors gather from them.</p>';
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
  list.innerHTML = app.apiDocs.commands.map((c) => `<div class="api-item"><span class="sig">${esc(c.signature)}</span><span class="doc">${esc(c.doc)}</span></div>`).join('');
}

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

const chip = (s) => `<span class="cmd-chip ${s.ok ? 'ok' : 'fail'}">${esc(s.name)}(${s.args.map((a) => JSON.stringify(a)).join(', ')})<small>${s.ok ? (s.mode === 'replace' ? 'now' : 'queued') : esc(s.error?.code ?? 'rejected')}</small></span>`;

async function runCode() {
  const editor = $('code-editor'); const result = $('code-execution-result'); const list = $('code-commands'); const btn = $('btn-run-code');
  if (!editor || !freeSim) return;
  btn.disabled = true; result.className = 'execution-result'; result.textContent = 'Running in sandbox…';
  try {
    const res = await app.runCode(freeSim, editor.value, { actorId: selected?.kind === 'npc' ? selected.id : null });
    if (!res.ok) {
      result.className = 'execution-result fail'; result.textContent = friendlyError(res); list.innerHTML = '';
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

function lessonList() {
  if (!app || !app.defs || !app.defs.lessons) return [];
  return Object.values(app.defs.lessons);
}

function renderLessonList() {
  const container = $('lesson-list');
  if (!container) return;
  const lessons = lessonList();
  container.innerHTML = lessons.map((l) => {
    const prog = lessonAttempt && lessonAttempt.lessonId === l.id
      ? lessonAttempt.passed ? 'passed' : 'attempted'
      : '';
    const cls = `lesson-item ${prog}${currentLessonId === l.id ? ' active' : ''}`;
    return `<button type="button" class="${cls}" onclick="startLesson('${l.id}')" aria-label="Start lesson ${l.title}">
      <div class="lesson-title">${esc(l.title)}</div>
      <div class="lesson-brief">${esc(l.brief)}</div>
      <div class="lesson-progress">${prog === 'passed' ? '✓ Passed' : prog === 'attempted' ? 'Attempted' : 'Not started'}</div>
    </button>`;
  }).join('');
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
    <div class=\"lesson-starter\">Starter code:<br><pre>${esc(l.starter)}</pre></div>
  `;
  if (brief) brief.textContent = l.brief;
}

function renderLessonResult() {
  const result = $('lesson-result');
  if (!result || !lessonAttempt) return;
  const l = lessonList().find((x) => x.id === lessonAttempt.lessonId);
  const passed = lessonAttempt.passed;
  result.style.display = 'block';
  result.className = `lesson-result ${passed ? 'passed' : 'failed'}`;
  result.innerHTML = `
    <div class="lesson-result-header">${passed ? '✓ Lesson Passed' : '✗ Lesson Not Yet Passed'}</div>
    <div class="lesson-result-details">
      ${lessonAttempt.results?.map((r) => `<div class="goal-row"><span class="goal-tag ${r.passed ? 'ok' : 'fail'}">${r.passed ? '✓' : '✗'}</span><span class="goal-msg">${esc(r.message)}</span>${r.detail ? `<span class="goal-detail">(${esc(r.detail)})</span>` : ''}</div>`).join('')}
      ${lessonAttempt.feedback?.length ? `<div class="lesson-feedback">${lessonAttempt.feedback.join('<br>')}</div>` : ''}
    </div>
    <div class="lesson-result-actions">
      <button type="button" class="btn-small" onclick="restartLesson()">Restart Lesson</button>
      <button type="button" class="btn-small" onclick="exitLesson()">Exit Lesson Mode</button>
    </div>
  `;
}

function renderProgressScreen() {
  const container = $('progress-screen');
  if (!container) return;
  const completed = lessonList().filter((l) => {
    const a = lessonAttempt;
    return a && a.lessonId === l.id && a.passed;
  }).length;
  container.innerHTML = `
    <h3>📊 Progress</h3>
    <div class="progress-summary">
      Lessons completed: ${completed} / ${lessonList().length}
    </div>
    <div class="progress-list">
      ${lessonList().map((l) => {
        const a = lessonAttempt && lessonAttempt.lessonId === l.id ? lessonAttempt : null;
        const status = a ? (a.passed ? 'passed' : 'failed') : 'not-started';
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
  const el = $('lesson-player-panel');
  if (el) el.style.display = 'block';
  const codePanel = $('code-panel');
  if (codePanel) codePanel.classList.add('open');
  isCodePanelOpen = true;
  const editor = $('code-editor');
  const l = lessonList().find((x) => x.id === lessonId);
  if (editor && l) editor.value = l.starter;
  renderLessonList();
  renderLessonInstructions();
  renderUI();
  startScenario();
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
  const el = $('lesson-player-panel');
  if (el) el.style.display = 'none';
  const result = $('lesson-result');
  if (result) result.style.display = 'none';
  renderLessonList();
  renderUI();
}

async function runLessonAttempt(code) {
  if (!app || !currentLessonId) return;
  const l = lessonList().find((x) => x.id === currentLessonId);
  if (!l) return;
  try {
    const res = await app.runLesson(l.id, code);
    lessonAttempt = {
      lessonId: l.id,
      passed: res.evaluation.passed,
      results: res.evaluation.results,
      feedback: res.evaluation.feedback,
      attempt: res.attempt,
    };
    renderLessonResult();
    renderLessonList();
    renderUI();
  } catch (e) {
    const result = $('lesson-result');
    if (result) {
      result.style.display = 'block';
      result.className = 'lesson-result failed';
      result.textContent = `Lesson failed to run: ${e.message}`;
    }
  }
}

async function handleRunCode() {
  if (isLessonMode && currentLessonId) {
    const editor = $('code-editor');
    if (!editor) return;
    await runLessonAttempt(editor.value);
    return;
  }
  return runCode();
}
const nameOf = (id) => freeSim.studentView().survivors.find((x) => x.id === id)?.name ?? id;
const SHOWN_EVENTS = {
  'task.started': (e) => `${nameOf(e.actorId)} started ${e.taskType} ${e.resource}`,
  'resource.gathered': (e) => `+${e.amount} ${e.resource}`,
  'task.stopped': (e) => `${nameOf(e.actorId)} stopped ${e.taskType}: ${e.reason} (${e.gathered} gathered in ${e.trips} trip(s))`,
  'action.failed': (e) => `${nameOf(e.actorId)}: ${e.actionType} failed: ${e.reason}`,
  'action.cancelled': (e) => `${nameOf(e.actorId)}: ${e.actionType} cancelled (${e.reason})`,
  'command.rejected': (e) => `${e.name}() rejected: ${e.code}`,
  'node.depleted': (e) => `${e.nodeId} is empty`,
  'building.condition_changed': (e) => `${e.buildingId}: ${e.from} → ${e.to}`,
  'survivor.consumed': (e) => `consumed ${e.item}`,
  'survivor.downed': () => 'survivor downed',
};

function collectEvents() {
  const all = freeSim.log.all();
  for (const e of all.slice(eventCursor)) if (SHOWN_EVENTS[e.type]) feed.push(`t${e.tick} ${SHOWN_EVENTS[e.type](e)}`);
  eventCursor = all.length;
  if (feed.length > 14) feed = feed.slice(-14);
}

function renderFeed() {
  $('event-feed').innerHTML = feed.length
    ? feed.map((l) => `<span class="cmd-chip">${esc(l)}</span>`).join('')
    : '<span class="hint">The world keeps running. Open CODE, run a command, and watch your survivors work. Events appear here.</span>';
}

function togglePlay() { clock.toggle(); refreshUI(); }
function cycleSpeed() { clock.cycleSpeed(); refreshUI(); }

function bindEvents() {
  $('map-canvas').addEventListener('click', (e) => {
    const rect = $('map-canvas').getBoundingClientRect();
    const hit = renderer.pick(e.clientX - rect.left, e.clientY - rect.top, freeSim.renderProjection());
    if (hit) selectEntity(hit.kind, hit.id);
  });
  $('inspector-toggle')?.addEventListener('click', () => {
    isInspectorOpen = !isInspectorOpen;
    $('inspector').classList.toggle('collapsed', !isInspectorOpen);
    $('inspector-toggle').textContent = isInspectorOpen ? '◂' : '▸';
  });
  $('btn-code')?.addEventListener('click', toggleCodePanel);
  $('code-close')?.addEventListener('click', toggleCodePanel);
  $('btn-run-code')?.addEventListener('click', handleRunCode);
  $('btn-play')?.addEventListener('click', togglePlay);
  $('btn-speed')?.addEventListener('click', cycleSpeed);
  $('btn-restart')?.addEventListener('click', startScenario);
  $('btn-lessons')?.addEventListener('click', toggleLessonMode);
  $('code-editor')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleRunCode(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isCodePanelOpen) toggleCodePanel();
    if (e.key === ' ' && !isCodePanelOpen && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault?.(); togglePlay(); } // Space: play / pause
    if ((e.key === 'd' || e.key === 'D') && e.altKey) renderer.setDebug(!renderer.debug); // Alt+D: optional debug overlay
    if (e.key === 'l' || e.key === 'L') toggleLessonMode(); // Alt+L: lesson mode toggle
  });
}

function toggleLessonMode() {
  if (isLessonMode) exitLesson();
  else {
    const lessons = lessonList();
    if (lessons.length) startLesson(lessons[0].id);
  }
}

init();
