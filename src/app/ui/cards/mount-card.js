// Mounted weapon card adapter (UI-C1D, presentation only).
import { cardStateOf, pct, toneFor } from './card-state.js';
import { metricBarHtml, metricRowHtml, statusPillHtml, mutedHtml } from './card-metrics.js';
import { renderCardActions } from './card-actions.js';
import { createCardView, renderCardShell, emptyCardView } from './card-shell.js';
import { mountActionList } from '../actions.js';

export function buildMountCardView(mount, tower, view = {}, { survivorId = null } = {}) {
  if (!mount || !tower) return emptyCardView('Mounted weapon not found');
  const severity = tower.condition === 'ruined' ? 'ruined' : mount.status === 'NO_AMMO' || mount.status === 'NO_POWER' ? 'unavailable' : 'normal';
  const hopperMax = Math.max(mount.hopperMax ?? 1, 1);
  const actions = mountActionList(mount, tower, view);
  const crew = (tower.tower?.posted ?? []).length ? tower.tower.posted.join(', ') : 'none posted';

  const sections = [
    {
      id: 'sec:Mount',
      tab: 'info',
      icon: '⚙',
      title: 'Mount Status',
      html: `<div class="needs-grid">${metricBarHtml({ label: mount.ammo ?? 'ammo', value: mount.hopper ?? 0, max: hopperMax, displayValue: `${mount.hopper ?? 0}/${hopperMax}`, tone: toneFor(pct(mount.hopper ?? 0, hopperMax)) })}</div>`
        + `<div class="uc-metric-list" style="margin-top:6px;">`
        + metricRowHtml('Status', mount.status ?? 'IDLE')
        + metricRowHtml('Crew / Operator', crew)
        + metricRowHtml('Cooldown', `${mount.cooldown ?? 0} ticks`)
        + (mount.power ? metricRowHtml('Power', mount.powered ? 'Powered' : 'No power', { tone: mount.powered ? 'good' : 'bad' }) : '')
        + `</div><div style="margin-top:6px;">${statusPillHtml(mount.status ?? 'IDLE')}</div>`,
    },
    {
      id: 'sec:Actions',
      tab: 'command',
      icon: '🔋',
      title: 'Reload',
      html: `${renderCardActions(actions, { view, survivorId: survivorId ?? view?.survivors?.[0]?.id, showDisabledReasons: true })}${mutedHtml('Mounted weapons fire automatically while crewed and loaded.')}`,
    },
  ];

  return createCardView({
    kind: 'mount',
    id: `${tower.id}:${mount.weapon}`,
    title: mount.name ?? mount.weapon,
    subtitle: `Mounted on ${tower.name ?? tower.id} · ${mount.status ?? 'IDLE'}`,
    icon: '🔫',
    meta: [`Tower: ${tower.id}`, `Ammo: ${mount.ammo ?? '—'}`],
    severity,
    tabs: [{ id: 'info', label: 'Info' }, { id: 'command', label: 'Command' }],
    sections,
    metrics: [{ label: 'hopper', value: mount.hopper ?? 0, max: hopperMax }],
    actions,
    codeExamples: actions.map((a) => ({ label: a.label, snippet: a.snippet, reason: a.reason })),
  });
}

export function renderMountCard(mount, tower, view, opts = {}) {
  return renderCardShell(buildMountCardView(mount, tower, view, opts), opts);
}
