// O12 workshop crafting + kitchen levels 2-3: the workshop station, survivor.craft (same batch engine as cook), the Crafting skill, hot meal
// (kitchen 2), MRE (kitchen 3, sealed by a powered machine), glass (workshop 2, powered), recipe power on the grid, foods, spoilage, API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, types, sandbox, noCrops } from './helpers.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { describeApi } from '../src/modules/api/index.js';

const DAY = defs.environment.ticksPerDay;
const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) st.ledger[`stock.${k}`].total = v; };
const skill = (st, name, level) => { st.survivors.survivor_1.skills[name] = level; };
const stock = (sim, k) => sim.snapshot().ledger[`stock.${k}`].total;
const failed = (sim) => JSON.stringify(sim.log.all().filter((e) => e.type === 'action.failed'));
const stopped = (sim) => sim.log.all().filter((e) => e.type === 'task.stopped').at(-1);
const view = (sim, id) => sim.studentView().buildings.find((b) => b.id === id);

const shop = (st, level = 1) => { fix(st, 'workshop_1', level); give(st, { wood: 40, stone: 40 }); };
// A kitchen at `level`, cooking skill, and a working generator with fuel (the MRE sealer and the glass furnace draw power).
const powered = (st) => { fix(st, 'generator_1', 1); st.ledger['stock.wood'].total = Math.max(st.ledger['stock.wood'].total, 40); };

test('the workshop starts as a ruin: craft fails NEEDS_REPAIR and spends nothing; repairing it makes crafting possible', () => {
  const sim = newSim('stage1', 1, (st) => give(st, { wood: 40, stone: 40 }));
  assert.equal(view(sim, 'workshop_1').condition, 'ruined');
  assert.equal(sim.studentView().recipes.packaging.stationWorking, false);
  call(sim, 'craft', 'packaging', 1); runUntilIdle(sim);
  assert.ok(failed(sim).includes('NEEDS_REPAIR'), failed(sim));
  assert.equal(stock(sim, 'wood'), 40);
  for (let i = 0; i < 4; i++) call(sim, 'repair', 'workshop_1');
  runUntilIdle(sim, 800);
  assert.equal(sim.studentView().recipes.packaging.stationWorking, true);
});

test('craft("packaging", 3): exact inputs (2 wood + 1 stone per batch), 2 packaging per batch, TARGET_REACHED, Crafting XP, ledger balanced', () => {
  const sim = newSim('stage1', 1, shop);
  call(sim, 'craft', 'packaging', 3);
  runUntilIdle(sim, 1000);
  const st = sim.snapshot();
  assert.equal(st.ledger['stock.packaging'].total, 6);
  assert.equal(st.ledger['stock.wood'].total, 40 - 6);
  assert.equal(st.ledger['stock.stone'].total, 40 - 3);
  assert.equal(stopped(sim).reason, 'TARGET_REACHED');
  assert.equal(stopped(sim).taskType, 'craft');
  assert.equal(stopped(sim).crafted, 3);
  assert.equal(types(sim).filter((t) => t === 'item.crafted').length, 3);
  assert.ok(st.survivors.survivor_1.progression.xp.crafting >= 12, 'crafting is practised');
  assert.equal(st.survivors.survivor_1.progression.xp.cooking ?? 0, 0, 'and cooking is not');
  assert.deepEqual(ledgerViolations(st), []);
});

test('each recipe belongs to one command: craft("bread") and cook("packaging") are refused and cost nothing', () => {
  const sim = newSim('stage1', 1, (st) => { shop(st); fix(st, 'kitchen'); give(st, { wheat: 10 }); });
  call(sim, 'craft', 'bread', 1); call(sim, 'cook', 'packaging', 1);
  runUntilIdle(sim);
  assert.equal((failed(sim).match(/INVALID_PARAMS/g) ?? []).length, 2, failed(sim));
  assert.equal(stock(sim, 'wood'), 40);
  assert.equal(stock(sim, 'wheat'), 10);
});

