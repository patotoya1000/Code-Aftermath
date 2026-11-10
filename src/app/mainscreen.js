// CODE: AFTERMATH — Main Game Screen Controller (Phase 2)
// Connects the renderer, inspector, and command bar to the simulation.
// Every value shown is a read-only projection of GameState — the UI never mutates state.

import { mountRenderer } from '../render/renderer.js';
import { createApp } from './index.js';
import { createIndexedDbAdapter } from '../modules/persistence/index.js';
import { buildCommand } from '../modules/api/index.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

let app, renderer, freeSim;
let selectedEntity = null;
let isInspectorOpen = true;
let isCodePanelOpen = false;
let simPaused = false;
let simSpeed = 1;
let lastProjection = null;

const RESOURCE_ICONS = {
  wood: 'wood', stone: 'stone', metal: 'metal', food: 'food', water: 'water',
  survivor: 'survivor', base: 'base',
};

async function init() {
  const canvas = $('map-canvas');
  renderer = mountRenderer(canvas);

  const adapter = createIndexedDbAdapter();
  app = createApp(adapter ? { adapter } : {});

  await ensureFreeSim();
  bindEvents();
  renderFrame();
  requestAnimationFrame(loop);
}

async function ensureFreeSim() {
  if (!freeSim) {
    const { sim: s } = await app.createFreeSim({ scenarioId: 'stage1', seed: 1 });
    freeSim = s;
    renderer.draw(freeSim.renderProjection());
    lastProjection = freeSim.renderProjection();
    updateTopBar(lastProjection);
    selectEntity('npc', freeSim.studentView().survivors[0]);
  }
}

function loop() {
  renderFrame();
  requestAnimationFrame(loop);
}

function renderFrame() {
  if (!freeSim) return;
  const proj = freeSim.renderProjection();
  lastProjection = proj;
  renderer.draw(proj);
  updateTopBar(proj);
  if (selectedEntity) renderInspector();
  updateTutor(proj);
}
function updateTopBar(proj) {
  const res = $('resources');
  if (!res || !proj) return;

  const stock = proj.stock || {};
  const order = ['wood', 'stone', 'metal', 'food', 'water'];
  let html = order.map((key) => {
    const val = stock[key] ?? 0;
    const icon = RESOURCE_ICONS[key] || key;
    return `
      <div class="resource">
        <div class="icon ${icon}">${icon.toUpperCase().slice(0, 2)}</div>
        <b>${val}</b>
      </div>
    `;
  }).join('');

  const survCount = proj.survivors ? proj.survivors.length : 0;
  html += `
    <div class="resource">
      <div class="icon survivor">SV</div>
      <b>${survCount}</b>
    </div>
  `;

  const hq = proj.hq;
  const baseCond = hq ? Math.round((hq.health / hq.maxHealth) * 100) : 100;
  const condClass = baseCond >= 80 ? 'pos' : baseCond >= 50 ? 'warn' : 'neg';
  html += `
    <div class="resource">
      <div class="icon base">BS</div>
      <b><span class="delta ${condClass}">${baseCond}%</span></b>
    </div>
  `;

  res.innerHTML = html;

  const tick = proj.tick ?? 0;
  const day = Math.floor(tick / 100) + 1;
  const hour = Math.floor((tick % 100) / 4) + 6;
  const minute = Math.floor(((tick % 100) % 4) / 4 * 60);
  $('time-day').textContent = `DAY ${day}`;
  $('time-clock').textContent = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}

function selectEntity(kind, data) {
  selectedEntity = { kind, data };
  renderer.select(kind, data.id);
  renderInspector();
  updateTutor(lastProjection);
}

function clearSelection() {
  selectedEntity = null;
  renderer.clearSelection();
  $('inspector-card').innerHTML = `
    <div class="header">
      <div class="portrait">?</div>
      <div class="info">
        <div class="name">—</div>
        <div class="sub">Select a survivor or building</div>
      </div>
    </div>
  `;
}

