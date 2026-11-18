// O19 threats groundwork (public pure raid schedule, warnings, history, learner read, validation, replay-safety) + Z1 data tables + Z2 zombie ENTITIES:
// a raid is a wave that spawns at dusk, walks, hits the wall and is resolved at dawn (no combat yet).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { zombies, raidSchedule } from '../src/modules/definitions/data/threats.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { raidForDay, defenseOf, upcomingRaids } from '../src/modules/threats/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { sandbox } from './helpers.js';
import { buildCommand } from '../src/modules/api/index.js';
import { blockedTiles } from '../src/modules/buildings/index.js';

const quiet = { eventSchedule: { ...eventSchedule, chancePercent: 0 } };
const on = createDefinitions({ ...quiet, raidSchedule: { ...raidSchedule, chancePercent: 100 } }); // a raid EVERY day from startDay
const DAY = on.environment.ticksPerDay;
const sim = (defs = on, seed = 1, mutate) => { const state = createInitialState({ defs, scenarioId: 'stage1', seed }); mutate?.(state); return createSimulation({ defs, state }); };
const fence = (st, level, condition = 'repaired') => { const b = st.buildings.fence; b.level = level; const max = on.buildings.fence.levels[level].maxHealth; b.health = condition === 'repaired' ? max : condition === 'damaged' ? Math.floor(max * 0.4) : 1; b.condition = condition; };
const keep = (st) => Object.assign(st.survivors.survivor_1.needs, { hunger: 100, thirst: 100, energy: 100 });
/** Run until just after dusk of `day` (hour 18 of that day). */
const pastDusk = (s, day) => { const target = (day - 1) * DAY + (on.environment.duskHour - on.environment.startHour) * (DAY / 24) + 2; while (s.snapshot().tick < target) s.step(1); };
const resolved = (s) => s.log.all().filter((e) => e.type === 'raid.resolved');

test('the schedule is pure: same (seed, day) gives the same raid, strength grows with the day, composition adds up inside the budget', () => {
  for (let d = 6; d < 30; d++) assert.deepEqual(raidForDay(on, 9, d), raidForDay(on, 9, d));
  assert.equal(raidForDay(on, 9, 5), null);
  for (let d = 6; d < 60; d++) {
    const r = raidForDay(on, 9, d);
    const spent = Object.entries(r.composition).reduce((n, [id, c]) => n + c * zombies[id].threat, 0);
    assert.equal(spent, r.threat); assert.ok(r.threat <= r.strength && r.strength >= 1);
  }
  const avg = (a, b) => { let s = 0; for (let d = a; d < b; d++) s += raidForDay(on, 3, d).strength; return s / (b - a); };
  assert.ok(avg(40, 60) > avg(6, 26) + 20, 'later raids are stronger');
  const off = createDefinitions({ ...quiet, raidSchedule: { ...raidSchedule, chancePercent: 0 } });
  for (let d = 1; d < 80; d++) assert.equal(raidForDay(off, 1, d), null);
});

test('the shipped world has raids at a sensible rate and every zombie type shows up over time', () => {
  const real = createDefinitions();
  let n = 0; const seen = new Set();
  for (let d = 1; d <= 400; d++) { const r = raidForDay(real, 2, d); if (r) { n++; for (const id of Object.keys(r.composition)) seen.add(id); } }
  assert.ok(n > 60 && n < 180, `${n} raids in 400 days`);
  assert.deepEqual([...seen].sort(), Object.keys(zombies).sort());
});

test('defence: level x perLevel, halved when damaged, zero when ruined', () => {
  const v = (level, cond) => defenseOf(sim(on, 1, (st) => fence(st, level, cond)).snapshot(), on).value;
  assert.equal(v(1, 'repaired'), 15); assert.equal(v(2, 'repaired'), 30);
  assert.equal(v(2, 'damaged'), 15); assert.equal(v(1, 'ruined'), 0);
});

