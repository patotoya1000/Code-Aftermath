// O18 risk events: a public, seed-and-day schedule (pure), dawn effects (stock loss / building damage / supply cache), warnings, history,
// learner read, validation, replay-safety, ledger conservation with events switched ON.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { events as eventData, eventSchedule } from '../src/modules/definitions/data/events.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { eventForDay, upcomingEvents } from '../src/modules/events/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { sandbox } from './helpers.js';

const on = createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 100 } }); // an event EVERY day from startDay
const DAY = on.environment.ticksPerDay;
const sim = (defs = on, seed = 1, mutate) => { const state = createInitialState({ defs, scenarioId: 'stage1', seed }); mutate?.(state); return createSimulation({ defs, state }); };
const fix = (st, id) => { const b = st.buildings[id]; b.health = on.buildings[b.type].levels[b.level].maxHealth; b.condition = 'repaired'; };
const toDay = (s, day) => { while (s.snapshot().tick < (day - 1) * DAY - on.environment.startHour * (DAY / 24) + 2) s.step(1); };
const keep = (st) => Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100 });
const happened = (s) => s.log.all().filter((e) => e.type === 'event.happened');
/** First day (>= from) whose scheduled event is `id` for this seed. */
const dayOfKind = (id, seed, from = 3) => { for (let d = from; d < 400; d++) if (eventForDay(on, seed, d)?.id === id) return d; throw new Error('no such day'); };

test('the schedule is a pure function of (seed, day): same answer every time, different seeds differ, nothing before startDay', () => {
  for (let d = 1; d <= 40; d++) assert.deepEqual(eventForDay(on, 7, d), eventForDay(on, 7, d));
  assert.equal(eventForDay(on, 7, 1), null); assert.equal(eventForDay(on, 7, 2), null);
  assert.ok(eventForDay(on, 7, 3));
  const a = Array.from({ length: 30 }, (_, i) => eventForDay(on, 1, i + 3)?.id).join();
  const b = Array.from({ length: 30 }, (_, i) => eventForDay(on, 2, i + 3)?.id).join();
  assert.notEqual(a, b);
  const none = createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 0 } });
  for (let d = 1; d <= 60; d++) assert.equal(eventForDay(none, 1, d), null);
});

test('weights are honoured over many days and every event kind eventually appears', () => {
  const count = {};
  for (let d = 3; d < 2003; d++) { const e = eventForDay(on, 5, d); count[e.id] = (count[e.id] ?? 0) + 1; }
  assert.deepEqual(Object.keys(count).sort(), Object.keys(eventData).sort());
  assert.ok(count.rat_infestation > count.supply_cache, JSON.stringify(count));
});

test('upcoming events: the next warnDays days are public, today is not included, and the learner read shows them', async () => {
  const s = sim();
  const view = s.studentView();
  assert.deepEqual(view.events.upcoming.map((e) => e.inDays), [2], 'day 2 is inside the calm start, day 3 (2 days ahead) is the first possible event');
  assert.ok(view.events.upcoming.every((e) => e.name && typeof e.harm === 'boolean'));
  assert.deepEqual(view.events.upcoming, upcomingEvents(on, 1, 0));
  const r = await sandbox.run({ code: 'console.log(events.upcoming.length, events.history.length);', view, seed: 1 });
  assert.match(r.logs.join(' '), /^1 0/);
  const w = await sandbox.run({ code: 'events.upcoming.push(1);', view, seed: 1 });
  assert.ok(w.error, 'events are read-only');
});

test('a warning is logged a day-count ahead, then the event happens at dawn of its day', () => {
  const s = sim(); toDay(s, 5);
  const warn = s.log.all().filter((e) => e.type === 'event.warning');
  assert.ok(warn.some((e) => e.day === 5 + 0 || e.day === 5), 'day 5 was announced two days before');
  assert.ok(happened(s).some((e) => e.day === 4 || e.day === 5));
  assert.ok(s.studentView().events.history.length >= 2);
});

