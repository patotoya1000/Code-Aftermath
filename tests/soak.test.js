// Soak test: thousands of ticks of pseudo-random (but seeded, so reproducible) play. After every slice the world must
// still satisfy its invariants. This is the "unknown unknowns" net: it found nothing by hand, so we let it run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/kernel/index.js';
import { ledgerViolations, nodeKey, stockKey } from '../src/modules/resources/index.js';
import { defs, newSim } from './helpers.js';

const BUILDINGS = ['hq', 'fence', 'tent_1', 'storage_1', 'gate'];
const NODES = ['tree_1', 'tree_2', 'tree_3', 'rock_1'];

function randomCommand(rng) {
  const pick = (arr) => arr[rng.int(arr.length)];
  switch (rng.int(8)) {
    case 0: return { type: 'gather', params: { resource: pick(['wood', 'stone']), amount: 1 + rng.int(20), ...(rng.int(2) ? { total: 1 + rng.int(60) } : {}) } };
    case 1: return { type: 'rest', params: rng.int(2) ? { ticks: 1 + rng.int(60) } : {} };
    case 2: return { type: 'eat', params: {} };
    case 3: return { type: 'drink', params: {} };
    case 4: return { type: 'repair', params: { targetId: pick(BUILDINGS) } };
    case 5: return { type: 'move', params: rng.int(2) ? { x: rng.int(24), y: rng.int(16) } : { targetId: pick([...BUILDINGS, ...NODES]) } };
    case 6: return { type: 'stop', params: {} };
    default: return { type: 'gather', params: { resource: 'food' } }; // no such nodes → must fail cleanly
  }
}

function assertInvariants(sim, label, start) {
  const st = sim.snapshot();
  assert.deepEqual(ledgerViolations(st), [], `${label}: ledger`);
  for (const [k, a] of Object.entries(st.ledger)) assert.ok(a.total >= 0 && a.reserved >= 0 && a.reserved <= a.total, `${label}: ${k} ${JSON.stringify(a)}`);
  const cap = defs.buildings.hq.storage;
  for (const [res, c] of Object.entries(cap)) assert.ok(st.ledger[stockKey(res)].total <= Math.max(c, start[res]), `${label}: ${res} over HQ capacity`);
  const s = st.survivors.survivor_1;
  for (const [need, v] of Object.entries(s.needs)) assert.ok(Number.isFinite(v) && v >= 0 && v <= 100, `${label}: need ${need}=${v}`);
  assert.ok(s.position.x >= 0 && s.position.y >= 0 && s.position.x < st.map.width && s.position.y < st.map.height, `${label}: position`);
  for (const b of Object.values(st.buildings)) assert.ok(b.health >= 0 && b.health <= defs.buildings[b.type].levels[b.level].maxHealth, `${label}: ${b.id} health`);
  // stone is only ever gathered (never spent): nodes + stock is constant
  const stone = Object.values(st.nodes).filter((n) => n.resource === 'stone').reduce((t, n) => t + st.ledger[nodeKey(n.id)].total, 0) + st.ledger[stockKey('stone')].total;
  assert.equal(stone, start.stoneAll, `${label}: stone conserved`);
  // every live action reserves only what it should; terminal actions hold nothing
  for (const a of Object.values(st.actions)) if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(a.status)) assert.deepEqual(a.reservationIds, [], `${label}: ${a.actionId} holds reservations after ending`);
  assert.deepEqual([...new Set(st.activeActions)].length, st.activeActions.length, `${label}: duplicate active action`);
}

// CI runs 12 seeds; for a deep check run:  SOAK_SEEDS=300 npm test
const SEEDS = Array.from({ length: Number(process.env.SOAK_SEEDS ?? 12) }, (_, i) => i + 1);
for (const seed of SEEDS) {
  test(`soak: seed ${seed} — 3000 ticks of random commands keep every invariant`, () => {
    // odd seeds play a strong, skilled survivor so output bonuses are exercised too
    const sim = newSim('stage1', seed, seed % 2 ? (st) => { st.survivors.survivor_1.traits = ['strong', 'tireless']; st.survivors.survivor_1.skills.gathering = 8; } : undefined);
    const rng = createRng(seed * 7919);
    const st0 = sim.snapshot();
    const start = {
      ...Object.fromEntries(Object.keys(defs.items).map((i) => [i, st0.ledger[stockKey(i)].total])),
      stoneAll: Object.values(st0.nodes).filter((n) => n.resource === 'stone').reduce((t, n) => t + st0.ledger[nodeKey(n.id)].total, 0) + st0.ledger[stockKey('stone')].total,
    };
    for (let slice = 0; slice < 60; slice++) {
      for (let c = rng.int(3); c > 0; c--) {
        const cmd = randomCommand(rng);
        try { sim.submit({ apiVersion: 1, actorId: 'survivor_1', mode: rng.int(2) ? 'replace' : 'queue', ...cmd }); } catch (e) { assert.ok(e.code, 'rejections carry a code'); }
      }
      sim.step(50);
      assertInvariants(sim, `seed ${seed} slice ${slice} tick ${sim.tick}`, start);
      if (sim.snapshot().survivors.survivor_1.status !== 'active') break; // starvation is a legal ending
    }
  });
}

test('soak: the same seeded session is bit-for-bit reproducible', () => {
  const run = () => {
    const sim = newSim('stage1', 5); const rng = createRng(99);
    for (let i = 0; i < 40; i++) { try { sim.submit({ apiVersion: 1, actorId: 'survivor_1', mode: 'queue', ...randomCommand(rng) }); } catch { /* ignored */ } sim.step(40); }
    return [sim.stateHash(), sim.log.hash()];
  };
  assert.deepEqual(run(), run());
});
