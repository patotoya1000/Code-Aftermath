// R4b learner event hooks. Each test names the rule it protects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { createFreeSim, submitCalls, createHookRunner, replayTimeline, runAttempt } from '../src/modules/session/index.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { defs, sandbox, newSim } from './helpers.js';

const types = (sim) => sim.log.all().map((e) => e.type);
const fresh = (seed = 1, mutate) => {
  const { sim } = createFreeSim({ defs, seed });
  if (mutate) throw new Error('use fresh() without mutate');
  return sim;
};
async function program(sim, code) {
  const run = await sandbox.run({ code, view: sim.studentView(), seed: sim.seed });
  assert.equal(run.ok, true, JSON.stringify(run.error));
  return submitCalls(sim, run.calls);
}

test('hook: registering is an instant command that costs 1 point and is stored in state', async () => {
  const sim = fresh();
  const out = await program(sim, 'survivor.on("hungry", () => { survivor.eat(); });\nsurvivor.gather("wood", 5, 5);');
  assert.deepEqual(out.map((o) => o.ok), [true, true]);
  assert.equal(out[1].mode, 'replace', 'a hook does not count as the program\'s first task command');
  assert.equal(sim.studentView().survivor.hooks[0], 'hungry');
  assert.equal(sim.getClockInfo().strategyPoints, 8);
});

test('hook: a hungry hook runs in the sandbox, sees the world as it is then, and its command takes effect', async () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.needs.hunger = 31; });
  const runner = createHookRunner({ sim, sandbox, defs });
  await program(sim, 'survivor.on("hungry", () => { if (base.food > 0) survivor.eat(); });\nsurvivor.gather("wood", 5, 40);');
  const food0 = sim.studentView().base.food;
  for (let i = 0; i < 20; i++) { sim.step(10); await runner.pump(); }
  const t = types(sim);
  assert.ok(t.includes('hook.ran'), 'hook ran');
  assert.ok(sim.studentView().base.food < food0, 'she ate');
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('hook: "stopped" hands the handler the reason', async () => {
  const sim = fresh();
  const runner = createHookRunner({ sim, sandbox, defs });
  await program(sim, 'survivor.on("stopped", (e) => { if (e.reason === "TARGET_REACHED") survivor.rest(3); });\nsurvivor.gather("wood", 5, 5);');
  for (let i = 0; i < 12; i++) { sim.step(10); await runner.pump(); }
  const ran = sim.log.all().filter((e) => e.type === 'hook.ran');
  assert.equal(ran.length, 1);
  assert.equal(ran[0].commands, 1);
  assert.ok(types(sim).includes('survivor.rested') || types(sim).includes('action.failed'));
});

test('hook: a runaway or crashing handler is killed, reported once, and switched off', async () => {
  const sim = fresh();
  const runner = createHookRunner({ sim, sandbox: { run: (a) => sandbox.run({ ...a }) }, defs });
  await program(sim, 'survivor.on("stopped", () => { while (true) {} });\nsurvivor.gather("wood", 5, 5);');
  for (let i = 0; i < 10; i++) { sim.step(10); await runner.pump(); }
  assert.equal(sim.log.all().filter((e) => e.type === 'hook.failed').length, 1);
  assert.equal(sim.log.all().find((e) => e.type === 'hook.failed').code, 'EXECUTION_TIMEOUT');
  sim.step(10); await runner.pump();
  assert.equal(sim.log.all().filter((e) => e.type === 'hook.failed').length, 1, 'switched off: no second timeout');
}, { timeout: 20000 });

