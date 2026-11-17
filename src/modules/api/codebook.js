import { API_VERSION } from '../../kernel/index.js';
import { COMMANDS, READ_SURFACE } from './v1.js';
import { COMMAND_BOOK, COMMAND_GROUPS, READS, READ_GROUPS, READ_ALIASES, OUTCOMES, CONCEPTS } from './codebook-data.js';

// The Codebook is a VIEW over the Game API, never a second API (docs/game/19-codebook-and-ui-display.md §3).
// Commands come from COMMANDS (signature + doc are the API's own text), reads from READ_SURFACE (the authoritative line is
// kept on each entry). Pure and state-free; nothing here can reach the simulation.

const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

/** Build the Codebook: `{ version, sections: [{ id, title, groups: [{ id, title, entryIds }] }], entries: [...] }`. */
export function describeCodebook() {
  const entries = [];
  const add = (e) => { entries.push(e); return e.id; };

  // --- commands (every COMMANDS key is shown, even if its curated metadata is missing: the API is never hidden) ---
  const commandIds = {};
  for (const [name, c] of Object.entries(COMMANDS)) {
    const m = COMMAND_BOOK[name] ?? {};
    const group = COMMAND_GROUPS.some((g) => g.id === m.group) ? m.group : 'tasks';
    const id = add({
      id: `command.${name}`, kind: 'command', group, name, title: `survivor.${name}()`, signature: c.signature, summary: c.doc,
      effect: m.effect ?? '', requires: m.requires ?? [], parameters: (m.parameters ?? []).map(([n, meaning]) => ({ name: n, meaning })),
      example: m.example ?? null, reads: (m.reads ?? []).map((r) => READ_ALIASES[r] ?? r), outcomes: m.outcomes ?? [], notes: m.notes ?? [],
      keywords: m.keywords ?? [], instant: c.instant === true, documented: Boolean(COMMAND_BOOK[name]),
    });
    (commandIds[group] ??= []).push(id);
  }

  // --- reads ---
  const readIds = {};
  for (const r of READS) {
    const line = READ_SURFACE.find((l) => l.startsWith(r.covers)) ?? null;
    const id = add({
      id: `read.${r.slug}`, kind: 'read', group: r.group, title: r.title, signature: r.path, summary: r.summary, example: r.example,
      surface: line, keywords: r.keywords ?? [], readOnly: true,
    });
    (readIds[r.group] ??= []).push(id);
  }

  // --- concepts ---
  const startIds = []; const conceptIds = [];
  for (const c of CONCEPTS) {
    const id = add({ id: `concept.${c.slug}`, kind: 'concept', group: c.section, title: c.title, summary: c.summary, body: c.body ?? [], example: c.example ?? null, keywords: c.keywords ?? [] });
    (c.section === 'start' ? startIds : conceptIds).push(id);
  }

  // --- glossary: stop / failure reasons, with the commands that can end that way (derived, not typed twice) ---
  const termIds = [];
  for (const [code, meaning] of Object.entries(OUTCOMES)) {
    const usedBy = entries.filter((e) => e.kind === 'command' && e.outcomes.includes(code)).map((e) => e.id);
    termIds.push(add({ id: `term.${code}`, kind: 'term', group: 'glossary', title: code, summary: meaning, usedBy, keywords: ['reason', 'stop', 'failed', 'lastTask'] }));
  }

  const sections = [
    { id: 'start', title: 'Getting Started', groups: [{ id: 'start', title: 'Basics', entryIds: startIds }] },
    { id: 'commands', title: 'Commands', groups: COMMAND_GROUPS.filter((g) => commandIds[g.id]).map((g) => ({ id: g.id, title: g.title, entryIds: commandIds[g.id] })) },
    { id: 'state', title: 'Variables & State', groups: READ_GROUPS.filter((g) => readIds[g.id]).map((g) => ({ id: g.id, title: g.title, entryIds: readIds[g.id] })) },
    { id: 'concepts', title: 'Programming Concepts', groups: [{ id: 'concepts', title: 'Ideas', entryIds: conceptIds }] },
    { id: 'glossary', title: 'Glossary', groups: [{ id: 'glossary', title: 'Why a job stopped', entryIds: termIds }] },
  ];
  return deepFreeze({ version: API_VERSION, sections, entries });
}

export const findEntry = (book, id) => book.entries.find((e) => e.id === id) ?? null;

const fields = (e) => [
  [e.title, 5], [e.name ?? '', 5], [e.signature ?? '', 3], [(e.keywords ?? []).join(' '), 3], [e.summary ?? '', 2],
  [e.effect ?? '', 1], [(e.parameters ?? []).map((p) => `${p.name} ${p.meaning}`).join(' '), 1], [(e.body ?? []).join(' '), 1],
];

/** Every word must match somewhere; entries with more important matches come first, ties keep the book's order. */
export function searchCodebook(book, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...book.entries];
  const scored = [];
  book.entries.forEach((e, i) => {
    const fs = fields(e).map(([t, w]) => [t.toLowerCase(), w]);
    let score = 0;
    for (const w of words) {
      const hit = fs.filter(([t]) => t.includes(w)).reduce((s, [, wt]) => s + wt, 0);
      if (!hit) return;
      score += hit;
    }
    scored.push({ e, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.e);
}

/** A rejected call such as gather() → its Codebook entry (UI: rejected-command chips link here). */
export const entryForCommand = (book, name) => findEntry(book, `command.${name}`);