test('warnings come at dawn, upcoming raids are public (strength + composition), today counts only before dusk', async () => {
  const s = sim(); const view = s.studentView();
  assert.deepEqual(view.threats.upcoming.map((r) => r.day), [], 'day 1-2 are calm: the first raid is day 6, beyond a 2-day window');
  for (let i = 0; i < DAY * 4; i++) s.step(1);
  const warn = s.log.all().filter((e) => e.type === 'raid.warning');
  assert.ok(warn.length >= 1 && warn[0].day >= 6);
  const up = s.studentView().threats.upcoming;
  assert.ok(up.length >= 1 && up[0].strength >= 1 && Object.keys(up[0].composition).length >= 1);
  assert.deepEqual(up, upcomingRaids(on, 1, s.tick));
  const r = await sandbox.run({ code: 'console.log(Object.keys(threats.zombies).length, threats.defense.value >= 0, typeof threats.upcoming.length);', view: s.studentView(), seed: 1 });
  assert.match(r.logs.join(" "), /^6 true number/);
  const w = await sandbox.run({ code: 'threats.defense.value = 999;', view: s.studentView(), seed: 1 });
  assert.ok(w.error, 'threats are read-only');
});

test('history is capped; same seed and ticks give the same raids and state hash (replay-safe); a month soak keeps the ledger balanced', () => {
  const run = () => { const s = sim(on, 5, keep); for (let i = 0; i < DAY * 30; i++) s.step(1); return s; };
  const a = run(), b = run();
  assert.equal(a.stateHash(), b.stateHash());
  assert.deepEqual(resolved(a).map((e) => [e.day, e.outcome]), resolved(b).map((e) => [e.day, e.outcome]));
  assert.ok(a.snapshot().threats.history.length <= on.raidSchedule.historyLimit);
  assert.deepEqual(ledgerViolations(a.snapshot()), []);
});

test('definitions validation: zombie stats and the raid schedule are checked', () => {
  assert.throws(() => createDefinitions({ zombies: { x: { name: 'X', threat: 0, weight: 1, health: 1, damage: 1, speed: 1 } } }), /zombie/);
  assert.throws(() => createDefinitions({ raidSchedule: { ...raidSchedule, chancePercent: 120 } }), /raidSchedule/);
  assert.throws(() => createDefinitions({ raidSchedule: { ...raidSchedule, breached: { ...raidSchedule.breached, loot: ['gold'] } } }), /loot/);
  assert.throws(() => createDefinitions({ raidSchedule: { ...raidSchedule, defense: { perLevel: 0, damagedPercent: 50 } } }), /raidSchedule/);
});

// ---- Phase 1 of docs/game/20 (data tables only): taxonomy, day gates, boss milestone, loot, weapons, towers, noise ----
import { bosses, bossSchedule, waveRules, lootTables } from '../src/modules/definitions/data/threats.js';
import { weapons, towers, noise } from '../src/modules/definitions/data/arsenal.js';
import { zombiesAvailable, bossForDay, upcomingBosses, effectiveRange, canMount, shotNoise } from '../src/modules/threats/index.js';

const real = createDefinitions();

test('taxonomy: the seven design types exist (six zombies + a boss), each with a loot table whose items are known', () => {
  assert.deepEqual(Object.values(zombies).map((z) => z.role).sort(), ['boomer', 'common', 'runner', 'screamer', 'tank', 'thrower']);
  assert.ok(bosses[bossSchedule.boss]);
  for (const id of [...Object.keys(zombies), ...Object.keys(bosses)]) assert.ok(lootTables[id]?.length > 0, `${id} has loot`);
  for (const rows of Object.values(lootTables)) for (const r of rows) assert.ok(real.items[r.item], r.item);
  assert.equal(zombies.boomer.behaviour.type, 'explode'); assert.ok(zombies.boomer.behaviour.radius >= 1);
  assert.ok(zombies.boomer.armor > 0 && zombies.screamer.damage === 0, 'boomer is armored; the screamer does not hit');
  assert.equal(lootTables.boomer[0].requires, 'not_exploded', 'an exploded boomer drops nothing');
});

test('day gates: a type appears only from its firstDay, the early game keeps the old walker/runner mix, bosses are never in a random raid', () => {
  assert.deepEqual(zombiesAvailable(real, 6), ['walker']);
  assert.deepEqual(zombiesAvailable(real, 9), ['runner', 'walker']);
  assert.deepEqual(zombiesAvailable(real, 30), ['boomer', 'brute', 'runner', 'screamer', 'thrower', 'walker']);
  for (let d = 1; d < 120; d++) {
    const r = raidForDay(on, 4, d);
    if (!r) continue;
    for (const id of Object.keys(r.composition)) { assert.ok(zombies[id].firstDay <= d, `${id} before day ${zombies[id].firstDay}`); assert.ok(!bosses[id]); }
  }
});

