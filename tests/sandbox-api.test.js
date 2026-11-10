import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defs, sandbox, newSim } from './helpers.js';
import { createSandbox, validateSource } from '../src/modules/sandbox/index.js';
import { normalizeCall, buildCommand, describeApi } from '../src/modules/api/index.js';

const view = () => newSim().studentView();
const run = (code, seed = 1, sb = sandbox) => sb.run({ code, view: view(), seed });

test('api: every command has a documented contract; arguments are validated', () => {
  const api = describeApi();
  assert.equal(api.version, 1);
  for (const c of api.commands) assert.ok(c.signature && c.doc, c.name);
  assert.deepEqual(buildCommand('survivor_1', { name: 'gather', args: ['wood', 5] }), { apiVersion: 1, type: 'gather', actorId: 'survivor_1', params: { resource: 'wood', amount: 5 } });
  assert.deepEqual(normalizeCall('repair', [{ id: 'fence', health: 20 }]), { name: 'repair', args: ['fence'] });
  for (const bad of [['gather', []], ['gather', ['wood', 99]], ['gather', ['wood', 1.5]], ['moveTo', [1]], ['rest', [0]], ['eat', [1]], ['repair', [42]], ['hack', []], ['constructor', []]]) {
    assert.throws(() => normalizeCall(...bad), (e) => ['INVALID_ARGUMENT', 'UNKNOWN_COMMAND'].includes(e.code), JSON.stringify(bad));
  }
});

test('sandbox: learner code produces commands as plain data (Clock A) and never touches state', async () => {
  const r = await run('survivor.gather("wood", 5); survivor.rest(); console.log("hi", survivor.needs.energy, base.wood);');
  assert.equal(r.ok, true);
  assert.deepEqual(r.calls.map((c) => c.name), ['gather', 'rest']);
  assert.deepEqual(r.logs, ['hi 90 0']);
});

test('sandbox: reads are frozen — direct mutation of state is impossible', async () => {
  for (const code of [
    'survivor.needs.energy = 100;', 'base.wood = 999;', 'fence.health = 100;', 'survivor.attributes.strength = 99;',
    'survivor.x = 0;', 'nodes[0].amount = 1e9;', 'survivors.push(1);', 'base.reserved.wood = 5;',
  ]) {
    const r = await run(code);
    assert.equal(r.ok, false, code);
    assert.equal(r.error.code, 'RUNTIME_ERROR', code);
    assert.deepEqual(r.calls, [], 'no commands survive an error');
  }
});

test('sandbox: infinite loop is killed by the time limit', async () => {
  const r = await run('while (true) {}', 1, createSandbox({ timeoutMs: 300 }));
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'EXECUTION_TIMEOUT');
});

test('sandbox: command budget bounds unbounded command generation', async () => {
  const r = await run('for (let i = 0; i < 100000; i++) survivor.rest();', 1, createSandbox({ maxCommands: 50 }));
  assert.equal(r.error.code, 'COMMAND_BUDGET_EXCEEDED');
});

test('sandbox: syntax and runtime errors are reported with codes', async () => {
  assert.equal((await run('survivor.gather(')).error.code, 'SYNTAX_ERROR');
  assert.equal((await run('nothing.here()')).error.code, 'RUNTIME_ERROR');
  assert.equal((await run('survivor.fly()')).error.code, 'RUNTIME_ERROR');
  assert.equal((await run('survivor.gather("wood", 999)')).error.code, 'INVALID_ARGUMENT');
});

test('sandbox: forbidden constructs are blocked statically with line numbers', async () => {
  for (const code of [
    'eval("1")', 'new Function("return 1")', 'globalThis.x = 1', 'process.exit()', 'fetch("http://x")', 'import("fs")',
    '(()=>{}).constructor("return this")()', 'x.__proto__', 'Date.now()', 'await 1', 'setTimeout(()=>{},1)', 'ev\\u0061l(1)',
  ]) {
    const r = await run(code);
    assert.equal(r.error?.code, 'SAFETY_VIOLATION', code);
    assert.ok(r.violations.length > 0);
  }
  assert.equal(validateSource('// ok\nsurvivor.rest();').ok, true);
  assert.equal(validateSource('a\nb\neval(1)').violations[0].line, 3);
  assert.equal(validateSource('x'.repeat(10001)).ok, false);
});

test('sandbox: hardening blocks the Function-constructor escape even if the static check is bypassed', async () => {
  // Built without any forbidden word appearing literally.
  const code = 'const k = "con" + "structor"; const F = (() => 1)[k]; if (F) { survivor.rest(); } else { console.log("blocked"); }';
  const r = await run(code);
  assert.equal(r.ok, true);
  assert.deepEqual(r.logs, ['blocked']);
  assert.equal(r.calls.length, 0);
});

test('sandbox: Math.random is seeded, Date is unavailable => learner code is deterministic', async () => {
  const code = 'console.log(Math.random(), Math.random());';
  const a = await run(code, 5); const b = await run(code, 5); const c = await run(code, 6);
  assert.deepEqual(a.logs, b.logs);
  assert.notDeepEqual(a.logs, c.logs);
});

test('sandbox: each run is isolated — nothing leaks between runs', async () => {
  await run('base.leak = 1;').catch(() => {});
  const r = await run('console.log(typeof base.leak, typeof survivor.leak);');
  assert.deepEqual(r.logs, ['undefined undefined']);
});
