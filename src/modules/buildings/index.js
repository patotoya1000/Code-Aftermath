import { AftermathError } from '../../kernel/index.js';

export function createBuilding(defs, spec) {
  const def = defs.buildings[spec.type];
  if (!def) throw new AftermathError('UNKNOWN_BUILDING', `Unknown building type ${spec.type}`);
  const b = {
    id: spec.id, type: spec.type, level: spec.level ?? 1, x: spec.x, y: spec.y,
    health: spec.health ?? def.levels[spec.level ?? 1].maxHealth,
    condition: 'repaired',
    ...(def.storage ? { storage: { ...def.storage } } : {}),
  };
  if (spec.bounds) b.bounds = { ...spec.bounds };
  b.condition = conditionOf(defs, b);
  return b;
}

export const maxHealthOf = (defs, b) => defs.buildings[b.type].levels[b.level].maxHealth;

/** Meaningful visual/functional threshold: ruined | damaged | repaired. */
export function conditionOf(defs, b) {
  const v = defs.buildings[b.type].visual;
  const ratio = b.health / maxHealthOf(defs, b);
  if (ratio <= v.ruinedBelow) return 'ruined';
  if (ratio < v.damagedBelow) return 'damaged';
  return 'repaired';
}

/** Semantic asset key per docs: building_<type>_lv<level>_<state>. */
export const assetKey = (b) => `building_${b.type}_lv${b.level}_${b.condition}`;

/** Apply a health change; returns { from, to } condition so callers can emit events. */
export function applyHealth(defs, b, delta) {
  const from = b.condition;
  b.health = Math.min(maxHealthOf(defs, b), Math.max(0, b.health + delta));
  b.condition = conditionOf(defs, b);
  return { from, to: b.condition };
}

// ---- Pooled storage (R3). Base stock is one stock per item; its limit is the sum of the storage tables of every building
// that still works. A ruined building adds nothing and cannot be unloaded at. ----

export const isOperational = (b) => b.condition !== 'ruined';
const accepts = (b, item) => Boolean(b.storage) && Object.prototype.hasOwnProperty.call(b.storage, item) && isOperational(b);

/** Pooled capacity for `item` (0 when nothing working stores it). */
export function storageCapacity(state, item) {
  let cap = 0;
  for (const b of Object.values(state.buildings)) if (accepts(b, item)) cap += b.storage[item];
  return cap;
}

/** The working building nearest to `from` that accepts `item` (chebyshev distance, ties by id), or null. */
export function nearestDepot(state, item, from) {
  let best = null;
  for (const b of Object.values(state.buildings)) {
    if (!accepts(b, item)) continue;
    const d = Math.max(Math.abs(b.x - from.x), Math.abs(b.y - from.y));
    if (!best || d < best.d || (d === best.d && b.id < best.b.id)) best = { b, d };
  }
  return best?.b ?? null;
}

export const depotAccepts = accepts;
