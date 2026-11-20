// W3 scavenge expeditions (docs/game/21 section 6): `survivor.scavenge(siteId)` walks to the gate and leaves; she is away for the site's ticks and comes back
// with loot (scaled by the site's recovery, halved when hurt, limited by storage room); a wave that starts while she is out loses her for good.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { scavenge as scavengeData } from '../src/modules/definitions/data/scavenge.js';
import { raidSchedule } from '../src/modules/definitions/data/threats.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { recoveryPercent, dangerOn, rollLoot } from '../src/modules/scavenge/index.js';
import { buildCommand } from '../src/modules/api/index.js';
import { runLiveCode } from '../src/modules/session/index.js';
import { ledgerViolations, stockKey } from '../src/modules/resources/index.js';
import { sandbox } from './helpers.js';

const quiet = { eventSchedule: { ...eventSchedule, chancePercent: 0 }, raidSchedule: { ...raidSchedule, chancePercent: 0 } };
const open = { ...scavengeData, startDay: 1 };
const defs = createDefinitions({ ...quiet, scavenge: open });
const DAY = defs.environment.ticksPerDay;
const keep = (st) => { for (const s of Object.values(st.survivors)) Object.assign(s.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 }); };
const mk = (d = defs, seed = 1, mutate) => { const state = createInitialState({ defs: d, scenarioId: 'stage1', seed }); keep(state); mutate?.(state); return createSimulation({ defs: d, state }); };
const go = (sim, site, who = 'survivor_1') => sim.submit(buildCommand(who, { name: 'scavenge', args: [site] }));
const runTo = (s, tick) => { while (s.snapshot().tick < tick) s.step(1); };
const evs = (s, type) => s.log.all().filter((e) => e.type === type);
const stockOf = (st, item) => st.ledger[stockKey(item)].total;
const refused = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const trip = (s, site) => { const had = evs(s, 'scavenge.returned').length; go(s, site); let n = 0; while (evs(s, 'scavenge.returned').length === had && n++ < 600) s.step(1); return evs(s, 'scavenge.returned').at(-1); };
const withSites = (sites, extra = {}) => createDefinitions({ ...quiet, scavenge: { ...open, sites, ...extra } });

test('data: the shipped table is valid, and bad sites are refused at load time', () => {
  assert.ok(Object.keys(defs.scavenge.sites).length >= 3);
  const bad = (mut, re) => assert.throws(() => { const sv = structuredClone(scavengeData); mut(sv); createDefinitions({ scavenge: sv }); }, re);
  bad((sv) => { sv.sites.junkyard.danger = 101; }, /danger/);
  bad((sv) => { sv.sites.junkyard.yield = { gold: [1, 2] }; }, /yield/);
  bad((sv) => { sv.sites.junkyard.yield = { scrap: [5, 2] }; }, /yield/);
  bad((sv) => { sv.sites.junkyard.ticks = 0; }, /ticks/);
  bad((sv) => { sv.hurtLootPercent = 150; }, /hurtLootPercent/);
  bad((sv) => { sv.sites = {}; }, /at least one site/);
  bad((sv) => { delete sv.needsPer10Ticks.thirst; }, /needsPer10Ticks/);
});

test('pure rules: recovery regrows from minRecovery to 100, danger rises on a raid day, loot is a bounded pure roll that hurt halves', () => {
  const st = mk().snapshot();
  assert.equal(recoveryPercent(defs, st, 'junkyard', 5), 100, 'never looted');
  st.scavenge.sites.junkyard = { lastDay: 5, trips: 1 };
  assert.equal(recoveryPercent(defs, st, 'junkyard', 5), defs.scavenge.minRecovery);
  assert.equal(recoveryPercent(defs, st, 'junkyard', 6), 25); // regrowDays 4
  assert.equal(recoveryPercent(defs, st, 'junkyard', 9), 100); assert.equal(recoveryPercent(defs, st, 'junkyard', 40), 100);
  const raids = createDefinitions({ ...quiet, raidSchedule: { ...raidSchedule, chancePercent: 100 } });
  assert.equal(dangerOn(defs, 1, 'junkyard', 10), 25);
  assert.equal(dangerOn(raids, 1, 'junkyard', 10), 25 + raids.scavenge.raidDayDanger);
  assert.equal(dangerOn(raids, 1, 'army_depot', 10), 65);
  const a = rollLoot(defs, 3, 'k', 'army_depot', 100, false), b = rollLoot(defs, 3, 'k', 'army_depot', 100, false);
  assert.deepEqual(a, b);
  for (const [item, qty] of Object.entries(a)) { const [min, max] = defs.scavenge.sites.army_depot.yield[item]; assert.ok(qty >= min && qty <= max, item); }
  const half = rollLoot(defs, 3, 'k', 'army_depot', 100, true);
  for (const item of Object.keys(half)) assert.ok(half[item] <= Math.ceil(a[item] / 2));
  assert.deepEqual(rollLoot(defs, 3, 'k', 'army_depot', 0, false), {});
});