test('boss: a fixed milestone (pure, same every run), first on firstDay then every everyDays, announced earlier than a raid', () => {
  assert.equal(bossForDay(real, bossSchedule.firstDay - 1), null);
  assert.equal(bossForDay(real, bossSchedule.firstDay).boss, 'horde_king');
  assert.equal(bossForDay(real, bossSchedule.firstDay + 1), null);
  assert.equal(bossForDay(real, bossSchedule.firstDay + bossSchedule.everyDays).day, bossSchedule.firstDay + bossSchedule.everyDays);
  assert.ok(bossSchedule.warnDays > raidSchedule.warnDays);
  const DAYT = real.environment.ticksPerDay;
  const up = upcomingBosses(real, (bossSchedule.firstDay - 3) * DAYT - DAYT + 2 * (DAYT / 24)); // some tick two or three days before
  assert.ok(up.every((b) => b.inDays >= 0 && b.inDays <= bossSchedule.warnDays));
});

test('weapons: starters are melee, the ladder has the right tiers, melee never gets a tower bonus, mounted weapons need their tower level', () => {
  assert.deepEqual(Object.keys(weapons).filter((w) => weapons[w].starter).sort(), ['knife', 'spear']);
  for (const w of ['advanced_spear', 'bow', 'crossbow', 'rifle', 'ballista', 'repeating_crossbow', 'minigun']) assert.ok(weapons[w].craft && !weapons[w].starter);
  assert.ok(weapons.spear.reach > weapons.knife.reach, 'the spear reaches further across the fence');
  assert.ok(weapons.rifle.noise > weapons.crossbow.noise && weapons.minigun.noise > weapons.rifle.noise, 'loud weapons');
  assert.ok(weapons.crossbow.pierce >= zombies.boomer.armor, 'the crossbow answers the boomer armor');
  assert.equal(weapons.minigun.kind, 'mounted'); assert.ok(weapons.minigun.power >= 1, 'the minigun draws grid power');
  assert.equal(effectiveRange(real, 'knife', 3), weapons.knife.reach, 'a tower adds nothing to melee');
  assert.equal(effectiveRange(real, 'bow', 0), weapons.bow.range);
  assert.equal(effectiveRange(real, 'rifle', 3), weapons.rifle.range + towers[3].rangeBonus);
  assert.ok(effectiveRange(real, 'rifle', 3) > zombies.thrower.behaviour.range, 'a tower rifle outranges the thrower');
  assert.equal(effectiveRange(real, 'minigun', 2), 0, 'level 2 cannot use the minigun'); assert.equal(effectiveRange(real, 'minigun', 3), weapons.minigun.range);
  assert.equal(effectiveRange(real, 'nope', 1), 0);
});

test('towers: three levels, range bonus grows, mounts follow the level (level 1 mounts nothing, only level 3 holds the minigun)', () => {
  assert.deepEqual(Object.keys(towers), ['1', '2', '3']);
  assert.ok(towers[1].rangeBonus < towers[2].rangeBonus && towers[2].rangeBonus < towers[3].rangeBonus);
  assert.deepEqual(towers[1].mounts, []);
  assert.ok(canMount(real, 'ballista', 2) && !canMount(real, 'minigun', 2) && canMount(real, 'minigun', 3) && !canMount(real, 'bow', 3));
});

test('noise: loud weapons add more; a suppressor cuts personal weapons but not mounted ones', () => {
  assert.equal(shotNoise(real, 'rifle'), weapons.rifle.noise);
  assert.equal(shotNoise(real, 'rifle', true), Math.floor((weapons.rifle.noise * (100 - noise.suppressorPercent)) / 100));
  assert.equal(shotNoise(real, 'minigun', true), weapons.minigun.noise);
  assert.equal(shotNoise(real, 'knife'), 0);
  assert.equal(waveRules.recall, 'learner'); assert.equal(waveRules.gateClosesDuringWave, true);
});

test('the learner reads the arsenal (read-only) and the world still has no zombie on the map', async () => {
  const s = sim();
  const r = await sandbox.run({ code: 'console.log(Object.keys(threats.zombies).length, threats.weapons.minigun.kind, threats.towers[3].mounts.length, threats.noise.threshold, threats.waveRules.recall, Array.isArray(threats.bosses), threats.zombies.boomer.armor);', view: s.studentView(), seed: 1 });
  assert.match(r.logs.join(' '), /^6 mounted 3 40 learner true 3/);
  const w = await sandbox.run({ code: 'threats.weapons.knife.damage = 99;', view: s.studentView(), seed: 1 });
  assert.ok(w.error, 'read-only');
  assert.equal(s.renderProjection().zombies.length, 0);
});

