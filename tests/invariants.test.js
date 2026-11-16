// Architecture invariants (AI_MEMORY/RULES.md §Invariants). Each test protects one rule that future changes must not break.
// Obsolete-model guard, read-only projection, terminal-action finality, event/state agreement, capacity, AI_MEMORY accuracy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ledgerViolations, stockKey } from '../src/modules/resources/index.js';
import { defs, newSim, call } from './helpers.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED'];

test('the turn-based model is not in active code: no startTurn / executeTurn / getTurnInfo / NEXT TURN in src or index.html', () => {
  // scripts/smoke.mjs is excluded on purpose: it asserts the old NEXT TURN button is GONE.
  const files = [...walk(join(ROOT, 'src')), join(ROOT, 'index.html')];
  const re = /startTurn|executeTurn|getTurnInfo|runTurnCode|next[-_ ]?turn|perTurn/i;
  for (const f of files) assert.ok(!re.test(readFileSync(f, 'utf8')), `${relative(ROOT, f)} mentions the obsolete turn model`);
});

test('projections and the inspector are pure reads: calling them never changes the authoritative state hash', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood', 5, 10);
  sim.step(40);
  const before = sim.stateHash();
  const logLen = sim.log.length;
  for (let i = 0; i < 3; i++) { sim.studentView(); sim.renderProjection(); sim.inspector('survivor_1'); sim.getClockInfo(); }
  assert.equal(sim.stateHash(), before);
  assert.equal(sim.log.length, logLen, 'reading emits no events');
});

test('learner-visible and renderer-visible projections cannot be used to change the world', () => {
  const sim = newSim();
  const view = sim.studentView();
  const proj = sim.renderProjection();
  const before = sim.stateHash();
  for (const obj of [view, view.survivor, view.base, view.buildings[0], proj, proj.npcs[0], proj.nodes[0], sim.inspector('survivor_1')]) {
    assert.ok(Object.isFrozen(obj));
    assert.throws(() => { 'use strict'; obj.x = 99; obj.injected = true; }, TypeError);
  }
  view.survivor?.needs && assert.throws(() => { 'use strict'; view.survivor.needs.hunger = 100; }, TypeError);
  assert.equal(sim.stateHash(), before);
  assert.equal(sim.snapshot().survivors.survivor_1.needs.hunger, 80);
});

test('a finished action never runs again: COMPLETED / FAILED / CANCELLED actions keep their end tick, hold no reservation and never re-enter the queue', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood', 5, 5);     // completes (TARGET_REACHED)
  call(sim, 'repair', 'fence');           // will be cancelled
  call(sim, 'repair', 'no_such_building'); // fails when it reaches validation
  sim.step(120);
  sim.submit({ apiVersion: 1, actorId: 'survivor_1', type: 'stop', params: {} });
  const ended = Object.fromEntries(Object.values(sim.snapshot().actions).filter((a) => TERMINAL.includes(a.status)).map((a) => [a.actionId, [a.status, a.endedAtTick]]));
  assert.ok(Object.keys(ended).length >= 2, 'the scenario produced finished actions');
  sim.step(300);
  const st = sim.snapshot();
  for (const [id, [status, endedAtTick]] of Object.entries(ended)) {
    assert.equal(st.actions[id].status, status, `${id} must keep its terminal status`);
    assert.equal(st.actions[id].endedAtTick, endedAtTick, `${id} must not be touched after it ended`);
    assert.deepEqual(st.actions[id].reservationIds, []);
    assert.ok(!st.activeActions.includes(id), `${id} is not in the active queue`);
  }
  assert.deepEqual(ledgerViolations(st), []);
  assert.equal(Object.keys(st.reservations).length, 0, 'nothing is left reserved once everything has ended');
});

test('events agree with authoritative state: gathered events add up to the stock gain and to what the nodes lost', () => {
  const sim = newSim();
  const before = sim.snapshot();
  call(sim, 'gather', 'wood', 7, 30);
  sim.runUntil((s) => s.isIdle(), 1500);
  const st = sim.snapshot();
  const fromEvents = sim.log.ofType('resource.gathered').reduce((t, e) => t + e.amount, 0);
  assert.equal(fromEvents, 30);
  assert.equal(st.ledger[stockKey('wood')].total - before.ledger[stockKey('wood')].total, fromEvents, 'stock gain = sum of events');
  const nodeLoss = Object.values(st.nodes).filter((n) => n.resource === 'wood').reduce((t, n) => t + before.ledger[`node.${n.id}`].total - st.ledger[`node.${n.id}`].total, 0);
  assert.equal(nodeLoss, fromEvents, 'node loss = sum of events');
  // every terminal action has exactly one matching terminal event
  for (const a of Object.values(st.actions).filter((x) => TERMINAL.includes(x.status))) {
    const hits = sim.log.ofType(`action.${a.status.toLowerCase()}`).filter((e) => e.actionId === a.actionId);
    assert.equal(hits.length, 1, `${a.actionId} ${a.status} is announced exactly once`);
  }
});

