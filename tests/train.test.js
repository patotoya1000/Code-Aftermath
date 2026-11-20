// W5 the town train: a pure (seed, visit) schedule, announced ahead, in for stayDays; extra recruits with more skills; limited goods bought with supplies
// (instant `town.buy`, checked before any change); anything unbought leaves with the train.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { trainArrival, trainOn, nextTrain, trainCargo, offersForDay } from '../src/modules/town/index.js';
import { buildCommand, describeApi, describeCodebook, entryForCommand } from '../src/modules/api/index.js';
import { runLiveCode } from '../src/modules/session/index.js';
import { ledgerViolations, stockKey } from '../src/modules/resources/index.js';
import { trainActionList } from '../src/app/ui/actions.js';
import { defs, sandbox, newSim } from './helpers.js';

const DAY = defs.environment.ticksPerDay;
const tr = defs.town.train;
const toDay = (sim, day) => { while (sim.snapshot().tick < (day - 1) * DAY - defs.environment.startHour * (DAY / 24) + 2) sim.step(1); };
const stock = (st, item, n) => { st.ledger[stockKey(item)].total = n; };
const rich = (st) => { for (const i of ['wheat', 'potato', 'carrot', 'wood', 'stone', 'bread']) stock(st, i, 500); };
const cmd = (name, ...args) => ({ ...buildCommand('survivor_1', { name, args }), mode: 'queue' });
const buy = (sim, ...a) => sim.submit(cmd('buy', ...a));
const refused = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('data: the train table validates; bad ones are refused', () => {
  assert.throws(() => createDefinitions({ town: { ...defs.town, train: { ...tr, gapDays: { min: 1, max: 3 } } } }), /gapDays/);
  assert.throws(() => createDefinitions({ town: { ...defs.town, train: { ...tr, goods: { ...tr.goods, bread: { worth: 5, qty: [1, 2] } } } } }), /goods/, 'a payment item cannot also be sold');
  assert.throws(() => createDefinitions({ town: { ...defs.town, train: { ...tr, goodsPerVisit: 9 } } }), /goods/);
  assert.throws(() => createDefinitions({ town: { ...defs.town, train: { ...tr, bonusSkills: 20 } } }), /bonusSkills/);
});

test('schedule: pure per seed, first on firstDay, gaps inside gapDays, visits never overlap, no train before the first', () => {
  assert.equal(trainArrival(defs, 3, 1), tr.firstDay);
  for (const seed of [1, 2, 3, 99]) {
    let prev = trainArrival(defs, seed, 1);
    for (let k = 2; k <= 12; k++) {
      const a = trainArrival(defs, seed, k);
      assert.ok(a - prev >= tr.gapDays.min && a - prev <= tr.gapDays.max); assert.equal(a, trainArrival(defs, seed, k));
      prev = a;
    }
  }
  assert.notDeepEqual([2, 3, 4, 5, 6, 7].map((k) => trainArrival(defs, 1, k)), [2, 3, 4, 5, 6, 7].map((k) => trainArrival(defs, 2, k)));
  for (let d = 1; d < tr.firstDay; d++) assert.equal(trainOn(defs, 3, d), null);
  const v = trainOn(defs, 3, tr.firstDay);
  assert.deepEqual(v, { k: 1, arrives: tr.firstDay, leaves: tr.firstDay + tr.stayDays });
  assert.equal(trainOn(defs, 3, tr.firstDay + tr.stayDays), null);
  assert.equal(nextTrain(defs, 3, 1).arrives, tr.firstDay);
});

test('cargo: pure, limited, different per visit; goods are distinct and inside their quantity range; train recruits carry bonus skills', () => {
  const a = trainCargo(defs, 3, 1); assert.deepEqual(a, trainCargo(defs, 3, 1));
  assert.equal(a.goods.length, tr.goodsPerVisit); assert.equal(new Set(a.goods.map((g) => g.item)).size, a.goods.length);
  for (let seed = 1; seed <= 20; seed++) for (let k = 1; k <= 6; k++) {
    const c = trainCargo(defs, seed, k);
    for (const g of c.goods) { const r = tr.goods[g.item].qty; assert.ok(g.qty >= r[0] && g.qty <= r[1]); assert.equal(g.id, `train_${k}_${g.item}`); }
    assert.equal(c.recruits.length, tr.recruits);
    for (const r of c.recruits) assert.equal(Object.keys(r.skills).length, defs.town.candidates.skills.count + tr.bonusSkills);
  }
  assert.notDeepEqual(trainCargo(defs, 3, 1).goods.map((g) => g.item), [2, 3, 4, 5].map((k) => trainCargo(defs, 3, k).goods.map((g) => g.item)).flat().slice(0, 3));
  const day = offersForDay(defs, 3, tr.firstDay);
  assert.equal(day.length, defs.town.offers + tr.recruits); assert.ok(day.filter((o) => o.train).length === tr.recruits);
  assert.equal(offersForDay(defs, 3, tr.firstDay + tr.stayDays).filter((o) => o.train).length, 0);
});

