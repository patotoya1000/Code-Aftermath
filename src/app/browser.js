import { createApp } from './index.js';
import { createIndexedDbAdapter } from '../modules/persistence/index.js';
import { mountDebugView } from '../modules/debugview/index.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

let adapter;
try { adapter = createIndexedDbAdapter(); } catch { adapter = undefined; }
const app = createApp(adapter ? { adapter } : {});
const view = mountDebugView($('map'));

let freeSim = null;
let lastRecord = null;
let selectedEntity = null;
let activeTab = 'info';

async function ensureFreeSim() {
  if (!freeSim) {
    const { sim } = await app.createFreeSim();
    freeSim = sim;
    drawWorld(sim.renderProjection());
    renderTurnInfo(sim.getTurnInfo());
    renderCmdQueue([]);
  }
}

function drawWorld(projection) {
  view.draw(projection);
  const stock = $('stock');
  if (stock && projection) {
    stock.textContent = Object.entries(projection.stock).map(([k, v]) => `${k} ${v}`).join(' · ');
  }
}

function renderTurnInfo(info) {
  $('turninfo').innerHTML = info
    ? `<strong>Tick:</strong> ${info.tick} &nbsp;|&nbsp; <strong>Turn:</strong> ${info.turn} &nbsp;|&nbsp; <strong>Commands:</strong> ${info.commandsLeft}/${info.maxCommands} &nbsp;|&nbsp; <strong>Strategy Points:</strong> ${info.strategyPoints}/${info.maxStrategyPoints}`
    : '<span class="hint">Start a free play session.</span>';
}

function renderCmdQueue(commands) {
  if (!commands || commands.length === 0) {
    $('cmdqueue').innerHTML = '<span class="hint">Command queue: empty</span>';
    return;
  }
  $('cmdqueue').innerHTML =
    '<div class="hint">Command queue:</div>' +
    commands.map((c) => {
      const status = c.status === 'queued' ? '⏳' : c.status === 'done' ? '✔' : c.status === 'failed' ? '✘' : '⚪';
      return `<div style="padding:4px 8px; border-left:3px solid var(--line); margin:2px 0; background:var(--code-bg); font-size:12px; font-family: ui-monospace, monospace;">${status} ${esc(c.name)}(${JSON.stringify(c.args)}) <small>${c.status}</small></div>`;
    }).join('');
}

function renderActivityItems(submitted) {
  const container = $('activity-items');
  if (!submitted || submitted.length === 0) {
    container.innerHTML = '<span class="hint">No commands this turn</span>';
    return;
  }
  container.innerHTML = submitted.map((c) => {
    const ok = c.ok ? 'ok' : 'fail';
    const name = (c.name || 'command').replace('survivor.', '').replace(/\..*/, '');
    const reason = c.reason || c.error?.message || c.error?.code || (c.ok ? 'completed' : 'failed');
    return `<span class="activity-chip" title="${esc(c.name || reason)}"><span class="activity-dot ${ok}"></span>${esc(name)}${c.ok ? '' : `<small> ${esc(reason)}</small>`}</span>`;
  }).join('');
}