function renderInspector() {
  if (!selectedEntity || !freeSim) return;

  const viewState = freeSim.studentView();
  const isBuilding = selectedEntity.kind === 'building';
  const entity = selectedEntity.data;

  const title = isBuilding ? (entity.name || entity.type || 'Building')
    : (entity.name || entity.identity?.name || 'Survivor');
  const status = isBuilding ? `${entity.condition || 'repaired'} · Lvl ${entity.level ?? 1}`
    : (entity.status || 'active');

  const metaHtml = isBuilding
    ? `<span>ID: ${esc(entity.id)}</span><span>Type: ${esc(entity.type)}</span><span>Lvl: ${entity.level ?? 1}</span>`
    : `<span>ID: ${esc(entity.id)}</span><span>Pos: ${entity.x},${entity.y}</span><span>Dir: ${entity.direction}</span>`;

  const sections = [];
  if (!isBuilding) {
    const s = viewState.survivors.find((x) => x.id === entity.id) || entity;
    sections.push(renderNeedsSection(s));
    sections.push(renderAttributesSection(s));
    sections.push(renderEquipmentSection(s));
    sections.push(renderCarrySection(s));
  } else {
    sections.push(renderBuildingSection(entity));
  }
  sections.push(renderTaskSection(entity));

  $('inspector-card').innerHTML = `
    <div class="header">
      <div class="portrait ${!isBuilding ? 'selected' : ''}">${isBuilding ? '🏗' : '👤'}</div>
      <div class="info">
        <div class="name">${esc(title)}</div>
        <div class="sub">${esc(status)}</div>
        <div class="meta-row" id="inspector-meta">${metaHtml}</div>
      </div>
    </div>
    ${sections.join('')}
  `;
}

function renderNeedsSection(s) {
  const needs = s.needs || {};
  const rows = Object.entries(needs).map(([key, val]) => {
    const pct = Math.max(0, Math.min(100, val));
    const cls = val <= 20 ? 'bad' : val <= 40 ? 'warn' : 'good';
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    return `
      <div class="need-row">
        <div class="label">${label}</div>
        <div class="bar-flex"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
        <div class="value">${Math.round(val)}</div>
      </div>
    `;
  }).join('');
  return `<div class="section"><h3><span class="icon">❤</span>Needs</h3><div class="needs-grid">${rows}</div></div>`;
}

function renderAttributesSection(s) {
  const attrs = s.attributes || {};
  const order = ['strength', 'intelligence', 'agility', 'endurance', 'crafting', 'perception'];
  const cells = order.filter((k) => attrs[k] !== undefined).map((k) => {
    const label = k.charAt(0).toUpperCase() + k.slice(1);
    return `
      <div class="attr-cell">
        <span class="attr-name">${label}</span>
        <span class="attr-val">${attrs[k]}</span>
      </div>
    `;
  }).join('');
  return `<div class="section"><h3><span class="icon">⚡</span>Attributes</h3><div class="attrs-grid">${cells}</div></div>`;
}

function renderEquipmentSection(s) {
  const equip = s.equipment || {};
  const slots = ['PRIMARY', 'CLOTHING', 'BACKPACK'];
  const cells = slots.map((slot) => {
    const item = equip[slot.toLowerCase()] || null;
    if (!item) {
      return `<div class="equip-slot empty"><span class="slot-label">${slot}</span><span class="slot-val">—</span></div>`;
    }
    return `<div class="equip-slot"><span class="slot-label">${slot}</span><span class="slot-val">${esc(item)}</span></div>`;
  }).join('');
  return `<div class="section"><h3><span class="icon">🎒</span>Equipment</h3><div class="equip-grid">${cells}</div></div>`;
}

function renderCarrySection(s) {
  const inventory = s.inventory || { items: {} };
  const items = inventory.items || {};
  let totalWeight = 0;
  for (const [key, qty] of Object.entries(items)) totalWeight += qty * 2;
  const maxCarry = 22;
  const pct = Math.min(100, (totalWeight / maxCarry) * 100);
  const encumbered = pct > 80;
  const encState = pct > 80 ? 'Heavy' : pct > 50 ? 'Moderate' : 'Light';
  const invRows = Object.entries(items).map(([key, qty]) => `
    <div class="inv-item"><span class="name">${esc(key)} × ${qty}</span><span class="qty">${qty * 2} kg</span></div>
  `).join('');
  return `
    <div class="section"><h3><span class="icon">⚖</span>Carry Load</h3>
      <div class="carry-row"><div class="carry-bar"><div class="carry-fill ${encumbered ? 'encumbered' : ''}" style="width:${pct}%"></div></div></div>
      <div class="carry-text">Carry Load ${totalWeight} / ${maxCarry} kg · Encumbrance: ${encState}</div>
      <div class="inv-list">${invRows || '<span style="color:var(--muted);font-size:11px;">Empty</span>'}</div>
    </div>`;
}

const CONDITION_COLOR = { ruined: '#c0504d', damaged: '#d9a441', repaired: '#4f9d5d' };