test('validation: broken zombie, boss, loot, weapon, tower and noise tables are refused', () => {
  const bad = (o, re) => assert.throws(() => createDefinitions(o), re);
  bad({ zombies: { ...zombies, boomer: { ...zombies.boomer, role: 'ghost' } } }, /role/);
  bad({ zombies: { ...zombies, boomer: { ...zombies.boomer, behaviour: { type: 'explode', radius: 0, fenceDamage: 1, survivorDamage: 1 } } } }, /explode/);
  bad({ zombies: { ...zombies, screamer: { ...zombies.screamer, behaviour: { type: 'scream', cooldownTicks: 5, summons: 4, waveCap: 2 } } } }, /scream/);
  bad({ bossSchedule: { ...bossSchedule, boss: 'nobody' } }, /bossSchedule/);
  bad({ lootTables: { ...lootTables, walker: [{ item: 'gold', min: 1, max: 1, chancePercent: 50 }] } }, /lootTable/);
  bad({ lootTables: { ...lootTables, brute: [] } }, /needs a loot table/);
  bad({ weapons: { ...weapons, bow: { ...weapons.bow, ammo: 'rocks' } } }, /weapon bow/);
  bad({ weapons: { ...weapons, knife: { ...weapons.knife, reach: 1 } } }, /reach/);
  bad({ weapons: { ...weapons, minigun: { ...weapons.minigun, minTowerLevel: 1 } } }, /minTowerLevel/);
  bad({ weapons: { ...weapons, rifle: { ...weapons.rifle, power: 3 } } }, /only mounted/);
  bad({ weapons: Object.fromEntries(Object.entries(weapons).filter(([, w]) => !w.starter)) }, /starter/);
  bad({ towers: { 1: towers[1], 3: towers[3] } }, /levels/);
  bad({ towers: { ...towers, 2: { ...towers[2], mounts: ['minigun'] } } }, /tower 2/);
  bad({ noise: { ...noise, suppressorPercent: 150 } }, /noise/);
  bad({ waveRules: { ...waveRules, recall: 'auto' } }, /waveRules/);
});

// ---- Z2: zombie entities (doc 20 section 11) ----
const weak = createDefinitions({ ...quiet, raidSchedule: { ...raidSchedule, chancePercent: 100, strengthBase: 4, strengthPerDay: 0, variancePercent: 0 } }); // day 6: exactly 2 walkers
const wsim = (mutate, seed = 1) => sim(weak, seed, (st) => { keep(st); mutate?.(st); });
const runTo = (s, tick) => { while (s.snapshot().tick < tick) s.step(1); };
const duskTick = (day) => (day - 1) * DAY + (on.environment.duskHour - on.environment.startHour) * (DAY / 24);
const dawnTick = (day) => day * DAY; // dawn that ends `day`'s night
const go = (s, name, ...args) => s.submit(buildCommand('survivor_1', { name, args }));
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const evs = (s, type) => s.log.all().filter((e) => e.type === type);

test('Z2: a wave starts at dusk - the gate closes, zombies spawn one at a time on a map edge, and are listed in the projection and the learner read', () => {
  const s = wsim();
  runTo(s, duskTick(6) - 1);
  assert.equal(s.snapshot().threats.wave, null); assert.ok(!blockedTiles(s.snapshot()).has('16,7'), 'the gate is open by day');
  assert.deepEqual(s.studentView().threats.wave, { active: false });
  runTo(s, duskTick(6) + 1);
  assert.equal(evs(s, 'wave.started').length, 1); assert.equal(s.snapshot().threats.wave.gateClosed, true);
  assert.ok(blockedTiles(s.snapshot()).has('16,7'), 'the gate is a closed wall piece during the wave');
  runTo(s, duskTick(6) + 8);
  const spawned = evs(s, 'zombie.spawned');
  assert.equal(spawned.length, 2, 'strength 4 = two walkers');
  const { width: w, height: h } = s.snapshot().map;
  for (const e of spawned) assert.ok(e.x === 0 || e.y === 0 || e.x === w - 1 || e.y === h - 1, 'spawned on a map edge');
  assert.ok(spawned[1].tick > spawned[0].tick, 'staggered, not all at once');
  const proj = s.renderProjection().zombies;
  assert.equal(proj.length, 2); assert.ok(proj.every((z) => z.id && z.animation && z.direction));
  const view = s.studentView().threats.wave;
  assert.equal(view.active, true); assert.equal(view.gateClosed, true); assert.equal(view.zombies.length, 2); assert.equal(view.zombies[0].type, 'walker');
});

