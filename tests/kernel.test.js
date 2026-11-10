import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, stableStringify, hashValue, createEventLog, directionFromDelta, chebyshev } from '../src/kernel/index.js';

test('rng: same seed gives same sequence; state can be resumed', () => {
  const a = createRng(42); const b = createRng(42);
  const seqA = Array.from({ length: 5 }, () => a.next());
  assert.deepEqual(seqA, Array.from({ length: 5 }, () => b.next()));
  const c = createRng(42); c.next(); c.next();
  const resumed = createRng(c.state);
  assert.equal(resumed.next(), c.next());
  assert.notEqual(createRng(1).next(), createRng(2).next());
});

test('stableStringify ignores key order; hash is stable and sensitive', () => {
  assert.equal(stableStringify({ b: 1, a: [1, { d: 1, c: 2 }] }), stableStringify({ a: [1, { c: 2, d: 1 }], b: 1 }));
  assert.equal(hashValue({ a: 1 }), hashValue({ a: 1 }));
  assert.notEqual(hashValue({ a: 1 }), hashValue({ a: 2 }));
});

test('event log is append-only, frozen, and reserved keys win', () => {
  const log = createEventLog();
  const e = log.append(3, 'x', { seq: 99, tick: 99, type: 'y', other: 1 });
  assert.equal(e.seq, 0); assert.equal(e.tick, 3); assert.equal(e.type, 'x');
  assert.throws(() => { 'use strict'; e.tick = 5; });
});

test('8-direction vocabulary', () => {
  assert.equal(directionFromDelta(0, -3), 'UP');
  assert.equal(directionFromDelta(1, 1), 'DOWN_RIGHT');
  assert.equal(directionFromDelta(-2, 1), 'DOWN_LEFT');
  assert.equal(directionFromDelta(0, 0), null);
  assert.equal(chebyshev({ x: 0, y: 0 }, { x: 3, y: -5 }), 5);
});
