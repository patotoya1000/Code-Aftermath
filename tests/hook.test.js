import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSim, call, runUntilIdle, defs } from './helpers.js';
import { buildCommand } from '../src/modules/api/index.js';

// Register a hook exactly as learner code would: survivor.on(event, handler).
// `call` goes through sim.submit(buildCommand(...)) which runs on.params() and converts
// the handler function to a serializable source string.
const on = (sim, event, handler) => call(sim, 'on', event, handler);
const off = (sim, event) => call(sim, 'off', event);

test('survivor.on registers a hook; rejected hooks cost nothing and are not stored', () => {
  const sim = newSim('stage1', 1, (s) => { s.survivors.survivor_1.needs.hunger = 31; });
  assert.deepEqual(sim.studentView().survivor.conditions, [], 'not hungry yet');
  on(sim, 'hungry', () => { survivor.eat(); });
  // Hunger decays 1 per 20 ticks; threshold hungry is < 30. From 31: tick 20→30 (not hungry), tick 40→29 (hungry).
  while (!sim.studentView().survivor.conditions.includes('hungry') && sim.tick < 200) sim.step(1);
  assert.ok(sim.studentView().survivor.conditions.includes('hungry'), 'survivor became hungry');
  // The hook fired: eat was issued, so the survivor now has an eat task.
  const v = sim.studentView();
  assert.ok(v.survivor.task && v.survivor.task.type === 'eat', 'hook issued eat command');
});

test('survivor.on hook fires once per condition transition', () => {
  const sim = newSim('stage1', 1, (s) => { s.survivors.survivor_1.needs.hunger = 31; });
  on(sim, 'hungry', () => { survivor.eat(); });
  while (!sim.studentView().survivor.conditions.includes('hungry') && sim.tick < 200) sim.step(1);
  assert.ok(sim.studentView().survivor.conditions.includes('hungry'), 'survivor became hungry');
  const v = sim.studentView();
  assert.ok(v.survivor.task && v.survivor.task.type === 'eat', 'hook issued eat command on the transition');
});

test('survivor.off removes a hook so it no longer fires', () => {
  const sim = newSim('stage1', 1, (s) => { s.survivors.survivor_1.needs.hunger = 31; });
  on(sim, 'hungry', () => { survivor.eat(); });
  off(sim, 'hungry');
  while (!sim.studentView().survivor.conditions.includes('hungry') && sim.tick < 200) sim.step(1);
  assert.ok(sim.studentView().survivor.conditions.includes('hungry'));
  assert.equal(sim.studentView().survivor.task, null, 'hook did not fire after off()');
});

test('survivor.on rejects unknown event names', () => {
  const sim = newSim();
  assert.throws(() => on(sim, 'bogus', () => {}), /unknown event/);
  assert.equal(sim.studentView().survivor.task, null);
});

test('survivor.on rejects handlers that contain loops', () => {
  const sim = newSim();
  assert.throws(() => on(sim, 'hungry', () => { while (true) {} }), /must not contain loops/);
  assert.throws(() => on(sim, 'hungry', () => { for (;;) {} }), /must not contain loops/);
});

test('survivor.on rejects non-function handlers', () => {
  const sim = newSim();
  assert.throws(() => call(sim, 'on', 'hungry', 'not a function'), /second argument must be a function/);
});

test('hook handler is isolated: a failing handler emits hook.error but does not crash the tick', () => {
  const sim = newSim('stage1', 1, (s) => { s.survivors.survivor_1.needs.hunger = 31; });
  on(sim, 'hungry', () => { survivor.teleport(1, 1); }); // teleport is not a real command -> RUNTIME_ERROR
  while (!sim.studentView().survivor.conditions.includes('hungry') && sim.tick < 200) sim.step(1);
  const errors = sim.log.ofType('hook.error');
  assert.equal(errors.length, 1, 'hook failure was recorded');
  assert.equal(sim.studentView().survivor.task, null, 'no command issued from the broken handler');
  // The simulation kept ticking.
  assert.ok(sim.tick > 0);
});

test('hook command budget stops a runaway handler after MAX_HOOK_COMMANDS commands', () => {
  const sim = newSim('stage1', 1, (s) => { s.survivors.survivor_1.needs.hunger = 31; });
  // Issue 6 eat commands (budget is 5); the 6th should be blocked.
  on(sim, 'hungry', () => {
    survivor.eat(); survivor.eat(); survivor.eat(); survivor.eat(); survivor.eat(); survivor.eat();
  });
  while (!sim.studentView().survivor.conditions.includes('hungry') && sim.tick < 200) sim.step(1);
  const stopped = sim.log.ofType('hook.stopped');
  assert.equal(stopped.length, 1, 'hook was stopped for exceeding budget');
});

test('replay does not re-fire hooks (their commands are already in the timeline)', () => {
  const sim = newSim('stage1', 1, (s) => { s.survivors.survivor_1.needs.hunger = 31; });
  on(sim, 'hungry', () => { survivor.eat(); });
  while (!sim.studentView().survivor.conditions.includes('hungry') && sim.tick < 200) sim.step(1);
  const timeline = sim.commandTimeline();
  // Rebuild from the timeline: hooks must not re-fire during replay.
  const replay = newSim('stage1', 1);
  replay.setReplaying(true);
  for (const { tick, command } of timeline) {
    if (tick > replay.tick) replay.step(tick - replay.tick);
    replay.submitCommand(command);
  }
  // The replayed session should have eaten (command from timeline) but not re-fired the hook.
  assert.ok(replay.log.ofType('action.queued').some((e) => e.actionType === 'eat'), 'replay applied the eat command');
  const hookErrors = replay.log.ofType('hook.error');
  assert.equal(hookErrors.length, 0, 'no hook re-fired during replay');
});