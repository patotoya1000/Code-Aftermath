import { chebyshev } from '../../kernel/index.js';
import { sourceKey, stockKey, total, available, credit, transfer } from '../resources/index.js';
import { isOperational, depotAccepts, storageRoom } from '../buildings/index.js';
import { weatherAt } from '../environment/index.js';

// Water (O7): renewable sources (the deep well) and the siphon that automates hauling from them.
//
//   aquifer   every tick the well's reservoir gains water: +`recharge.amount` every `recharge.every` ticks at normal weather,
//             scaled by the weather of the day (`environment.weather[..].recharge`, percent). The accumulator is an integer
//             (percent-ticks), so there is no floating point and no randomness: same tick => same water, replay-safe.
//             The reservoir never holds more than `reservoir`; what would overflow is simply lost. A RUINED well refills nothing.
//   siphon    (level 2+) every `siphon.every` ticks it moves `siphon.amount` from the reservoir into base stock - but only while
//             it is CONNECTED: a working building that stores water stands within `siphon.reach` tiles, and base storage has room.
//   status    'OFF' (no siphon yet) · 'BROKEN' (well ruined) · 'NO_POWER' (a pump the grid is not powering) · 'NO_STORAGE' (nothing that stores water within reach) ·
//             'FULL' (base water storage is full) · 'ACTIVE'. It describes the CONNECTION, not whether water is flowing this
//             very tick, so it only changes (and emits `siphon.status`) when something about the structure changes.
//
// Everything here is a pure function of (definitions, state, tick). The simulation calls tickWater() once per tick.

export const sourceDefOf = (defs, b) => defs.buildings[b.type]?.levels?.[b.level]?.source ?? null;
export const siphonDefOf = (defs, b) => defs.buildings[b.type]?.levels?.[b.level]?.siphon ?? null;

/** Aquifer speed today, in percent of normal. */
export const rechargePercent = (defs, tick) => defs.environment.weather[weatherAt(defs, tick)].recharge ?? 100;

/** Working source buildings that supply `resource`, shaped like gather's draw points: { id, x, y, account, renewable }. */
export function workingSources(state, defs, resource) {
  const out = [];
  for (const b of Object.values(state.buildings)) {
    const s = sourceDefOf(defs, b);
    if (s && s.resource === resource && isOperational(b)) out.push({ id: b.id, x: b.x, y: b.y, account: sourceKey(b.id), renewable: true });
  }
  return out;
}

/** The nearest WORKING building (not `b`) that stores `resource` within `reach` tiles of `b` (ties by id), or null. */
export function siphonTarget(state, b, resource, reach) {
  let best = null;
  for (const o of Object.values(state.buildings)) {
    if (o.id === b.id || !depotAccepts(o, resource)) continue;
    const d = chebyshev(b, o);
    if (d > reach) continue;
    if (!best || d < best.d || (d === best.d && o.id < best.o.id)) best = { o, d };
  }
  return best?.o ?? null;
}

function siphonStatus(state, defs, b, src, sp) {
  if (!sp) return 'OFF';
  if (!isOperational(b)) return 'BROKEN';
  if (defs.buildings[b.type].levels[b.level].power?.use !== undefined && !b.power?.powered) return 'NO_POWER';
  if (!siphonTarget(state, b, src.resource, sp.reach)) return 'NO_STORAGE';
  if (storageRoom(state, src.resource) < 1) return 'FULL';
  return 'ACTIVE';
}

/** One tick of every well: aquifer recharge, then the siphon. Mutates state through the ledger only. ctx = { state, defs, emit }. */
export function tickWater(ctx) {
  const { state, defs, emit } = ctx;
  const percent = rechargePercent(defs, state.tick);
  for (const id of Object.keys(state.buildings).sort()) {
    const b = state.buildings[id];
    const src = sourceDefOf(defs, b);
    if (!src || !b.water) continue;
    const key = sourceKey(b.id);

    if (isOperational(b)) {
      b.water.progress += percent;
      const step = src.recharge.every * 100;
      while (b.water.progress >= step) {
        b.water.progress -= step;
        const room = src.reservoir - total(state, key);
        if (room > 0) credit(state, key, Math.min(room, src.recharge.amount));
      }
    }

    const sp = siphonDefOf(defs, b);
    const status = siphonStatus(state, defs, b, src, sp);
    if (status !== b.water.siphon.status) {
      emit('siphon.status', { buildingId: b.id, from: b.water.siphon.status, to: status });
      b.water.siphon.status = status;
    }
    if (status === 'ACTIVE') {
      const s = b.water.siphon;
      if (s.progress < sp.every) s.progress += 1;
      if (s.progress >= sp.every) {
        const n = Math.min(sp.amount, available(state, key), storageRoom(state, src.resource));
        if (n >= 1) { transfer(state, key, stockKey(src.resource), n); s.progress = 0; }
      }
    }
  }
}

/** Learner/UI view of a source building (undefined when it has no source at its level). */
export function waterInfoFor(state, defs, b) {
  const src = sourceDefOf(defs, b);
  if (!src || !b.water) return undefined;
  const sp = siphonDefOf(defs, b);
  const percent = rechargePercent(defs, state.tick);
  const target = sp ? siphonTarget(state, b, src.resource, sp.reach) : null;
  return {
    resource: src.resource,
    amount: total(state, sourceKey(b.id)),
    available: available(state, sourceKey(b.id)),
    capacity: src.reservoir,
    working: isOperational(b),
    recharge: { every: src.recharge.every, amount: src.recharge.amount, percent, perDay: Math.floor((defs.environment.ticksPerDay * percent * src.recharge.amount) / (100 * src.recharge.every)) },
    siphon: sp ? { every: sp.every, amount: sp.amount, reach: sp.reach, status: b.water.siphon.status, target: target?.id ?? null } : null,
  };
}
