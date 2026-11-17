import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, types, sandbox, noCrops } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';

// A working kitchen and a stocked pantry: the shipped scenario starts with a ruined kitchen and 10 wheat.
const ready = (st) => {
  st.buildings.kitchen.health = 110; st.buildings.kitchen.condition = 'repaired';
  st.ledger['stock.wood'].total = 20;
};
const stock = (sim, k) => sim.snapshot().ledger[`stock.${k}`].total;
const failed = (sim) => JSON.stringify(sim.log.all().filter((e) => e.type === 'action.failed'));
const stopped = (sim) => sim.log.all().filter((e) => e.type === 'task.stopped').at(-1);

test('the kitchen starts as a ruin: cooking fails with NEEDS_REPAIR and spends nothing; repairing it makes cooking possible', () => {
  const sim = newSim('stage1', 1, (st) => { st.ledger['stock.wood'].total = 20; st.ledger['stock.stone'].total = 10; });
  assert.equal(sim.studentView().buildings.find((b) => b.id === 'kitchen').condition, 'ruined');
  assert.equal(sim.studentView().recipes.bread.stationWorking, false);
  call(sim, 'cook', 'bread', 1); runUntilIdle(sim);
  assert.ok(failed(sim).includes('NEEDS_REPAIR'), failed(sim));
  assert.equal(stock(sim, 'wheat'), 10);
  call(sim, 'repair', 'kitchen'); call(sim, 'repair', 'kitchen'); runUntilIdle(sim, 500);
  assert.equal(sim.studentView().recipes.bread.stationWorking, true);
  call(sim, 'cook', 'bread', 1); runUntilIdle(sim, 800);
  assert.equal(stock(sim, 'bread'), 1);
});

test('cook("bread", 3): three batches, exact inputs spent (2 wheat, 1 water, 1 wood each), 3 bread made, TARGET_REACHED, XP', () => {
  const sim = newSim('stage1', 1, ready);
  call(sim, 'cook', 'bread', 3);
  runUntilIdle(sim, 1000);
  const st = sim.snapshot();
  assert.equal(st.ledger['stock.bread'].total, 3);
  assert.equal(st.ledger['stock.wheat'].total, 10 - 6);
  assert.equal(st.ledger['stock.water'].total, 6 - 3);
  assert.equal(st.ledger['stock.wood'].total, 20 - 3);
  assert.equal(stopped(sim).reason, 'TARGET_REACHED');
  assert.equal(stopped(sim).crafted, 3);
  assert.equal(types(sim).filter((t) => t === 'item.crafted').length, 3);
  assert.ok(st.survivors.survivor_1.progression.xp.cooking >= 12);
  assert.deepEqual(ledgerViolations(st), []);
  assert.equal(st.survivors.survivor_1.lastTask.crafted, 3);
});

test('a batch takes recipe.ticks of work: nothing is spent or made before it finishes', () => {
  const sim = newSim('stage1', 1, ready);
  call(sim, 'cook', 'bread', 1);
  while (!types(sim).includes('item.crafted') && sim.tick < 200) {
    sim.step(1);
    if (!types(sim).includes('item.crafted')) assert.equal(stock(sim, 'bread'), 0);
  }
  assert.ok(sim.tick >= defs.recipes.bread.ticks, 'at least one batch of work ticks');
});

test('without a count she keeps cooking until the ingredients run out: NO_INGREDIENTS, and nothing is left reserved', () => {
  const sim = newSim('stage1', 1, ready); // 10 wheat = 5 batches, 6 water, 20 wood
  call(sim, 'cook', 'bread');
  runUntilIdle(sim, 2000);
  const st = sim.snapshot();
  assert.equal(st.ledger['stock.bread'].total, 5);
  assert.equal(st.ledger['stock.wheat'].total, 0);
  assert.equal(stopped(sim).reason, 'NO_INGREDIENTS');
  assert.deepEqual(ledgerViolations(st), []);
  assert.equal(Object.keys(st.reservations).length, 0);
});

