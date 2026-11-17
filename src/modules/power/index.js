import { stockKey, available, discard } from '../resources/index.js';
import { isOperational } from '../buildings/index.js';
import { timeOf, weatherAt } from '../environment/index.js';
import { chebyshev } from '../../kernel/index.js';

// Power (O11, docs/game/16): one small grid, one number per tick.
//
//   producer   a building level with `power.output`. Two kinds:
//                solar panel  `solar: true`  output = floor(output x weather.solar / 100), and 0 at night. Free, always offered.
//                generator    `fuel: { item, every }`  burns ONE `item` from base stock per `every` ticks, but only on ticks when
//                             the grid still needs power. Higher levels give more output per fuel.
//   consumer   a building level with `power.use` (the freezer storehouse). It only works while the grid powers it.
//   storage    (O13) a battery: a building level with `power.store: { capacity, rate }`. It keeps whole units of power in `b.power.charge`. When
//              demand is left after solar it DISCHARGES (up to `rate` per tick, before any generator burns fuel); when generation is left over
//              after every consumer is served it CHARGES from that surplus (up to `rate` and `capacity`). Generators never burn fuel just to
//              charge a battery. A ruined battery neither charges nor discharges (it keeps its charge). status: BROKEN | IDLE | CHARGING | DISCHARGING
//   machine    (O12) a recipe with `power` draws that much while a survivor works a batch of it at its station (a sealer, a glass furnace). It is
//              a consumer too, served after the buildings, in action-id order; the cook handler waits on `action.powered`.
//   grid       demand = sum of `use` over working consumers (and powered batches being worked). Solar covers it first, then generators in id order. Consumers are
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
const isStorage = (p) => Boolean(p) && p.store !== undefined;

/** Does this building type have a power table at ANY level? (Such buildings keep `b.power` bookkeeping.) */
export const hasPower = (def) => Object.values(def.levels).some((l) => l.power);

/** Sunlight now, in percent: 0 at night, else the weather's `solar` %. */
export const sunPercent = (defs, tick) => (timeOf(defs, tick).isNight ? 0 : defs.environment.weather[weatherAt(defs, tick)].solar ?? 100);

const byId = (list) => list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const solarOutput = (p, sun) => Math.floor((p.output * sun) / 100);

/** Powered batches being worked right now: active cook/craft jobs whose recipe has `power`, whose survivor stands at a working station. */
function poweredJobs(state, defs) {
  const jobs = [];
  for (const id of state.activeActions) {
    const a = state.actions[id];
    if (!a) continue;
    a.powered = false; // re-decided below, every tick
    if (defs.actions[a.actionType]?.handler !== 'cook' || a.status !== 'EXECUTING') continue;
    const rc = defs.recipes[a.params.recipe];
    const station = a.targetId ? state.buildings[a.targetId] : null;
    if (!rc?.power || !station || station.condition !== 'repaired' || station.level < rc.stationLevel) continue;
    if (chebyshev(state.survivors[a.actorId].position, station) > defs.actions[a.actionType].range) continue;
    jobs.push({ a, use: rc.power });
  }
  return jobs.sort((x, y) => (x.a.actionId < y.a.actionId ? -1 : 1));
}