test('a trip: she walks to the gate, departs (action DEPARTED), is hidden and takes no commands, then returns at the gate with the loot in base stock', () => {
  const s = mk();
  const before = s.snapshot();
  go(s, 'roadside_store');
  let n = 0; while (s.snapshot().survivors.survivor_1.status !== 'away' && n++ < 100) s.step(1);
  let st = s.snapshot(); const me = st.survivors.survivor_1;
  assert.equal(me.status, 'away'); assert.deepEqual(me.position, { x: st.buildings.gate.x, y: st.buildings.gate.y });
  assert.equal(me.away.siteId, 'roadside_store'); assert.equal(me.away.returnTick, st.tick + defs.scavenge.sites.roadside_store.ticks);
  assert.equal(st.survivors.survivor_1.lastTask?.reason ?? null, 'DEPARTED');
  assert.equal(s.renderProjection().npcs.length, 0, 'an absent survivor is not drawn');
  assert.equal(s.studentView().survivors[0].status, 'away');
  const view = s.studentView().scavenge; assert.equal(view.away.length, 1); assert.equal(view.away[0].siteId, 'roadside_store');
  assert.equal(view.sites.find((x) => x.id === 'roadside_store').awayNow, 1);
  // a command while she is away fails with AWAY and changes nothing
  s.submit(buildCommand('survivor_1', { name: 'rest', args: [] })); s.step(2);
  assert.equal(s.snapshot().survivors.survivor_1.lastTask.reason, 'AWAY');
  runTo(s, me.away.returnTick - 1); assert.equal(s.snapshot().survivors.survivor_1.status, 'away');
  s.step(1);
  st = s.snapshot();
  const ret = evs(s, 'scavenge.returned')[0];
  assert.ok(ret); assert.equal(st.survivors.survivor_1.status, 'active'); assert.equal(st.survivors.survivor_1.away, undefined);
  assert.deepEqual(st.survivors.survivor_1.position, { x: st.buildings.gate.x, y: st.buildings.gate.y });
  for (const [item, qty] of Object.entries(ret.loot)) assert.equal(stockOf(st, item), stockOf(before, item) + qty, `${item} went into base stock`);
  assert.ok(Object.keys(ret.loot).length > 0 || ret.outcome === 'hurt');
  assert.deepEqual(ledgerViolations(st), []);
  assert.equal(st.scavenge.sites.roadside_store.trips, 1); assert.equal(st.scavenge.history.length, 1);
  assert.equal(s.studentView().scavenge.away.length, 0);
});

test('costs and rewards: needs are paid on return (not before), a good trip teaches Gathering, health only drops when hurt', () => {
  const calm = withSites({ safe: { name: 'Safe', ticks: 100, danger: 0, regrowDays: 2, yield: { rags: [5, 5] } } });
  const s = mk(calm);
  const r = trip(s, 'safe');
  assert.equal(r.outcome, 'clean'); assert.deepEqual(r.loot, { rags: 5 });
  const me = s.snapshot().survivors.survivor_1;
  assert.equal(me.needs.health, 100, 'not hurt');
  const cost = Math.floor((100 * calm.scavenge.needsPer10Ticks.hunger) / 10);
  assert.ok(me.needs.hunger <= 100 - cost && me.needs.hunger >= 100 - cost - 5, 'hunger fell by the trip cost (plus a little for the walk to the gate)');
  assert.ok(me.needs.energy < 100 && me.needs.thirst < 100);
  assert.ok(me.progression.xp.gathering >= 3, 'the trip taught Gathering');
});

test('danger: a danger-100 site always hurts (health down, half loot, never below 1); a danger-0 site never does', () => {
  const rough = withSites({ rough: { name: 'Rough', ticks: 30, danger: 100, regrowDays: 2, yield: { rags: [10, 10] } } });
  for (const seed of [1, 2, 3]) {
    const s = mk(rough, seed); const r = trip(s, 'rough');
    assert.equal(r.outcome, 'hurt'); assert.deepEqual(r.loot, { rags: 5 });
    assert.equal(s.snapshot().survivors.survivor_1.needs.health, 100 - rough.scavenge.hurtDamage);
  }
  const frail = mk(rough, 1, (st) => { st.survivors.survivor_1.needs.health = 10; });
  trip(frail, 'rough'); assert.equal(frail.snapshot().survivors.survivor_1.needs.health, 1, 'an ambush never kills');
  const safe = withSites({ safe: { name: 'Safe', ticks: 30, danger: 0, regrowDays: 2, yield: { rags: [10, 10] } } });
  for (const seed of [1, 2, 3, 4, 5]) assert.equal(trip(mk(safe, seed), 'safe').outcome, 'clean');
});