test('the kitchen has levels: a level-1 kitchen cannot make a hot meal (NEEDS_REPAIR), upgrading it unlocks the recipe', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'kitchen'); give(st, { wood: 60, stone: 60, potato: 4, carrot: 4 }); skill(st, 'repair', 1); skill(st, 'cooking', 1); });
  assert.equal(view(sim, 'kitchen').upgrade.level, 2);
  call(sim, 'cook', 'hot_meal', 1); runUntilIdle(sim);
  assert.ok(failed(sim).includes('NEEDS_REPAIR'), failed(sim));
  call(sim, 'upgrade', 'kitchen'); runUntilIdle(sim, 800);
  assert.equal(view(sim, 'kitchen').level, 2);
  assert.equal(view(sim, 'kitchen').name, 'Stove Kitchen');
  assert.equal(stock(sim, 'wood'), 40); assert.equal(stock(sim, 'stone'), 40);
  call(sim, 'cook', 'hot_meal', 1); runUntilIdle(sim, 800);
  assert.equal(stock(sim, 'hot_meal'), 1);
});

test('hot meal: needs a little Cooking skill, spends exactly 1 potato + 1 carrot + 1 water + 1 wood per batch, restores 60 hunger', () => {
  const rookie = newSim('stage1', 1, (st) => { fix(st, 'kitchen', 2); give(st, { wood: 10, potato: 4, carrot: 4 }); });
  call(rookie, 'cook', 'hot_meal', 1); runUntilIdle(rookie);
  assert.ok(failed(rookie).includes('CAPABILITY_INSUFFICIENT'), failed(rookie));
  assert.equal(stock(rookie, 'potato'), 4);

  const sim = newSim('stage1', 1, (st) => { fix(st, 'kitchen', 2); give(st, { wood: 10, potato: 4, carrot: 4 }); skill(st, 'cooking', 1); st.survivors.survivor_1.needs.hunger = 20; });
  call(sim, 'cook', 'hot_meal', 2); runUntilIdle(sim, 1000);
  const st = sim.snapshot();
  assert.equal(st.ledger['stock.hot_meal'].total, 2);
  assert.equal(st.ledger['stock.potato'].total, 2); assert.equal(st.ledger['stock.carrot'].total, 2);
  assert.equal(st.ledger['stock.water'].total, 4); assert.equal(st.ledger['stock.wood'].total, 8);
  assert.equal(sim.studentView().foods.hot_meal.restore, 60);
  const h = st.survivors.survivor_1.needs.hunger;
  call(sim, 'eat', 'hot_meal'); runUntilIdle(sim);
  assert.ok(sim.snapshot().survivors.survivor_1.needs.hunger >= Math.min(100, h + 60) - 2, 'restores ~60 (minus a decay tick or two)');
  assert.equal(stock(sim, 'hot_meal'), 1);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('hot meals spoil (3 days) but an MRE never does', () => {
  const sim = newSim('stage1', 1, (st) => { noCrops(st); give(st, { hot_meal: 2, mre: 2 }); st.perishables.hot_meal = [{ qty: 2, age: 0 }]; });
  assert.equal(defs.items.hot_meal.shelfLife, 3);
  assert.equal(defs.items.mre.shelfLife, undefined);
  sim.step(DAY * 4 + 5);
  assert.equal(stock(sim, 'hot_meal'), 0, 'gone after its shelf life');
  assert.equal(stock(sim, 'mre'), 2, 'sealed food keeps');
  assert.ok(types(sim).includes('food.spoiled'));
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('eat order: the MRE is the last resort by default, but eat("mre") restores 100', () => {
  const sim = newSim('stage1', 1, (st) => { noCrops(st); give(st, { food: 0, mre: 1, hot_meal: 1 }); st.perishables.hot_meal = [{ qty: 1, age: 0 }]; st.survivors.survivor_1.needs.hunger = 10; });
  assert.ok(defs.actions.eat.items.mre.rank > defs.actions.eat.items.hot_meal.rank);
  call(sim, 'eat'); runUntilIdle(sim);
  assert.equal(stock(sim, 'hot_meal'), 0); assert.equal(stock(sim, 'mre'), 1, 'cheapest first');
  call(sim, 'eat', 'mre'); runUntilIdle(sim);
  assert.equal(stock(sim, 'mre'), 0);
  assert.ok(sim.snapshot().survivors.survivor_1.needs.hunger >= 98, 'from ~10 to full');
});

test('MRE: kitchen level 3 + 2 hot meals + packaging + POWER while it is sealed; wood burns as fuel; the MRE is made', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'kitchen', 3); powered(st); give(st, { hot_meal: 4, packaging: 2 }); st.perishables.hot_meal = [{ qty: 4, age: 0 }]; skill(st, 'cooking', 2); });
  assert.equal(sim.studentView().recipes.mre.power, 4);
  assert.equal(sim.studentView().power.demand, 0, 'idle: nothing asks for power');
  const wood0 = stock(sim, 'wood');
  call(sim, 'cook', 'mre', 2); runUntilIdle(sim, 1500);
  const st = sim.snapshot();
  assert.equal(st.ledger['stock.mre'].total, 2);
  assert.equal(st.ledger['stock.hot_meal'].total, 0); assert.equal(st.ledger['stock.packaging'].total, 0);
  assert.ok(st.ledger['stock.wood'].total < wood0, 'the generator burned wood while the sealer ran');
  assert.equal(stopped(sim).reason, 'TARGET_REACHED');
  assert.ok(types(sim).includes('power.status'));
  assert.deepEqual(ledgerViolations(st), []);
});