test('hook: command budget per run, no nested hooks, bad events and long handlers are rejected', async () => {
  const sim = fresh();
  const runner = createHookRunner({ sim, sandbox, defs });
  await program(sim, 'survivor.on("stopped", () => { for (let i = 0; i < 9; i++) survivor.rest(1); });\nsurvivor.gather("wood", 5, 5);');
  for (let i = 0; i < 10; i++) { sim.step(10); await runner.pump(); }
  assert.equal(sim.log.all().find((e) => e.type === 'hook.failed')?.code, 'COMMAND_BUDGET_EXCEEDED');

  const s2 = fresh();
  const r2 = createHookRunner({ sim: s2, sandbox, defs });
  await program(s2, 'survivor.on("stopped", () => { survivor.on("hungry", () => {}); });\nsurvivor.gather("wood", 5, 5);');
  for (let i = 0; i < 10; i++) { s2.step(10); await r2.pump(); }
  assert.equal(s2.log.all().find((e) => e.type === 'hook.failed')?.code, 'HOOK_NOT_ALLOWED');

  const s3 = fresh();
  const out = await program(s3, 'survivor.on("sneezed", () => {});');
  assert.equal(out[0].ok, false);
  assert.equal(out[0].error.code, 'INVALID_COMMAND');
  const long = await sandbox.run({ code: `survivor.on("hungry", () => { /* ${'x'.repeat(700)} */ });`, view: s3.studentView(), seed: 1 });
  assert.equal(submitCalls(s3, long.calls)[0].ok, false);
  await program(s3, 'survivor.on("hungry", () => {});\nsurvivor.off("hungry");');
  assert.deepEqual(s3.studentView().survivor.hooks, []);
});

test('hook: cooldown stops a stopped→gather→stopped loop from running every tick', async () => {
  const sim = fresh();
  const runner = createHookRunner({ sim, sandbox, defs });
  await program(sim, 'survivor.on("stopped", () => { survivor.gather("wood", 1, 1); });\nsurvivor.gather("wood", 1, 1);');
  for (let i = 0; i < 40; i++) { sim.step(5); await runner.pump(); }
  const fired = sim.log.all().filter((e) => e.type === 'hook.ran').length;
  assert.ok(fired >= 1 && fired <= 200 / defs.hooks.limits.cooldownTicks + 1, `fired ${fired}`);
});

test('hook: replay needs no hook code — the timeline reproduces the same world', async () => {
  const scen = structuredClone(defs.scenarios.stage1);
  scen.survivors[0].needs = { hunger: 31, energy: 40 };
  const d2 = createDefinitions({ scenarios: { ...structuredClone(defs.scenarios), needy: scen } });
  const sim = createFreeSim({ defs: d2, scenarioId: 'needy', seed: 4 }).sim;
  const runner = createHookRunner({ sim, sandbox, defs: d2 });
  const run = await sandbox.run({ code: 'survivor.on("hungry", () => { survivor.eat(); });\nsurvivor.on("tired", () => { survivor.rest(10); });\nsurvivor.gather("wood", 5, 60);', view: sim.studentView(), seed: 4 });
  submitCalls(sim, run.calls);
  for (let i = 0; i < 60; i++) { sim.step(10); await runner.pump(); }
  assert.ok(sim.commandTimeline().length > 4, 'hook commands were recorded');
  assert.ok(sim.log.all().some((e) => e.type === 'hook.ran'));
  assert.deepEqual(sim.hooks().map((h) => h.event).sort(), ['hungry', 'tired']);
  const b = replayTimeline({ defs: d2, scenarioId: 'needy', seed: 4, timeline: sim.commandTimeline(), untilTick: sim.tick });
  assert.equal(b.stateHash(), sim.stateHash());
  assert.deepEqual(b.hooks().map((h) => h.event).sort(), ['hungry', 'tired']);
});

test('hook: lessons reject hooks clearly (they run to completion in one go)', async () => {
  const a = await runAttempt({ defs, sandbox, code: 'survivor.on("hungry", () => {});\nsurvivor.gather("wood", 5, 5);', scenarioId: 'stage1', seed: 1 });
  assert.equal(a.commands[0].accepted, false);
  assert.equal(a.commands[0].error.code, 'HOOKS_FREE_PLAY_ONLY');
  assert.equal(a.commands[1].accepted, true);
});