test('a first batch that cannot be paid for fails as INSUFFICIENT_RESOURCE (nothing spent, nothing made)', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); st.ledger['stock.wheat'].total = 1; });
  call(sim, 'cook', 'bread', 2); runUntilIdle(sim, 300);
  assert.ok(failed(sim).includes('INSUFFICIENT_RESOURCE'), failed(sim));
  assert.equal(stock(sim, 'wheat'), 1);
  assert.equal(stock(sim, 'wood'), 20);
});

test('storage limits: no room for bread is STORAGE_FULL; bread can never exceed the pooled capacity', () => {
  const room = defs.buildings.hq.storage.bread;
  const sim = newSim('stage1', 1, (st) => { ready(st); st.ledger['stock.bread'].total = room - 1; st.ledger['stock.wheat'].total = 10; });
  call(sim, 'cook', 'bread', 5); runUntilIdle(sim, 1000);
  assert.equal(stock(sim, 'bread'), room);
  assert.equal(stopped(sim).reason, 'STORAGE_FULL');
  const full = newSim('stage1', 1, (st) => { ready(st); st.ledger['stock.bread'].total = room; });
  call(full, 'cook', 'bread', 1); runUntilIdle(full, 200);
  assert.ok(failed(full).includes('STORAGE_FULL'));
  assert.equal(stock(full, 'wheat'), 10);
});

test('cancelling mid-batch gives the reserved inputs back untouched', () => {
  const sim = newSim('stage1', 1, ready);
  call(sim, 'cook', 'bread', 2);
  for (let i = 0; i < 20; i++) sim.step(1); // one batch is finished, the second is under way
  assert.equal(stock(sim, 'bread'), 1);
  assert.ok(Object.keys(sim.snapshot().reservations).length > 0, 'the batch holds its inputs while it works');
  call(sim, 'stop');
  sim.step(1);
  const st = sim.snapshot();
  assert.equal(Object.keys(st.reservations).length, 0);
  assert.equal(st.ledger['stock.wheat'].total, 8, 'only the finished batch was paid for');
  assert.equal(st.ledger['stock.water'].total, 5);
  assert.equal(st.ledger['stock.wood'].total, 19);
  assert.equal(st.ledger['stock.bread'].total, 1);
  assert.deepEqual(ledgerViolations(st), []);
});

test('bad arguments: unknown recipe, non-integer or out-of-range count', () => {
  const sim = newSim('stage1', 1, ready);
  call(sim, 'cook', 'cake'); runUntilIdle(sim, 50);
  assert.ok(failed(sim).includes('INVALID_PARAMS'));
  assert.throws(() => call(sim, 'cook', 'bread', 0), /count/);
  assert.throws(() => call(sim, 'cook', 'bread', 1.5), /count/);
  assert.throws(() => call(sim, 'cook'), /recipe/);
});

test('a world with no kitchen at all is NO_STATION', () => {
  const none = newSim('stage1', 1, (st) => { ready(st); delete st.buildings.kitchen; });
  call(none, 'cook', 'bread', 1); runUntilIdle(none, 50);
  assert.ok(failed(none).includes('NO_STATION'), failed(none));
});