function renderBuildingSection(b) {
  const pct = Math.max(0, Math.min(100, ((b.health ?? 0) / (b.maxHealth || 100)) * 100));
  return `
    <div class="section"><h3><span class="icon">🏗</span>Building</h3>
      <div class="bar"><span>Health</span><i style="width:${pct}%;background:var(--good)"></i><b>${b.health ?? 0}/${b.maxHealth || 0}</b></div>
      <div class="bar" style="margin-top:8px;"><span>Condition</span><i style="width:100%;background:${CONDITION_COLOR[b.condition] || '#d9a441'}"></i><b>${esc(b.condition)}</b></div>
      <div style="margin-top:10px;font-size:11px;color:var(--muted);">Available actions: Repair (pending Phase 4)</div>
    </div>`;
}

function renderTaskSection(entity) {
  const task = entity.task || null;
  if (!task) {
    return `<div id="task-panel">
      <div class="section"><h3><span class="icon">📋</span>Current Task</h3>
        <div class="current-task">
          <div class="task-icon">—</div>
          <div class="task-info">
            <div class="task-title">No active task</div>
            <div class="task-target">Idle</div>
            <div class="task-progress"><div class="task-progress-fill" style="width:0%"></div></div>
            <div class="task-meta">Waiting for command</div>
          </div>
        </div>
      </div>
      <div class="section"><h3><span class="icon">📜</span>Task Queue</h3>
        <div id="task-queue">
          <div class="queue-item"><div class="badge q">Q</div><div class="text">No queued tasks</div></div>
        </div>
      </div>
    </div>`;
  }

  const pct = Math.round((task.progress ?? 0) * 100);
  const iconMap = { gather: '🌲', move: '🚶', rest: '💤', eat: '🍎', drink: '💧', repair: '🔧' };
  const icon = iconMap[task.type] || '⏳';

  return `<div id="task-panel">
    <div class="section"><h3><span class="icon">📋</span>Current Task</h3>
      <div class="current-task">
        <div class="task-icon">${icon}</div>
        <div class="task-info">
          <div class="task-title">${esc(task.type)}</div>
          <div class="task-target">Target: ${esc(task.targetId || 'base')}</div>
          <div class="task-progress"><div class="task-progress-fill" style="width:${pct}%"></div></div>
          <div class="task-meta">${task.status} · Progress: ${pct}%</div>
        </div>
      </div>
    </div>
    <div class="section"><h3><span class="icon">📜</span>Task Queue</h3>
      <div id="task-queue">
        <div class="queue-item"><div class="badge e">E</div><div class="text">${esc(task.type)} → ${esc(task.targetId || 'base')}</div><div class="fail-reason">${task.status}</div></div>
      </div>
    </div>
  </div>`;
}

function updateTutor(proj) {
  const content = $('tutor-content');
  const empty = $('tutor-empty');
  if (!content || !proj) return;

  let msg = '';
  if (selectedEntity && selectedEntity.kind === 'npc') {
    const s = proj.survivors ? proj.survivors.find((x) => x.id === selectedEntity.id) : null;
    if (s) {
      const task = s.task;
      if (task && task.status === 'EXECUTING') {
        msg = `<p>${esc(s.name)} is currently <span class="highlight">${esc(task.type)}</span>. Progress: ${Math.round((task.progress ?? 0) * 100)}%.</p>`;
        if (s.conditions && s.conditions.length > 0) msg += `<p>Conditions: ${s.conditions.join(', ')}.</p>`;
      } else if (task && task.status === 'FAILED') {
        msg = `<p>${esc(s.name)}'s action <span class="highlight">failed</span>. Reason: ${task.failureReason || 'unknown'}.</p>`;
        msg += `<p>Check preconditions: resources, carry capacity, or target availability.</p>`;
      } else {
        msg = `<p>${esc(s.name)} is idle. Ready for a command.</p>`;
        msg += `<div class="example">survivor.gather("wood", 10);</div>`;
      }
    }
  } else if (selectedEntity && selectedEntity.kind === 'building') {
    msg = `<p>${esc(selectedEntity.data.name || selectedEntity.data.type)} — Level ${selectedEntity.data.level ?? 1}, Condition: ${selectedEntity.data.condition}.</p>`;
    msg += `<p>Buildings provide storage and training. Condition affects functionality.</p>`;
  } else {
    empty.style.display = 'block';
    content.innerHTML = '';
    return;
  }

  empty.style.display = 'none';
  content.innerHTML = msg;
}

