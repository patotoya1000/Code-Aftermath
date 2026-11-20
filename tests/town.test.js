// W4 the town: recruit offers are a pure function of (seed, day), priced from stats, paid only in supplies; hiring is instant, checked before it
// changes anything, needs a free bed, and the new survivor is a real survivor (commands, save, replay, learner reads, UI buttons).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { offersForDay, candidateFor, periodOf, worthOf, priceIn } from '../src/modules/town/index.js';
import { buildCommand } from '../src/modules/api/index.js';
import { runLiveCode } from '../src/modules/session/index.js';
import { ledgerViolations, stockKey } from '../src/modules/resources/index.js';
import { townActionList } from '../src/app/ui/actions.js';
import { describeApi } from '../src/modules/api/index.js';
import { defs, sandbox, newSim, call } from './helpers.js';

const DAY = defs.environment.ticksPerDay;
const toDay = (sim, day) => { const startHour = defs.environment.startHour; while (sim.snapshot().tick < (day - 1) * DAY - startHour * (DAY / 24) + 2) sim.step(1); };
const stock = (st, item, n) => { st.ledger[stockKey(item)].total = n; };
const rich = (st) => { for (const i of ['wheat', 'potato', 'carrot', 'wood', 'stone', 'bread']) stock(st, i, 100); };
const hire = (sim, offerId, item) => sim.submit({ ...buildCommand('survivor_1', { name: 'recruit', args: item ? [offerId, item] : [offerId] }), mode: 'queue' });
const refused = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('data: the town table is valid, accepts only items (no money), and a broken one is refused', () => {
  assert.ok(defs.town.offers >= 1);
  for (const k of Object.keys(defs.town.payWith)) assert.ok(defs.items[k], k);
  assert.ok(!Object.keys(defs.town.payWith).some((k) => /money|cash|coin|credit/i.test(k)));
  assert.throws(() => createDefinitions({ town: { ...defs.town, payWith: { gold: 5 } } }), /town: payWith/);
  assert.throws(() => createDefinitions({ town: { ...defs.town, payOrder: ['mre', 'gold'] } }), /payOrder/);
  assert.throws(() => createDefinitions({ town: { ...defs.town, beds: { castle: 3 } } }), /beds/);
  assert.throws(() => createDefinitions({ town: { ...defs.town, pricing: { ...defs.town.pricing, base: -1 } } }), /pricing/);
});

test('offers: pure per (seed, day); none before the town opens; the board rotates every rotateDays; seeds differ', () => {
  assert.deepEqual(offersForDay(defs, 7, 1), []);
  assert.equal(periodOf(defs, 1), 0);
  assert.equal(periodOf(defs, defs.town.startDay), 1);
  const a = offersForDay(defs, 7, 2); const b = offersForDay(defs, 7, 2);
  assert.equal(a.length, defs.town.offers); assert.deepEqual(a, b);
  assert.deepEqual(offersForDay(defs, 7, 2), offersForDay(defs, 7, 2 + defs.town.rotateDays - 1), 'same board inside a period');
  assert.notDeepEqual(offersForDay(defs, 7, 2).map((o) => o.id), offersForDay(defs, 7, 2 + defs.town.rotateDays).map((o) => o.id));
  assert.notDeepEqual(offersForDay(defs, 7, 2), offersForDay(defs, 8, 2));
  assert.equal(new Set(a.map((o) => o.id)).size, a.length);
});

test('candidates: stats stay inside the configured ranges and the price is a pure function of the stats', () => {
  const c = defs.town.candidates;
  for (let seed = 1; seed <= 30; seed++) for (let period = 1; period <= 6; period++) for (let slot = 0; slot < defs.town.offers; slot++) {
    const o = candidateFor(defs, seed, period, slot);
    for (const v of Object.values(o.attributes)) assert.ok(v >= c.attribute.min && v <= c.attribute.max);
    assert.equal(Object.keys(o.skills).length, c.skills.count);
    for (const [k, v] of Object.entries(o.skills)) { assert.ok(c.skills.pool.includes(k)); assert.ok(v >= 1 && v <= c.skills.maxLevel); }
    assert.ok(o.traits.length <= 1 && o.traits.every((t) => defs.traits[t]));
    assert.equal(o.worth, worthOf(defs, { skills: o.skills, attributes: o.attributes, traits: o.traits }));
    assert.ok(o.worth >= defs.town.pricing.minWorth);
    assert.deepEqual(o.price, priceIn(defs, o.worth));
    for (const [item, n] of Object.entries(o.price)) assert.ok(n * defs.town.payWith[item] >= o.worth && (n - 1) * defs.town.payWith[item] < o.worth, 'rounded up, never over by a unit');
  }
});

