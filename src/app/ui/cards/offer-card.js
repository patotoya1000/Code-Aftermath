// Offer card adapter for recruit, train goods, and scavenge site offers (UI-C1D, presentation only).
import { esc } from './card-state.js';
import { metricRowHtml, mutedHtml } from './card-metrics.js';
import { renderCardActions } from './card-actions.js';
import { createCardView, renderCardShell, emptyCardView } from './card-shell.js';
import { townActionList, trainActionList, scavengeActionList } from '../actions.js';

export function buildOfferCardView(offerOrId, kind = 'recruit', view = {}) {
  const id = typeof offerOrId === 'string' ? offerOrId : offerOrId?.id;
  if (!id) return emptyCardView('Offer not found');

  if (kind === 'recruit') {
    const entry = townActionList(view).find((a) => a.offer?.id === id);
    if (!entry) return emptyCardView('Recruit offer not available');
    const o = entry.offer;
    const stats = [...Object.entries(o.skills ?? {}).map(([k, v]) => `${k} ${v}`), ...(o.traits ?? [])].join(' · ') || 'no skills yet';
    const priceStr = entry.price.map((p) => `${p.qty} ${p.item}${p.ok ? ' ✓' : ''}`).join(' / ');
    return createCardView({
      kind: 'offer',
      id: o.id,
      title: `${o.name}${o.train ? ' 🚆' : ''}`,
      subtitle: `Recruit · worth ${o.worth}`,
      icon: '🧑',
      meta: [`ID: ${o.id}`, `Free beds: ${view.town?.freeBeds ?? 0}`],
      severity: o.hired ? 'unavailable' : 'normal',
      sections: [{
        id: 'sec:Offer',
        tab: 'info',
        icon: '📋',
        title: 'Candidate',
        html: `${metricRowHtml('Skills & Traits', stats)}${metricRowHtml('Attributes', `STR ${o.attributes.strength} AGI ${o.attributes.agility} END ${o.attributes.endurance}`)}${metricRowHtml('Price', priceStr)}${renderCardActions([entry], { showDisabledReasons: true })}`,
      }],
      actions: [entry],
      codeExamples: [{ label: entry.label, snippet: entry.snippet, reason: entry.reason }],
    });
  }

  if (kind === 'train') {
    const entry = trainActionList(view).find((a) => a.goods?.id === id);
    if (!entry) return emptyCardView('Train goods not available');
    const g = entry.goods;
    const priceStr = entry.price.map((p) => `${p.qty} ${p.item}${p.ok ? ' ✓' : ''}`).join(' / ');
    return createCardView({
      kind: 'offer',
      id: g.id,
      title: g.name,
      subtitle: `${g.left} of ${g.qty} left`,
      icon: '🚆',
      meta: [`ID: ${g.id}`, `Item: ${g.item}`],
      severity: g.left < 1 ? 'empty' : 'normal',
      sections: [{
        id: 'sec:Goods',
        tab: 'info',
        icon: '📦',
        title: 'Train Cargo',
        html: `${metricRowHtml('Available', `${g.left} / ${g.qty}`)}${metricRowHtml('Price each', priceStr)}${renderCardActions([entry], { showDisabledReasons: true })}`,
      }],
      actions: [entry],
      codeExamples: [{ label: entry.label, snippet: entry.snippet, reason: entry.reason }],
    });
  }

  if (kind === 'scavenge') {
    const entry = scavengeActionList(view).find((a) => a.site?.id === id);
    if (!entry) return emptyCardView('Scavenge site not available');
    const s = entry.site;
    const gain = Object.entries(s.expected ?? {}).map(([i, r]) => `${r[0]}-${r[1]} ${i}`).join(', ');
    return createCardView({
      kind: 'offer',
      id: s.id,
      title: s.name,
      subtitle: `${s.ticks} ticks · ${s.dangerToday}% danger`,
      icon: '🧭',
      meta: [`ID: ${s.id}`, `Recovery: ${s.recoveryPercent}%`],
      severity: entry.enabled ? 'normal' : 'unavailable',
      sections: [{
        id: 'sec:Site',
        tab: 'info',
        icon: '🗺',
        title: 'Expedition Site',
        html: `${metricRowHtml('Trip time', `${s.ticks} ticks`)}${metricRowHtml('Danger today', `${s.dangerToday}%`)}${metricRowHtml('Recovery', `${s.recoveryPercent}%`)}${metricRowHtml('Expected', gain || '—')}${renderCardActions([entry], { showDisabledReasons: true })}${mutedHtml(esc(entry.reason))}`,
      }],
      actions: [entry],
      codeExamples: [{ label: entry.label, snippet: entry.snippet, reason: entry.reason }],
    });
  }

  return emptyCardView('Unknown offer kind');
}

export function renderOfferCard(offerOrId, kind, view, opts = {}) {
  return renderCardShell(buildOfferCardView(offerOrId, kind, view), opts);
}