test('tired survivors cannot start cooking (EXHAUSTED); a long cook stops by itself when she tires out', () => {
  const tired = newSim('stage1', 1, (st) => { ready(st); st.survivors.survivor_1.needs.energy = 2; });
  call(tired, 'cook', 'bread', 1); runUntilIdle(tired, 100);
  assert.ok(failed(tired).includes('EXHAUSTED'));
  const sim = newSim('stage1', 1, (st) => { ready(st); st.survivors.survivor_1.needs.energy = 8; st.ledger['stock.wheat'].total = 40; st.ledger['stock.water'].total = 40; });
  call(sim, 'cook', 'bread'); runUntilIdle(sim, 3000);
  assert.equal(stopped(sim).reason, 'EXHAUSTED');
  assert.ok(stock(sim, 'bread') >= 1);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('eat: with no argument the cheapest food goes first; eat("bread") chooses bread; asking for something she does not have fails cleanly', () => {
  const hungry = (st) => { st.survivors.survivor_1.needs.hunger = 10; st.ledger['stock.bread'].total = 2; };
  const a = newSim('stage1', 1, hungry);
  call(a, 'eat'); runUntilIdle(a, 50);
  assert.equal(stock(a, 'food'), 5); assert.equal(stock(a, 'bread'), 2); assert.equal(a.snapshot().survivors.survivor_1.needs.hunger, 40);
  const b = newSim('stage1', 1, hungry);
  call(b, 'eat', 'bread'); runUntilIdle(b, 50);
  assert.equal(stock(b, 'food'), 6); assert.equal(stock(b, 'bread'), 1); assert.equal(b.snapshot().survivors.survivor_1.needs.hunger, 50, 'bread restores 40');
  assert.equal(b.log.all().find((e) => e.type === 'survivor.consumed').item, 'bread');
  const c = newSim('stage1', 1, (st) => { hungry(st); st.ledger['stock.bread'].total = 0; });
  call(c, 'eat', 'bread'); runUntilIdle(c, 50);
  assert.ok(failed(c).includes('INSUFFICIENT_RESOURCE'));
  assert.equal(stock(c, 'food'), 6, 'she did not fall back to other food when bread was asked for');
  const d = newSim('stage1', 1, hungry);
  call(d, 'eat', 'water'); runUntilIdle(d, 50);
  assert.ok(failed(d).includes('INVALID_PARAMS'));
  assert.equal(stock(d, 'water'), 6);
});

test('eat with no food at all still fails INSUFFICIENT_RESOURCE; drink is unchanged', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.needs.hunger = 10; st.survivors.survivor_1.needs.thirst = 10; st.ledger['stock.food'].total = 0; noCrops(st); });
  call(sim, 'eat'); runUntilIdle(sim, 50);
  assert.ok(failed(sim).includes('INSUFFICIENT_RESOURCE'));
  call(sim, 'drink'); runUntilIdle(sim, 50);
  assert.equal(sim.snapshot().survivors.survivor_1.needs.thirst, 40);
});

test('eat policy with prefer: eats the preferred food while it lasts, then falls back to the default order; unknown foods are refused', () => {
  const sim = newSim('stage1', 1, (st) => { st.survivors.survivor_1.needs.hunger = 20; st.ledger['stock.bread'].total = 1; });
  call(sim, 'policy', 'eat', { below: 30, prefer: 'bread' });
  call(sim, 'gather', 'wood', 5);
  for (let i = 0; i < 40; i++) sim.step(1);
  const eaten = sim.log.all().filter((e) => e.type === 'survivor.consumed').map((e) => e.item);
  assert.equal(eaten[0], 'bread');
  assert.equal(sim.studentView().survivor.policies.eat.prefer, 'bread');
  assert.throws(() => call(sim, 'policy', 'eat', { prefer: 'stone' }), /prefer/);
  assert.throws(() => call(sim, 'policy', 'drink', { prefer: 'water' }), /prefer|not an option/);
  const soft = newSim('stage1', 1, (st) => { st.survivors.survivor_1.needs.hunger = 20; });
  call(soft, 'policy', 'eat', { below: 30, prefer: 'bread' });
  call(soft, 'gather', 'wood', 5);
  for (let i = 0; i < 40; i++) soft.step(1);
  assert.equal(soft.log.all().find((e) => e.type === 'survivor.consumed')?.item, 'food', 'no bread in stock: the default food is eaten');
});