test('events: warning a day ahead, arrival, departure; the view counts down', () => {
  const sim = newSim('stage1', 3, rich); toDay(sim, tr.firstDay + tr.stayDays + 1);
  const ev = sim.log.all().filter((e) => e.type.startsWith('train.'));
  assert.deepEqual(ev.map((e) => [e.type, e.day]), [['train.warning', tr.firstDay], ['train.arrived', tr.firstDay], ['train.left', tr.firstDay + tr.stayDays]]);
  const sim2 = newSim('stage1', 3, rich); toDay(sim2, tr.firstDay - 1);
  const t = sim2.studentView().town.train; assert.equal(t.present, false); assert.equal(t.arrivesInDays, 1); assert.deepEqual(t.goods, []);
  toDay(sim2, tr.firstDay);
  const t2 = sim2.studentView().town.train; assert.equal(t2.present, true); assert.equal(t2.leavesInDays, tr.stayDays); assert.equal(t2.goods.length, tr.goodsPerVisit);
  assert.ok(sim2.studentView().town.offers.some((o) => o.train));
});

test('buy: pays from stock, goods land in base stock, limited quantity, per-unit price, ledger stays balanced', () => {
  const sim = newSim('stage1', 3, rich); toDay(sim, tr.firstDay);
  const g = sim.studentView().town.train.goods[0];
  const before = sim.snapshot().ledger; const had = before[stockKey(g.item)].total; const wheat = before[stockKey('wheat')].total;
  assert.equal(buy(sim, g.id, 1, 'wheat'), null);
  const st = sim.snapshot();
  assert.equal(st.ledger[stockKey(g.item)].total, had + 1); assert.equal(st.ledger[stockKey('wheat')].total, wheat - g.price.wheat);
  assert.equal(st.town.bought[g.id], 1); assert.deepEqual(ledgerViolations(st), []);
  const left = sim.studentView().town.train.goods[0].left; assert.equal(left, g.qty - 1);
  assert.equal(sim.log.all().filter((e) => e.type === 'town.bought').length, 1);
  if (g.qty > 1) { assert.equal(refused(() => buy(sim, g.id, g.qty, 'wheat')), 'SOLD_OUT'); buy(sim, g.id, left, 'wheat'); }
  assert.equal(refused(() => buy(sim, g.id, 1, 'wheat')), 'SOLD_OUT');
});

test('buy: a bigger quantity costs the rounded-up worth of all units, not unit price times n', () => {
  const sim = newSim('stage1', 3, rich); toDay(sim, tr.firstDay);
  const g = sim.studentView().town.train.goods.find((x) => x.qty >= 3);
  if (!g) return; // this seed carries no stackable goods
  const wheat = sim.snapshot().ledger[stockKey('wheat')].total;
  buy(sim, g.id, 3, 'wheat');
  assert.equal(sim.snapshot().ledger[stockKey('wheat')].total, wheat - Math.ceil((g.worth * 3) / defs.town.payWith.wheat));
});

test('buy: every refusal says why and changes nothing', () => {
  const sim = newSim('stage1', 3, rich); toDay(sim, tr.firstDay - 1);
  const h0 = sim.stateHash();
  assert.equal(refused(() => buy(sim, 'train_1_bow')), 'NO_TRAIN');
  assert.equal(sim.stateHash(), h0);
  toDay(sim, tr.firstDay);
  const g = sim.studentView().town.train.goods[0]; const h1 = sim.stateHash();
  assert.equal(refused(() => buy(sim, 'train_1_nothing')), 'NO_SUCH_OFFER');
  assert.equal(refused(() => buy(sim, g.id, 1, 'gold')), 'NOT_ACCEPTED');
  assert.equal(refused(() => buy(sim, g.id, 1, 'mre')), 'CANNOT_AFFORD');
  assert.equal(refused(() => buy(sim, g.id, g.qty + 1, 'wheat')), 'SOLD_OUT');
  assert.equal(sim.stateHash(), h1);
  const poor = newSim('stage1', 3, (st) => { for (const i of Object.keys(defs.items)) stock(st, i, 0); }); toDay(poor, tr.firstDay);
  assert.equal(refused(() => buy(poor, poor.studentView().town.train.goods[0].id)), 'CANNOT_AFFORD');
});

test('buy: STORAGE_FULL when base storage has no room for the goods', () => {
  const sim = newSim('stage1', 3, (st) => { rich(st); for (const b of Object.values(st.buildings)) if (b.storage) b.condition = 'ruined'; }); toDay(sim, tr.firstDay);
  const g = sim.studentView().town.train.goods[0]; const h = sim.stateHash();
  assert.equal(refused(() => buy(sim, g.id, 1, 'wheat')), 'STORAGE_FULL'); assert.equal(sim.stateHash(), h);
});

