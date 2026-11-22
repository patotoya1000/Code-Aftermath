// Zombie & wanderer card adapter (UI-C1D, presentation only).
import { esc, cardStateOf, pct, toneFor } from './card-state.js';
import { metricBarHtml, metricRowHtml, statusPillHtml, mutedHtml } from './card-metrics.js';
import { renderCardActions } from './card-actions.js';
import { createCardView, renderCardShell, emptyCardView } from './card-shell.js';
import { zombieActionList } from '../actions.js';

export function buildZombieCardView(z, view = {}, { survivorId = null } = {}) {
  if (!z) return emptyCardView('Zombie not found');
  const isWanderer = z.wanderer === true || String(z.id ?? '').startsWith('wanderer_');
  const def = view?.threats?.zombies?.[z.type] ?? view?.threats?.bosses?.[z.type] ?? {};
  const maxHp = z.maxHealth ?? def.health ?? Math.max(z.health ?? 1, 1);
  const hp = z.health ?? maxHp;
  const severity = cardStateOf({ health: hp, maxHealth: maxHp });
  const armor = z.armor ?? def.armor ?? 0;
  const behaviour = z.behaviour?.type ?? def.behaviour?.type ?? 'chase';
  const target = z.target ?? (z.targetId ? z.targetId : 'wall / nearest survivor');
  const actions = zombieActionList(z, view);

  const infoRows = [
    metricBarHtml({ label: 'health', value: hp, max: maxHp, displayValue: `${hp}/${maxHp}`, tone: toneFor(pct(hp, maxHp)) }),
    metricRowHtml('Armor', armor),
    metricRowHtml('Behaviour', behaviour),
    metricRowHtml('Target', target),
  ].join('');

  const tags = [
    isWanderer ? statusPillHtml('Wanderer (daytime, no wave needed)', 'warn') : statusPillHtml('Wave enemy', 'bad'),
    z.phase ? statusPillHtml(`Phase: ${z.phase}`, 'bad') : '',
  ].filter(Boolean).join(' ');

  const sections = [
    { id: 'sec:Threat', tab: 'info', icon: '🧟', title: 'Threat', html: `<div class="needs-grid">${infoRows}</div><div style="margin-top:6px;">${tags}</div>` },
    {
      id: 'sec:Actions',
      tab: 'command',
      icon: '⚔',
      title: 'Combat',
      html: `${renderCardActions(actions, { view, survivorId: survivorId ?? view?.survivors?.[0]?.id, showDisabledReasons: true })}${mutedHtml('Attack orders route through the sandbox.')}`,
    },
  ];

  return createCardView({
    kind: 'zombie',
    id: z.id,
    title: z.name ?? def.name ?? z.type ?? z.id,
    subtitle: isWanderer ? 'Wanderer · outside wall' : `${z.type ?? 'zombie'} · active threat`,
    icon: '🧟',
    meta: [`ID: ${z.id}`, `Pos: ${Math.round(z.x ?? 0)},${Math.round(z.y ?? 0)}`],
    severity,
    tabs: [{ id: 'info', label: 'Info' }, { id: 'command', label: 'Command' }],
    sections,
    metrics: [{ label: 'health', value: hp, max: maxHp }],
    actions,
    codeExamples: actions.map((a) => ({ label: a.label, snippet: a.snippet, reason: a.reason })),
  });
}

export function renderZombieCard(z, view, opts = {}) {
  return renderCardShell(buildZombieCardView(z, view, opts), opts);
}