test('a needs policy that interrupts a cook job lets her resume it with the remaining count', () => {
  const sim = newSim('stage1', 1, (st) => { ready(st); st.survivors.survivor_1.needs.hunger = 31; });
  call(sim, 'policy', 'eat', { below: 30 });
  call(sim, 'cook', 'bread', 4);
  runUntilIdle(sim, 3000);
  assert.equal(stock(sim, 'bread'), 4, 'the interrupted job came back and finished exactly the requested count');
  assert.ok(types(sim).includes('task.resumed'));
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('learner code reads recipes and foods, cooks through the sandbox, and cannot write them', async () => {
  const sim = newSim('stage1', 1, ready);
  const code = 'if (recipes.bread.stationWorking && recipes.bread.canAfford && foods.bread.restore === 40) survivor.cook("bread", 2);';
  const res = await sandbox.run({ code, view: sim.studentView(), seed: 1 });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(res.calls.length, 1);
  assert.equal(res.calls[0].name, 'cook');
  const bad = await sandbox.run({ code: 'recipes.bread.inputs.wheat = 0;', view: sim.studentView(), seed: 1 });
  assert.equal(bad.ok, false, 'recipes are frozen');
});

test('view: recipe book, food table and station recipes are read-only and follow the world', () => {
  const sim = newSim('stage1', 1, (st) => { st.ledger['stock.wood'].total = 0; });
  const v = sim.studentView();
  assert.deepEqual(v.recipes.bread.inputs, { wheat: 2, water: 1, wood: 1 });
  assert.equal(v.recipes.bread.canAfford, false, 'no wood for fuel');
  assert.deepEqual(v.foods.food, { restore: 30, rank: 1, available: 6 });
  assert.deepEqual(v.buildings.find((b) => b.id === 'kitchen').recipes, [{ id: 'bread', stationLevel: 1, working: false }]);
  assert.ok(Object.isFrozen(v.recipes) && Object.isFrozen(v.foods));
  assert.equal(v.base.wheat, 10);
  assert.equal(v.base.capacity.bread, 40);
});

test('definitions validation rejects broken recipes and food tables', () => {
  const bad = (recipes) => assert.throws(() => createDefinitions({ recipes }), /recipe/);
  bad({ x: { ...defs.recipes.bread, station: 'nowhere' } });
  bad({ x: { ...defs.recipes.bread, inputs: { wheat: 0 } } });
  bad({ x: { ...defs.recipes.bread, outputs: { gold: 1 } } });
  bad({ x: { ...defs.recipes.bread, ticks: 0 } });
  bad({ x: { ...defs.recipes.bread, stationLevel: 9 } });
  bad({ x: { ...defs.recipes.bread, skill: 'gathering' } });
  const eat = { ...defs.actions.eat, items: { food: { restore: 30, rank: 1 }, bread: { restore: 40, rank: 1 } } };
  assert.throws(() => createDefinitions({ actions: { ...defs.actions, eat } }), /rank/);
});

test('cooking is deterministic and replays exactly', async () => {
  const run = () => { const s = newSim('stage1', 7, ready); call(s, 'cook', 'bread'); runUntilIdle(s, 2000); return s.stateHash(); };
  assert.equal(run(), run());
});

test('soak: random cooking/eating/gathering never breaks the ledger, storage limits or reservations', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const sim = newSim('stage1', seed, ready);
    const picks = [['cook', 'bread', 1 + (seed % 3)], ['eat'], ['eat', 'bread'], ['gather', 'wood', 5], ['cook', 'bread'], ['rest', 10], ['drink']];
    for (let i = 0; i < 30; i++) {
      try { call(sim, ...picks[(seed * 7 + i * 3) % picks.length]); } catch { /* a refused command costs nothing */ }
      for (let t = 0; t < 25; t++) sim.step(1);
      const st = sim.snapshot();
      assert.deepEqual(ledgerViolations(st), [], `seed ${seed} step ${i}`);
      assert.ok(st.ledger['stock.bread'].total <= sim.studentView().base.capacity.bread, 'bread within capacity');
      assert.ok(st.ledger['stock.bread'].total >= 0 && st.ledger['stock.wheat'].total >= 0);
    }
  }
});
