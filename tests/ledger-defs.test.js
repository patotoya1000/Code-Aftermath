import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openAccount, reserve, commit, release, releaseOwner, available, total, credit, ledgerViolations } from '../src/modules/resources/index.js';
import { createDefinitions } from '../src/modules/definitions/index.js';

const fresh = () => { const s = { ledger: {}, reservations: {}, counters: { reservation: 0 } }; openAccount(s, 'stock.wood', 10); return s; };

test('ledger: reserve → commit consumes; reserve → release restores', () => {
  const s = fresh();
  const r1 = reserve(s, { owner: 'a', account: 'stock.wood', qty: 6 });
  assert.equal(available(s, 'stock.wood'), 4);
  assert.equal(total(s, 'stock.wood'), 10);
  release(s, r1);
  assert.equal(available(s, 'stock.wood'), 10);
  const r2 = reserve(s, { owner: 'a', account: 'stock.wood', qty: 6 });
  commit(s, r2);
  assert.equal(total(s, 'stock.wood'), 4);
  assert.deepEqual(ledgerViolations(s), []);
});

test('ledger: cannot reserve more than available (double-spend guard) and rejects bad quantities', () => {
  const s = fresh();
  reserve(s, { owner: 'a', account: 'stock.wood', qty: 7 });
  assert.throws(() => reserve(s, { owner: 'b', account: 'stock.wood', qty: 4 }), (e) => e.code === 'INSUFFICIENT_RESOURCE');
  assert.throws(() => reserve(s, { owner: 'b', account: 'stock.wood', qty: 0 }), (e) => e.code === 'INVALID_QUANTITY');
  assert.throws(() => reserve(s, { owner: 'b', account: 'nope', qty: 1 }), (e) => e.code === 'UNKNOWN_ACCOUNT');
  releaseOwner(s, 'a');
  credit(s, 'stock.wood', 5);
  assert.equal(available(s, 'stock.wood'), 15);
});

test('definitions: default set is valid and frozen; bad data is rejected with every error listed', () => {
  const d = createDefinitions();
  assert.ok(Object.isFrozen(d.items));
  assert.throws(() => { d.items.wood.unitWeight = 0; }, TypeError);
  assert.throws(
    () => createDefinitions({ nodeTypes: { tree: { name: 'T', yields: 'unobtainium', amount: 5, variance: 0 } } }),
    (e) => e.code === 'INVALID_DEFINITIONS' && e.details.errors.some((m) => m.includes('unobtainium')),
  );
});
