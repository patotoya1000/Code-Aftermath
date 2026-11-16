import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, types, sandbox } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { ledgerViolations, reserve } from '../src/modules/resources/index.js';

const DAY = defs.environment.ticksPerDay;
const setBread = (st, batches) => { st.perishables.bread = batches.map((b) => ({ ...b })); st.ledger['stock.bread'].total = batches.reduce((n, b) => n + b.qty, 0); };
const cellar = (st) => { st.buildings.storage_1.level = 2; st.buildings.storage_1.health = 170; st.buildings.storage_1.condition = 'repaired'; };
const bread = (sim) => sim.snapshot().ledger['stock.bread'].total;
const batches = (sim) => sim.snapshot().perishables.bread;
const days = (sim, n) => sim.step(DAY * n);
const spoiledEvents = (sim) => sim.log.all().filter((e) => e.type === 'food.spoiled');

test('bread ages one day at a time and spoils when its shelf life is used up; the loss leaves the ledger and is logged', () => {
  const sim = newSim('stage1', 1, (st) => setBread(st, [{ qty: 5, age: 0 }]));
  days(sim, 1); assert.deepEqual(batches(sim), [{ qty: 5, age: 100 }]);
  assert.equal(sim.studentView().base.perishables[0].daysLeft, 3);
  days(sim, 2); assert.equal(bread(sim), 5, 'still fresh after 3 days (shelf life is 4)');
  days(sim, 1);
  assert.equal(bread(sim), 0);
  assert.deepEqual(batches(sim), []);
  assert.deepEqual(spoiledEvents(sim).map((e) => [e.item, e.qty]), [['bread', 5]]);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('items without a shelf life never spoil (canned food, wheat)', () => {
  const sim = newSim('stage1', 1);
  days(sim, 12);
  assert.equal(sim.snapshot().ledger['stock.food'].total, 6);
  assert.equal(sim.snapshot().ledger['stock.wheat'].total, 10);
  assert.equal(spoiledEvents(sim).length, 0);
});

test('cooked bread is a fresh batch; eating takes the OLDEST units first', () => {
  const sim = newSim('stage1', 1, (st) => {
    st.buildings.kitchen.health = 110; st.buildings.kitchen.condition = 'repaired'; st.ledger['stock.wood'].total = 5;
    setBread(st, [{ qty: 2, age: 200 }]);
  });
  call(sim, 'cook', 'bread', 1); runUntilIdle(sim, 300);
  assert.deepEqual(batches(sim), [{ qty: 2, age: 200 }, { qty: 1, age: 0 }]);
  const hungry = newSim('stage1', 1, (st) => { setBread(st, [{ qty: 1, age: 300 }, { qty: 1, age: 0 }]); st.survivors.survivor_1.needs.hunger = 10; });
  call(hungry, 'eat', 'bread'); runUntilIdle(hungry, 50);
  assert.deepEqual(batches(hungry), [{ qty: 1, age: 0 }], 'the 3-day-old loaf went first');
});

test('a repaired cold cellar makes protected bread age twice as slowly', () => {
  const plain = newSim('stage1', 1, (st) => setBread(st, [{ qty: 5, age: 0 }]));
  const cold = newSim('stage1', 1, (st) => { setBread(st, [{ qty: 5, age: 0 }]); cellar(st); });
  days(plain, 3); days(cold, 3);
  assert.equal(batches(plain)[0].age, 300);
  assert.equal(batches(cold)[0].age, 150);
  days(plain, 1); days(cold, 4);
  assert.equal(bread(plain), 0, 'plain shelf: gone after 4 days');
  assert.equal(bread(cold), 5, 'cellar: 7 days in, still there (age 350)');
  days(cold, 1);
  assert.equal(bread(cold), 0, 'but it does spoil eventually (age 400)');
});

test('cold capacity is limited and protects the OLDEST units first; the rest ages normally', () => {
  const sim = newSim('stage1', 1, (st) => { cellar(st); setBread(st, [{ qty: 20, age: 200 }, { qty: 15, age: 100 }, { qty: 5, age: 0 }]); });
  days(sim, 1);
  // 30 cold units: all 20 of the oldest (200 -> 250) and 10 of the middle batch (100 -> 150); 5 middle units (100 -> 200) and the 5 fresh (0 -> 100) age normally.
  assert.deepEqual(batches(sim), [{ qty: 20, age: 250 }, { qty: 5, age: 200 }, { qty: 10, age: 150 }, { qty: 5, age: 100 }]);
  const view = sim.studentView().base.perishables;
  assert.equal(view.reduce((n, b) => n + b.qty, 0), 40);
  assert.equal(view.filter((b) => b.cold).reduce((n, b) => n + b.qty, 0), 30);
});

test('a ruined cellar protects nothing; the cellar gets built through the normal path (repair, then upgrade the storehouse)', () => {
  const ruined = newSim('stage1', 1, (st) => { setBread(st, [{ qty: 5, age: 0 }]); st.buildings.storage_1.level = 2; st.buildings.storage_1.health = 20; st.buildings.storage_1.condition = 'ruined'; });
  days(ruined, 1);
  assert.equal(batches(ruined)[0].age, 100);

  const sim = newSim('stage1', 1, (st) => { st.ledger['stock.wood'].total = 80; st.ledger['stock.stone'].total = 60; st.survivors.survivor_1.skills.repair = 1; });
  assert.equal(sim.studentView().buildings.find((b) => b.id === 'storage_1').cold, undefined, 'level 1 has no cold table');
  for (let i = 0; i < 4; i++) call(sim, 'repair', 'storage_1');
  runUntilIdle(sim, 800);
  call(sim, 'upgrade', 'storage_1'); runUntilIdle(sim, 800);
  const b = sim.studentView().buildings.find((x) => x.id === 'storage_1');
  assert.equal(b.level, 2);
  assert.deepEqual(b.cold, { capacity: 30, factor: 2, working: true });
});

test('units reserved by a meal in progress are never taken away by spoilage; they go the next day', () => {
  const sim = newSim('stage1', 1, (st) => { setBread(st, [{ qty: 3, age: 300 }]); reserve(st, { owner: 'test', account: 'stock.bread', qty: 1 }); });
  days(sim, 1);
  assert.equal(bread(sim), 1, 'only the two unreserved loaves spoiled');
  assert.deepEqual(spoiledEvents(sim).map((e) => e.qty), [2]);
  assert.deepEqual(batches(sim), [{ qty: 1, age: 400 }]);
});

test('stock changed outside the game rules is treated as fresh (no crash, no phantom food)', () => {
  const sim = newSim('stage1', 1, (st) => { st.ledger['stock.bread'].total = 4; });
  assert.equal(sim.studentView().base.perishables[0].daysLeft, 4);
  days(sim, 1);
  assert.equal(bread(sim), 4);
  assert.deepEqual(batches(sim), [{ qty: 4, age: 100 }]);
});

test('learner code reads base.perishables and the cellar, and can decide what to eat', async () => {
  const sim = newSim('stage1', 1, (st) => { setBread(st, [{ qty: 2, age: 300 }]); });
  const res = await sandbox.run({ code: 'const old = base.perishables.find((p) => p.item === "bread" && p.daysLeft <= 1); if (old) survivor.eat("bread");', view: sim.studentView(), seed: 1 });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(res.calls.length, 1);
  const bad = await sandbox.run({ code: 'base.perishables[0].qty = 99;', view: sim.studentView(), seed: 1 });
  assert.equal(bad.ok, false);
});

test('definitions validation: shelfLife and cold tables', () => {
  assert.throws(() => createDefinitions({ items: { ...defs.items, bread: { ...defs.items.bread, shelfLife: 0 } } }), /shelfLife/);
  const b = structuredClone(defs.buildings);
  b.storage.levels[2].cold = { capacity: 0, factor: 2 };
  assert.throws(() => createDefinitions({ buildings: b }), /cold/);
  b.storage.levels[2].cold = { capacity: 5, factor: 1 };
  assert.throws(() => createDefinitions({ buildings: b }), /cold/);
});

test('soak: cooking, eating and ageing over 12 days keep the batches equal to the ledger and conserve every loaf', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const sim = newSim('stage1', seed, (st) => {
      st.buildings.kitchen.health = 110; st.buildings.kitchen.condition = 'repaired'; st.ledger['stock.wood'].total = 60; st.ledger['stock.wheat'].total = 60; st.ledger['stock.water'].total = 60;
      if (seed % 2) cellar(st);
    });
    const picks = [['cook', 'bread', 3], ['eat', 'bread'], ['rest', 20], ['cook', 'bread'], ['eat'], ['drink']];
    for (let i = 0; i < 40; i++) {
      try { call(sim, ...picks[(seed + i * 5) % picks.length]); } catch { /* refused: free */ }
      sim.step(DAY / 4);
      const st = sim.snapshot();
      const sum = (st.perishables.bread ?? []).reduce((n, b) => n + b.qty, 0);
      assert.equal(sum, st.ledger['stock.bread'].total, `seed ${seed} step ${i}: batches match the ledger`);
      assert.deepEqual(ledgerViolations(st), []);
    }
    const made = sim.log.all().filter((e) => e.type === 'item.crafted').length;
    const ate = sim.log.all().filter((e) => e.type === 'survivor.consumed' && e.item === 'bread').length;
    const lost = spoiledEvents(sim).reduce((n, e) => n + e.qty, 0);
    assert.equal(made - ate - lost, bread(sim), `seed ${seed}: made - eaten - spoiled = in stock`);
  }
});

test('spoilage is deterministic', () => {
  const run = () => { const s = newSim('stage1', 5, (st) => { cellar(st); setBread(st, [{ qty: 9, age: 120 }]); }); days(s, 6); return s.stateHash(); };
  assert.equal(run(), run());
  assert.ok(types(newSim('stage1', 1)).length === 0);
});