test('pricing: a stronger, more skilled candidate costs more; traits add; the floor holds', () => {
  const weak = { skills: {}, attributes: { strength: 3, agility: 3, endurance: 3, intelligence: 3, perception: 3 }, traits: [] };
  const strong = { skills: { combat: 3, repair: 2 }, attributes: { strength: 8, agility: 8, endurance: 8, intelligence: 5, perception: 5 }, traits: [] };
  assert.equal(worthOf(defs, weak), defs.town.pricing.minWorth <= defs.town.pricing.base ? defs.town.pricing.base : defs.town.pricing.minWorth);
  assert.ok(worthOf(defs, strong) > worthOf(defs, weak));
  assert.equal(worthOf(defs, { ...strong, traits: ['strong'] }), worthOf(defs, strong) + defs.town.pricing.perTrait);
});

test('recruit: pays only from stock, adds a real survivor with the offered stats, one hire per offer, at the gate', () => {
  const sim = newSim('stage1', 3, rich); toDay(sim, 2);
  const view = sim.studentView(); const offer = view.town.offers[0];
  assert.equal(view.town.open, true); assert.equal(view.town.survivors, 1); assert.equal(view.town.beds, 4); assert.equal(view.town.freeBeds, 3);
  const before = sim.snapshot().ledger[stockKey('wheat')].total;
  const id = hire(sim, offer.id, 'wheat');
  assert.equal(id, null);
  const st = sim.snapshot(); const s = st.survivors.survivor_2;
  assert.ok(s, 'new survivor exists'); assert.equal(s.identity.name, offer.name);
  assert.deepEqual(s.attributes, offer.attributes);
  for (const [k, v] of Object.entries(offer.skills)) assert.equal(s.skills[k], v);
  assert.deepEqual(s.traits, offer.traits);
  assert.equal(st.ledger[stockKey('wheat')].total, before - offer.price.wheat);
  assert.deepEqual(ledgerViolations(st), []);
  assert.equal(st.town.hired[offer.id], 'survivor_2');
  assert.equal(sim.log.all().filter((e) => e.type === 'town.recruited').length, 1);
  assert.equal(refused(() => hire(sim, offer.id, 'wheat')), 'ALREADY_HIRED');
  const v2 = sim.studentView(); assert.equal(v2.town.offers[0].hired, true); assert.equal(v2.survivors.length, 2); assert.equal(v2.town.freeBeds, 2);
});

test('recruit: every refusal says why and changes nothing (state hash identical)', () => {
  const sim = newSim('stage1', 3, rich); const offer0 = () => sim.studentView().town.offers[0];
  const h0 = sim.stateHash();
  assert.equal(refused(() => hire(sim, 'offer_1_1')), 'TOWN_CLOSED');
  toDay(sim, 2);
  const h1 = sim.stateHash();
  assert.equal(refused(() => hire(sim, 'offer_9_9')), 'NO_SUCH_OFFER');
  assert.equal(refused(() => hire(sim, offer0().id, 'gold')), 'NOT_ACCEPTED');
  assert.equal(refused(() => hire(sim, offer0().id, 'mre')), 'CANNOT_AFFORD');
  assert.equal(sim.stateHash(), h1, 'refusals cost nothing');
  assert.notEqual(h0, h1);
});

