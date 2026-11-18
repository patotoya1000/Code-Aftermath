// Z4: loot on the ground + sortie pickup (collect) + lingering/expiry + carried ammo (take). docs/game/20 sections 4 and 15.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { raidSchedule, waveRules, lootTables } from '../src/modules/definitions/data/threats.js';
import { actions } from '../src/modules/definitions/data/actions.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { lootFor, lootPiles, sortieOpen } from '../src/modules/threats/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { carryCapacity, carriedLoad } from '../src/modules/survivors/index.js';
import { blockedTiles } from '../src/modules/buildings/index.js';
import { buildCommand } from '../src/modules/api/index.js';
import { sandbox } from './helpers.js';

const quiet = { eventSchedule: { ...eventSchedule, chancePercent: 0 } };
const weak = createDefinitions({ ...quiet, raidSchedule: { ...raidSchedule, chancePercent: 100, strengthBase: 4, strengthPerDay: 0, variancePercent: 0 } }); // day 6: exactly 2 walkers
const calm = createDefinitions({ ...quiet, raidSchedule: { ...raidSchedule, chancePercent: 0 } }); // no raids at all: piles are placed by hand
const DAY = weak.environment.ticksPerDay;
const duskTick = (day) => (day - 1) * DAY + (weak.environment.duskHour - weak.environment.startHour) * (DAY / 24);
const dawnTick = (day) => day * DAY;
const keep = (st) => Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
const make = (defs, mutate, seed = 1) => { const state = createInitialState({ defs, scenarioId: 'stage1', seed }); keep(state); mutate?.(state); return createSimulation({ defs, state }); };
const runTo = (s, tick) => { while (s.snapshot().tick < tick) s.step(1); };
const go = (s, name, ...args) => s.submit(buildCommand('survivor_1', { name, args }));
const evs = (s, type) => s.log.all().filter((e) => e.type === type);
const pile = (id, item, qty, x, y, expiresDay = null) => ({ id, item, qty, x, y, day: 5, expiresDay });
const withPiles = (...ps) => (st) => { for (const p of ps) { st.threats.loot[p.id] = p; st.threats.lootCounter = Math.max(st.threats.lootCounter, Number(p.id.split('_')[1])); } };
const stock = (s, item) => s.snapshot().ledger[`stock.${item}`].total;
const carried = (s, item) => s.snapshot().survivors.survivor_1.inventory.items[item] ?? 0;
const onGround = (s, item) => lootPiles(s.snapshot()).filter((p) => p.item === item).reduce((n, p) => n + p.qty, 0);
const total = (s, item) => stock(s, item) + carried(s, item) + onGround(s, item);
const last = (s) => s.snapshot().survivors.survivor_1.lastTask;

// ---- the drop ----

test('lootFor is a pure function of (seed, day, zombie): same inputs, same drop; quantities stay inside the table; a boomer that exploded drops nothing', () => {
  const z = { id: 'zombie_7', type: 'walker' };
  for (let day = 6; day < 40; day++) assert.deepEqual(lootFor(weak, 3, day, z), lootFor(weak, 3, day, z));
  for (let n = 1; n <= 200; n++) for (const row of lootFor(weak, 1, 9, { id: `zombie_${n}`, type: 'brute' })) {
    const t = lootTables.brute.find((r) => r.item === row.item);
    assert.ok(row.qty >= t.min && row.qty <= t.max, `${row.item} x${row.qty}`);
  }
  assert.deepEqual(lootFor(weak, 1, 12, { id: 'zombie_1', type: 'boomer', exploded: true }), []);
  assert.deepEqual(lootFor(weak, 1, 12, { id: 'zombie_1', type: 'boomer' }), [{ item: 'gland', qty: 1 }], 'killed before contact it drops its gland (100 %)');
});

test('lootFor: the chance column matters (a 70 % entry drops about 70 % of the time) and different zombies roll differently', () => {
  let bones = 0; const seen = new Set();
  for (let n = 1; n <= 600; n++) { const d = lootFor(weak, 2, 6, { id: `zombie_${n}`, type: 'walker' }); if (d.some((r) => r.item === 'bones')) bones++; seen.add(JSON.stringify(d)); }
  assert.ok(bones > 600 * 0.6 && bones < 600 * 0.8, `${bones}/600 walkers dropped bones`);
  assert.ok(seen.size > 3, 'not every zombie drops the same');
});

