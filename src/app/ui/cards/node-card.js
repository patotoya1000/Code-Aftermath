// Resource node card adapter (UI-C1D, presentation only).
import { esc, cap, cardStateOf, pct, toneFor } from './card-state.js';
import { metricBarHtml, mutedHtml } from './card-metrics.js';
import { renderCardActions } from './card-actions.js';
import { createCardView, renderCardShell, emptyCardView } from './card-shell.js';
import { nodeActionList } from '../actions.js';

export function buildNodeCardView(node, view = {}, { projNode = null, survivorId = null } = {}) {
  if (!node) return emptyCardView('Resource node not found');
  const max = Math.max(projNode?.capacity ?? 0, node.amount ?? 0, 1);
  const severity = cardStateOf({ amount: node.amount });
  const workers = projNode?.workers ?? [];
  const actions = nodeActionList(node, view);
  const recoveryNote = node.amount <= 0
    ? 'Depleted: no resources left on this node.'
    : workers.length
    ? `Active workers: ${workers.join(', ')}.`
    : 'No survivor gathering here right now.';

  const sections = [
    {
      id: 'sec:Resource',
      tab: 'info',
      icon: '⛏',
      title: 'Resource',
      html: `<div class="needs-grid">${metricBarHtml({ label: node.resource, value: node.amount, max, displayValue: `${node.amount}/${max}`, tone: node.amount > 0 ? toneFor(pct(node.amount, max)) : 'bad' })}</div><div style="margin-top:6px;font-size:11px;">${esc(recoveryNote)}</div>`,
    },
    {
      id: 'sec:Actions',
      tab: 'command',
      icon: '🔧',
      title: 'Actions',
      html: `${renderCardActions(actions, { view, survivorId: survivorId ?? view?.survivors?.[0]?.id, showDisabledReasons: true })}${mutedHtml(`Use survivor.gather("${node.resource}") to harvest.`)}`,
    },
  ];

  return createCardView({
    kind: 'node',
    id: node.id,
    title: projNode?.name ?? cap(node.type),
    subtitle: `${node.amount} ${node.resource} left`,
    icon: node.type === 'tree' ? '🌲' : '🪨',
    meta: [`ID: ${node.id}`, `Pos: ${node.x},${node.y}`],
    severity,
    tabs: [{ id: 'info', label: 'Info' }, { id: 'command', label: 'Command' }],
    sections,
    metrics: [{ label: node.resource, value: node.amount, max }],
    actions,
    codeExamples: actions.map((a) => ({ label: a.label, snippet: a.snippet, reason: a.reason })),
  });
}

export function renderNodeCard(node, view, opts = {}) {
  return renderCardShell(buildNodeCardView(node, view, opts), opts);
}