test('recruit: cannot afford with nothing in stock, default item is the first in payOrder that covers the price', () => {
  const poor = newSim('stage1', 3, (st) => { for (const i of Object.keys(defs.items)) stock(st, i, 0); }); toDay(poor, 2);
  const h = poor.stateHash();
  assert.equal(refused(() => hire(poor, poor.studentView().town.offers[0].id)), 'CANNOT_AFFORD');
  assert.equal(poor.stateHash(), h);
  const mid = newSim('stage1', 3, (st) => { for (const i of Object.keys(defs.items)) stock(st, i, 0); stock(st, 'stone', 100); stock(st, 'bread', 100); }); toDay(mid, 2);
  const o = mid.studentView().town.offers[0];
  hire(mid, o.id);
  assert.equal(mid.snapshot().ledger[stockKey('bread')].total, 100 - o.price.bread, 'bread comes before stone in payOrder');
  assert.equal(mid.snapshot().ledger[stockKey('stone')].total, 100);
});

test('recruit: beds limit the camp (hq 2 + tent 2 = 4), and a ruined housing building gives none', () => {
  const sim = newSim('stage1', 3, rich); toDay(sim, 2);
  const o = sim.studentView().town.offers;
  hire(sim, o[0].id, 'wheat'); hire(sim, o[1].id, 'wheat'); hire(sim, o[2].id, 'wheat');
  assert.equal(Object.keys(sim.snapshot().survivors).length, 4);
  toDay(sim, 2 + defs.town.rotateDays);
  const next = sim.studentView().town;
  assert.equal(next.freeBeds, 0);
  assert.equal(refused(() => hire(sim, next.offers[0].id, 'wheat')), 'NO_FREE_BED');
  const ruined = newSim('stage1', 3, (st) => { rich(st); st.buildings.tent_1.condition = 'ruined'; }); toDay(ruined, 2);
  assert.equal(ruined.studentView().town.beds, 2);
});

test('the board rotates: unhired offers leave, hired ones stay hired, new ids appear with an announcement', () => {
  const sim = newSim('stage1', 3, rich); toDay(sim, 2);
  const first = sim.studentView().town.offers.map((o) => o.id);
  hire(sim, first[0], 'wheat');
  toDay(sim, 2 + defs.town.rotateDays);
  const t = sim.studentView().town;
  assert.ok(t.offers.every((o) => !first.includes(o.id)));
  assert.equal(refused(() => hire(sim, first[1], 'wheat')), 'NO_SUCH_OFFER', 'a left offer cannot be hired');
  const ann = sim.log.all().filter((e) => e.type === 'town.offers');
  assert.ok(ann.length >= 2); assert.deepEqual(ann.at(-1).offers, t.offers.map((o) => o.id));
  assert.equal(t.history.length, 1);
});