function renderNpcPanel() {
  const panel = $('panel-content');
  if (!panel) return;
  if (!selectedEntity) {
    panel.innerHTML = '<span class="hint">Select a survivor or building on the map to inspect it.</span>';
    return;
  }

  const viewState = freeSim ? freeSim.studentView() : null;
  const isBuilding = selectedEntity.kind === 'building';
  const entity = selectedEntity.data;

  const task = entity.task || null;
  const needs = Object.entries(entity.needs || {});
  const conditions = entity.conditions || [];
  const storage = viewState?.hq?.storageInfo ?? null;

  const title = isBuilding ? (entity.name || entity.type || 'Building') : (entity.name || entity.identity?.name || 'Survivor');
  const status = isBuilding ? `${entity.condition || 'repaired'} · lvl ${entity.level ?? 1}` : (entity.status || 'active');

  const renderInfo = `
    <div class="meta">${esc(title)}</div>
    <div class="status-pill">${esc(status)}</div>
    ${isBuilding ? `
      <div style="margin-top:12px;">
        <div class="hint">Health</div>
        <div class="bar"><span>hp</span><i style="width:${Math.max(0, Math.min(100, ((entity.health ?? 0) / (entity.maxHealth || 100)) * 100))}%"></i><b>${entity.health ?? 0}/${entity.maxHealth || 0}</b></div>
      </div>
    ` : (needs.length ? needs.map(([k, v]) => `<div class="bar"><span>${k}</span><i style="width:${Math.max(0, Math.min(100, v))}%"></i><b>${v}</b></div>`).join('') : '<span class="hint">No needs tracked.</span>')}
    ${!isBuilding ? `
      <div style="margin-top:12px;">
        <div class="hint">Conditions</div>
        ${conditions.length ? conditions.map((c) => `<span class="status-pill" style="margin-right:6px; margin-top:4px;">${esc(c)}</span>`).join('') : '<span class="hint">No active conditions.</span>'}
      </div>
    ` : ''}
    <div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--line);">
      <div class="hint">Active task</div>
      <div>${task ? `${esc(task.type)} → ${esc(task.targetId || 'base')}` : '<span class="hint">No active task</span>'}</div>
    </div>
  `;

  const availableCmds = app.apiDocs.commands.map((c) => ({
    signature: c.signature.replace('survivor.', ''),
    doc: c.doc,
  }));

  const renderStatus = `
    <div class="meta">Status</div>
    <div style="margin-top:8px;">
      <div class="hint">Current task</div>
      <div>${task ? `${esc(task.type)} → ${esc(task.targetId || 'base')}` : '<span class="hint">No active task</span>'}</div>
    </div>
    <div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--line);">
      <div class="hint">Available methods / commands</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
        ${availableCmds.map((c) => `<div class="status-pill" style="margin:4px 0;"><code style="font-size:11px;">${esc(c.signature)}</code><div style="font-size:10px; color:var(--muted); margin-top:2px;">${esc(c.doc)}</div></div>`).join('')}
      </div>
    </div>
    <div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--line);">
      <div class="hint">Command line</div>
      <div style="display:flex; gap:6px; margin-top:6px; align-items:center;">
        <input id="npc-cmd" type="text" placeholder="survivor.gather('wood', 10)" aria-label="Command input" style="flex:1; min-width:140px;" />
        <button id="npc-nextturn" type="button" class="primary">Next Turn</button>
      </div>
      <div id="npc-cmd-result" class="hint" style="margin-top:6px; font-size:11px;"></div>
    </div>
  `;

  const equipmentItems = isBuilding ? [] : (entity.inventory?.items ? Object.entries(entity.inventory.items) : []);
  const renderEquipment = `
    <div class="meta">Equipment</div>
    <div style="display:grid; gap:8px; margin-top:8px;">
      ${equipmentItems.length ? equipmentItems.map(([k, v]) => `<div class="status-pill">${esc(k)}: ${esc(v)}</div>`).join('') : '<span class="hint">No equipment tracked for this selection.</span>'}
    </div>
    <div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--line);">
      <div class="hint">Slots</div>
      <div>${isBuilding ? 'Structure inventory' : `${entity.equipment ? Object.keys(entity.equipment).length || '0' : '0'} slots available`}</div>
    </div>
  `;

  const storageRows = storage && storage.capacity
    ? Object.entries(storage.capacity).map(([k, cap]) => {
        const current = storage.current?.[k] ?? 0;
        const percent = Math.min(100, (current / cap) * 100 || 0);
        return `<div class="bar"><span>${k}</span><i style="width:${percent}%"></i><b>${current}/${cap}</b></div>`;
      }).join('')
    : '<span class="hint">No storage data available.</span>';

  const renderStorage = `
    <div class="meta">Storage</div>
    <div style="margin-top:8px;">${storageRows}</div>
    <div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--line);">
      <div class="hint">Rule</div>
      <div>When storage reaches the cap, gather actions stop and fail with <strong>STORAGE_FULL</strong>.</div>
    </div>
  `;

  const content = {
    info: renderInfo,
    status: renderStatus,
    equipment: renderEquipment,
    storage: renderStorage,
  }[activeTab] || renderInfo;

  panel.innerHTML = content;
}

