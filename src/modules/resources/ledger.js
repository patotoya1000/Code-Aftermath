import { AftermathError } from '../../kernel/index.js';

// The resource ledger: every spendable quantity (base stock, resource-node contents) is an
// "account" with total + reserved. Actions reserve, then commit on success or release on failure,
// so two actions can never spend the same unit.
export const stockKey = (item) => `stock.${item}`;
export const nodeKey = (id) => `node.${id}`;

function acct(state, key) {
  const a = state.ledger[key];
  if (!a) throw new AftermathError('UNKNOWN_ACCOUNT', `Unknown account ${key}`);
  return a;
}

function assertQty(qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new AftermathError('INVALID_QUANTITY', `Quantity must be a positive integer, got ${qty}`);
}

export function openAccount(state, key, total) {
  if (state.ledger[key]) throw new AftermathError('DUPLICATE_ACCOUNT', `Account ${key} already exists`);
  state.ledger[key] = { total, reserved: 0 };
}

export const total = (state, key) => acct(state, key).total;
export const available = (state, key) => { const a = acct(state, key); return a.total - a.reserved; };

export function reserve(state, { owner, account, qty }) {
  assertQty(qty);
  const a = acct(state, account);
  const free = a.total - a.reserved;
  if (free < qty) throw new AftermathError('INSUFFICIENT_RESOURCE', `Need ${qty} of ${account}, only ${free} available`, { account, qty, available: free });
  a.reserved += qty;
  state.counters.reservation += 1;
  const id = `res_${state.counters.reservation}`;
  state.reservations[id] = { id, owner, account, qty };
  return id;
}

function take(state, id) {
  const r = state.reservations[id];
  if (!r) throw new AftermathError('UNKNOWN_RESERVATION', `Unknown reservation ${id}`);
  delete state.reservations[id];
  return r;
}

/** Consume a reservation: the reserved quantity leaves the account for good. */
export function commit(state, id) {
  const r = take(state, id);
  const a = acct(state, r.account);
  a.reserved -= r.qty;
  a.total -= r.qty;
  return { account: r.account, qty: r.qty };
}

/** Give a reservation back (failure/cancel). */
export function release(state, id) {
  const r = take(state, id);
  acct(state, r.account).reserved -= r.qty;
}

export function releaseOwner(state, owner) {
  for (const r of Object.values(state.reservations)) if (r.owner === owner) release(state, r.id);
}

export function credit(state, key, qty) {
  assertQty(qty);
  acct(state, key).total += qty;
}

/** Safe summary for learner/UI: no reservation internals. */
export function summary(state) {
  const out = {};
  for (const [k, a] of Object.entries(state.ledger)) out[k] = { total: a.total, reserved: a.reserved, available: a.total - a.reserved };
  return out;
}

/** Test/debug helper: returns a list of invariant violations (empty = healthy). */
export function ledgerViolations(state) {
  const problems = [];
  const sums = {};
  for (const r of Object.values(state.reservations)) sums[r.account] = (sums[r.account] ?? 0) + r.qty;
  for (const [k, a] of Object.entries(state.ledger)) {
    if (a.reserved !== (sums[k] ?? 0)) problems.push(`${k}: reserved ${a.reserved} != reservations ${sums[k] ?? 0}`);
    if (a.total < a.reserved || a.reserved < 0) problems.push(`${k}: total ${a.total} / reserved ${a.reserved} out of range`);
  }
  return problems;
}
