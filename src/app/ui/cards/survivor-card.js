// Survivor & personal inventory card adapter (UI-C1B, presentation only).
// Reads inspectorCard() + studentView() projections without inventing numbers.
import { iconUrl } from '../../../modules/assets/icons.js';
import { esc, cap, cardStateOf, isActionAllowedInState } from './card-state.js';
import { metricBarHtml, statusPillHtml, kvGridHtml, mutedHtml } from './card-metrics.js';
import { renderCardActions } from './card-actions.js';
import { createCardView, renderCardShell, emptyCardView } from './card-shell.js';
import { survivorActionList } from '../actions.js';

const TASK_ICON = { gather: '⛏', repair: '🔧', rest: '💤', eat: '🍎', drink: '💧', move: '👣', deposit: '📦', farm: '🌾', cook: '🍳', craft: '🔨', scavenge: '🧭', attack: '⚔', guard: '🛡', mount: '⚙', reload: '🔋', lure: '📣', upgrade: '⬆', collect: '🎒', take: '🤲', equip: '🗡' };
const itemIcon = (id) => { const u = iconUrl(id); return u ? `<img class="item-icon" src="${u}" alt="">` : ''; };

function taskSectionHtml(task, queued = 0, lastTask = null) {
  const stopReason = lastTask?.reason ?? task?.reason ?? null;
  const target = task?.targetId ?? lastTask?.targetId ?? null;
  const route = target ? `Route: ${target}` : 'Route: none';
  const reasonText = stopReason ? `<div class="task-meta">Stop reason: ${esc(stopReason)}</div>` : '';
  if (!task) {
    const last = lastTask
      ? `Last: ${esc(lastTask.type)} ${esc(String(lastTask.status ?? '').toLowerCase())}${lastTask.reason ? ` — ${esc(lastTask.reason)}` : ''}${lastTask.gathered ? ` (${lastTask.gathered} gathered)` : ''}${lastTask.crafted ? ` (${lastTask.crafted} cooked)` : ''}`
      : 'Waiting for command';
    return `<div class="current-task"><div class="task-icon">—</div><div class="task-info"><div class="task-title">No active task</div><div class="task-target">${esc(route)}</div><div class="task-progress"><div class="task-progress-fill" style="width:0%"></div></div><div class="task-meta">${last}</div>${reasonText}</div></div>`;
  }
  const pct = Math.round((task.fraction ?? 0) * 100);
  const stats = !task.stats ? '' : task.stats.crafted !== undefined ? ` · cooked ${task.stats.crafted} batch(es)` : ` · gathered ${task.stats.gathered} in ${task.stats.trips} trip(s)`;
  return `<div class="current-task"><div class="task-icon">${TASK_ICON[task.type] ?? '⏳'}</div><div class="task-info"><div class="task-title">${esc(task.type)}</div><div class="task-target">Target: ${esc(task.targetId ?? 'base')} · ${esc(route)}</div><div class="task-progress"><div class="task-progress-fill" style="width:${pct}%"></div></div><div class="task-meta">${esc(task.status)} · ${pct}%${esc(stats)} · queued: ${queued}</div>${reasonText}</div></div>`;
}

