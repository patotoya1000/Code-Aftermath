import { stockKey, available, discard } from '../resources/index.js';
import { isOperational } from '../buildings/index.js';
import { timeOf, weatherAt } from '../environment/index.js';

// Power (O11, docs/game/16): one small grid, one number per tick.
//
//   producer   a building level with `power.output`. Two kinds:
//                solar panel  `solar: true`  output = floor(output x weather.solar / 100), and 0 at night. Free, always offered.
//                generator    `fuel: { item, every }`  burns ONE `item` from base stock per `every` ticks, but only on ticks when
//                             the grid still needs power. Higher levels give more output per fuel.
//   consumer   a building level with `power.use` (the freezer storehouse). It only works while the grid powers it.
//   grid       demand = sum of `use` over working consumers. Solar covers it first, then generators in id order. Consumers are
//              served in id order from what was produced; one that does not fit is NOT powered this tick (all or nothing).
//              Surplus is simply lost: there are no batteries yet.
//   status     producer: 'OFF' (never ran) | 'BROKEN' (ruined) | 'IDLE' (nothing needs it) | 'RUNNING' | 'NO_FUEL' | 'DARK' (solar, 0 output now)
//              consumer: 'BROKEN' | 'POWERED' | 'NO_POWER'
//
// Everything is a pure function of (definitions, state, tick): same ticks => same power, replay-safe. Fuel leaves base stock through
// ledger.discard (a sink, like spoilage), so conservation checks still balance. The simulation calls tickPower() once per tick.

export const powerDefOf = (defs, b) => defs.buildings[b.type]?.levels?.[b.level]?.power ?? null;
const isProducer = (p) => Boolean(p) && p.output !== undefined;
const isConsumer = (p) => Boolean(p) && p.use !== undefined;

/** Does this building type have a power table at ANY level? (Such buildings keep `b.power` bookkeeping.) */
export const hasPower = (def) => Object.values(def.levels).some((l) => l.power);

/** Sunlight now, in percent: 0 at night, else the weather's `solar` %. */
export const sunPercent = (defs, tick) => (timeOf(defs, tick).isNight ? 0 : defs.environment.weather[weatherAt(defs, tick)].solar ?? 100);

const byId = (list) => list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const solarOutput = (p, sun) => Math.floor((p.output * sun) / 100);

/** One tick of the grid. Mutates only `b.power` bookkeeping, `state.power`, and base fuel through the ledger. ctx = { state, defs, emit }. */
export function tickPower(ctx) {
  const { state, defs, emit } = ctx;
  const all = byId(Object.values(state.buildings).filter((b) => b.power));
  const set = (b, status) => {
    if (status !== b.power.status) { emit('power.status', { buildingId: b.id, from: b.power.status, to: status }); b.power.status = status; }
  };

  const consumers = all.filter((b) => isConsumer(powerDefOf(defs, b)) && isOperational(b));
  const demand = consumers.reduce((n, b) => n + powerDefOf(defs, b).use, 0);
  const sun = sunPercent(defs, state.tick);

  let produced = 0;
  for (const b of all) { // solar first: free
    const p = powerDefOf(defs, b);
    if (!isProducer(p) || !p.solar) continue;
    if (!isOperational(b)) { b.power.output = 0; set(b, 'BROKEN'); continue; }
    b.power.output = solarOutput(p, sun);
    produced += b.power.output;
    set(b, b.power.output > 0 ? 'RUNNING' : 'DARK');
  }
  let needed = Math.max(0, demand - produced);
  for (const b of all) { // then generators, in id order, only while needed
    const p = powerDefOf(defs, b);
    if (!isProducer(p) || p.solar) continue;
    b.power.output = 0;
    if (!isOperational(b)) { set(b, 'BROKEN'); continue; }
    if (needed <= 0) { set(b, 'IDLE'); continue; }
    if (b.power.burn <= 0 && available(state, stockKey(p.fuel.item)) >= 1) {
      discard(state, stockKey(p.fuel.item), 1);
      b.power.burn = p.fuel.every;
    }
    if (b.power.burn <= 0) { set(b, 'NO_FUEL'); continue; }
    b.power.burn -= 1;
    b.power.output = p.output;
    produced += p.output;
    needed -= p.output;
    set(b, 'RUNNING');
  }

  let budget = produced;
  for (const b of all) {
    const p = powerDefOf(defs, b);
    if (!isConsumer(p)) continue;
    if (!isOperational(b)) { b.power.powered = false; set(b, 'BROKEN'); continue; }
    b.power.powered = budget >= p.use;
    if (b.power.powered) budget -= p.use;
    set(b, b.power.powered ? 'POWERED' : 'NO_POWER');
  }
  state.power.produced = produced;
  state.power.demand = demand;
}

/** The grid as a learner sees it. */
export function gridView(state, defs) {
  const { produced, demand } = state.power;
  const sources = Object.values(state.buildings).filter((b) => b.power && isProducer(powerDefOf(defs, b)));
  return {
    produced, demand, balance: produced - demand, ok: produced >= demand,
    sun: sunPercent(defs, state.tick),
    producers: sources.filter((b) => isOperational(b)).length, working: sources.filter((b) => b.power.output > 0).length,
  };
}

/** Read-only view of one building's power table + live status (undefined when it has none at its level). */
export function powerInfoFor(state, defs, b) {
  const p = powerDefOf(defs, b);
  if (!p || !b.power) return undefined;
  if (isConsumer(p)) return { role: 'consumer', use: p.use, powered: Boolean(b.power.powered), status: b.power.status, working: isOperational(b) };
  const fuel = p.fuel ? { item: p.fuel.item, every: p.fuel.every, burnLeft: b.power.burn, inStock: available(state, stockKey(p.fuel.item)) } : null;
  return { role: 'producer', kind: p.solar ? 'solar' : 'generator', output: p.output, producing: b.power.output, status: b.power.status, working: isOperational(b), fuel };
}