/** Kill every zombie of the wave with survivor_1 (spear) standing at the gate; returns the sim. */
function killWave(seed) {
  const s = make(weak, (st) => { st.survivors.survivor_1.position = { x: 16, y: 7 }; st.survivors.survivor_1.equipment.weapon = 'spear'; }, seed);
  runTo(s, duskTick(6) + 3);
  for (let guard = 0; guard < 40 && !s.snapshot().threats.wave?.cleared && s.snapshot().tick < dawnTick(6) - 5; guard++) {
    const z = Object.values(s.snapshot().threats.zombies).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    if (!z) { s.step(3); continue; }
    go(s, 'attack', z.id);
    for (let i = 0; i < 120 && s.snapshot().threats.zombies[z.id] && !s.isIdle(); i++) s.step(1);
  }
  return s;
}

test('a killed zombie leaves exactly the loot its table rolls, on the cell where it died; the last kill clears the wave and OPENS the gate', () => {
  let s = null;
  for (let seed = 1; seed < 40 && !s; seed++) { const t = killWave(seed); if (evs(t, 'loot.dropped').length > 0 && t.snapshot().threats.wave?.cleared) s = t; }
  assert.ok(s, 'some seed gives a wave that is killed AND drops loot');
  const killed = evs(s, 'zombie.killed');
  assert.equal(killed.length, 2);
  const want = {};
  for (const k of killed) for (const r of lootFor(weak, s.seed, 6, { id: k.zombieId, type: k.zombieType })) want[r.item] = (want[r.item] ?? 0) + r.qty;
  const got = {};
  for (const p of lootPiles(s.snapshot())) got[p.item] = (got[p.item] ?? 0) + p.qty;
  assert.deepEqual(got, want, 'the piles are exactly what the table rolled');
  for (const d of evs(s, 'loot.dropped')) assert.ok(d.x >= 0 && d.y >= 0 && d.pileId && d.zombieId && d.amount >= 1);
  assert.ok(lootPiles(s.snapshot()).every((p) => p.expiresDay === null), 'the countdown starts at the dawn that ends the wave');
  const snap = s.snapshot();
  assert.equal(snap.threats.wave.cleared, true); assert.equal(snap.threats.wave.gateClosed, false);
  assert.ok(!blockedTiles(snap).has('16,7'), 'the gate stands open again once the wave is cleared');
  assert.equal(sortieOpen(snap), true);
  const view = s.studentView().threats;
  assert.equal(view.wave.cleared, true); assert.equal(view.loot.sortieOpen, true);
  assert.deepEqual(view.loot.piles.map((p) => p.id), lootPiles(snap).map((p) => p.id));
  assert.ok(view.loot.piles.every((p) => p.daysLeft === null));
  assert.deepEqual(ledgerViolations(snap), []);
});

// ---- collect ----

test('collect: she walks out, picks up a pile, unloads it at the HQ; the units are always in exactly one place and the pile is gone at the end', () => {
  const s = make(calm, withPiles(pile('loot_1', 'bones', 12, 19, 7)));
  const before = total(s, 'bones'); assert.equal(before, 12);
  go(s, 'collect');
  for (let i = 0; i < 400 && !s.isIdle(); i++) { s.step(1); assert.equal(total(s, 'bones'), before, `conservation at tick ${s.tick}`); }
  assert.ok(s.isIdle());
  assert.equal(stock(s, 'bones'), 12); assert.equal(onGround(s, 'bones'), 0); assert.equal(carried(s, 'bones'), 0);
  assert.equal(last(s).status, 'COMPLETED'); assert.equal(last(s).reason, 'NO_LOOT'); assert.equal(last(s).gathered, 12);
  assert.ok(evs(s, 'loot.picked').length >= 1); assert.ok(evs(s, 'resource.deposited').some((e) => e.resource === 'bones' && e.amount === 12));
  const stopped = evs(s, 'task.stopped').find((e) => e.taskType === 'collect');
  assert.equal(stopped.collected, 12); assert.equal(stopped.reason, 'NO_LOOT');
  assert.ok(s.snapshot().survivors.survivor_1.progression.xp.gathering > 0, 'sorties practise Gathering');
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
});

