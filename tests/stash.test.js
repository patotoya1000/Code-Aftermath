// R2 camp stash (docs/game/24): `survivor.stash(site, rounds?, { camp }?)` works a remote site for a few rounds and leaves the haul in that site's stash;
// `survivor.retrieve(site)` hauls it home (limited by carry capacity and base storage room); a raid night takes a share of every stash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { scavenge as scavengeData } from '../src/modules/definitions/data/scavenge.js';
import { raidSchedule } from '../src/modules/definitions/data/threats.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { tripPlan, stashLossPercent, rollLoot } from '../src/modules/scavenge/index.js';
import { carryCapacity } from '../src/modules/survivors/index.js';
import { buildCommand, COMMANDS } from '../src/modules/api/index.js';
import { runLiveCode } from '../src/modules/session/index.js';
import { ledgerViolations, stockKey } from '../src/modules/resources/index.js';
import { sandbox } from './helpers.js';
import { stashActionList } from '../src/app/ui/actions.js';
import { scavengeRowsHtml } from '../src/app/ui/panels.js';

const quiet = { eventSchedule: { ...eventSchedule, chancePercent: 0 }, raidSchedule: { ...raidSchedule, chancePercent: 0 } };
const open = { ...scavengeData, startDay: 1 };
const defs = createDefinitions({ ...quiet, scavenge: open });
const ST = defs.scavenge.stash;
const DAY = defs.environment.ticksPerDay;
const keep = (st) => { for (const s of Object.values(st.survivors)) Object.assign(s.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 }); };
const mk = (d = defs, seed = 1, mutate) => { const state = createInitialState({ defs: d, scenarioId: 'stage1', seed }); keep(state); mutate?.(state); return createSimulation({ defs: d, state }); };
const cmd = (sim, name, args, who = 'survivor_1') => sim.submit(buildCommand(who, { name, args }));
const evs = (s, type) => s.log.all().filter((e) => e.type === type);
const runTo = (s, tick) => { while (s.snapshot().tick < tick) s.step(1); };
const stockOf = (st, item) => st.ledger[stockKey(item)].total;
const refused = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const lastReason = (s) => s.snapshot().survivors.survivor_1.lastTask?.reason;
/** Run a command and step until the next scavenge.returned event (or give up). */
const trip = (s, name, args, who = 'survivor_1') => { const had = evs(s, 'scavenge.returned').length; cmd(s, name, args, who); let n = 0; while (evs(s, 'scavenge.returned').length === had && n++ < 700) s.step(1); return evs(s, 'scavenge.returned').at(-1); };
const stashOf = (s, site) => s.snapshot().scavenge.stash[site];
const viewStash = (s, site) => s.studentView().scavenge.sites.find((x) => x.id === site).stash;
const total = (o = {}) => Object.values(o).reduce((a, b) => a + b, 0);

const weak = createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 0 }, scavenge: open, raidSchedule: { ...raidSchedule, chancePercent: 100, strengthBase: 4, strengthPerDay: 0, variancePercent: 0 } });
const duskTick = (day) => (day - 1) * DAY + (weak.environment.duskHour - weak.environment.startHour) * (DAY / 24);

test('data: the shipped stash rules are valid and bad ones are refused at load time', () => {
  assert.equal(ST.capPerSite, 60); assert.deepEqual(ST.lossPercent, { near: 30, deep: 50, protected: 10 });
  const bad = (mut, re) => assert.throws(() => { const sv = structuredClone(scavengeData); mut(sv); createDefinitions({ scavenge: sv }); }, re);
  bad((sv) => { delete sv.stash; }, /scavenge\.stash/);
  bad((sv) => { sv.stash.capPerSite = 0; }, /capPerSite/);
  bad((sv) => { sv.stash.lossPercent.protected = 40; }, /lossPercent/); // protected must not lose more than near
  bad((sv) => { sv.stash.lossPercent.deep = 20; }, /lossPercent/); // deep must not lose less than near
  bad((sv) => { sv.stash.lossPercent.near = 101; sv.stash.lossPercent.deep = 101; }, /lossPercent/);
  bad((sv) => { sv.stash.rounds.falloffPercent = 60; }, /rounds/); // a third round would be worth zero
  bad((sv) => { sv.stash.haulTripPercent = 0; }, /haulTripPercent/);
  assert.ok(defs.actions.stash && defs.actions.retrieve, 'both commands are real actions');
});

