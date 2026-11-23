import { AftermathError } from '../../kernel/index.js';
import { total, stockKey } from '../resources/index.js';

export function createBuilding(defs, spec) {
  const def = defs.buildings[spec.type];
  if (!def) throw new AftermathError('UNKNOWN_BUILDING', `Unknown building type ${spec.type}`);
  const b = {
    id: spec.id, type: spec.type, level: spec.level ?? 1, x: spec.x, y: spec.y,
    health: spec.health ?? def.levels[spec.level ?? 1].maxHealth,
    condition: 'repaired',
    blocks: def.blocks !== false, // survivors cannot walk through it (see pathing.js); the gate opts out
    ...(def.storage ? { storage: { ...def.storage } } : {}),
    // A building that has a water source at any level keeps its own small bookkeeping here (the reservoir itself is a ledger account):
    //   progress = aquifer recharge accumulator (percent-ticks), siphon = { status, progress }.
    ...(Object.values(def.levels).some((l) => l.source) ? { water: { progress: 0, siphon: { status: 'OFF', progress: 0 } } } : {}),
    // Power (O11): producers and consumers keep their own small bookkeeping (burn = ticks of the current fuel unit left, output = produced this tick,
    // powered = a consumer got its power this tick, status = last reported status).
    ...(Object.values(def.levels).some((l) => l.power) ? { power: { burn: 0, output: 0, powered: false, charge: 0, status: 'OFF' } } : {}),
  };
  if (spec.type === 'tower') b.mounts = []; // Z6b: installed mounted weapons: [{ weapon, hopper, cooldown, status, powered }]
  if (spec.bounds) b.bounds = { ...spec.bounds };
  if (def.footprint) b.footprint = footprintRect(def.footprint, spec.x, spec.y);
  b.condition = conditionOf(defs, b);
  return b;
}

/** Absolute inclusive rectangle of a definition footprint (offsets relative to the door cell) placed at door (x, y). */
export const footprintRect = (fp, x, y) => ({ x1: x + fp.x, y1: y + fp.y, x2: x + fp.x + fp.w - 1, y2: y + fp.y + fp.h - 1 });

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

/**
 * Room left in pooled storage for `item`: pooled capacity - base stock - every unit already on its way there (what survivors carry
 * and what gatherers have reserved at a source but not picked up yet). `exceptActionId` leaves one gather's own batch out of the sum.
 * Gatherers and siphons both use it, so nothing can ever overfill storage.
 */
export function storageRoom(state, item, exceptActionId = null) {
  let incoming = 0;
  for (const sv of Object.values(state.survivors)) if (Object.prototype.hasOwnProperty.call(sv.inventory.items, item)) incoming += sv.inventory.items[item];
  for (const id of state.activeActions) {
    const o = state.actions[id];
    if (o.actionId !== exceptActionId && o.actionType === 'gather' && o.params.resource === item && o.batch > 0 && o.reservationIds.length > 0) incoming += o.batch;
  }
  return Math.max(0, storageCapacity(state, item) - total(state, stockKey(item)) - incoming);
}

/** The next level's upgrade offer for a building ({ level, cost, ticks, minHq? }) or null at the top / when none is defined. `minHq` = the HQ level this level needs (P0). */
export function nextUpgrade(defs, b) {
  const def = defs.buildings[b.type];
  const level = b.level + 1;
  const spec = def.upgrade?.[level];
  return def.levels[level] && spec ? { level, cost: { ...spec.cost }, ticks: spec.ticks, ...(spec.minHq ? { minHq: spec.minHq } : {}) } : null;
}

/** The headquarters level of this world (the highest `hq` building; 0 when there is none). It is the ceiling for walls, gates and strip builds (docs/game/23 section 3). */
export function hqLevelOf(state) {
  let lv = 0;
  for (const b of Object.values(state.buildings)) if (b.type === 'hq' && b.level > lv) lv = b.level;
  return lv;
}

/** Why this upgrade is locked by the HQ, or null: `{ need, have }` when the HQ is below the level the upgrade asks for. */
export function hqLock(state, up) {
  if (!up?.minHq) return null;
  const have = hqLevelOf(state);
  return have >= up.minHq ? null : { need: up.minHq, have };
}

/** Repair numbers for this building AT ITS LEVEL: the building's `repair` table, overridden by the level's own `repair` when it has one (heavier walls take heavier repairs). */
export const repairOf = (defs, b) => ({ ...defs.buildings[b.type].repair, ...(defs.buildings[b.type].levels[b.level]?.repair ?? {}) });

/** Wall armor of a fence or gate: the level's `armor`, else `waveRules.wallArmorPerLevel` x level (the pre-P3 rule). Subtracted from every zombie wall hit. */
export const armorOf = (defs, b) => defs.buildings[b.type].levels[b.level]?.armor ?? (defs.waveRules?.wallArmorPerLevel ?? 1) * b.level;

/** Station buildings for a recipe: `all` of its type, and the `working` ones (fully repaired and at least the recipe's station level). */
export function stationsFor(state, defs, recipe) {
  const all = Object.values(state.buildings).filter((b) => b.type === recipe.station);
  return { all, working: all.filter((b) => b.condition === 'repaired' && b.level >= recipe.stationLevel) };
}

export { findPath, blockedTiles } from './pathing.js';
export { caveInPercent, roundYield, miningInfoFor } from './mining.js';
