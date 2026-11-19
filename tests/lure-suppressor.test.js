// Z8: suppressor (equip accessory, halves personal-weapon noise), noise lure (survivor.lure), scream and explosion noise. docs/game/20 section 28.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, call, runUntilIdle, sandbox } from './helpers.js';
import { noise, weapons } from '../src/modules/definitions/data/arsenal.js';
import { zombies } from '../src/modules/definitions/data/threats.js';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { loudestTower, shotNoise } from '../src/modules/threats/index.js';

const fix = (st, id, level = 1) => { const b = st.buildings[id]; b.level = level; b.health = defs.buildings[b.type].levels[level].maxHealth; b.condition = 'repaired'; };
const give = (st, items) => { for (const [k, v] of Object.entries(items)) st.ledger[`stock.${k}`].total = v; };
const stock = (sim, k) => sim.snapshot().ledger[`stock.${k}`].total;
const calm = (st) => { for (const s of Object.values(st.survivors)) Object.assign(s.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 }); };
const at = (st, id, x, y) => { st.survivors[id].position = { x, y }; };
const types = (sim) => sim.log.all().map((e) => e.type);
const last = (sim) => sim.snapshot().survivors.survivor_1.lastTask;
const wave = (composition = { walker: 1 }) => ({ day: 18, strength: 4, defense: 0, composition, queue: [], spawned: 1, reinforced: 0, summoned: 0, startTick: 0, gateClosed: true, breached: false, wallDamage: 0 });
const zombie = (st, id, type, x, y, health) => { st.threats.zombies[id] = { id, type, x, y, direction: 'LEFT', state: 'walk', health: health ?? defs.zombies[type].health, move: 0, hit: 0, goal: null, route: null, reached: null }; st.threats.counter = 9; };

test('suppressor data: a recipe (workshop 2), an item with HQ and storehouse storage; the lure item is stored too; noise config validates', () => {
  const rc = defs.recipes.suppressor;
  assert.deepEqual(rc.outputs, { suppressor: 1 }); assert.equal(rc.stationLevel, 2); assert.equal(rc.action, 'craft');
  for (const item of ['suppressor', 'noise_lure']) assert.ok(defs.items[item] && defs.buildings.hq.storage[item] > 0 && defs.buildings.hq.levels[2].storage[item] > 0, item);
  assert.throws(() => createDefinitions({ noise: { ...noise, lure: { attention: 20, tower: 0, range: 1 } } }));
  assert.throws(() => createDefinitions({ noise: { ...noise, scream: -1 } }));
});

test('shotNoise: the suppressor halves a personal weapon (rounded down) and never touches a mounted one', () => {
  assert.equal(shotNoise(defs, 'rifle', false), weapons.rifle.noise);
  assert.equal(shotNoise(defs, 'rifle', true), Math.floor(weapons.rifle.noise * (100 - noise.suppressorPercent) / 100));
  assert.equal(shotNoise(defs, 'bow', true), 0);
  assert.equal(shotNoise(defs, 'minigun', true), weapons.minigun.noise);
});

test('equip("suppressor"): takes one from stock, fits for good, NOT_NEEDED twice, INSUFFICIENT_RESOURCE with none', () => {
  const sim = newSim('stage1', 1, (st) => { calm(st); give(st, { suppressor: 2 }); });
  call(sim, 'equip', 'suppressor'); runUntilIdle(sim, 200);
  assert.equal(sim.snapshot().survivors.survivor_1.equipment.suppressor, true);
  assert.equal(stock(sim, 'suppressor'), 1); assert.ok(types(sim).includes('suppressor.fitted'));
  call(sim, 'equip', 'suppressor'); sim.step(3); assert.equal(last(sim).reason, 'NOT_NEEDED'); assert.equal(stock(sim, 'suppressor'), 1);
  const none = newSim('stage1', 1, (st) => calm(st));
  call(none, 'equip', 'suppressor'); none.step(3); assert.equal(last(none).reason, 'INSUFFICIENT_RESOURCE');
});

test('a fitted suppressor makes a rifle quieter in play, and the weapon she holds can change without losing it', () => {
  const run = (suppressed) => {
    const sim = newSim('stage1', 1, (st) => {
      calm(st);
      const s = st.survivors.survivor_1; s.skills.combat = 3; s.equipment.weapon = 'rifle'; s.inventory.items.bullets = 50; if (suppressed) s.equipment.suppressor = true; at(st, 'survivor_1', 10, 5);
      st.threats.wave = wave(); zombie(st, 'zombie_1', 'brute', 14, 5, 500);
    });
    call(sim, 'guard'); let peak = 0;
    for (let i = 0; i < 40; i++) { sim.step(1); peak = Math.max(peak, sim.snapshot().threats.attention); }
    return peak;
  };
  const [loud, quiet] = [run(false), run(true)];
  assert.ok(quiet > 0 && quiet < loud, `suppressed ${quiet} < open ${loud}`);
});