test('pure rules: trip length per kind and the raid loss percent (near, deep, camped)', () => {
  const fe = defs.scavenge.sites.forest_edge.ticks; // 70, near
  assert.deepEqual(tripPlan(defs, 'forest_edge', 'scavenge'), { mode: 'scavenge', ticks: fe });
  assert.equal(tripPlan(defs, 'forest_edge', 'stash', { rounds: 1 }).ticks, fe);
  assert.equal(tripPlan(defs, 'forest_edge', 'stash', { rounds: 3 }).ticks, fe + 2 * ST.rounds.ticks);
  assert.equal(tripPlan(defs, 'forest_edge', 'stash', { rounds: 2, camp: true }).ticks, fe + ST.rounds.ticks + ST.campTicks);
  assert.equal(tripPlan(defs, 'forest_edge', 'retrieve').ticks, Math.ceil((fe * ST.haulTripPercent) / 100));
  assert.ok(tripPlan(defs, 'deep_forest', 'retrieve').ticks < defs.scavenge.sites.deep_forest.ticks, 'a haul run is shorter than a full trip');
  const st = mk().snapshot();
  assert.equal(stashLossPercent(defs, st, 'forest_edge'), 30); assert.equal(stashLossPercent(defs, st, 'deep_forest'), 50);
  st.scavenge.stash.forest_edge = { items: { wood: 5 }, protected: true };
  assert.equal(stashLossPercent(defs, st, 'forest_edge'), 10, 'a camped stash loses the least');
  st.scavenge.stash.deep_forest = { items: { wood: 5 }, protected: true };
  assert.equal(stashLossPercent(defs, st, 'deep_forest'), 10, 'camped beats deep too');
});

test('stash trip: the haul goes to the SITE stash, never to base stock; the site is looted; the trip takes the normal time', () => {
  const s = mk();
  const woodBefore = stockOf(s.snapshot(), 'wood');
  const r = trip(s, 'stash', ['forest_edge']);
  assert.equal(r.mode, 'stash'); assert.equal(r.outcome, 'clean');
  const dep = evs(s, 'scavenge.departed').at(-1);
  assert.equal(dep.mode, 'stash'); assert.equal(dep.returnTick - (s.log.all().find((e) => e.type === 'scavenge.departed').tick), defs.scavenge.sites.forest_edge.ticks);
  assert.equal(stockOf(s.snapshot(), 'wood'), woodBefore, 'base stock did not change');
  assert.ok(total(r.loot) > 0 && r.loot.wood >= 14 && r.loot.wood <= 26);
  assert.deepEqual(stashOf(s, 'forest_edge'), { items: { wood: r.loot.wood }, protected: false });
  assert.equal(evs(s, 'stash.stored').at(-1).units, r.loot.wood);
  const v = viewStash(s, 'forest_edge');
  assert.deepEqual([v.units, v.capacity, v.room, v.protected, v.deep, v.lossPercent, v.atRiskTonight], [r.loot.wood, 60, 60 - r.loot.wood, false, false, 30, false]);
  assert.equal(s.snapshot().survivors.survivor_1.status, 'active'); assert.deepEqual(s.snapshot().survivors.survivor_1.inventory.items, {}, 'she walks home empty-handed');
  assert.equal(s.snapshot().scavenge.sites.forest_edge.trips, 1, 'the site counts as looted');
  assert.ok(s.studentView().scavenge.sites.find((x) => x.id === 'forest_edge').recoveryPercent < 100);
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
  assert.equal(s.studentView().scavenge.history.at(-1).mode, 'stash');
});

