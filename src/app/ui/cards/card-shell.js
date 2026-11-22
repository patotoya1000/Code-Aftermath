// Unified CardView shell & contract (presentation only).
// Every card (survivor, building, node, loot, zombie, mount, offer, panel) adapts projection data into a CardView
// and renders through renderCardShell() so layout, states, tabs, metrics, actions and code examples stay consistent.
import { esc, stateNotice } from './card-state.js';
import { metricBarHtml, mutedHtml } from './card-metrics.js';
import { renderTabBar, sectionsForTab } from './card-tabs.js';
import { renderCardActions, renderCodeExamples, collectDisabledReasons } from './card-actions.js';

export const CARD_KINDS = Object.freeze(['survivor', 'building', 'node', 'loot', 'zombie', 'mount', 'offer', 'panel']);

export function createCardView({
  kind = 'panel',
  id = '',
  title = '—',
  subtitle = '',
  icon = '?',
  meta = [],
  severity = 'normal',
  notice = null,
  tabs = [],
  sections = [],
  metrics = [],
  inventory = [],
  actions = [],
  disabledReasons = null,
  codeExamples = [],
} = {}) {
  return {
    kind: CARD_KINDS.includes(kind) ? kind : 'panel',
    id: String(id ?? ''),
    title: String(title ?? '—'),
    subtitle: String(subtitle ?? ''),
    icon: String(icon ?? '?'),
    meta: Array.isArray(meta) ? meta : [],
    severity,
    notice: notice ?? stateNotice(severity),
    tabs: Array.isArray(tabs) ? tabs : [],
    sections: Array.isArray(sections) ? sections.filter(Boolean) : [],
    metrics: Array.isArray(metrics) ? metrics : [],
    inventory: Array.isArray(inventory) ? inventory : [],
    actions: Array.isArray(actions) ? actions : [],
    disabledReasons: Array.isArray(disabledReasons) ? disabledReasons : collectDisabledReasons(actions),
    codeExamples: Array.isArray(codeExamples) ? codeExamples : [],
  };
}

export function emptyCardView(message = 'Select a survivor, building or resource') {
  return createCardView({
    kind: 'panel',
    id: 'empty',
    title: '—',
    subtitle: message,
    icon: '?',
    severity: 'empty',
    notice: null,
  });
}

export function loadingCardView(label = 'Loading…') {
  return createCardView({
    kind: 'panel',
    id: 'loading',
    title: label,
    subtitle: 'Waiting for projection…',
    icon: '⏳',
    severity: 'loading',
  });
}

export function sectionHtml(icon, title, body, { key = '' } = {}) {
  const dataKey = key ? ` data-key="${esc(key)}"` : '';
  return `<div class="section"${dataKey}><h3><span class="icon">${icon}</span>${esc(title)}</h3>${body}</div>`;
}

export function renderCardHeader(cardView) {
  const metaHtml = cardView.meta.length
    ? `<div class="meta-row" id="inspector-meta">${cardView.meta.map((m) => `<span>${esc(m)}</span>`).join('')}</div>`
    : '';
  return `<div class="header"><div class="portrait selected">${cardView.icon}</div><div class="info"><div class="name">${esc(cardView.title)}</div><div class="sub">${esc(cardView.subtitle)}</div>${metaHtml}</div></div>`;
}

export function renderCardBody(cardView, { activeTab = '', showTabs = false, view = null, survivorId = null } = {}) {
  const noticeHtml = cardView.notice
    ? `<div class="uc-notice uc-notice-${esc(cardView.notice.tone)}">${esc(cardView.notice.text)}</div>`
    : '';
  const tabHtml = showTabs && cardView.tabs.length ? renderTabBar(cardView.tabs, activeTab) : '';
  const visibleSections = showTabs && cardView.tabs.length ? sectionsForTab(cardView.sections, activeTab, cardView.tabs) : cardView.sections;
  const sectionsMarkup = visibleSections.map((s) =>
    s.raw ? s.html : sectionHtml(s.icon ?? '•', s.title ?? '', s.html ?? '', { key: s.id ?? '' })
  ).join('');

  let fallback = '';
  if (!sectionsMarkup && cardView.metrics.length) {
    fallback += sectionHtml('📊', 'Metrics', `<div class="needs-grid">${cardView.metrics.map((m) => metricBarHtml(m)).join('')}</div>`);
  }
  if (!sectionsMarkup && cardView.actions.length) {
    fallback += sectionHtml('🔧', 'Actions', `${renderCardActions(cardView.actions, { view, survivorId, showDisabledReasons: true })}${mutedHtml('Buttons add a command to the editor; nothing runs until you press Run.')}`);
  }
  if (!sectionsMarkup && !fallback && cardView.codeExamples.length) {
    fallback += sectionHtml('⌨', 'Code', renderCodeExamples(cardView.codeExamples, { view, survivorId }));
  }
  if (!sectionsMarkup && !fallback && (cardView.severity === 'empty' || cardView.severity === 'loading')) {
    fallback = `<div class="uc-empty">${esc(cardView.notice?.text || cardView.subtitle || 'No details available.')}</div>`;
  }
  return `${noticeHtml}${tabHtml}${sectionsMarkup || fallback}`;
}

export function renderCardShell(cardView, opts = {}) {
  const header = opts.showHeader === false ? '' : renderCardHeader(cardView);
  const body = renderCardBody(cardView, opts);
  return `<div class="uc-card uc-kind-${esc(cardView.kind)} uc-state-${esc(cardView.severity)}" data-card-kind="${esc(cardView.kind)}" data-card-id="${esc(cardView.id)}">${header}${body}</div>`;
}