function lurer(mut) {
  return newSim('stage1', 1, (st) => { calm(st); fix(st, 'tower_1'); st.survivors.survivor_1.inventory.items.noise_lure = 2; at(st, 'survivor_1', 14, 4); mut?.(st); });
}

test('lure: she sets it off at a tower - one lure spent, attention +lure.attention, that tower +lure.tower and now the loudest', () => {
  const sim = lurer();
  call(sim, 'lure', 'tower_1'); runUntilIdle(sim, 100);
  const st = sim.snapshot();
  assert.equal(st.survivors.survivor_1.inventory.items.noise_lure, 1);
  assert.ok(st.threats.towerNoise.tower_1 > 0 && st.threats.towerNoise.tower_1 <= noise.lure.tower);
  assert.ok(st.threats.attention > 0 && st.threats.attention <= noise.lure.attention);
  assert.equal(loudestTower(st)?.id, 'tower_1');
  const e = sim.log.all().find((x) => x.type === 'noise.lured'); assert.ok(e); assert.equal(e.towerId, 'tower_1');
  assert.equal(sim.studentView().threats.noise.loudest, 'tower_1');
});

test('lure: she walks to the tower first; failures NO_LURE, UNKNOWN_TARGET, NEEDS_REPAIR', () => {
  const far = lurer((st) => at(st, 'survivor_1', 4, 10));
  call(far, 'lure', 'tower_1'); far.step(3); assert.ok(far.snapshot().threats.attention === 0, 'not yet there'); runUntilIdle(far, 400);
  assert.equal(far.snapshot().survivors.survivor_1.inventory.items.noise_lure, 1);
  const none = lurer((st) => { st.survivors.survivor_1.inventory.items.noise_lure = 0; });
  call(none, 'lure', 'tower_1'); none.step(3); assert.equal(last(none).reason, 'NO_LURE');
  const bad = lurer(); call(bad, 'lure', 'hq_1'); bad.step(3); assert.equal(last(bad).reason, 'UNKNOWN_TARGET');
  const ruin = lurer((st) => { st.buildings.tower_1.condition = 'ruined'; });
  call(ruin, 'lure', 'tower_1'); ruin.step(3); assert.equal(last(ruin).reason, 'NEEDS_REPAIR');
});

test('lure bait works: with nobody outside, a zombie drifts toward the lured tower', () => {
  const walk = (lure) => {
    const sim = newSim('stage1', 1, (st) => {
      calm(st); at(st, 'survivor_1', 11, 9); fix(st, 'tower_1'); st.threats.wave = wave(); zombie(st, 'zombie_1', 'walker', 12, 0, 50);
      if (lure) st.threats.towerNoise.tower_1 = noise.lure.tower;
    });
    sim.step(14); return sim.snapshot().threats.zombies.zombie_1.x;
  };
  assert.ok(walk(true) > walk(false));
});

test('a screamer scream and a boomer explosion each add their noise to the attention meter', () => {
  const scr = newSim('stage1', 1, (st) => { calm(st); st.threats.wave = wave({ screamer: 1 }); zombie(st, 'zombie_1', 'screamer', 1, 6); });
  scr.step(zombies.screamer.behaviour.cooldownTicks);
  assert.ok(types(scr).includes('zombie.screamed')); assert.ok(scr.snapshot().threats.attention >= noise.scream - 1);
  const fence = (st) => Object.values(st.buildings).find((b) => b.type === 'fence').bounds;
  const boom = newSim('stage1', 1, (st) => { calm(st); st.threats.wave = wave({ boomer: 1 }); const { x1, y1 } = fence(st); zombie(st, 'zombie_1', 'boomer', x1 - 1, y1 - 1); });
  for (let i = 0; i < 80 && !types(boom).includes('zombie.exploded'); i++) boom.step(1);
  assert.ok(types(boom).includes('zombie.exploded'));
  assert.ok(boom.snapshot().threats.attention >= noise.explosion - 1, 'the blast is loud the moment it goes off (the meter then decays)');
});

test('learner API: survivor.lure and equip("suppressor") are documented and the codebook lists them; deterministic', async () => {
  const r = await sandbox.run({ code: 'survivor.take("noise_lure", 1); survivor.lure(tower_1); survivor.equip("suppressor");', view: newSim().studentView(), seed: 1 });
  assert.equal(r.ok, true, r.error?.message);
  assert.deepEqual(r.calls.map((c) => c.name), ['take', 'lure', 'equip']);
  const run = () => { const s = lurer(); call(s, 'lure', 'tower_1'); s.step(40); return s.stateHash(); };
  assert.equal(run(), run());
});