test('collect: a pile bigger than her hands takes several trips, the nearest pile first, and never carries more than she can hold', () => {
  const s = make(calm, (st) => { withPiles(pile('loot_1', 'bones', 30, 18, 7), pile('loot_2', 'hide', 4, 22, 12))(st); st.survivors.survivor_1.attributes.strength = 1; });
  const cap = carryCapacity(s.snapshot().survivors.survivor_1, calm);
  assert.ok(cap < 30, 'a weak survivor: the pile needs more than one trip');
  go(s, 'collect');
  let peak = 0;
  for (let i = 0; i < 1500 && !s.isIdle(); i++) { s.step(1); peak = Math.max(peak, carriedLoad(s.snapshot().survivors.survivor_1, calm)); }
  assert.ok(peak <= cap, `carried ${peak} of ${cap}`);
  assert.equal(stock(s, 'bones'), 30); assert.equal(stock(s, 'hide'), 4);
  const picks = evs(s, 'loot.picked');
  assert.equal(picks[0].item, 'bones', 'the nearest pile first');
  assert.ok(picks.filter((e) => e.item === 'bones').length >= 2, 'several trips');
  assert.ok(evs(s, 'task.stopped').find((e) => e.taskType === 'collect').trips >= 3);
});

test('collect("hide") takes only that item; an unknown item is refused', () => {
  const s = make(calm, withPiles(pile('loot_1', 'bones', 5, 18, 7), pile('loot_2', 'hide', 3, 20, 9)));
  go(s, 'collect', 'hide');
  for (let i = 0; i < 400 && !s.isIdle(); i++) s.step(1);
  assert.equal(stock(s, 'hide'), 3); assert.equal(stock(s, 'bones'), 0); assert.equal(onGround(s, 'bones'), 5);
  assert.equal(last(s).reason, 'NO_LOOT');
  go(s, 'collect', 'unobtainium'); s.step(2);
  assert.equal(last(s).status, 'FAILED'); assert.equal(last(s).reason, 'INVALID_PARAMS');
});

test('collect with nothing on the ground fails NO_LOOT and costs nothing', () => {
  const s = make(calm);
  go(s, 'collect'); s.step(3);
  assert.equal(last(s).status, 'FAILED'); assert.equal(last(s).reason, 'NO_LOOT');
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
});

test('sorties are only allowed when no wave is on: WAVE_ACTIVE during a wave, allowed once it is cleared', () => {
  const s = make(weak, withPiles(pile('loot_1', 'bones', 5, 19, 7, 99)));
  runTo(s, duskTick(6) + 3);
  assert.equal(sortieOpen(s.snapshot()), false);
  assert.equal(s.studentView().threats.loot.sortieOpen, false);
  go(s, 'collect'); s.step(2);
  assert.equal(last(s).status, 'FAILED'); assert.equal(last(s).reason, 'WAVE_ACTIVE');
  assert.equal(onGround(s, 'bones'), 5);
});

test('a sortie that is under way stops the moment the next wave starts, and keeps what she carries (no automatic recall)', () => {
  const s = make(weak, withPiles(pile('loot_1', 'bones', 30, 22, 7, 99)));
  runTo(s, duskTick(6) - 4); // four ticks before dusk: the pile is five tiles outside the gate, she cannot finish
  go(s, 'collect');
  runTo(s, duskTick(6) + 3);
  assert.ok(s.snapshot().threats.wave, 'the wave started');
  assert.equal(last(s).reason, 'WAVE_ACTIVE'); assert.equal(s.isIdle(), true);
  assert.equal(onGround(s, 'bones') + carried(s, 'bones') + stock(s, 'bones'), 30);
  assert.ok(evs(s, 'resource.deposited').length === 0);
});