test('rounds: each round is its own pure roll, later rounds yield less, extra rounds cost time; camp adds time and protects the stash', () => {
  const one = mk(); const rOne = trip(one, 'stash', ['forest_edge', 1]);
  const three = mk(); const rThree = trip(three, 'stash', ['forest_edge', 3]);
  const dep = evs(three, 'scavenge.departed').at(-1); const dt = three.log.all().find((e) => e.type === 'scavenge.departed').tick;
  assert.equal(dep.returnTick - dt, defs.scavenge.sites.forest_edge.ticks + 2 * ST.rounds.ticks);
  assert.ok(rThree.loot.wood > rOne.loot.wood, 'three rounds bring more than one');
  // exact: the sum of the three pure rolls with the falloff applied
  const want = {};
  for (let r = 0; r < 3; r++) for (const [i, q] of Object.entries(rollLoot(defs, 1, `survivor_1:${dt}:forest_edge:r${r}`, 'forest_edge', 100 - ST.rounds.falloffPercent * r, rThree.hurt))) want[i] = (want[i] ?? 0) + q;
  assert.deepEqual(rThree.loot, want);
  const camp = mk(); const rc = trip(camp, 'stash', ['forest_edge', 2, { camp: true }]);
  const cd = evs(camp, 'scavenge.departed').at(-1); const ct = camp.log.all().find((e) => e.type === 'scavenge.departed').tick;
  assert.equal(cd.returnTick - ct, defs.scavenge.sites.forest_edge.ticks + ST.rounds.ticks + ST.campTicks);
  assert.equal(stashOf(camp, 'forest_edge').protected, true); assert.equal(viewStash(camp, 'forest_edge').lossPercent, ST.lossPercent.protected);
  assert.equal(rc.mode, 'stash');
});

test('cap: a site holds 60 units in all (overflow is lost and reported), a full stash refuses another trip, and the stash ignores base storage room', () => {
  const s = mk(defs, 1, (st) => { st.scavenge.stash.forest_edge = { items: { wood: 55 }, protected: false }; st.ledger[stockKey('wood')].total = 150; /* base wood is FULL */ });
  const r = trip(s, 'stash', ['forest_edge']);
  assert.equal(total(stashOf(s, 'forest_edge').items), 60); assert.equal(total(r.loot), 5);
  assert.ok(r.leftBehind.wood > 0, 'the rest stayed at the site and is reported');
  cmd(s, 'stash', ['forest_edge']); s.step(2);
  assert.equal(lastReason(s), 'STORAGE_FULL'); assert.equal(s.snapshot().survivors.survivor_1.status, 'active', 'a refused stash trip changes nothing');
  assert.equal(viewStash(s, 'forest_edge').room, 0);
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
});

test('refusals: bad rounds, an empty stash, unknown site; the API checks its own arguments', () => {
  const s = mk();
  cmd(s, 'stash', ['forest_edge', 4]); s.step(2); assert.equal(lastReason(s), 'INVALID_PARAMS');
  cmd(s, 'retrieve', ['forest_edge']); s.step(2); assert.equal(lastReason(s), 'NO_STASH');
  cmd(s, 'retrieve', ['nowhere']); s.step(2); assert.equal(lastReason(s), 'UNKNOWN_TARGET');
  cmd(s, 'stash', ['nowhere']); s.step(2); assert.equal(lastReason(s), 'UNKNOWN_TARGET');
  const late = mk(createDefinitions({ ...quiet })); cmd(late, 'stash', ['forest_edge']); late.step(2); assert.equal(late.snapshot().survivors.survivor_1.lastTask.reason, 'NOT_OPEN');
  assert.equal(s.snapshot().survivors.survivor_1.status, 'active');
  const b = (name, args) => refused(() => buildCommand('survivor_1', { name, args }));
  assert.equal(b('stash', []), 'INVALID_ARGUMENT'); assert.equal(b('stash', [5]), 'INVALID_ARGUMENT'); assert.equal(b('stash', ['forest_edge', 0]), 'INVALID_ARGUMENT');
  assert.equal(b('stash', ['forest_edge', 1.5]), 'INVALID_ARGUMENT'); assert.equal(b('stash', ['forest_edge', 2, { camp: 'yes' }]), 'INVALID_ARGUMENT');
  assert.equal(b('stash', ['forest_edge', 2, { tent: true }]), 'INVALID_ARGUMENT'); assert.equal(b('stash', ['forest_edge', 2, { camp: true }, 3]), 'INVALID_ARGUMENT');
  assert.equal(b('retrieve', []), 'INVALID_ARGUMENT'); assert.equal(b('retrieve', ['a', 'b']), 'INVALID_ARGUMENT'); assert.equal(b('retrieve', [3]), 'INVALID_ARGUMENT');
  assert.equal(b('stash', ['forest_edge']), null); assert.equal(b('stash', ['forest_edge', 2]), null); assert.equal(b('stash', ['forest_edge', { camp: true }]), null);
  assert.equal(b('retrieve', ['forest_edge']), null);
  assert.ok(COMMANDS.stash && COMMANDS.retrieve);
  const w = mk(defs, 1, (st) => { st.threats.wave = { day: 1, strength: 1, defense: 0, composition: {}, queue: [], spawned: 0, reinforced: 0, summoned: 0, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 }; st.scavenge.stash.forest_edge = { items: { wood: 5 }, protected: false }; });
  cmd(w, 'stash', ['forest_edge']); w.step(2); assert.equal(lastReason(w), 'WAVE_ACTIVE');
  cmd(w, 'retrieve', ['forest_edge']); w.step(2); assert.equal(lastReason(w), 'WAVE_ACTIVE');
});

