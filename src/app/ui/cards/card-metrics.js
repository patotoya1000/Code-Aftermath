// Shared metric, bar, pill, and key-value components for unified cards (presentation only).
import { esc, cap, pct, toneFor } from './card-state.js';

export function metricBarHtml({ label, value, max = 100, displayValue = null, tone = null } = {}) {
  const p = pct(value, max);
  const cls = tone || toneFor(p);
  const shown = displayValue !== null && displayValue !== undefined ? String(displayValue) : String(Math.round(Number(value ?? 0)));
  return `<div class="need-row"><div class="label">${esc(cap(label))}</div><div class="bar-flex"><div class="bar-fill ${esc(cls)}" style="width:${p}%"></div></div><div class="value">${esc(shown)}</div></div>`;
}

export function metricRowHtml(label, value, { tone = '' } = {}) {
  const cls = tone ? ` class="uc-val ${esc(tone)}"` : ' class="uc-val"';
  return `<div class="uc-metric-row"><span class="uc-label">${esc(label)}</span><span${cls}>${esc(value)}</span></div>`;
}

export function statusPillHtml(text, tone = '') {
  const cls = tone ? `status-pill uc-pill-${esc(tone)}` : 'status-pill';
  return `<span class="${cls}">${esc(text)}</span>`;
}

export function kvGridHtml(items = []) {
  if (!items.length) return '';
  return `<div class="attrs-grid">${items.map(({ label, value, title = '' }) =>
    `<div class="attr-cell"${title ? ` title="${esc(title)}"` : ''}><span class="attr-name">${esc(label)}</span><span class="attr-val">${esc(value)}</span></div>`
  ).join('')}</div>`;
}

export function mutedHtml(text) {
  return `<span class="uc-muted" style="color:var(--muted);font-size:11px;">${esc(text)}</span>`;
}
