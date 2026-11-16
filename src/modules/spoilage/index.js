import { stockKey, total, available, discard } from '../resources/index.js';
import { isOperational } from '../buildings/index.js';

// Spoilage (O9, docs/game/16): perishable items (items with a `shelfLife` in days) are kept as BATCHES { qty, age } beside the
// ledger, which still owns the quantity. `state.perishables[item]` is a list of batches, oldest first; the sum of a list always
// equals the item's ledger total (syncStock restores that after every change, so ages stay exact):
//   more in the ledger than in the batches  -> the difference is a FRESH batch (age 0)
//   less in the ledger than in the batches  -> the OLDEST units are the ones that were used
// Once per calendar day (the simulation calls ageFood when the day changes) every batch ages 100 points; a batch whose age reaches
// shelfLife x 100 spoils: its units leave the ledger for good (ledger.discard, the only sink) and `food.spoiled` is emitted.
// COLD storage (a building level with a `cold` table: capacity in units, factor) slows ageing: the `capacity` OLDEST units across all
// perishables age only floor(100 / factor) points that day. Integers only, no randomness: same ticks => same food.

export const AGE_PER_DAY = 100;

export const perishableItems = (defs) => Object.entries(defs.items).filter(([, it]) => it.shelfLife).map(([id]) => id).sort();
export const limitOf = (defs, item) => defs.items[item].shelfLife * AGE_PER_DAY;

const listOf = (state, item) => (state.perishables[item] ??= []);
const sum = (list) => list.reduce((n, b) => n + b.qty, 0);

/** Make the batches of `item` match the ledger total (call right after any change to that stock). */
export function syncStock(state, defs, item) {
  if (!defs.items[item]?.shelfLife) return;
  const list = listOf(state, item);
  const have = sum(list);
  const want = total(state, stockKey(item));
  if (want > have) {
    const last = list.at(-1);
    if (last && last.age === 0) last.qty += want - have; else list.push({ qty: want - have, age: 0 });
    list.sort((a, b) => b.age - a.age); // stable: oldest first
  } else if (want < have) {
    let drop = have - want;
    while (drop > 0) { // the oldest go first
      const b = list[0];
      const take = Math.min(drop, b.qty);
      b.qty -= take; drop -= take;
      if (b.qty === 0) list.shift();
    }
  }
}

/** The best cold storage that works: { capacity (summed over working buildings), factor (the best one) } or null. */
export function coldOf(state, defs) {
  let capacity = 0; let factor = 0;
  for (const b of Object.values(state.buildings)) {
    const c = defs.buildings[b.type].levels[b.level]?.cold;
    if (c && isOperational(b)) { capacity += c.capacity; factor = Math.max(factor, c.factor); }
  }
  return capacity > 0 ? { capacity, factor } : null;
}

const pointsPerDay = (cold, protectedUnit) => (protectedUnit && cold ? Math.floor(AGE_PER_DAY / cold.factor) : AGE_PER_DAY);

/** Oldest-first flat list of batches across perishables; the first `capacity` units are the protected ones (batches are split at the cut). */
function planDay(state, defs, cold) {
  const all = [];
  for (const item of perishableItems(defs)) for (const b of listOf(state, item)) all.push({ item, qty: b.qty, age: b.age });
  all.sort((a, b) => b.age - a.age || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
  let room = cold?.capacity ?? 0;
  const out = [];
  for (const b of all) {
    const safe = Math.min(room, b.qty);
    room -= safe;
    if (safe > 0) out.push({ item: b.item, qty: safe, age: b.age, cold: true });
    if (b.qty - safe > 0) out.push({ item: b.item, qty: b.qty - safe, age: b.age, cold: false });
  }
  return out;
}

/** Called once when the calendar day changes. Ages every batch, spoils what ran out. */
export function ageFood(ctx, day = null) {
  const { state, defs } = ctx;
  for (const item of perishableItems(defs)) syncStock(state, defs, item);
  const cold = coldOf(state, defs);
  const next = {};
  for (const item of perishableItems(defs)) next[item] = [];
  const spoiled = {};
  for (const b of planDay(state, defs, cold)) {
    const age = b.age + pointsPerDay(cold, b.cold);
    let { qty } = b;
    if (age >= limitOf(defs, b.item)) {
      const lost = Math.min(qty, available(state, stockKey(b.item))); // units reserved by a meal in progress cannot be taken away; they spoil tomorrow
      if (lost > 0) { discard(state, stockKey(b.item), lost); spoiled[b.item] = (spoiled[b.item] ?? 0) + lost; qty -= lost; }
    }
    if (qty > 0) next[b.item].push({ qty, age: Math.min(age, limitOf(defs, b.item)) });
  }
  for (const item of perishableItems(defs)) {
    const merged = [];
    for (const b of next[item].sort((x, y) => y.age - x.age)) { const l = merged.at(-1); if (l && l.age === b.age) l.qty += b.qty; else merged.push({ ...b }); }
    state.perishables[item] = merged;
    if (spoiled[item]) ctx.emit('food.spoiled', { item, qty: spoiled[item], day });
  }
}

/** Read-only: what is in stock, oldest first: [{ item, qty, daysLeft, cold }]. Untracked stock (changed outside the game rules) counts as fresh. */
export function perishableView(state, defs) {
  const cold = coldOf(state, defs);
  const all = [];
  for (const item of perishableItems(defs)) {
    const list = (state.perishables?.[item] ?? []).map((b) => ({ ...b }));
    const extra = total(state, stockKey(item)) - sum(list);
    if (extra > 0) list.push({ qty: extra, age: 0 });
    for (const b of list) all.push({ item, qty: b.qty, age: b.age });
  }
  all.sort((a, b) => b.age - a.age || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
  let room = cold?.capacity ?? 0;
  const out = [];
  for (const b of all) {
    const safe = Math.min(room, b.qty);
    room -= safe;
    const left = (age, per) => Math.max(0, Math.ceil((limitOf(defs, b.item) - age) / per));
    if (safe > 0) out.push({ item: b.item, qty: safe, daysLeft: left(b.age, pointsPerDay(cold, true)), cold: true });
    if (b.qty - safe > 0) out.push({ item: b.item, qty: b.qty - safe, daysLeft: left(b.age, AGE_PER_DAY), cold: false });
  }
  return out;
}

/** Read-only: a cold building's table and how many units of food it protects right now (0 while ruined). */
export function coldInfoFor(state, defs, b) {
  const c = defs.buildings[b.type].levels[b.level]?.cold;
  if (!c) return null;
  return { capacity: c.capacity, factor: c.factor, working: isOperational(b) };
}
