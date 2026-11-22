// Shared card action insertion, disabled-reason, and copyable code snippet helpers (presentation only).
// Never mutates simulation state; all actions emit data-action="insert" snippets for the sandbox.
import { esc } from './card-state.js';
import { actionButtons as baseActionButtons, addressSurvivor } from '../actions.js';

export { addressSurvivor };

export function collectDisabledReasons(actions = []) {
  return actions
    .filter((a) => !a.enabled && a.reason)
    .map((a) => ({ id: a.id, label: a.label, reason: a.reason }));
}

export function renderCardActions(actions = [], { view, survivorId, showDisabledReasons = false } = {}) {
  if (!actions.length) return '';
  const buttons = baseActionButtons(actions, { view, survivorId });
  if (!showDisabledReasons) return buttons;
  const disabled = collectDisabledReasons(actions);
  if (!disabled.length) return buttons;
  const notes = `<ul class="uc-disabled-reasons">${disabled.map((d) =>
    `<li><strong>${esc(d.label)}:</strong> ${esc(d.reason)}</li>`
  ).join('')}</ul>`;
  return `${buttons}${notes}`;
}

export function renderCodeExamples(examples = [], { view, survivorId } = {}) {
  if (!examples.length) return '';
  return `<div class="uc-code-list">${examples.map((ex) => {
    const raw = survivorId && view ? addressSurvivor(ex.snippet, view, survivorId) : ex.snippet;
    const label = ex.label || raw;
    return `<div class="uc-code-row">
      <code class="uc-code-snippet">${esc(raw)}</code>
      <div class="uc-code-btns">
        <button type="button" class="act-btn" data-action="insert" data-snippet="${esc(raw)}" title="${esc(ex.reason || 'Add to editor')}">${esc(label)}</button>
        <button type="button" class="act-btn uc-copy-btn" data-action="copy" data-snippet="${esc(raw)}" title="Copy snippet to clipboard">Copy</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}