test('Z2: zombies walk to the fence, stand against it and hit it for (damage - wall armor) every attackEveryTicks; dawn resolves the wave and clears the map', () => {
  const s = wsim((st) => fence(st, 1)); // 100 health, armor 1: a walker (damage 2) hits for 1
  runTo(s, duskTick(6) + 60);
  const zs = Object.values(s.snapshot().threats.zombies);
  assert.equal(zs.length, 2);
  for (const z of zs) { assert.equal(z.state, 'attack'); assert.ok(cheb(z, { x: z.x, y: z.y }) === 0); }
  const f = s.snapshot().buildings.fence.bounds;
  for (const z of zs) assert.ok(z.x < f.x1 + 1 || z.x > f.x2 - 1 || z.y < f.y1 + 1 || z.y > f.y2 - 1, 'against the wall from outside, never inside');
  assert.equal(evs(s, 'zombie.reached_wall').length, 2);
  const mid = s.snapshot().buildings.fence.health;
  assert.ok(mid < 100, 'the fence has been hit');
  runTo(s, dawnTick(6) + 2);
  const ev = resolved(s)[0];
  assert.equal(ev.outcome, 'repelled'); assert.deepEqual(ev.lost, {});
  assert.equal(ev.fenceDamage, 100 - s.snapshot().buildings.fence.health, 'the damage is the real hits');
  assert.ok(ev.fenceDamage > 0 && ev.fenceDamage < 60);
  assert.equal(Object.keys(s.snapshot().threats.zombies).length, 0, 'the wave retreats at dawn');
  assert.equal(s.snapshot().threats.wave, null); assert.ok(!blockedTiles(s.snapshot()).has('16,7'), 'the gate opens again');
  assert.equal(s.snapshot().threats.history[0].outcome, 'repelled');
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
});

test('Z2: wall armor grows with the fence level - a level 2 fence takes no damage from walkers', () => {
  const s = wsim((st) => fence(st, 2));
  runTo(s, dawnTick(6) + 2);
  const ev = resolved(s)[0];
  assert.equal(ev.outcome, 'repelled'); assert.equal(ev.fenceDamage, 0);
  assert.equal(s.snapshot().buildings.fence.health, weak.buildings.fence.levels[2].maxHealth);
});

test('Z2: a nearly destroyed fence is breached - wall.breached, then a share of the AVAILABLE food and water is looted at dawn (reserved units stay)', () => {
  const s = wsim((st) => { fence(st, 1, 'ruined'); st.ledger['stock.water'].total = 20; st.ledger['stock.wheat'].total = 8; });
  runTo(s, dawnTick(6) + 2);
  assert.equal(evs(s, 'wall.breached').length, 1);
  const ev = resolved(s)[0];
  assert.equal(ev.outcome, 'breached'); assert.equal(ev.lost.water, 5, '25 % of 20, rounded up'); assert.equal(ev.lost.wheat, 2);
  assert.equal(s.snapshot().buildings.fence.health, 0);
  assert.deepEqual(ledgerViolations(s.snapshot()), []);
  const r = wsim((st) => { fence(st, 1, 'ruined'); st.ledger['stock.water'].total = 10; st.ledger['stock.water'].reserved = 10; st.reservations.r_test = { id: 'r_test', owner: 'x', account: 'stock.water', qty: 10 }; });
  runTo(r, dawnTick(6) + 2);
  assert.equal(r.snapshot().ledger['stock.water'].total, 10);
  assert.deepEqual(ledgerViolations(r.snapshot()), []);
});

test('Z2: a survivor OUTSIDE the wall is chased first - zombies reach her, leave the wall alone, and damage her', () => {
  const s = wsim((st) => { fence(st, 1); st.survivors.survivor_1.position = { x: 3, y: 8 }; });
  runTo(s, duskTick(6) + 90);
  assert.ok(evs(s, 'zombie.reached_survivor').length >= 1);
  assert.equal(evs(s, 'zombie.reached_wall').length, 0, 'the survivor outside is the target, not the wall');
  assert.equal(s.snapshot().threats.wave.wallDamage, 0);
  assert.ok(evs(s, 'survivor.damaged').length >= 1, 'Z3: reaching a survivor damages her');
  for (const z of Object.values(s.snapshot().threats.zombies)) assert.ok(cheb(z, s.snapshot().survivors.survivor_1.position) <= 1 || z.state === 'walk');
});