test('storage capacity is a hard limit: an unbounded gather stops with STORAGE_FULL and never overfills the HQ', () => {
  const sim = newSim('stage1', 3, (st) => { st.survivors.survivor_1.needs.energy = 100; st.survivors.survivor_1.needs.hunger = 100; st.survivors.survivor_1.needs.thirst = 100; });
  const cap = defs.buildings.hq.storage.stone;
  call(sim, 'gather', 'stone', 20);
  sim.runUntil((s) => s.isIdle(), 3000);
  const st = sim.snapshot();
  assert.ok(st.ledger[stockKey('stone')].total <= cap, 'stone never exceeds HQ capacity');
  assert.ok(['STORAGE_FULL', 'NO_TARGET', 'EXHAUSTED'].includes(st.survivors.survivor_1.lastTask?.reason), `stopped with a stop reason, got ${st.survivors.survivor_1.lastTask?.reason}`);
  assert.deepEqual(ledgerViolations(st), []);
});

test('the Game API accepts requests only: every API command maps to an action/policy/hook/stop type the simulation validates, never to a state write', async () => {
  const { COMMANDS } = await import('../src/modules/api/index.js');
  const allowed = new Set([...Object.keys(defs.actions), 'stop', 'policy', 'policy_clear', 'hook_register', 'hook_clear', null]);
  for (const [name, c] of Object.entries(COMMANDS)) assert.ok(allowed.has(c.type), `survivor.${name}() maps to unknown type ${c.type}`);
});

// ---------------------------------------------------------------- AI_MEMORY stays honest ----

const MEMORY = join(ROOT, 'AI_MEMORY');
const REQUIRED = [
  'PROJECT_INDEX.md', 'ARCHITECTURE_INDEX.md', 'IMPLEMENTATION_STATUS.md', 'CHANGELOG.md', 'DECISIONS.md', 'RULES.md',
  ...['NPC', 'BUILDING', 'RESOURCE', 'ITEM', 'ZOMBIE', 'COMBAT', 'NEEDS', 'SKILLS', 'TASK', 'EVENT', 'INVENTORY', 'WORLD'].map((n) => `domains/${n}_INDEX.md`),
  ...['API', 'SIMULATION', 'SANDBOX', 'SAVELOAD', 'REPLAY', 'RENDERER', 'LESSON'].map((n) => `systems/${n}_INDEX.md`),
  'assets/ASSET_INDEX.md', 'assets/SPRITE_INDEX.md', 'assets/NPC_ASSETS.md', 'assets/BUILDING_ASSETS.md', 'assets/RESOURCE_ASSETS.md', 'assets/UI_ASSETS.md',
];
const TEMPLATE = ['Purpose', 'Responsibilities', 'Does NOT Own', 'Core Data', 'State', 'Commands / API', 'Events', 'Dependencies', 'Dependents', 'Source Files', 'UI Files', 'Asset Files', 'Tests', 'Current Status', 'Known Problems', 'Planned Changes', 'Forbidden Changes', 'Related Documentation'];

test('AI_MEMORY has every required file', () => {
  for (const f of REQUIRED) assert.ok(existsSync(join(MEMORY, f)), `AI_MEMORY/${f} is missing`);
});

test('every domain and system memory file follows the standard template and has a non-empty Forbidden Changes section', () => {
  for (const f of REQUIRED.filter((x) => x.startsWith('domains/') || x.startsWith('systems/'))) {
    const text = readFileSync(join(MEMORY, f), 'utf8');
    const headings = [...text.matchAll(/^# (.+)$/gm)].map((m) => m[1].trim());
    for (const h of TEMPLATE) assert.ok(headings.includes(h), `${f} lacks "# ${h}"`);
    const forbidden = text.split(/^# Forbidden Changes\s*$/m)[1]?.split(/^# /m)[0] ?? '';
    assert.ok(forbidden.trim().length > 20, `${f}: Forbidden Changes is empty`);
  }
});

test('AI_MEMORY only points at files that exist (src/, tests/, docs/, scripts/, AI_MEMORY/ paths in backticks)', () => {
  const missing = [];
  for (const file of walk(MEMORY).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/`((?:src|tests|docs|scripts|AI_MEMORY)\/[A-Za-z0-9_./-]+?)`/g)) {
      const p = m[1].replace(/\/$/, '');
      if (!existsSync(join(ROOT, p))) missing.push(`${relative(ROOT, file)} → ${p}`);
    }
  }
  assert.deepEqual(missing, [], 'AI_MEMORY references files that do not exist (update the memory, not the check)');
});

test('AI_MEMORY records every module in the architecture manifest and every test file', async () => {
  const { MODULES } = await import('../src/architecture.js');
  const arch = readFileSync(join(MEMORY, 'ARCHITECTURE_INDEX.md'), 'utf8');
  for (const m of Object.keys(MODULES)) assert.ok(arch.includes(`\`${m}\``), `ARCHITECTURE_INDEX.md does not mention module ${m}`);
  const status = readFileSync(join(MEMORY, 'IMPLEMENTATION_STATUS.md'), 'utf8');
  for (const t of readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js'))) assert.ok(status.includes(t), `IMPLEMENTATION_STATUS.md does not list tests/${t}`);
});