test('MRE without a working grid: she waits, makes no progress, spends nothing, then stops with NO_POWER', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'kitchen', 3); give(st, { hot_meal: 2, packaging: 1 }); st.perishables.hot_meal = [{ qty: 2, age: 0 }]; skill(st, 'cooking', 2); });
  call(sim, 'cook', 'mre', 1); runUntilIdle(sim, 1500);
  assert.ok(failed(sim).includes('NO_POWER'), failed(sim)); // nothing was finished, so the job FAILS with the stop reason (like every standing action)
  assert.equal(stock(sim, 'mre'), 0);
  assert.equal(stock(sim, 'hot_meal'), 2); assert.equal(stock(sim, 'packaging'), 1);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  assert.equal(sim.studentView().base.hot_meal, 2, 'and nothing is left reserved');
});

test('a powered recipe with a generator that has no fuel also ends in NO_POWER', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'kitchen', 3); fix(st, 'generator_1'); give(st, { hot_meal: 2, packaging: 1, wood: 0 }); st.perishables.hot_meal = [{ qty: 2, age: 0 }]; skill(st, 'cooking', 2); });
  call(sim, 'cook', 'mre', 1); runUntilIdle(sim, 1500);
  assert.ok(failed(sim).includes('NO_POWER'), 'no wood, no fuel, no power');
  assert.equal(view(sim, 'generator_1').power.status, 'NO_FUEL');
});

test('glass: workshop level 2, Crafting skill 1, stone + wood, power for the furnace', () => {
  const sim = newSim('stage1', 1, (st) => { shop(st, 1); powered(st); give(st, { wood: 40, stone: 40 }); skill(st, 'crafting', 1); });
  call(sim, 'craft', 'glass', 1); runUntilIdle(sim);
  assert.ok(failed(sim).includes('NEEDS_REPAIR'), 'level 1 workshop has no furnace');
  const l2 = newSim('stage1', 1, (st) => { shop(st, 2); powered(st); give(st, { wood: 40, stone: 40 }); skill(st, 'crafting', 1); });
  const wood0 = stock(l2, 'wood');
  call(l2, 'craft', 'glass', 2); runUntilIdle(l2, 1500);
  assert.equal(stock(l2, 'glass'), 2);
  assert.equal(stock(l2, 'stone'), 40 - 8);
  assert.ok(stock(l2, 'wood') <= wood0 - 4, 'recipe wood plus generator fuel');
  const rookie = newSim('stage1', 1, (st) => { shop(st, 2); powered(st); });
  call(rookie, 'craft', 'glass', 1); runUntilIdle(rookie);
  assert.ok(failed(rookie).includes('CAPABILITY_INSUFFICIENT'), 'glass needs Crafting 1 (packaging teaches it)');
});