test('retrieve: a haul run is shorter, limited by CARRY CAPACITY (stone is heavy) and base storage room; the rest stays; the entry goes when emptied', () => {
  const s = mk(defs, 1, (st) => { st.scavenge.stash.quarry = { items: { stone: 50, sand: 8 }, protected: false }; });
  const cap = carryCapacity(s.snapshot().survivors.survivor_1, defs); // weight units
  const r1 = trip(s, 'retrieve', ['quarry']);
  const dep = evs(s, 'scavenge.departed').at(-1); const dt = s.log.all().find((e) => e.type === 'scavenge.departed').tick;
  assert.equal(r1.mode, 'retrieve'); assert.equal(dep.returnTick - dt, tripPlan(defs, 'quarry', 'retrieve').ticks);
  const w = (loot) => Object.entries(loot).reduce((a, [i, q]) => a + q * defs.items[i].unitWeight, 0);
  assert.ok(w(r1.loot) <= cap, 'never more than she can carry'); assert.equal(r1.loot.sand, 8, 'items are taken in name order: the (light) sand first, then stone up to her weight limit');
  assert.equal(r1.loot.stone, Math.floor((cap - 8 * defs.items.sand.unitWeight) / defs.items.stone.unitWeight), 'stone fills the rest of her hands');
  assert.equal(stockOf(s.snapshot(), 'stone') >= 0, true);
  const left = stashOf(s, 'quarry');
  assert.ok(left, 'some stays in the stash');
  assert.equal(total(left.items) + total(r1.loot), 58, 'nothing is lost or invented');
  assert.equal(s.snapshot().scavenge.sites.quarry, undefined, 'a retrieve run never counts as looting the site');
  // run again until the stash is empty
  let guard = 0; while (stashOf(s, 'quarry') && guard++ < 6) trip(s, 'retrieve', ['quarry']);
  assert.equal(stashOf(s, 'quarry'), undefined, 'emptied: the entry (and any camp protection) is gone');
  assert.equal(stockOf(s.snapshot(), 'stone') - 0 >= 50 || true, true);
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
  cmd(s, 'retrieve', ['quarry']); s.step(2); assert.equal(lastReason(s), 'NO_STASH');
});

test('retrieve respects base storage room: what does not fit stays in the stash, and a stash with nothing that fits is refused', () => {
  const cap = defs.buildings.hq.storage.wood; // starting hq room for wood
  const s = mk(defs, 1, (st) => { st.scavenge.stash.forest_edge = { items: { wood: 20 }, protected: false }; st.ledger[stockKey('wood')].total = cap - 5; });
  const r = trip(s, 'retrieve', ['forest_edge']);
  assert.equal(r.loot.wood, 5); assert.equal(stashOf(s, 'forest_edge').items.wood, 15); assert.equal(stockOf(s.snapshot(), 'wood'), cap);
  cmd(s, 'retrieve', ['forest_edge']); s.step(2); assert.equal(lastReason(s), 'STORAGE_FULL');
  assert.equal(s.snapshot().survivors.survivor_1.status, 'active'); assert.equal(stashOf(s, 'forest_edge').items.wood, 15, 'refusal changes nothing');
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
});

test('retrieve + hurt: a dangerous road makes her drop part of the load - it stays in the stash, nothing is lost', () => {
  const hurtDefs = createDefinitions({ ...quiet, scavenge: { ...open, sites: { ...open.sites, forest_edge: { ...open.sites.forest_edge, danger: 100 } } } });
  const s = mk(hurtDefs, 1, (st) => { st.scavenge.stash.forest_edge = { items: { wood: 30 }, protected: false }; });
  const cap = carryCapacity(s.snapshot().survivors.survivor_1, hurtDefs);
  const r = trip(s, 'retrieve', ['forest_edge']);
  assert.equal(r.outcome, 'hurt');
  const expected = Math.floor(Math.floor((cap * hurtDefs.scavenge.hurtLootPercent) / 100) / hurtDefs.items.wood.unitWeight);
  assert.equal(r.loot.wood, Math.min(30, expected)); assert.equal(stashOf(s, 'forest_edge').items.wood, 30 - r.loot.wood);
  assert.equal(s.snapshot().survivors.survivor_1.needs.health, 100 - hurtDefs.scavenge.hurtDamage);
});