test('recovery: a looted site gives little at once and recovers over regrowDays; a different site is unaffected', () => {
  const one = withSites({ a: { name: 'A', ticks: 30, danger: 0, regrowDays: 2, yield: { rags: [10, 10] } }, b: { name: 'B', ticks: 30, danger: 0, regrowDays: 2, yield: { rags: [10, 10] } } });
  const s = mk(one);
  assert.equal(trip(s, 'a').loot.rags, 10);
  const again = trip(s, 'a');
  assert.equal(again.recoveryPercent, one.scavenge.minRecovery); assert.equal(again.loot.rags, 1);
  assert.equal(s.studentView().scavenge.sites.find((x) => x.id === 'a').recoveryPercent, one.scavenge.minRecovery);
  assert.equal(s.studentView().scavenge.sites.find((x) => x.id === 'b').recoveryPercent, 100);
  runTo(s, s.snapshot().tick + DAY * 2);
  assert.equal(s.studentView().scavenge.sites.find((x) => x.id === 'a').recoveryPercent, 100, 'two days later it has regrown');
  assert.equal(trip(s, 'a').loot.rags, 10);
});

test('storage: what does not fit is left behind (reported), nothing is lost from the ledger', () => {
  const s = mk(defs, 1, (st) => { st.ledger[stockKey('rags')].total = 29; }); // hq room for rags is 30
  const r = trip(s, 'roadside_store');
  assert.equal(stockOf(s.snapshot(), 'rags'), 30);
  assert.ok(r.leftBehind.rags >= 1, 'rags beyond the room stay at the site');
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
});

test('refusals: unknown site, not open yet, a wave on, too tired, no arguments - and a refused trip changes nothing', () => {
  const s = mk();
  assert.equal(go(s, 'nowhere') !== undefined, true); s.step(1);
  assert.equal(s.snapshot().survivors.survivor_1.lastTask.reason, 'UNKNOWN_TARGET');
  assert.equal(refused(() => buildCommand('survivor_1', { name: 'scavenge', args: [] })), 'INVALID_ARGUMENT');
  assert.equal(refused(() => buildCommand('survivor_1', { name: 'scavenge', args: [5] })), 'INVALID_ARGUMENT');
  const late = createDefinitions({ ...quiet });
  const l = mk(late); go(l, 'junkyard'); l.step(1);
  assert.equal(l.snapshot().survivors.survivor_1.lastTask.reason, 'NOT_OPEN'); assert.equal(l.studentView().scavenge.open, false);
  const tired = mk(defs, 1, (st) => { st.survivors.survivor_1.needs.energy = 1; }); go(tired, 'junkyard'); tired.step(1);
  assert.equal(tired.snapshot().survivors.survivor_1.lastTask.reason, 'EXHAUSTED');
  const hash = (x) => JSON.stringify(x.snapshot().ledger);
  const w = mk(defs, 1, (st) => { st.threats.wave = { day: 1, strength: 1, defense: 0, composition: {}, queue: [], spawned: 0, reinforced: 0, summoned: 0, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 }; });
  const ledger = hash(w); go(w, 'junkyard'); w.step(2);
  assert.equal(w.snapshot().survivors.survivor_1.lastTask.reason, 'WAVE_ACTIVE'); assert.equal(hash(w), ledger);
});

const weak = createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 0 }, scavenge: open, raidSchedule: { ...raidSchedule, chancePercent: 100, strengthBase: 4, strengthPerDay: 0, variancePercent: 0 } });
const duskTick = (day) => (day - 1) * DAY + (weak.environment.duskHour - weak.environment.startHour) * (DAY / 24);

test('a wave while she is out: she is LOST for good (removed, recorded), nobody recalls her, her id is not reused, and the wave never targets her', () => {
  const s = mk(weak, 1, (st) => { st.survivors.survivor_2 = structuredClone(st.survivors.survivor_1); st.survivors.survivor_2.id = 'survivor_2'; st.survivors.survivor_2.identity.name = 'Bo'; });
  runTo(s, duskTick(6) - 60);
  go(s, 'army_depot'); // 110 ticks: still out at dusk
  runTo(s, duskTick(6) + 2);
  const st = s.snapshot();
  assert.equal(st.survivors.survivor_1, undefined, 'lost');
  assert.ok(st.survivors.survivor_2);
  assert.deepEqual(st.scavenge.lost.map((l) => [l.id, l.siteId, l.day]), [['survivor_1', 'army_depot', 6]]);
  assert.equal(evs(s, 'survivor.lost').length, 1);
  assert.equal(s.studentView().scavenge.lost[0].id, 'survivor_1');
  assert.equal(evs(s, 'scavenge.returned').length, 0, 'she never comes back');
  assert.equal(refused(() => go(s, 'junkyard', 'survivor_1')), 'UNKNOWN_ACTOR');
  assert.deepEqual(ledgerViolations(st), []);
  runTo(s, duskTick(6) + 40);
  assert.ok(!evs(s, 'zombie.reached_survivor').some((e) => e.survivorId === 'survivor_1'));
});