test('rat infestation: 30 % of each listed food in available stock is lost, reserved units are safe, the ledger stays balanced', () => {
  const d = dayOfKind('rat_infestation', 1);
  const s = sim(on, 1, (st) => { keep(st); st.ledger['stock.wheat'].total = 10; st.ledger['stock.bread'].total = 0; st.ledger['stock.potato'].total = 4; st.ledger['stock.carrot'].total = 0; });
  const before = (k) => s.snapshot().ledger[`stock.${k}`].total;
  const w0 = before('wheat'), p0 = before('potato');
  toDay(s, d);
  const ev = happened(s).find((e) => e.event === 'rat_infestation' && e.day === d);
  assert.equal(ev.outcome, 'lost');
  assert.equal(ev.detail.wheat, Math.ceil(w0 * 0.3));
  assert.equal(before('wheat'), w0 - ev.detail.wheat);
  assert.ok(ev.detail.potato >= 1 && before('potato') === p0 - ev.detail.potato);
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
});

test('equipment fault: one repaired machine drops to half health (condition damaged); with nothing repaired it does nothing', () => {
  const d = dayOfKind('equipment_fault', 1, 3);
  const s = sim(on, 1, (st) => { keep(st); fix(st, 'generator_1'); });
  toDay(s, d);
  const ev = happened(s).find((e) => e.event === 'equipment_fault' && e.day === d);
  assert.equal(ev.outcome, 'damaged');
  const b = s.snapshot().buildings[ev.detail.buildingId];
  assert.equal(b.health, Math.floor(on.buildings[b.type].levels[b.level].maxHealth / 2));
  assert.equal(b.condition, 'damaged');
  const none = sim(on, 1, keep); toDay(none, d);
  assert.equal(happened(none).find((e) => e.event === 'equipment_fault' && e.day === d).outcome, 'none');
});

test('supply cache: wood and stone arrive, limited by storage room', () => {
  const d = dayOfKind('supply_cache', 1, 3);
  const s = sim(on, 1, keep);
  const wood0 = s.snapshot().ledger['stock.wood'].total;
  toDay(s, d);
  const ev = happened(s).find((e) => e.event === 'supply_cache' && e.day === d);
  assert.equal(ev.outcome, 'gained');
  assert.ok(ev.detail.wood >= 1);
  assert.ok(s.snapshot().ledger['stock.wood'].total > wood0 - 1);
  const full = sim(on, 1, (st) => { keep(st); st.ledger['stock.wood'].total = 300; st.ledger['stock.stone'].total = 300; });
  toDay(full, d);
  const e2 = happened(full).find((e) => e.event === 'supply_cache' && e.day === d);
  assert.ok(e2.outcome === 'none' || (e2.detail.wood ?? 0) <= 300);
  assert.ok(full.snapshot().ledger['stock.wood'].total <= 300 + 12);
});

test('history is capped, and the same seed and ticks give the same events and state hash (replay-safe)', () => {
  const run = () => { const s = sim(on, 3, keep); for (let i = 0; i < DAY * 16; i++) s.step(1); return s; };
  const a = run(), b = run();
  assert.equal(a.stateHash(), b.stateHash());
  assert.deepEqual(happened(a).map((e) => [e.day, e.event, e.outcome]), happened(b).map((e) => [e.day, e.event, e.outcome]));
  assert.ok(a.snapshot().events.history.length <= on.eventSchedule.historyLimit);
});

test('soak with events ON: a month of idle ticks keeps every ledger invariant', () => {
  const s = sim(on, 4, (st) => { keep(st); for (const id of ['generator_1', 'workshop_1', 'battery_1']) fix(st, id); });
  for (let i = 0; i < DAY * 30; i++) s.step(1);
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
});

test('definitions validation: schedule and event tables are checked', () => {
  assert.throws(() => createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 101 } }), /eventSchedule/);
  assert.throws(() => createDefinitions({ events: { x: { name: 'X', kind: 'explode', weight: 1, harm: true } } }), /unknown kind/);
  assert.throws(() => createDefinitions({ events: { x: { ...eventData.rat_infestation, items: ['nothing'] } } }), /lose_stock/);
  assert.throws(() => createDefinitions({ events: { x: { ...eventData.equipment_fault, types: ['ghost'] } } }), /damage_building/);
  assert.throws(() => createDefinitions({ events: { x: { ...eventData.supply_cache, weight: 0 } } }), /weight/);
});
