import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defs, sandbox, newSim } from './helpers.js';
import { COMMANDS, READ_SURFACE, describeCodebook, searchCodebook, findEntry, entryForCommand } from '../src/modules/api/index.js';
import { COMMAND_BOOK, READS, OUTCOMES } from '../src/modules/api/codebook-data.js';
import { FailureReason, StopReason } from '../src/modules/actions/index.js';
import { createApp } from '../src/app/index.js';

const book = describeCodebook();

test('codebook: every API command has an entry built from the API text, and no entry is invented', () => {
  assert.deepEqual(Object.keys(COMMAND_BOOK).sort(), Object.keys(COMMANDS).sort(), 'COMMAND_BOOK and COMMANDS must list the same commands');
  for (const [name, c] of Object.entries(COMMANDS)) {
    const e = entryForCommand(book, name);
    assert.ok(e, name);
    assert.equal(e.signature, c.signature); assert.equal(e.summary, c.doc); assert.equal(e.documented, true, `${name} lacks curated Codebook metadata`);
    assert.ok(e.effect && e.example, `${name} needs an effect and an example`);
  }
  assert.equal(book.entries.filter((e) => e.kind === 'command').length, Object.keys(COMMANDS).length);
});

test('codebook: every read line of the API is documented exactly once, and every read entry points at a real line', () => {
  for (const line of READ_SURFACE) assert.equal(READS.filter((r) => line.startsWith(r.covers)).length, 1, `read line not covered once: ${line}`);
  for (const r of READS) assert.ok(READ_SURFACE.some((l) => l.startsWith(r.covers)), `stale read entry ${r.slug}`);
  for (const e of book.entries.filter((x) => x.kind === 'read')) assert.ok(e.surface, e.id);
});

test('codebook: links between entries resolve, outcomes are real engine reasons, nothing is mutable', () => {
  for (const e of book.entries) {
    for (const r of e.reads ?? []) assert.ok(findEntry(book, r), `${e.id} → ${r}`);
    for (const o of e.outcomes ?? []) assert.ok(OUTCOMES[o], `${e.id} outcome ${o} has no glossary text`);
    for (const u of e.usedBy ?? []) assert.ok(findEntry(book, u));
  }
  const real = new Set([...Object.values(FailureReason), ...Object.values(StopReason)]);
  for (const code of Object.keys(OUTCOMES)) assert.ok(real.has(code), `${code} is not a stop/failure reason of the action engine`);
  assert.ok(Object.isFrozen(book) && Object.isFrozen(book.entries[0]));
  assert.equal(new Set(book.entries.map((e) => e.id)).size, book.entries.length, 'entry ids are unique');
  const listed = book.sections.flatMap((s) => s.groups.flatMap((g) => g.entryIds));
  assert.deepEqual([...listed].sort(), book.entries.map((e) => e.id).sort(), 'every entry is reachable from the navigation');
});

test('codebook: every example (commands, reads, concepts) passes the real sandbox and Game API', async () => {
  for (const e of book.entries.filter((x) => x.example)) {
    const r = await sandbox.run({ code: e.example, view: newSim().studentView(), seed: 1 });
    assert.equal(r.ok, true, `${e.id}: ${r.error?.message}`);
  }
});

test('codebook: search finds by name, keyword and meaning; empty query lists everything', () => {
  assert.equal(searchCodebook(book, '')?.length, book.entries.length);
  assert.equal(searchCodebook(book, 'gather')[0].id, 'command.gather');
  assert.ok(searchCodebook(book, 'spoil').some((e) => e.id === 'read.perishables'));
  assert.ok(searchCodebook(book, 'if else').some((e) => e.id === 'concept.conditions'));
  assert.ok(searchCodebook(book, 'EXHAUSTED').some((e) => e.id === 'term.EXHAUSTED'));
  assert.deepEqual(searchCodebook(book, 'zzzz-nothing'), []);
  assert.ok(findEntry(book, 'term.EXHAUSTED').usedBy.includes('command.gather'));
});

test('codebook: the app exposes it read-only and a new command can never hide', () => {
  const app = createApp({ defs });
  assert.ok(app.codebook.entries.length > 40);
  assert.equal(app.searchCodebook('rest')[0].kind, 'command');
  assert.equal(app.entryForCommand('nope'), null);
  assert.equal(describeCodebook().entries.length, book.entries.length, 'building twice gives the same book');
});