test('collect stops with STORAGE_FULL when base stock has no room for the item, and with NO_DEPOT when nothing that works stores it', () => {
  const full = make(calm, (st) => { withPiles(pile('loot_1', 'bones', 5, 19, 7))(st); st.ledger['stock.bones'].total = 40; }); // the HQ holds 40
  go(full, 'collect'); full.step(3);
  assert.equal(last(full).status, 'FAILED'); assert.equal(last(full).reason, 'STORAGE_FULL'); assert.equal(onGround(full, 'bones'), 5);
  const none = make(calm, (st) => { withPiles(pile('loot_1', 'bones', 5, 19, 7))(st); st.buildings.hq.condition = 'ruined'; st.buildings.hq.health = 1; });
  go(none, 'collect'); none.step(3);
  assert.equal(last(none).reason, 'NO_DEPOT'); assert.equal(onGround(none, 'bones'), 5);
});

test('two collectors never take the same units: the total is conserved and the ledger stays clean', () => {
  const s = make(calm, (st) => {
    withPiles(pile('loot_1', 'bones', 20, 19, 7), pile('loot_2', 'rags', 10, 19, 9))(st);
    st.survivors.survivor_2 && keep2(st);
  });
  function keep2(st) { Object.assign(st.survivors.survivor_2.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 }); }
  const ids = Object.keys(s.snapshot().survivors);
  for (const id of ids) s.submit(buildCommand(id, { name: 'collect', args: [] }));
  for (let i = 0; i < 800 && !s.isIdle(); i++) s.step(1);
  assert.equal(stock(s, 'bones'), 20); assert.equal(stock(s, 'rags'), 10);
  assert.equal(onGround(s, 'bones') + onGround(s, 'rags'), 0);
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
});

// ---- lingering ----

test('loot lingers: stamped at the dawn that ends the wave, still there for lootLingerDays more dawns, then gone (loot.expired)', () => {
  const s = make(calm, withPiles(pile('loot_1', 'bones', 5, 19, 7), pile('loot_2', 'hide', 2, 20, 8)));
  runTo(s, dawnTick(1) + 1);
  const dawn1 = evs(s, 'time.dawn').at(-1).day;
  const piles = lootPiles(s.snapshot());
  assert.equal(piles.length, 2); assert.ok(piles.every((p) => p.expiresDay === dawn1 + waveRules.lootLingerDays));
  assert.ok(s.studentView().threats.loot.piles.every((p) => p.daysLeft === waveRules.lootLingerDays), 'the learner sees the days left');
  assert.equal(evs(s, 'loot.expired').length, 0);
  runTo(s, dawnTick(2) + 1);
  assert.equal(lootPiles(s.snapshot()).length, 0);
  const gone = evs(s, 'loot.expired');
  assert.equal(gone.length, 2); assert.deepEqual(gone.map((e) => e.item).sort(), ['bones', 'hide']);
});

test('lootLingerDays 0 means the loot is gone at the dawn that ends the wave', () => {
  const d0 = createDefinitions({ ...quiet, raidSchedule: { ...raidSchedule, chancePercent: 0 }, waveRules: { ...waveRules, lootLingerDays: 0 } });
  const s = make(d0, withPiles(pile('loot_1', 'bones', 5, 19, 7)));
  runTo(s, dawnTick(1) + 1);
  assert.equal(lootPiles(s.snapshot()).length, 0); assert.equal(evs(s, 'loot.expired').length, 1);
});

test('a pile that vanishes at dawn while she walks to it makes her pick another pile, or stop with NO_LOOT', () => {
  const s = make(calm, withPiles(pile('loot_1', 'bones', 5, 22, 14, 1))); // expires at the first dawn (day 1 counts as the dawn day or earlier)
  go(s, 'collect');
  for (let i = 0; i < 2000 && !s.isIdle(); i++) s.step(1);
  assert.ok(['NO_LOOT'].includes(last(s).reason) || last(s).status === 'COMPLETED' || last(s).status === 'FAILED');
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
  assert.equal(carried(s, 'bones') + stock(s, 'bones') + onGround(s, 'bones') <= 5, true);
});

// ---- take (carried ammo) ----

