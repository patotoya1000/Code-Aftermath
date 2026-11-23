import { available, stockKey } from '../resources/index.js';
import { hqLevelOf } from './index.js';

// R5 (docs/game/24 section 3e): the pure rules of the GARAGE and its vehicles, shared by the retrieve run (scavenge module + handler) and the projection (what the learner
// reads). Numbers live in data/vehicles.js; nothing here keeps state. A vehicle is not an item: the garage's level says which ones it fields, and a vehicle is "busy"
// exactly while a survivor away on a run carries its id in `away.vehicle` (so a lost survivor frees it again, and no extra state has to be saved).

/** Every garage building in the world. */
export const garagesOf = (state, defs) => Object.values(state.buildings).filter((b) => b.type === defs.vehicles.garage);

/** The highest level among fully repaired garages (0 when there is none): the garage level every vehicle's `garageLevel` is compared with. */
export const garageLevelOf = (state, defs) => garagesOf(state, defs).reduce((best, b) => (b.condition === 'repaired' ? Math.max(best, b.level) : best), 0);

/** The survivor id who is out with this vehicle right now, or null. */
export function vehicleHolder(state, id) {
  const s = Object.values(state.survivors).sort((a, b) => (a.id < b.id ? -1 : 1)).find((q) => q.status === 'away' && q.away?.vehicle === id);
  return s ? s.id : null;
}

/** What a run with this vehicle burns: { item, units } (item null when it needs no fuel), or null when base stock cannot pay for it. Prefers the first fuel item that covers it. */
export function fuelPlan(state, defs, id) {
  const units = defs.vehicles.types[id].fuel;
  if (units === 0) return { item: null, units: 0 };
  const item = defs.vehicles.fuelItems.find((i) => available(state, stockKey(i)) >= units);
  return item ? { item, units } : null;
}

/** Why this vehicle cannot leave now ({ code, message }) or null. Order: unknown id, HQ too low, no garage, garage too low or ruined, busy, no fuel. Used by the scavenge refusal AND again when she reaches the gate. */
export function vehicleRefusal(state, defs, id) {
  const v = defs.vehicles;
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(v.types, id)) return { code: 'UNKNOWN_TARGET', message: `There is no vehicle \"${id}\". Read a garage's vehicles list for the ids (${Object.keys(v.types).join(', ')}).` };
  const t = v.types[id];
  if (hqLevelOf(state) < v.minHq) return { code: 'HQ_LEVEL', message: `Vehicle runs open at HQ level ${v.minHq} (it is level ${hqLevelOf(state)}): upgrade the hq first.` };
  const garages = garagesOf(state, defs);
  if (garages.length === 0) return { code: 'NO_STATION', message: 'There is no garage in this world.' };
  if (garageLevelOf(state, defs) < t.garageLevel) return { code: 'NEEDS_REPAIR', message: `The ${t.name.toLowerCase()} needs a repaired garage at level ${t.garageLevel}: repair or upgrade it first.` };
  const holder = vehicleHolder(state, id);
  if (holder) return { code: 'VEHICLE_BUSY', message: `The ${t.name.toLowerCase()} is out with ${holder}.` };
  if (!fuelPlan(state, defs, id)) return { code: 'INSUFFICIENT_RESOURCE', message: `The ${t.name.toLowerCase()} burns ${t.fuel} ${v.fuelItems.join(' or ')} per run, and base stock has less.` };
  return null;
}

/** Her carry capacity (weight) on a run with this vehicle: the on-foot capacity x carryPercent. No vehicle = unchanged. Pure. */
export const vehicleCarry = (defs, id, base) => (id && defs.vehicles.types[id] ? Math.floor((base * defs.vehicles.types[id].carryPercent) / 100) : base);

/** The haul-run ticks with this vehicle: the on-foot ticks x ticksPercent, rounded up, at least 1. No vehicle = unchanged. Pure. */
export const vehicleTicks = (defs, id, base) => (id && defs.vehicles.types[id] ? Math.max(1, Math.ceil((base * defs.vehicles.types[id].ticksPercent) / 100)) : base);

/** The learner's view of a garage: is it working and open, which level it is, and every vehicle with its numbers and whether it can leave right now (and why not). null for any other building. */
export function garageInfoFor(state, defs, b) {
  if (b.type !== defs.vehicles.garage) return null;
  const v = defs.vehicles;
  const working = b.condition === 'repaired';
  const open = hqLevelOf(state) >= v.minHq;
  return {
    working, open, minHq: v.minHq, level: b.level, fuelItems: [...v.fuelItems],
    vehicles: Object.entries(v.types).map(([id, t]) => {
      const refusal = vehicleRefusal(state, defs, id);
      return { id, name: t.name, garageLevel: t.garageLevel, carryPercent: t.carryPercent, ticksPercent: t.ticksPercent, fuel: t.fuel, busyWith: vehicleHolder(state, id), canUse: refusal === null, reason: refusal ? refusal.message : null };
    }),
  };
}