test('goods leave with the train, and a train recruit can still be hired while it is in (not after)', () => {
  const sim = newSim('stage1', 3, rich); toDay(sim, tr.firstDay);
  const r = sim.studentView().town.offers.find((o) => o.train);
  sim.submit(cmd('recruit', r.id, 'wheat'));
  assert.ok(sim.snapshot().survivors.survivor_2);
  const other = sim.studentView().town.offers.find((o) => o.train && !o.hired);
  toDay(sim, tr.firstDay + tr.stayDays);
  assert.equal(refused(() => sim.submit(cmd('recruit', other.id, 'wheat'))), 'NO_SUCH_OFFER');
  const gone = trainCargo(defs, 3, 1).goods[0];
  assert.equal(refused(() => buy(sim, gone.id, 1, 'wheat')), 'NO_TRAIN');
});

test('a bought weapon is a real stock item: survivor.equip uses it', async () => {
  const sim = newSim('stage1', 3, (st) => { rich(st); stock(st, 'arrows', 0); for (const id of ['hq', 'storage_1']) { const b = st.buildings[id]; b.health = defs.buildings[b.type].levels[b.level].maxHealth; b.condition = 'repaired'; } st.survivors.survivor_1.skills.combat = 3; }); toDay(sim, tr.firstDay);
  const w = sim.studentView().town.train.goods.find((g) => ['advanced_spear', 'bow', 'crossbow'].includes(g.item));
  if (!w) return; // this seed's train carries no weapon: covered by the data-level checks
  buy(sim, w.id, 1, 'wheat');
  assert.equal(sim.snapshot().ledger[stockKey(w.item)].total, 1);
  sim.submit(cmd('equip', w.item)); sim.step(200);
  assert.equal(sim.snapshot().survivors.survivor_1.equipment.weapon, w.item);
});

test('learner code: town.train read, town.buy through the sandbox, refusals reported, not on survivor', async () => {
  const sim = newSim('stage1', 3, rich); toDay(sim, tr.firstDay);
  const out = await runLiveCode({ sim, sandbox, code: `if (town.train.present) { for (const g of town.train.goods) { if (g.canAfford) town.buy(g.id); } } console.log(town.train.goods.length);` });
  assert.equal(out.ok, true); assert.equal(out.logs[0], String(tr.goodsPerVisit));
  assert.ok(out.submitted.length >= 1 && out.submitted.every((s) => s.ok));
  const bad = await runLiveCode({ sim, sandbox, code: `town.buy("train_1_nothing");` });
  assert.equal(bad.submitted[0].ok, false); assert.equal(bad.submitted[0].error.code, 'NO_SUCH_OFFER');
  assert.equal((await runLiveCode({ sim, sandbox, code: `town.buy(3);` })).error.code, 'INVALID_ARGUMENT');
  assert.equal((await runLiveCode({ sim, sandbox, code: `survivor.buy("x");` })).ok, false);
});

test('determinism: a purchase and a train hire replay to the identical state', () => {
  const mk = () => newSim('stage1', 5, rich);
  const a = mk(); toDay(a, tr.firstDay);
  const g = a.studentView().town.train.goods[0]; const r = a.studentView().town.offers.find((o) => o.train);
  a.submitCommand(cmd('buy', g.id, 1, 'wheat')); a.submitCommand(cmd('recruit', r.id, 'potato')); a.step(200);
  const b = mk();
  for (const { tick, command } of a.commandTimeline()) { if (tick > b.tick) b.step(tick - b.tick); b.submitCommand(command); }
  b.step(a.tick - b.tick);
  assert.equal(b.stateHash(), a.stateHash());
});

test('API + codebook + UI: buy is town.buy, buttons follow the rules and the snippets run for real', async () => {
  assert.ok(describeApi().commands.some((c) => c.name === 'buy' && c.signature.startsWith('town.buy')));
  const e = entryForCommand(describeCodebook(), 'buy'); assert.equal(e.title, 'town.buy()'); assert.equal(e.instant, true);
  const away = newSim('stage1', 3, rich); toDay(away, tr.firstDay - 1);
  assert.deepEqual(trainActionList(away.studentView()), []);
  const sim = newSim('stage1', 3, rich); toDay(sim, tr.firstDay);
  const list = trainActionList(sim.studentView());
  assert.equal(list.length, tr.goodsPerVisit); assert.ok(list.every((a) => a.enabled && a.snippet.startsWith('town.buy(')));
  const out = await runLiveCode({ sim, sandbox, code: list[0].snippet });
  assert.equal(out.submitted[0].ok, true);
  const poor = newSim('stage1', 3, (st) => { for (const i of Object.keys(defs.items)) stock(st, i, 0); }); toDay(poor, tr.firstDay);
  assert.ok(trainActionList(poor.studentView()).every((a) => !a.enabled && /Not enough supplies/.test(a.reason)));
});

test('soak: many days of trains, hires and purchases never break the ledger', () => {
  const sim = newSim('stage1', 21, rich);
  for (let d = 2; d <= 30; d++) {
    toDay(sim, d);
    const t = sim.studentView().town;
    for (const g of t.train.goods) { try { buy(sim, g.id, 1); } catch { /* sold out or full */ } }
    for (const o of t.offers) { try { sim.submit(cmd('recruit', o.id)); } catch { /* beds */ } }
    sim.step(40);
    assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  }
});