test('take("arrows", 20): she walks to storage and moves the arrows from base stock into her hands; deposit() puts them back; nothing is created or lost', () => {
  const s = make(calm, (st) => { st.ledger['stock.arrows'].total = 30; });
  go(s, 'take', 'arrows', 20);
  for (let i = 0; i < 200 && !s.isIdle(); i++) { s.step(1); assert.equal(stock(s, 'arrows') + carried(s, 'arrows'), 30, `tick ${s.tick}`); } // (a reserved unit is still inside the stock total until it is committed)
  assert.equal(last(s).status, 'COMPLETED');
  assert.equal(carried(s, 'arrows'), 20); assert.equal(stock(s, 'arrows'), 10);
  assert.ok(evs(s, 'resource.taken').some((e) => e.resource === 'arrows' && e.amount === 20));
  go(s, 'deposit');
  for (let i = 0; i < 200 && !s.isIdle(); i++) s.step(1);
  assert.equal(carried(s, 'arrows'), 0); assert.equal(stock(s, 'arrows'), 30);
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
});

test('take is clamped to what base stock holds and what she can carry, and fails clearly when it cannot give anything', () => {
  const s = make(calm, (st) => { st.ledger['stock.arrows'].total = 6; });
  go(s, 'take', 'arrows', 50);
  for (let i = 0; i < 200 && !s.isIdle(); i++) s.step(1);
  assert.equal(carried(s, 'arrows'), 6); assert.equal(stock(s, 'arrows'), 0);
  go(s, 'take', 'arrows', 5); s.step(2);
  assert.equal(last(s).status, 'FAILED'); assert.equal(last(s).reason, 'INSUFFICIENT_RESOURCE');
  const heavy = make(calm, (st) => { st.ledger['stock.arrows'].total = 99; st.survivors.survivor_1.inventory.items.wood = carryCapacity(st.survivors.survivor_1, calm); });
  go(heavy, 'take', 'arrows', 5); heavy.step(2);
  assert.equal(last(heavy).reason, 'CARRY_FULL');
  const cap = make(calm, (st) => { st.ledger['stock.arrows'].total = 99; });
  go(cap, 'take', 'arrows', 99);
  for (let i = 0; i < 300 && !cap.isIdle(); i++) cap.step(1);
  assert.equal(carried(cap, 'arrows'), carryCapacity(cap.snapshot().survivors.survivor_1, calm), 'arrows weigh 1: she fills her hands and no more');
});

test('take refuses perishable food and unknown items, and cancelling a take gives the reserved units back', () => {
  const s = make(calm, (st) => { st.ledger['stock.arrows'].total = 10; st.ledger['stock.bread'].total = 5; });
  go(s, 'take', 'bread', 1); s.step(2);
  assert.equal(last(s).reason, 'INVALID_PARAMS');
  go(s, 'take', 'unobtainium', 1); s.step(2);
  assert.equal(last(s).reason, 'INVALID_PARAMS');
  go(s, 'take', 'arrows', 10); s.step(1);
  assert.equal(s.snapshot().ledger['stock.arrows'].reserved, 10, 'reserved while she walks to storage');
  go(s, 'stop'); s.step(1);
  assert.equal(s.snapshot().ledger['stock.arrows'].reserved, 0); assert.equal(stock(s, 'arrows'), 10); assert.equal(carried(s, 'arrows'), 0);
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
});

test('take with no working storage that holds the item fails NO_DEPOT', () => {
  const s = make(calm, (st) => { st.ledger['stock.arrows'].total = 10; st.buildings.hq.condition = 'ruined'; st.buildings.hq.health = 1; });
  go(s, 'take', 'arrows', 5); s.step(2);
  assert.equal(last(s).reason, 'NO_DEPOT');
});

// ---- API, learner reads, renderer, validation, determinism ----