/** One tick of the grid. Mutates only `b.power` bookkeeping, `state.power`, and base fuel through the ledger. ctx = { state, defs, emit }. */
export function tickPower(ctx) {
  const { state, defs, emit } = ctx;
  const all = byId(Object.values(state.buildings).filter((b) => b.power));
  const set = (b, status) => {
    if (status !== b.power.status) { emit('power.status', { buildingId: b.id, from: b.power.status, to: status }); b.power.status = status; }
  };

  const consumers = all.filter((b) => isConsumer(powerDefOf(defs, b)) && isOperational(b));
  const jobs = poweredJobs(state, defs);
  const demand = consumers.reduce((n, b) => n + powerDefOf(defs, b).use, 0) + jobs.reduce((n, j) => n + j.use, 0);
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
  const batteries = all.filter((b) => isStorage(powerDefOf(defs, b)));
  let drawn = 0;
  const discharging = new Set();
  for (const b of batteries) { // then batteries: stored power before any fuel is burned
    if (!isOperational(b)) { set(b, 'BROKEN'); continue; }
    const take = Math.min(needed, powerDefOf(defs, b).store.rate, b.power.charge);
    if (take <= 0) continue;
    b.power.charge -= take; drawn += take; produced += take; needed -= take; discharging.add(b.id);
  }
  for (const b of all) { // then generators, in id order, only while needed
    const p = powerDefOf(defs, b);
    if (!isProducer(p) || p.solar) continue;
    b.power.output = 0;
    if (!isOperational(b)) { set(b, 'BROKEN'); continue; }
    if (needed <= 0) { set(b, 'IDLE'); continue; }
    if (b.power.burn <= 0) { // light the better fuel (charcoal) first when there is any, otherwise the plain one (wood)
      const f = [p.fuel.better, p.fuel].find((x) => x && available(state, stockKey(x.item)) >= 1);
      if (f) { discard(state, stockKey(f.item), 1); b.power.burn = f.every; }
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
  for (const j of jobs) { // machines at work come after the buildings
    j.a.powered = budget >= j.use;
    if (j.a.powered) budget -= j.use;
  }
  // Surplus GENERATION (not the stored power just drawn) fills the batteries that did not discharge this tick.
  let surplus = Math.min(budget, produced - drawn);
  for (const b of batteries) {
    if (!isOperational(b)) continue;
    const st = powerDefOf(defs, b).store;
    if (discharging.has(b.id)) { set(b, 'DISCHARGING'); continue; }
    const put = Math.max(0, Math.min(surplus, st.rate, st.capacity - b.power.charge));
    b.power.charge += put; surplus -= put;
    set(b, put > 0 ? 'CHARGING' : 'IDLE');
  }
  state.power.produced = produced;
  state.power.demand = demand;
}

/** The grid as a learner sees it. */
export function gridView(state, defs) {
  const { produced, demand } = state.power;
  const cells = Object.values(state.buildings).filter((b) => b.power && isStorage(powerDefOf(defs, b)));
  const stored = cells.reduce((n, b) => n + b.power.charge, 0);
  const capacity = cells.filter((b) => isOperational(b)).reduce((n, b) => n + powerDefOf(defs, b).store.capacity, 0);
  const sources = Object.values(state.buildings).filter((b) => b.power && isProducer(powerDefOf(defs, b)));
  return {
    produced, demand, balance: produced - demand, ok: produced >= demand, stored, capacity,
    sun: sunPercent(defs, state.tick),
    producers: sources.filter((b) => isOperational(b)).length, working: sources.filter((b) => b.power.output > 0).length,
  };
}

/** Read-only view of one building's power table + live status (undefined when it has none at its level). */
export function powerInfoFor(state, defs, b) {
  const p = powerDefOf(defs, b);
  if (!p || !b.power) return undefined;
  if (isStorage(p)) return { role: 'storage', capacity: p.store.capacity, rate: p.store.rate, charge: b.power.charge, status: b.power.status, working: isOperational(b) };
  if (isConsumer(p)) return { role: 'consumer', use: p.use, powered: Boolean(b.power.powered), status: b.power.status, working: isOperational(b) };
  const fuel = p.fuel ? { item: p.fuel.item, every: p.fuel.every, burnLeft: b.power.burn, inStock: available(state, stockKey(p.fuel.item)), ...(p.fuel.better ? { better: { item: p.fuel.better.item, every: p.fuel.better.every, inStock: available(state, stockKey(p.fuel.better.item)) } } : {}) } : null;
  return { role: 'producer', kind: p.solar ? 'solar' : 'generator', output: p.output, producing: b.power.output, status: b.power.status, working: isOperational(b), fuel };
}
