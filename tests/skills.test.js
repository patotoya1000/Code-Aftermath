import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, types } from './helpers.js';
import { xpMultiplier, awardSkillXp, skillProgress } from '../src/modules/survivors/index.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { buildCommand } from '../src/modules/api/index.js';

const me = (sim) => sim.snapshot().survivors.survivor_1;

test('gathering earns Gathering XP per unit picked up, and a level-up is announced', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood', 5, 25);
  runUntilIdle(sim, 3000);
  const s = me(sim);
  assert.ok(s.progression.xp.gathering >= 25, `xp ${s.progression.xp.gathering}`);
  assert.equal(s.skills.gathering, 1, '20 xp reaches level 1, 50 does not');
  const up = sim.log.all().filter((e) => e.type === 'skill.levelup');
  assert.ok(up.some((e) => JSON.stringify(e).includes('gathering')));
});

test('walking, repairing and eating each train their own skill and nothing else', () => {
  const sim = newSim();
  call(sim, 'moveTo', 'hq'); runUntilIdle(sim);
  call(sim, 'repair', 'hq'); runUntilIdle(sim, 500);
  call(sim, 'eat'); runUntilIdle(sim, 500);
  const s = me(sim);
  assert.ok(s.progression.xp.move > 0 && s.progression.xp.consume > 0, JSON.stringify(s.progression.xp));
  assert.equal(s.progression.xp.gathering ?? 0, 0);
});

test('XP only comes from simulation work: attributes never change and idle time teaches nothing', () => {
  const sim = newSim();
  const before = structuredClone(me(sim).attributes);
  sim.step(300);
  assert.deepEqual(me(sim).attributes, before);
  assert.deepEqual(me(sim).progression.xp, {});
  call(sim, 'gather', 'wood', 5, 10); runUntilIdle(sim, 2000);
  assert.deepEqual(me(sim).attributes, before, 'repeating a job does not raise attributes');
});

test('diminishing returns: full XP below fullUntil, shrinking to the floor, floor beyond', () => {
  const aw = defs.progression.awards.gather;
  assert.equal(xpMultiplier(defs, aw, 0), 1);
  assert.equal(xpMultiplier(defs, aw, aw.fullUntil), 1);
  const mid = xpMultiplier(defs, aw, Math.ceil((aw.fullUntil + aw.teachesUpTo) / 2));
  assert.ok(mid < 1 && mid > defs.progression.floor);
  assert.equal(xpMultiplier(defs, aw, aw.teachesUpTo), defs.progression.floor);
  assert.equal(xpMultiplier(defs, aw, 10), defs.progression.floor);
  for (let l = 1; l <= 10; l++) assert.ok(xpMultiplier(defs, aw, l) <= xpMultiplier(defs, aw, l - 1), 'never increases with level');
});

test('a skill can never pass the top level, and the top level stops earning', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.skills.gathering = 10; st.survivors.survivor_1.progression.xp.gathering = 1250; });
  const emitted = [];
  const ctx = { defs, emit: (t, d) => emitted.push([t, d]) };
  const s = me(sim);
  awardSkillXp(ctx, s, 'gather', 1_000_000);
  assert.equal(s.skills.gathering, 10);
  assert.equal(s.progression.xp.gathering, 1250);
  assert.equal(emitted.length, 0);
  const fresh = me(newSim());
  awardSkillXp(ctx, fresh, 'gather', 1_000_000);
  assert.equal(fresh.skills.gathering, 10, 'a huge award is capped at the top level');
});

test('skills change how the work goes: a higher Gathering level is faster, and the load is never above what was asked', () => {
  const time = (lvl) => {
    const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.skills.gathering = lvl; });
    call(sim, 'gather', 'wood', 5, 15);
    runUntilIdle(sim, 3000);
    return sim.tick;
  };
  assert.ok(time(8) < time(0), 'level 8 finishes sooner than level 0');
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.skills.gathering = 10; });
  call(sim, 'gather', 'wood', 5, 5);
  runUntilIdle(sim, 2000);
  assert.equal(sim.studentView().base.wood, 5, 'exactly what was asked, no bonus unit');
});

test('learner view: survivor.skillProgress reports level, xp and the next threshold', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood', 5, 10); runUntilIdle(sim, 2000);
  const p = sim.studentView().survivor.skillProgress;
  assert.equal(p.gathering.level, 0);
  assert.equal(p.gathering.next, defs.progression.thresholds[1]);
  assert.ok(p.gathering.xp >= 10);
  assert.deepEqual(Object.keys(p).sort(), Object.keys(sim.studentView().survivor.skills).sort());
  assert.throws(() => { sim.studentView().survivor.skillProgress.gathering.xp = 999; }, 'frozen');
});

test('determinism: same play, same XP, same hash', () => {
  const run = () => { const s = newSim('stage1', 5); call(s, 'gather', 'wood', 5, 30); s.step(900); return [s.stateHash(), me(s).progression.xp.gathering]; };
  assert.deepEqual(run(), run());
});

test('definitions validate the progression table', () => {
  assert.throws(() => createDefinitions({ progression: { ...defs.progression, thresholds: [0, 10, 5] } }), /thresholds/);
  assert.throws(() => createDefinitions({ progression: { ...defs.progression, awards: { x: { skill: 'nope', xp: 1, fullUntil: 0, teachesUpTo: 2 } } } }), /unknown skill/);
  assert.throws(() => createDefinitions({ progression: { ...defs.progression, awards: { x: { skill: 'move', xp: 1, fullUntil: 3, teachesUpTo: 2 } } } }), /teachesUpTo/);
});