function toggleCodePanel() {
  isCodePanelOpen = !isCodePanelOpen;
  const panel = $('code-panel');
  if (panel) panel.classList.toggle('open', isCodePanelOpen);
  if (isCodePanelOpen) renderCodeAPI();
}

function renderCodeAPI() {
  const list = $('code-api-list');
  if (!list || !app) return;
  const cmds = app.apiDocs?.commands || [];
  list.innerHTML = cmds.map((c) => `
    <div class="api-item">
      <span class="sig">survivor.${c.signature.replace('survivor.', '')}</span>
      <span class="doc">${esc(c.doc)}</span>
    </div>
  `).join('');
}

function runCode() {
  const editor = $('code-editor');
  const result = $('code-execution-result');
  if (!editor || !freeSim || !app) return;

  const code = editor.textContent || editor.innerText || '';
  const match = code.match(/survivor\.(\w+)\((.*)\)/);
  if (!match) {
    result.textContent = 'Use format: survivor.commandName(args)';
    result.className = 'execution-result fail';
    return;
  }

  const [, name, argsStr] = match;
  let args = [];
  try { args = argsStr ? JSON.parse(`[${argsStr}]`) : []; } catch {
    result.textContent = 'Invalid arguments. Use JSON.';
    result.className = 'execution-result fail';
    return;
  }

  try {
    const actorId = selectedEntity?.kind === 'npc' ? selectedEntity.data.id : 'survivor_1';
    const cmd = buildCommand(actorId, { name, args });
    if (!cmd) {
      result.textContent = 'Command not recognized by Game API.';
      result.className = 'execution-result fail';
      return;
    }

    freeSim.submit(cmd);
    freeSim.executeTurn();
    renderFrame();

    result.textContent = 'Command accepted → queued → simulation executing';
    result.className = 'execution-result ok';
  } catch (e) {
    result.textContent = `Error: ${esc(String(e.message ?? e))}`;
    result.className = 'execution-result fail';
  }
}

function bindEvents() {
  $('map-canvas').addEventListener('click', async (e) => {
    await ensureFreeSim();
    if (!freeSim) return;
    const rect = $('map-canvas').getBoundingClientRect();
    const { x, y } = renderer.screenToTile(e.clientX - rect.left, e.clientY - rect.top);

    const proj = freeSim.renderProjection();
    for (const npc of proj.npcs || []) {
      if (Math.abs(npc.x - x) < 0.6 && Math.abs(npc.y - y) < 0.6) {
        const sv = proj.survivors ? proj.survivors.find((s) => s.id === npc.id) : null;
        if (sv) selectEntity('npc', sv);
        return;
      }
    }
    for (const b of proj.buildings || []) {
      if (Math.abs(b.x - x) < 0.6 && Math.abs(b.y - y) < 0.6) {
        selectEntity('building', b);
        return;
      }
    }
    for (const n of proj.nodes || []) {
      if (Math.abs(n.x - x) < 0.6 && Math.abs(n.y - y) < 0.6) {
        selectEntity('node', n);
        return;
      }
    }
  });

  $('inspector-toggle')?.addEventListener('click', () => {
    isInspectorOpen = !isInspectorOpen;
    $('inspector').classList.toggle('collapsed', !isInspectorOpen);
    $('inspector-toggle').textContent = isInspectorOpen ? '◂' : '▸';
  });

  $('btn-code')?.addEventListener('click', toggleCodePanel);
  $('code-close')?.addEventListener('click', toggleCodePanel);
  $('btn-run-code')?.addEventListener('click', runCode);

  $('btn-pause')?.addEventListener('click', () => { simPaused = true; updateSimBtns(); });
  $('btn-play')?.addEventListener('click', () => { simPaused = false; updateSimBtns(); });
  $('btn-speed')?.addEventListener('click', () => {
    simSpeed = simSpeed === 1 ? 2 : simSpeed === 2 ? 4 : 1;
    $('btn-speed').textContent = `${simSpeed}×`;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isCodePanelOpen) toggleCodePanel();
  });

  window.addEventListener('resize', () => {
    const canvas = $('map-canvas');
    renderer.resize(canvas.clientWidth, canvas.clientHeight);
    renderFrame();
  });
}

function updateSimBtns() {
  $('btn-pause')?.classList.toggle('active', simPaused);
  $('btn-play')?.classList.toggle('active', !simPaused);
}

init();