test('a trip home before dusk is safe; away survivors are not wave prey even when the wall is down', () => {
  const s = mk(weak, 1);
  runTo(s, duskTick(6) - 80);
  const r = trip(s, 'roadside_store');
  assert.ok(r && s.snapshot().survivors.survivor_1.status === 'active', 'home in time');
  assert.equal(s.snapshot().scavenge.lost.length, 0);
});

test('the board and the scavenge read: dusk countdown, raids, train and sites in one place; frozen in learner code; sandbox command works', async () => {
  const s = mk(weak, 1);
  runTo(s, 4 * DAY);
  const b = s.studentView().board;
  assert.equal(typeof b.duskInTicks, 'number'); assert.ok(Array.isArray(b.raids) && Array.isArray(b.events) && Array.isArray(b.bosses));
  assert.equal(typeof b.train.arrivesInDays, 'number'); assert.equal(b.sites.length, Object.keys(weak.scavenge.sites).length);
  assert.ok(b.sites.every((x) => x.dangerToday >= weak.scavenge.sites[x.id].danger));
  const t = mk(defs); // at the start of day 1 (06:00) dusk is 12 hours = 120 ticks away
  assert.equal(t.studentView().board.duskInTicks, 120);
  const out = await runLiveCode({ sim: t, sandbox, code: 'const s = scavenge.sites.find((x) => x.id === "roadside_store"); console.log(s.ticks, board.duskInTicks > s.ticks); survivor.scavenge(s.id);' });
  assert.equal(out.ok, true); assert.equal(out.logs[0], '40 true'); assert.equal(out.submitted[0].ok, true);
  const frozen = await runLiveCode({ sim: t, sandbox, code: 'scavenge.sites.push(1);' }); assert.equal(frozen.ok, false);
  const noGlobal = await runLiveCode({ sim: t, sandbox, code: 'town.scavenge("x");' }); assert.equal(noGlobal.ok, false, 'scavenge lives on survivor');
});

test('determinism + soak: the same seed gives the same hash and history; a long game of repeated trips keeps the ledger balanced', () => {
  const run = (seed) => { const s = mk(defs, seed); for (const site of ['roadside_store', 'old_farmhouse', 'junkyard']) trip(s, site); return s; };
  const a = run(5), b = run(5);
  assert.equal(a.stateHash(), b.stateHash()); assert.deepEqual(a.snapshot().scavenge.history, b.snapshot().scavenge.history);
  assert.notDeepEqual(a.snapshot().scavenge.history.map((h) => h.loot), run(6).snapshot().scavenge.history.map((h) => h.loot));
  const soak = mk(defs, 2);
  for (let i = 0; i < 20; i++) trip(soak, 'roadside_store');
  assert.deepEqual(ledgerViolations(soak.snapshot()), []);
  assert.ok(soak.snapshot().scavenge.history.length <= defs.scavenge.historyLimit);
});

test('UI: the Expeditions buttons mirror the rules (open, free survivor, home before dusk) and insert the real call', async () => {
  const { scavengeActionList } = await import('../src/app/ui/actions.js');
  const s = mk(defs);
  let list = scavengeActionList(s.studentView());
  assert.equal(list.length, Object.keys(defs.scavenge.sites).length);
  const store = list.find((a) => a.site.id === 'roadside_store');
  assert.equal(store.enabled, true); assert.equal(store.snippet, 'survivor.scavenge("roadside_store");');
  assert.equal(list.find((a) => a.site.id === 'army_depot').enabled, false, 'at dawn the 110-tick trip leaves no spare time before dusk');
  assert.equal(list.find((a) => a.site.id === 'junkyard').enabled, true);
  runTo(s, duskTick(1) - 50);
  list = scavengeActionList(s.studentView());
  assert.equal(list.find((a) => a.site.id === 'junkyard').enabled, false); assert.match(list.find((a) => a.site.id === 'junkyard').reason, /lost/);
  assert.equal(list.find((a) => a.site.id === 'roadside_store').enabled, false, '40 + 10 > 50');
  runTo(s, duskTick(1) + 5);
  assert.ok(scavengeActionList(s.studentView()).every((a) => !a.enabled));
  assert.deepEqual(scavengeActionList({}), []);
  assert.deepEqual(scavengeActionList(mk(createDefinitions(quiet)).studentView()), [], 'closed before the start day');
});