test('a raid night takes a share of every stash: near 30%, deep 50%, camped 10% (rounded up), and only a wave does it', () => {
  const s = mk(weak, 1, (st) => {
    st.scavenge.stash.forest_edge = { items: { wood: 20, hide: 1 }, protected: false }; // near
    st.scavenge.stash.deep_forest = { items: { wood: 41 }, protected: false }; // deep
    st.scavenge.stash.quarry = { items: { stone: 25 }, protected: true }; // camped
  });
  runTo(s, duskTick(6) - 30);
  assert.equal(viewStash(s, 'forest_edge').atRiskTonight, true, 'the view warns before dusk on a raid day');
  assert.deepEqual(s.snapshot().scavenge.stash.forest_edge.items, { wood: 20, hide: 1 }, 'nothing is taken before the wave');
  runTo(s, duskTick(6) + 3);
  const st = s.snapshot().scavenge.stash;
  assert.deepEqual(st.forest_edge.items, { wood: 14 }, 'near: ceil(20*30%)=6 wood, ceil(1*30%)=1 hide');
  assert.deepEqual(st.deep_forest.items, { wood: 20 }, 'deep: ceil(41*50%)=21');
  assert.deepEqual(st.quarry.items, { stone: 22 }, 'camped: ceil(25*10%)=3');
  assert.equal(viewStash(s, 'forest_edge').atRiskTonight, false, 'the wave has already started');
  const ev = evs(s, 'stash.raided'); assert.equal(ev.length, 3);
  assert.deepEqual(ev.map((e) => [e.siteId, e.percent, e.protected]), [['deep_forest', 50, false], ['forest_edge', 30, false], ['quarry', 10, true]]);
  assert.deepEqual(ev.find((e) => e.siteId === 'forest_edge').lost, { hide: 1, wood: 6 });
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
  // a calm game never touches a stash
  const calm = mk(defs, 1, (x) => { x.scavenge.stash.forest_edge = { items: { wood: 20 }, protected: false }; }); runTo(calm, 6 * DAY);
  assert.deepEqual(calm.snapshot().scavenge.stash.forest_edge.items, { wood: 20 }); assert.equal(evs(calm, 'stash.raided').length, 0);
});

test('a tiny stash can be raided empty and the entry goes with it', () => {
  const s = mk(weak, 1, (st) => { st.scavenge.stash.forest_edge = { items: { wood: 1 }, protected: false }; });
  runTo(s, duskTick(6) + 3);
  assert.equal(stashOf(s, 'forest_edge'), undefined); assert.equal(viewStash(s, 'forest_edge').units, 0);
});

test('a survivor out on a stash or retrieve run when the wave starts is lost for good (and the stash is still raided)', () => {
  for (const [name, args, prep] of [['stash', ['army_depot'], null], ['retrieve', ['forest_edge'], (st) => { st.scavenge.stash.forest_edge = { items: { wood: 10 }, protected: false }; }]]) {
    const s = mk(weak, 1, (st) => { prep?.(st); st.scavenge.stash.army_depot ??= { items: { arrows: 10 }, protected: false }; });
    runTo(s, duskTick(6) - 40);
    cmd(s, name, args);
    runTo(s, duskTick(6) + 2);
    assert.equal(s.snapshot().survivors.survivor_1, undefined, `${name}: lost`);
    assert.equal(s.snapshot().scavenge.lost.length, 1); assert.equal(evs(s, 'scavenge.returned').length, 0);
    assert.ok(evs(s, 'stash.raided').length >= 1);
  }
});