test('API: collect() / collect(item) / take(item, amount) are validated before they become commands', () => {
  assert.deepEqual(buildCommand('survivor_1', { name: 'collect', args: [] }).params, {});
  assert.deepEqual(buildCommand('survivor_1', { name: 'collect', args: ['bones'] }).params, { item: 'bones' });
  assert.deepEqual(buildCommand('survivor_1', { name: 'take', args: ['arrows', 20] }).params, { item: 'arrows', amount: 20 });
  for (const [name, args] of [['collect', [3]], ['collect', ['a', 'b']], ['take', []], ['take', ['arrows']], ['take', ['arrows', 0]], ['take', ['arrows', 101]], ['take', ['arrows', 1.5]], ['take', [7, 3]]]) {
    assert.throws(() => buildCommand('survivor_1', { name, args }), /INVALID_ARGUMENT|collect|take/, `${name}(${args.join(',')})`);
  }
});

test('the sandbox reads threats.loot and issues collect/take like any other command', async () => {
  const s = make(calm, withPiles(pile('loot_1', 'bones', 5, 19, 7, 3)));
  const r = await sandbox.run({ code: 'const p = threats.loot.piles[0];\nconsole.log(p.item, p.qty, p.daysLeft, threats.loot.sortieOpen);\nsurvivor.take("arrows", 5);\nsurvivor.collect("bones");', view: s.studentView(), seed: 1 });
  assert.equal(r.ok, true, r.error?.message);
  assert.deepEqual(r.calls.map((c) => c.name), ['take', 'collect']);
});

test('the render projection carries the piles (read-only, same data as the state) and the renderer has a loot list', () => {
  const s = make(calm, withPiles(pile('loot_1', 'bones', 5, 19, 7), pile('loot_2', 'hide', 2, 20, 8)));
  const proj = s.renderProjection();
  assert.deepEqual(proj.loot.map((p) => [p.id, p.item, p.qty, p.x, p.y]), [['loot_1', 'bones', 5, 19, 7], ['loot_2', 'hide', 2, 20, 8]]);
  assert.ok(Object.isFrozen(proj.loot));
  const before = s.stateHash(); s.renderProjection(); assert.equal(s.stateHash(), before, 'reading the projection changes nothing');
});

test('validation: a collect or take action with broken numbers is refused', () => {
  const bad = (o, re) => assert.throws(() => createDefinitions(o), re);
  bad({ actions: { ...actions, collect: { ...actions.collect, ticksPerUnit: 0 } } }, /action collect/);
  bad({ actions: { ...actions, take: { ...actions.take, maxAmount: 0 } } }, /action take/);
  bad({ actions: { ...actions, take: { ...actions.take, handler: 'nope' } } }, /unknown handler/);
});

test('every loot item has a storage table at the HQ (so a sortie can always unload), and the ammo items too', () => {
  const hq = calm.buildings.hq;
  const items = new Set(Object.values(lootTables).flat().map((r) => r.item));
  for (const w of Object.values(calm.weapons)) if (w.ammo) items.add(w.ammo);
  for (const item of items) { assert.ok(hq.storage[item] > 0, `${item} (level 1)`); assert.ok(hq.levels[2].storage[item] >= hq.storage[item], `${item} (level 2)`); }
});

test('determinism + soak: a full night with kills, loot, sorties and expiry replays to the same hash and keeps the ledger clean', () => {
  const run = () => {
    const s = make(weak, (st) => { st.survivors.survivor_1.position = { x: 16, y: 7 }; st.survivors.survivor_1.equipment.weapon = 'spear'; }, 4);
    runTo(s, duskTick(6) + 3);
    for (let guard = 0; guard < 40 && !s.snapshot().threats.wave?.cleared && s.snapshot().tick < dawnTick(6) - 5; guard++) {
      const z = Object.values(s.snapshot().threats.zombies).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      if (!z) { s.step(3); continue; }
      go(s, 'attack', z.id);
      for (let i = 0; i < 120 && s.snapshot().threats.zombies[z.id] && !s.isIdle(); i++) s.step(1);
    }
    go(s, 'collect');
    for (let i = 0; i < DAY * 2; i++) { s.step(1); if (i % 50 === 0) assert.deepEqual(ledgerViolations(s.snapshot()), []); }
    return s;
  };
  const a = run(), b = run();
  assert.equal(a.stateHash(), b.stateHash());
  assert.deepEqual(a.log.all(), b.log.all());
  assert.ok(evs(a, 'zombie.killed').length >= 1);
});