function showSelection(kind, data) {
  selectedEntity = { kind, data };
  const card = $('npc-card');
  const infoCard = $('card');
  if (!card) return;
  card.classList.remove('closed');
  if (infoCard) infoCard.style.display = 'block';
  renderNpcPanel();
}

function hideNpcCard() {
  const card = $('npc-card');
  const infoCard = $('card');
  if (card) card.classList.add('closed');
  if (infoCard) infoCard.style.display = 'none';
  selectedEntity = null;
  const panel = $('panel-content');
  if (panel) panel.innerHTML = '<span class="hint">Select a survivor or building on the map to inspect it.</span>';
}

function refreshWorld() {
  const p = freeSim ? freeSim.renderProjection() : null;
  if (p) drawWorld(p);
}

const lessonSel = $('lesson');
for (const l of app.lessons) lessonSel.add(new Option(l.title, l.id));
const currentLesson = () => app.lessons.find((l) => l.id === lessonSel.value);
function loadLesson() { $('brief').textContent = currentLesson().brief; $('code').value = currentLesson().starter; }
lessonSel.addEventListener('change', loadLesson);
loadLesson();

$('api').innerHTML =
  '<h3>Commands</h3><ul>' + app.apiDocs.commands.map((c) => `<li><code>${esc(c.signature)}</code> — ${esc(c.doc)}</li>`).join('') +
  '</ul><h3>What you can read</h3><ul>' + app.apiDocs.reads.map((r) => `<li><code>${esc(r)}</code></li>`).join('') + '</ul>';

function showResult({ attempt, evaluation }) {
  lastRecord = attempt.record;

  const status = evaluation.passed ? '<strong class="pass">Lesson passed</strong>' : '<strong class="fail">Not yet</strong>';
  $('feedback').innerHTML =
    status + '<ul>' + evaluation.results.map((r) => `<li class="${r.passed ? 'pass' : 'fail'}">${r.passed ? '✔' : '✘'} ${esc(r.message)} <small>${esc(r.detail ?? '')}</small></li>`).join('') + '</ul>' +
    (evaluation.feedback.length ? '<p class="hint">' + evaluation.feedback.map(esc).join('<br>') + '</p>' : '') +
    (attempt.sandbox.logs.length ? '<pre>' + esc(attempt.sandbox.logs.join('\n')) + '</pre>' : '');

  const sv = attempt.finalView.survivor;
  $('card').innerHTML = sv
    ? `<strong>${esc(sv.name)}</strong> <small>${esc(sv.status)}${sv.conditions.length ? ' · ' + esc(sv.conditions.join(', ')) : ''}</small>` +
      Object.entries(sv.needs).map(([k, v]) => `<div class="bar"><span>${k}</span><i style="width:${v}%"></i><b>${v}</b></div>`).join('')
    : '';
  if (sv) {
    const infoCard = $('card');
    if (infoCard) infoCard.style.display = 'block';
  }

  $('events').textContent = attempt.events.map((e) => `${String(e.tick).padStart(4)}  ${e.type}  ${JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['seq', 'tick', 'type'].includes(k))))}`).join('\n');
  $('progress').textContent = `Lessons completed: ${Object.keys(app.progress.completed).length} / ${app.lessons.length} · attempts: ${app.progress.attempts}`;
  $('replayOut').textContent = '';
}