export function buildSurvivorCardView(card, view = {}) {
  if (!card) return emptyCardView('Survivor not found');
  const severity = cardStateOf({ status: card.status });
  const needsObj = card.needs ?? {};
  const needsHtml = Object.entries(needsObj).map(([k, v]) =>
    metricBarHtml({ label: k, value: v, max: 100, tone: v <= 20 ? 'bad' : v <= 40 ? 'warn' : 'good' })
  ).join('');
  const attrsHtml = kvGridHtml(Object.entries(card.attributes ?? {}).map(([k, v]) => ({ label: cap(k), value: v })));
  const skills = Object.entries(card.skills ?? {});
  const skillsHtml = skills.length
    ? `<div class="attrs-grid">${skills.map(([k, v]) => {
      const pr = card.skillProgress?.[k];
      const pct = pr && pr.next ? Math.min(100, Math.round((pr.xp / pr.next) * 100)) : 100;
      const tip = pr ? `${pr.xp} XP${pr.next ? ` / ${pr.next} for level ${v + 1}` : ' (max level)'}` : '';
      return `<div class="attr-cell" title="${esc(tip)}"><span class="attr-name">${esc(cap(k))}</span><span class="attr-val">${v}</span><span class="skill-xp"><i style="width:${pct}%"></i></span></div>`;
    }).join('')}</div>`
    : mutedHtml('No skills tracked.');

  const equip = Object.entries(card.equipment ?? {}).filter(([, item]) => item);
  const equipHtml = equip.length
    ? `<div class="equip-grid">${equip.map(([slot, item]) => `<div class="equip-slot"><span class="slot-label">${esc(slot.toUpperCase())}</span><span class="slot-val">${itemIcon(item)}${esc(item)}</span></div>`).join('')}</div>`
    : mutedHtml('Nothing equipped.');

  const invDetail = card.inventoryDetail ?? [];
  const invHtml = invDetail.map((i) => `<div class="inv-item"><span class="name">${itemIcon(i.id)}${esc(i.name)} × ${i.quantity}</span><span class="qty">${i.weight} wt</span></div>`).join('');
  const carry = card.carry ?? { load: 0, capacity: 0 };

  const policies = Object.entries(card.policies ?? {});
  const policiesHtml = policies.length
    ? policies.map(([k, p]) => statusPillHtml(`${k} < ${p.below}${p.until ? ` → ${p.until}` : ''}${p.prefer ? ` (${p.prefer} first)` : ''}${p.blocked ? ` ⚠ ${p.blocked}` : ''}`)).join(' ')
    : mutedHtml('None. Try survivor.policy("eat", { below: 30 })');

  const hooks = card.hooks ?? [];
  const hooksHtml = hooks.length
    ? hooks.map((h) => statusPillHtml(`on ${h}`)).join(' ')
    : mutedHtml('None. Try survivor.on("hungry", () => { survivor.eat(); })');

  const actions = isActionAllowedInState(severity) ? survivorActionList(card, view) : survivorActionList({ ...card, status: severity }, view);
  const sections = [
    { id: 'sec:Needs', tab: 'stats', icon: '❤', title: 'Needs', html: `<div class="needs-grid">${needsHtml}</div>` },
    (card.conditions ?? []).length ? { id: 'sec:Conditions', tab: 'stats', icon: '⚠', title: 'Conditions', html: card.conditions.map((c) => statusPillHtml(c)).join(' ') } : null,
    { id: 'sec:Attributes', tab: 'stats', icon: '⚡', title: 'Attributes', html: attrsHtml },
    { id: 'sec:Skills', tab: 'stats', icon: '🎓', title: 'Skills', html: skillsHtml },
    (card.traits ?? []).length ? { id: 'sec:Traits', tab: 'stats', icon: '🏷', title: 'Traits', html: card.traits.map((t) => statusPillHtml(t)).join(' ') } : null,
    card.occupation ? { id: 'sec:Occupation', tab: 'stats', icon: '🪪', title: 'Occupation', html: statusPillHtml(card.occupation) } : null,
    { id: 'sec:Equipment', tab: 'equipment', icon: '🎒', title: 'Equipment', html: equipHtml },
    { id: 'sec:Inventory', tab: 'bag', icon: '📦', title: 'Inventory', html: `<div class="inv-list">${invHtml || mutedHtml('Empty')}</div><div style="margin-top:6px;">${mutedHtml(`Carrying ${carry.load} / ${carry.capacity} wt. Encumbrance does not slow her yet.`)}</div>` },
    { id: 'sec:Current Task', tab: 'info', icon: '📋', title: 'Current Task', html: taskSectionHtml(card.task, card.queued, card.lastTask) },
    { id: 'sec:Commands', tab: 'command', icon: '⌨', title: 'Commands', html: `${renderCardActions(actions, { view, survivorId: card.id })}${mutedHtml('Buttons add a command to the editor; nothing runs until you press Run.')}` },
    { id: 'sec:Policies', tab: 'command', icon: '🧭', title: 'Policies', html: policiesHtml },
    { id: 'sec:Hooks', tab: 'command', icon: '🪝', title: 'Hooks', html: hooksHtml },
  ].filter(Boolean);

  return createCardView({
    kind: 'survivor',
    id: card.id,
    title: card.identity?.name ?? card.id,
    subtitle: `${card.status} · ${card.identity?.background ?? 'Survivor'}`,
    icon: '<img class="npc-portrait" src="assets/sprites/npc/idle_down.png" alt="">',
    meta: [
      `ID: ${card.id}`,
      `Age: ${card.identity?.age ?? '?'}`,
      `Pos: ${card.x},${card.y}`,
      `Dir: ${card.direction ?? 'down'}`,
    ],
    severity,
    tabs: [
      { id: 'info', label: 'Info' },
      { id: 'stats', label: 'Stats' },
      { id: 'equipment', label: 'Equipment' },
      { id: 'bag', label: 'Bag' },
      { id: 'command', label: 'Command' },
    ],
    sections,
    metrics: Object.entries(needsObj).map(([k, v]) => ({ label: k, value: v, max: 100 })),
    inventory: invDetail,
    actions,
    codeExamples: actions.filter((a) => a.enabled).slice(0, 3).map((a) => ({ label: a.label, snippet: a.snippet, reason: a.reason })),
  });
}

export function renderSurvivorCard(card, view, opts = {}) {
  return renderCardShell(buildSurvivorCardView(card, view), opts);
}