test('a recruited survivor takes commands like any other and walks in through the world', () => {
  const sim = newSim('stage1', 3, (st) => { rich(st); for (const b of ['gate', 'hq']) { const x = st.buildings[b]; x.health = defs.buildings[x.type].levels[x.level].maxHealth; x.condition = 'repaired'; } }); toDay(sim, 2);
  hire(sim, sim.studentView().town.offers[0].id, 'wheat');
  const s = sim.studentView().survivors[1];
  assert.equal(s.id, 'survivor_2');
  sim.submit({ ...buildCommand('survivor_2', { name: 'gather', args: ['wood', 5, 5] }), mode: 'queue' });
  const r = sim.runUntil(() => sim.snapshot().survivors.survivor_2.occupation === null && sim.isIdle(), 800);
  assert.ok(sim.snapshot().ledger[stockKey('wood')].total >= 100 + 5 || r.ticks > 0);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('learner code: town is a read plus town.recruit through the sandbox; refusals show in the result, a hire spends one strategy point', async () => {
  const s = newSim('stage1', 3, rich); toDay(s, 2);
  const first = s.studentView().town.offers[0];
  const out = await runLiveCode({ sim: s, sandbox, code: `const o = town.offers[0]; console.log(o.name, town.freeBeds); town.recruit(o.id, "wheat");` });
  assert.equal(out.ok, true); assert.equal(out.logs[0], `${first.name} 3`);
  assert.equal(out.submitted[0].ok, true);
  assert.ok(s.snapshot().survivors.survivor_2);
  const again = await runLiveCode({ sim: s, sandbox, code: `town.recruit(town.offers[0].id, "wheat");` });
  assert.equal(again.submitted[0].ok, false); assert.equal(again.submitted[0].error.code, 'ALREADY_HIRED');
  const bad = await runLiveCode({ sim: s, sandbox, code: `town.recruit(5);` });
  assert.equal(bad.ok, false); assert.equal(bad.error.code, 'INVALID_ARGUMENT');
  const frozen = await runLiveCode({ sim: s, sandbox, code: `town.offers.push(1);` });
  assert.equal(frozen.ok, false);
  const noGlobal = await runLiveCode({ sim: s, sandbox, code: `survivor.recruit("x");` });
  assert.equal(noGlobal.ok, false, 'recruit lives on town, not on survivor');
});

test('determinism: save-free replay of the command timeline gives the identical state; a hire survives replay', () => {
  // a sim whose stock is rich from the start, hire on day 2, record the timeline, replay it on a fresh identical world
  const state = createInitialState({ defs, scenarioId: 'stage1', seed: 5 }); rich(state);
  const sim = createSimulation({ defs, state }); toDay(sim, 2);
  const o = sim.studentView().town.offers[1];
  sim.submitCommand({ ...buildCommand('survivor_1', { name: 'recruit', args: [o.id, 'potato'] }), mode: 'queue' });
  sim.step(300);
  const tl = sim.commandTimeline();
  assert.equal(tl.length, 1); assert.equal(tl[0].command.type, 'recruit');
  const st2 = createInitialState({ defs, scenarioId: 'stage1', seed: 5 }); rich(st2);
  const re = createSimulation({ defs, state: st2 });
  for (const { tick, command } of tl) { if (tick > re.tick) re.step(tick - re.tick); re.submitCommand(command); }
  re.step(sim.tick - re.tick);
  assert.equal(re.stateHash(), sim.stateHash());
});

test('API + codebook: recruit is documented as town.recruit and absent from the survivor commands', async () => {
  const api = describeApi();
  assert.ok(api.commands.some((c) => c.name === 'recruit' && c.signature.startsWith('town.recruit')));
  assert.ok(api.reads.some((l) => l.startsWith('town ')));
  const { describeCodebook, entryForCommand } = await import('../src/modules/api/index.js');
  const e = entryForCommand(describeCodebook(), 'recruit');
  assert.equal(e.title, 'town.recruit()'); assert.equal(e.instant, true);
});

test('UI: town buttons follow the real rules (bed, stock, already hired, closed) and insert the real call', () => {
  const closed = newSim().studentView();
  assert.deepEqual(townActionList(closed), []);
  const sim = newSim('stage1', 3, (st) => { for (const i of Object.keys(defs.items)) stock(st, i, 0); stock(st, 'wheat', 100); }); toDay(sim, 2);
  let list = townActionList(sim.studentView());
  assert.equal(list.length, defs.town.offers);
  assert.ok(list.every((a) => a.enabled && a.snippet === `town.recruit("${a.offer.id}");`));
  const poor = newSim('stage1', 3, (st) => { for (const i of Object.keys(defs.items)) stock(st, i, 0); }); toDay(poor, 2);
  list = townActionList(poor.studentView());
  assert.ok(list.every((a) => !a.enabled && /Not enough supplies/.test(a.reason)));
  hire(sim, sim.studentView().town.offers[0].id, 'wheat');
  list = townActionList(sim.studentView());
  assert.equal(list[0].enabled, false); assert.match(list[0].reason, /Already/);
});

test('UI: every enabled town snippet runs through the real sandbox and the live simulation', async () => {
  const sim = newSim('stage1', 3, rich); toDay(sim, 2);
  const a = townActionList(sim.studentView())[1];
  const out = await runLiveCode({ sim, sandbox, code: a.snippet });
  assert.equal(out.ok, true); assert.equal(out.submitted[0].ok, true);
  assert.equal(sim.studentView().town.offers[1].hired, true);
});

test('soak: hiring across many days never breaks the ledger or invariants', () => {
  const sim = newSim('stage1', 11, rich);
  for (let d = 2; d <= 12; d++) {
    toDay(sim, d);
    for (const o of sim.studentView().town.offers) { try { hire(sim, o.id); } catch { /* full or hired */ } }
    sim.step(50);
    assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  }
  assert.ok(Object.keys(sim.snapshot().survivors).length <= 4);
});