$('run').addEventListener('click', async () => {
  $('run').disabled = true;
  try { showResult(await app.runLesson(lessonSel.value, $('code').value)); } finally { $('run').disabled = false; }
});

$('nextturn').addEventListener('click', async () => {
  if (!freeSim) {
    const { sim, initialView } = await app.createFreeSim();
    freeSim = sim;
    const p = sim.renderProjection();
    drawWorld(p);
    renderTurnInfo(sim.getTurnInfo());
    renderCmdQueue([]);
    $('card').innerHTML = '<span class="hint">Survivor ready. Issue commands, then click Next Turn.</span>';
    $('events').textContent = '';
    return;
  }

  const cmd = $('cmd').value.trim();
  if (!cmd) { alert('Type a command like survivor.gather("wood", 10) first.'); return; }

  const match = cmd.match(/^survivor\.(\w+)\((.*)\)$/);
  if (!match) {
    alert('Use format: survivor.commandName(args...)');
    return;
  }
  const [, name, argsStr] = match;
  let args;
  try {
    args = argsStr ? JSON.parse(`[${argsStr}]`) : [];
  } catch {
    alert('Invalid arguments. Use JSON format like survivor.gather("wood", 10)');
    return;
  }

  const actorId = 'survivor_1';
  const res = await app.advanceTurn(freeSim, [{ actorId, name, args }]);

  renderTurnInfo(res.turnInfo);
  renderCmdQueue(res.submitted.map((c) => ({ name: c.name, args: c.args, status: c.ok ? 'done' : 'failed' })));
  renderActivityItems(res.submitted);
  drawWorld(res.renderProjection);

  // Show the info card if a survivor is selected
  if (selectedEntity && selectedEntity.kind === 'npc') {
    const infoCard = $('card');
    if (infoCard) infoCard.style.display = 'block';
  }

  const sv = res.studentView.survivor;
  $('card').innerHTML = sv
    ? `<strong>${esc(sv.name)}</strong> <small>${esc(sv.status)}${sv.conditions.length ? ' · ' + esc(sv.conditions.join(', ')) : ''}</small>` +
      Object.entries(sv.needs).map(([k, v]) => `<div class="bar"><span>${k}</span><i style="width:${v}%"></i><b>${v}</b></div>`).join('')
    : '';

  $('events').textContent = res.events.map((e) => `${String(e.tick).padStart(4)}  ${e.type}  ${JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['seq', 'tick', 'type'].includes(k))))}`).join('\n');
});

$('runfree').addEventListener('click', async () => {
  const code = $('cmd').value || 'survivor.gather("wood", 10);';
  const a = await app.runSandbox(code, { scenarioId: 'stage1', seed: 1, maxTicks: 600 });
  freeSim = null;
  showResult({ attempt: a, evaluation: { passed: true, results: [], feedback: [] } });
  renderTurnInfo(null);
  renderCmdQueue([]);
  refreshWorld();
});

$('replay').addEventListener('click', async () => {
  if (!lastRecord) { $('replayOut').textContent = 'Run something first.'; return; }
  const r = await app.verifyReplay(lastRecord);
  $('replayOut').textContent = r.matches ? 'Replay matches: identical event log and final state.' : `Replay differs: ${r.reason} ${r.mismatches.join(', ')}`;
});
$('save').addEventListener('click', async () => { $('replayOut').textContent = (await app.save()) ? 'Saved locally.' : 'Run something first.'; });
$('load').addEventListener('click', async () => {
  try { const d = await app.load(); $('replayOut').textContent = d ? `Loaded save (lessons completed: ${Object.keys(d.progress.completed).length}).` : 'No save found.'; }
  catch (e) { $('replayOut').textContent = `Could not load: ${e.code ?? e.message}`; }
  $('progress').textContent = `Lessons completed: ${Object.keys(app.progress.completed).length} / ${app.lessons.length} · attempts: ${app.progress.attempts}`;
});