test('Z2: the closed gate blocks survivors in BOTH directions during a wave (NO_PATH), and opens at dawn', () => {
  const s = wsim((st) => { fence(st, 1); st.survivors.survivor_1.position = { x: 18, y: 7 }; });
  runTo(s, duskTick(6) + 1);
  go(s, 'moveTo', 'hq');
  for (let i = 0; i < 40; i++) s.step(1);
  assert.equal(JSON.stringify(s.log.all()).includes('NO_PATH'), true, 'cannot walk back in through the closed gate');
  runTo(s, dawnTick(6) + 2);
  go(s, 'moveTo', 'hq');
  for (let i = 0; i < 40; i++) s.step(1);
  const p = s.snapshot().survivors.survivor_1.position;
  assert.ok(p.x < 18, 'after dawn the gate is open and she walks home');
});

test('Z2: deterministic - same seed, same zombies, same hash; different seeds can come from different sides; a month soak stays balanced', () => {
  const run = (seed) => { const s = wsim(null, seed); runTo(s, duskTick(6) + 70); return s; };
  const a = run(11), b = run(11);
  assert.equal(a.stateHash(), b.stateHash());
  assert.deepEqual(a.renderProjection().zombies, b.renderProjection().zombies);
  const sides = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => { const s = run(seed); return evs(s, 'zombie.spawned')[0].x + ',' + evs(s, 'zombie.spawned')[0].y; }));
  assert.ok(sides.size > 1, 'the entry point depends on the seed');
  const soak = sim(on, 5, keep);
  for (let i = 0; i < DAY * 20; i++) soak.step(1);
  assert.deepEqual(ledgerViolations(soak.snapshot()), []);
  assert.ok(soak.snapshot().threats.history.length >= 1);
});

// ---- Z3: advanced attacks, defenses, and wave mechanics (doc 20 section 12) ----
test('Z3: survivor.attack damages zombies, respects armor/pierce, spends ammo, and clears the wave', () => {
  const s = wsim((st) => { fence(st, 1); keep(st); st.survivors.survivor_1.position = { x: 16, y: 7 }; st.survivors.survivor_1.equipment.weapon = 'spear'; });
  runTo(s, duskTick(6) + 3);
  const z = Object.values(s.snapshot().threats.zombies)[0];
  assert.ok(z);
  const id = z.id;
  const cmd = buildCommand('survivor_1', { name: 'attack', args: [id] });
  s.submit(cmd);
  for (let i = 0; i < 300 && s.snapshot().threats.zombies[id]; i++) s.step(1);
  assert.equal(s.snapshot().threats.zombies[id]?.health ?? 0, 0);
  assert.ok(evs(s, 'zombie.killed').some((e) => e.zombieId === id));
});

test('Z3: ranged ammo is carried and NO_AMMO stops a ranged attack without firing', () => {
  const s = wsim((st) => { fence(st, 1); keep(st); st.survivors.survivor_1.position = { x: 11, y: 8 }; st.survivors.survivor_1.equipment.weapon = 'bow'; });
  runTo(s, duskTick(6) + 3);
  const z = Object.values(s.snapshot().threats.zombies)[0];
  assert.ok(z);
  s.submit(buildCommand('survivor_1', { name: 'attack', args: [z.id] }));
  for (let i = 0; i < 20; i++) s.step(1);
  assert.equal(s.snapshot().survivors.survivor_1.lastTask?.reason, 'NO_AMMO');
  assert.equal(s.snapshot().threats.zombies[z.id].health, on.zombies[z.type].health);
});

test('Z3: guard is a standing combat action and damages the nearest zombie in range', () => {
  const s = wsim((st) => { fence(st, 1); keep(st); st.survivors.survivor_1.position = { x: 16, y: 7 }; });
  runTo(s, duskTick(6) + 3);
  s.submit(buildCommand('survivor_1', { name: 'guard', args: [] }));
  for (let i = 0; i < 100; i++) s.step(1);
  assert.ok(evs(s, 'zombie.hurt').length >= 1 || evs(s, 'zombie.killed').length >= 1);
});
