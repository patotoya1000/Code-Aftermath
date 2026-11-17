// Codebook view (UI-1): pure functions from the Codebook data to HTML strings. No state, no DOM, no simulation access —
// mainscreen.js owns the panel state. Every string that came from data goes through esc().
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const KIND = { command: 'Command', read: 'Variable (read-only)', concept: 'Concept', term: 'Glossary' };
const firstSentence = (t) => { const s = String(t ?? '').split(/(?<=[.!?])\s/)[0]; return s.length > 96 ? `${s.slice(0, 93)}…` : s; };
const open = (id, cls, inner) => `<button type="button" class="${cls}" data-action="open-book" data-entry="${esc(id)}">${inner}</button>`;
const byId = (book, id) => book.entries.find((e) => e.id === id);

/** Compact "Available API" list for the code panel: commands and variables grouped, or a flat result list for a search. */
export function renderCompactList(book, results = null) {
  const item = (e) => open(e.id, 'api-item', `<span class="sig">${esc(e.kind === 'command' ? e.signature.split('  or')[0] : e.title)}</span><span class="doc">${esc(firstSentence(e.summary))}</span>`);
  if (results) return results.length ? results.map(item).join('') : '<p class="bk-empty">Nothing matches. Try a command name or a word like “wood”.</p>';
  return book.sections.filter((s) => s.id === 'commands' || s.id === 'state').map((s) => s.groups.map((g) => `<div class="api-group">${esc(s.id === 'state' ? `Variables · ${g.title}` : g.title)}</div>${g.entryIds.map((id) => item(byId(book, id))).join('')}`).join('')).join('');
}

/** Left column of the Codebook panel: sections and entries, or search results. */
export function renderNav(book, { results = null, activeId = null } = {}) {
  const row = (e) => open(e.id, `bk-nav-item${e.id === activeId ? ' active' : ''}`, esc(e.title));
  if (results) return results.length ? `<div class="bk-group">${results.length} result(s)</div>${results.map(row).join('')}` : '<p class="bk-empty">Nothing matches.</p>';
  return book.sections.map((s) => `<div class="bk-section">${esc(s.title)}</div>${s.groups.map((g) => `${g.title !== s.title && s.groups.length > 1 ? `<div class="bk-group">${esc(g.title)}</div>` : ''}${g.entryIds.map((id) => row(byId(book, id))).join('')}`).join('')}`).join('');
}

const block = (title, inner) => (inner ? `<h4>${esc(title)}</h4>${inner}` : '');
const list = (items) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '');

/** Right column: one entry in the standard layout (signature, purpose, what happens, needs, parameters, example, reads, outcomes). */
export function renderEntry(book, id) {
  const e = byId(book, id);
  if (!e) return '<p class="bk-empty">Pick an entry on the left, or search above.</p>';
  const chips = (ids) => ids.map((r) => { const t = byId(book, r); return t ? open(r, 'bk-chip', esc(t.title)) : ''; }).join('');
  const parts = [`<h3 class="bk-title"><code>${esc(e.title)}</code></h3><div class="bk-kind">${esc(KIND[e.kind] ?? e.kind)}</div>`];
  if (e.signature && e.kind !== 'term') parts.push(`<pre class="bk-sig">${esc(e.signature)}</pre>`);
  parts.push(`<p class="bk-summary">${esc(e.summary)}</p>`);
  if (e.kind === 'command') {
    parts.push(block('What will happen', `<p>${esc(e.effect)}</p>`));
    parts.push(block('Requires', list(e.requires.map(esc))));
    parts.push(block('Parameters', e.parameters.length ? `<table class="bk-params">${e.parameters.map((p) => `<tr><td><code>${esc(p.name)}</code></td><td>${esc(p.meaning)}</td></tr>`).join('')}</table>` : '<p>None.</p>'));
  }
  if (e.kind === 'read') parts.push(block('From the API', `<p class="bk-surface">${esc(e.surface)}</p><p>You can read this, never assign to it. Change the world with commands.</p>`));
  if (e.kind === 'concept') parts.push(e.body.map((p) => `<p>${esc(p)}</p>`).join(''));
  if (e.example) parts.push(block('Example', `<pre class="bk-example">${esc(e.example)}</pre><button type="button" class="btn-small" data-action="insert-example" data-entry="${esc(e.id)}">Insert in editor</button>`));
  if (e.kind === 'command') {
    parts.push(block('Read before using', chips(e.reads)));
    parts.push(block('Why it can stop', chips(e.outcomes.map((o) => `term.${o}`))));
    parts.push(block('Notes', list(e.notes.map(esc))));
  }
  if (e.kind === 'term') parts.push(block('Which commands can end this way', chips(e.usedBy)));
  return parts.join('');
}