$('close-npc-card').addEventListener('click', hideNpcCard);
document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab === button));
    renderNpcPanel();
  });
});

// NPC card command line: type a command and press Next Turn
const npcCmd = $('npc-cmd');
const npcNextTurn = $('npc-nextturn');
const npcCmdResult = $('npc-cmd-result');
if (npcNextTurn) {
  npcNextTurn.addEventListener('click', async () => {
    if (!freeSim) { npcCmdResult.textContent = 'Start a free play session first.'; return; }
    const cmd = npcCmd.value.trim();
    if (!cmd) { npcCmdResult.textContent = 'Type a command first.'; return; }
    const match = cmd.match(/^survivor\.(\w+)\((.*)\)$/);
    if (!match) {
      npcCmdResult.textContent = 'Use format: survivor.commandName(args...)';
      return;
    }
    const [, name, argsStr] = match;
    let args;
    try { args = argsStr ? JSON.parse(`[${argsStr}]`) : []; } catch {
      npcCmdResult.textContent = 'Invalid arguments. Use JSON format.';
      return;
    }
    const actorId = selectedEntity?.data?.id ?? 'survivor_1';
    try {
      const res = await app.advanceTurn(freeSim, [{ actorId, name, args }]);
      renderTurnInfo(res.turnInfo);
      renderCmdQueue(res.submitted.map((c) => ({ name: c.name, args: c.args, status: c.ok ? 'done' : 'failed' })));
      renderActivityItems(res.submitted);
      drawWorld(res.renderProjection);
      renderNpcPanel();
      npcCmd.value = '';
      npcCmdResult.textContent = res.submitted.every((c) => c.ok) ? 'Command executed.' : 'Command failed.';
      // Also update the info card if visible
      const infoCard = $('card');
      const sv = res.studentView.survivor;
      if (infoCard && sv && infoCard.style.display !== 'none') {
        infoCard.innerHTML = `<strong>${esc(sv.name)}</strong> <small>${esc(sv.status)}${sv.conditions.length ? ' · ' + esc(sv.conditions.join(', ')) : ''}</small>` +
          Object.entries(sv.needs).map(([k, v]) => `<div class="bar"><span>${k}</span><i style="width:${v}%"></i><b>${v}</b></div>`).join('');
      }
    } catch (e) {
      npcCmdResult.textContent = 'Error: ' + esc(String(e.message ?? e));
    }
  });
  if (npcCmd) {
    npcCmd.addEventListener('keydown', (e) => { if (e.key === 'Enter') npcNextTurn.click(); });
  }
}

let lastClickedSurvivor = null;
$('map').addEventListener('click', async (e) => {
  await ensureFreeSim();

  const rect = $('map').getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const projection = freeSim ? freeSim.renderProjection() : null;
  if (!projection) return;

  const tileSize = Math.floor(Math.min($('map').width / projection.map.width, $('map').height / projection.map.height));

  for (const npc of projection.npcs || []) {
    const nx = npc.x, ny = npc.y;
    if (Math.abs(x - nx * tileSize) < tileSize / 2 && Math.abs(y - ny * tileSize) < tileSize / 2) {
      const studentView = freeSim ? freeSim.studentView() : null;
      lastClickedSurvivor = studentView ? studentView.survivors.find((s) => s && s.id === npc.id) || null : null;
      if (lastClickedSurvivor) {
        showSelection('npc', lastClickedSurvivor);
      }
      return;
    }
  }

  for (const building of projection.buildings || []) {
    const bx = building.x, by = building.y;
    if (Math.abs(x - bx * tileSize) < tileSize / 2 && Math.abs(y - by * tileSize) < tileSize / 2) {
      showSelection('building', { ...building, name: building.name || building.type || 'Building', maxHealth: building.maxHealth || 100, health: building.health || 0, condition: building.condition || 'repaired' });
      return;
    }
  }
});