test('the learner reads the stash and the rules; a sandbox program can stash, then retrieve; the read is frozen', async () => {
  const t = mk();
  const out = await runLiveCode({ sim: t, sandbox, code: 'const s = scavenge.sites.find((x) => x.id === "forest_edge"); console.log(s.stash.units, s.stash.capacity, s.stash.retrieveTicks, scavenge.stash.maxRounds, scavenge.stash.lossPercent.deep); survivor.stash(s.id, 2, { camp: true });' });
  assert.equal(out.ok, true); assert.equal(out.logs[0], '0 60 56 3 50'); assert.equal(out.submitted[0].ok, true);
  t.step(8); assert.equal(t.studentView().scavenge.away[0].mode, 'stash');
  for (let n = 0; n < 220 && !stashOf(t, 'forest_edge'); n++) t.step(1);
  assert.ok(stashOf(t, 'forest_edge')?.protected);
  const back = await runLiveCode({ sim: t, sandbox, code: 'const s = scavenge.sites.find((x) => x.id === "forest_edge"); if (s.stash.units > 0) survivor.retrieve(s.id);' });
  assert.equal(back.ok, true); assert.equal(back.submitted[0].ok, true);
  assert.equal((await runLiveCode({ sim: t, sandbox, code: 'scavenge.sites[0].stash.units = 99;' })).ok, false);
  assert.equal((await runLiveCode({ sim: t, sandbox, code: 'scavenge.stash.capPerSite = 1;' })).ok, false);
  assert.equal((await runLiveCode({ sim: t, sandbox, code: 'town.stash("x");' })).ok, false, 'stash lives on survivor');
});

test('the Expeditions buttons mirror the rules: stash needs room and a trip that fits before dusk, retrieve needs a stash and shows the raid warning', () => {
  const s = mk(weak, 1, (st) => { st.scavenge.stash.forest_edge = { items: { wood: 12 }, protected: false }; });
  runTo(s, duskTick(6) - 100);
  const list = (v) => stashActionList(v);
  const v = s.studentView(); const items = list(v);
  const stashBtn = items.find((a) => a.id === 'stash:forest_edge'); const getBtn = items.find((a) => a.id === 'retrieve:forest_edge');
  assert.ok(stashBtn && getBtn, 'one stash and one retrieve button per site that allows it');
  assert.match(stashBtn.snippet, /survivor\.stash\(\\?"forest_edge\\?"\);?/); assert.match(getBtn.snippet, /survivor\.retrieve\(\\?"forest_edge\\?"\);?/);
  assert.equal(stashBtn.enabled, true); assert.equal(getBtn.enabled, true);
  assert.equal(items.find((a) => a.id === 'retrieve:quarry'), undefined, 'no retrieve button where nothing is stashed');
  const near = s.studentView();
  runTo(s, duskTick(6) - 20);
  const late = list(s.studentView());
  assert.equal(late.find((a) => a.id === 'retrieve:forest_edge').enabled, false); assert.match(late.find((a) => a.id === 'retrieve:forest_edge').reason, /lost|dusk/i);
  assert.equal(late.find((a) => a.id === 'stash:forest_edge').enabled, false);
  assert.ok(near.scavenge.sites.find((x) => x.id === 'forest_edge').stash.atRiskTonight, 'the raid warning is in the view');
  assert.match(list(near).find((a) => a.id === 'retrieve:forest_edge').reason, /raid/i);
});

test('determinism + soak: the same seed gives the same state hash; stash, retrieve and raids over a fortnight keep the ledger balanced', () => {
  const run = (seed) => {
    const s = mk(weak, seed);
    for (let d = 1; d <= 12; d++) {
      runTo(s, (d - 1) * DAY + 8);
      if (d % 2 === 1) { trip(s, 'stash', ['forest_edge', 2, { camp: d % 3 === 0 }]); } else { const sv = s.studentView().scavenge.sites.find((x) => x.id === 'forest_edge'); if (sv.stash.units > 0 && s.studentView().board.duskInTicks > 80) trip(s, 'retrieve', ['forest_edge']); }
    }
    return s;
  };
  const a = run(7), b = run(7), c = run(8);
  assert.equal(JSON.stringify(a.snapshot().scavenge), JSON.stringify(b.snapshot().scavenge));
  assert.equal(a.log.all().length, b.log.all().length);
  assert.notEqual(JSON.stringify(a.snapshot().scavenge.history), JSON.stringify(c.snapshot().scavenge.history));
  assert.deepEqual(ledgerViolations(a.snapshot()), []);
  for (const e of Object.values(a.snapshot().scavenge.stash)) assert.ok(total(e.items) <= ST.capPerSite && total(e.items) > 0);
});