test('power demand from a recipe appears only while she works a batch at the station, and is served after building consumers', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'kitchen', 3); powered(st); give(st, { hot_meal: 2, packaging: 1 }); st.perishables.hot_meal = [{ qty: 2, age: 0 }]; skill(st, 'cooking', 2); });
  call(sim, 'cook', 'mre', 1);
  let sawDemand = false; let before = 0;
  while (!sim.isIdle() && sim.tick < 1500) { sim.step(1); const p = sim.studentView().power; if (p.demand === 4) sawDemand = true; if (!sawDemand) before += p.demand; }
  assert.equal(before, 0, 'no demand while she walks to the kitchen');
  assert.ok(sawDemand, 'demand of 4 while sealing');
  sim.step(5);
  assert.equal(sim.studentView().power.demand, 0, 'and none afterwards');
});

test('cancelling a powered batch releases its inputs untouched', () => {
  const sim = newSim('stage1', 1, (st) => { fix(st, 'kitchen', 3); powered(st); give(st, { hot_meal: 2, packaging: 1 }); st.perishables.hot_meal = [{ qty: 2, age: 0 }]; skill(st, 'cooking', 2); });
  call(sim, 'cook', 'mre', 1); sim.step(15);
  call(sim, 'stop'); sim.step(3);
  assert.equal(stock(sim, 'hot_meal'), 2); assert.equal(stock(sim, 'packaging'), 1);
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  assert.equal(sim.studentView().base.hot_meal, 2, 'nothing stays reserved');
});

test('a needs policy that interrupts a craft job lets her resume it with the remaining count', () => {
  const sim = newSim('stage1', 1, (st) => { shop(st); st.survivors.survivor_1.needs.hunger = 31; });
  call(sim, 'policy', 'eat', { below: 30 });
  call(sim, 'craft', 'packaging', 4);
  runUntilIdle(sim, 3000);
  assert.equal(stock(sim, 'packaging'), 8, 'exactly 4 batches of 2');
  assert.ok(types(sim).includes('task.resumed'));
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
});

test('craft without a count runs until the ingredients are gone (NO_INGREDIENTS); storage limits are respected', () => {
  const sim = newSim('stage1', 1, (st) => { shop(st); give(st, { wood: 5, stone: 40 }); });
  call(sim, 'craft', 'packaging'); runUntilIdle(sim, 2000);
  assert.equal(stopped(sim).reason, 'NO_INGREDIENTS');
  assert.equal(stock(sim, 'packaging'), 4, '5 wood = 2 batches');
  const cap = newSim('stage1', 1, (st) => { shop(st); st.ledger['stock.packaging'].total = defs.buildings.hq.storage.packaging - 1; });
  call(cap, 'craft', 'packaging', 5); runUntilIdle(cap, 500);
  assert.ok(stock(cap, 'packaging') <= defs.buildings.hq.storage.packaging, 'never over capacity');
});

test('learner code reads the recipe book (action, power) and crafts through the sandbox; recipes stay frozen', async () => {
  const sim = newSim('stage1', 1, shop);
  const code = 'if (recipes.packaging.action === "craft" && recipes.packaging.stationWorking && recipes.mre.power === 4) survivor.craft("packaging", 2);';
  const res = await sandbox.run({ code, view: sim.studentView(), seed: 1 });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(res.calls[0].name, 'craft');
  assert.ok(describeApi().commands.some((c) => c.name === 'craft'));
  for (const bad of ['survivor.craft()', 'survivor.craft("packaging", 0)', 'survivor.craft(5)']) {
    const r = await sandbox.run({ code: bad, view: sim.studentView(), seed: 1 });
    assert.equal(r.ok, false, bad);
  }
});

