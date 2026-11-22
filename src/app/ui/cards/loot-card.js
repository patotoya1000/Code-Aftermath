// Loot pile card adapter (UI-C1D, presentation only).
import { esc, cardStateOf } from './card-state.js';
import { metricRowHtml, mutedHtml } from './card-metrics.js';
import { renderCardActions } from './card-actions.js';
import { createCardView, renderCardShell, emptyCardView } from './card-shell.js';
import { lootActionList } from '../actions.js';

export function buildLootCardView(pile, view = {}, { survivorId = null } = {}) {
  if (!pile) return emptyCardView('Loot pile not found');
  const severity = cardStateOf({ amount: pile.qty });
  const actions = lootActionList(pile, view);
  const sortieOpen = view?.threats?.loot?.sortieOpen ?? !view?.threats?.wave?.active;
  const rows = [
    metricRowHtml('Item', pile.item),
    metricRowHtml('Quantity', pile.qty),
    metricRowHtml('Sortie', sortieOpen ? 'Open' : 'Closed (wave active)', { tone: sortieOpen ? 'good' : 'bad' }),
  ].join('');

  const sections = [
    { id: 'sec:Loot', tab: 'info', icon: '🎒', title: 'Loot Pile', html: `<div class="uc-metric-list">${rows}</div>` },
    {
      id: 'sec:Actions',
      tab: 'command',
      icon: '🔧',
      title: 'Actions',
      html: `${renderCardActions(actions, { view, survivorId: survivorId ?? view?.survivors?.[0]?.id, showDisabledReasons: true })}${mutedHtml('Loot not collected is lost a day after the wave ends.')}`,
    },
  ];

  return createCardView({
    kind: 'loot',
    id: pile.id,
    title: `${pile.item} × ${pile.qty}`,
    subtitle: sortieOpen ? 'On the ground · ready to collect' : 'Wave active · sortie closed',
    icon: '💰',
    meta: [`ID: ${pile.id}`, `Pos: ${pile.x},${pile.y}`],
    severity,
    tabs: [{ id: 'info', label: 'Info' }, { id: 'command', label: 'Command' }],
    sections,
    inventory: [{ id: pile.item, name: pile.item, quantity: pile.qty }],
    actions,
    codeExamples: actions.map((a) => ({ label: a.label, snippet: a.snippet, reason: a.reason })),
  });
}

export function renderLootCard(pile, view, opts = {}) {
  return renderCardShell(buildLootCardView(pile, view, opts), opts);
}