test('building view: station recipes carry their action; the workshop lists its recipes', () => {
  const sim = newSim('stage1', 1, (st) => shop(st));
  assert.deepEqual(view(sim, 'workshop_1').recipes.map((r) => [r.id, r.action, r.stationLevel, r.working]), [['packaging', 'craft', 1, true], ['fertilizer', 'craft', 1, true], ['charcoal', 'craft', 1, true], ['nutrients', 'craft', 1, true], ['advanced_spear', 'craft', 1, true], ['bow', 'craft', 1, true], ['crossbow', 'craft', 2, false], ['arrows', 'craft', 1, true], ['bolts', 'craft', 2, false], ['ballista', 'craft', 2, false], ['repeating_crossbow', 'craft', 3, false], ['minigun', 'craft', 3, false], ['rifle', 'craft', 3, false], ['suppressor', 'craft', 2, false], ['bullets', 'craft', 3, false], ['bone_meal', 'craft', 1, true], ['steel_plate', 'craft', 2, false], ['hinge_set', 'craft', 1, true], ['concrete_block', 'craft', 2, false], ['sandbag', 'craft', 1, true], ['glass', 'craft', 2, false]]); // P1 added the fortress recipes
});

test('definitions validation rejects broken craft recipes', () => {
  const bad = (recipes) => assert.throws(() => createDefinitions({ recipes }), /recipe/);
  bad({ x: { ...defs.recipes.packaging, action: 'dance' } });
  bad({ x: { ...defs.recipes.packaging, skill: 'cooking' } }); // craft teaches crafting
  bad({ x: { ...defs.recipes.bread, action: 'craft' } });      // cooking is taught by cook
  bad({ x: { ...defs.recipes.mre, power: 0 } });
  bad({ x: { ...defs.recipes.packaging, stationLevel: 4 } });  // workshop has 3 levels
  assert.throws(() => createDefinitions({ actions: { ...defs.actions, craft: { ...defs.actions.craft, powerWaitTicks: 0 } } }), /powerWaitTicks/);
});

test('crafting is deterministic and replays exactly (including a powered batch)', () => {
  const run = () => {
    const s = newSim('stage1', 7, (st) => { shop(st, 2); fix(st, 'kitchen', 3); powered(st); give(st, { hot_meal: 2, packaging: 0 }); st.perishables.hot_meal = [{ qty: 2, age: 0 }]; skill(st, 'cooking', 2); skill(st, 'crafting', 1); });
    call(s, 'craft', 'packaging', 1); call(s, 'cook', 'mre', 1); call(s, 'craft', 'glass', 1);
    runUntilIdle(s, 3000); return s.stateHash();
  };
  assert.equal(run(), run());
});

test('soak: random cook/craft/eat/upgrade/gather commands never break the ledger, reservations or capacities', () => {
  const picks = [['craft', 'packaging', 2], ['craft', 'glass', 1], ['cook', 'hot_meal', 2], ['cook', 'mre', 1], ['cook', 'bread', 1], ['eat'], ['eat', 'mre'], ['gather', 'wood', 5], ['upgrade', 'kitchen'], ['upgrade', 'workshop_1'], ['rest', 10], ['stop']];
  for (let seed = 1; seed <= 12; seed++) {
    const sim = newSim('stage1', seed, (st) => { shop(st, 1 + (seed % 2)); fix(st, 'kitchen', 1 + (seed % 3)); powered(st); give(st, { hot_meal: 3, packaging: 2, potato: 4, carrot: 4, wheat: 10 }); st.perishables.hot_meal = [{ qty: 3, age: 0 }]; skill(st, 'cooking', 2); skill(st, 'crafting', 1); skill(st, 'repair', 1); });
    for (let i = 0; i < 25; i++) {
      try { call(sim, ...picks[(seed * 5 + i * 7) % picks.length]); } catch { /* refused commands cost nothing */ }
      sim.step(30);
      const st = sim.snapshot();
      assert.deepEqual(ledgerViolations(st), [], `seed ${seed} step ${i}`);
      for (const item of ['hot_meal', 'mre', 'packaging', 'glass']) assert.ok(st.ledger[`stock.${item}`].total <= sim.studentView().base.capacity[item], `${item} within capacity`);
    }
  }
});
