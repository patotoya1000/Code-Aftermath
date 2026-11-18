import { openAccount, plotKey, available, credit, discard } from '../resources/index.js';
import { weatherAt, weatherForDay } from '../environment/index.js';

// Farming (O10, docs/game/16). A FARM is a building whose level has a `farm` table (data/world.js `field`: level 1 = field, level 2 =
// greenhouse). It owns PLOTS (state.plots, ids `<farm>_<n>`); each plot has a ledger account `plot.<id>` that holds the ripe harvest:
//   empty    -> a survivor PLANTS it (spends the crop's seeds from base stock)            -> growing
//   growing  -> grows 1 tick of water -> `farm.growth` percent of progress per tick; a dry plot does not grow; rain waters it
//   ready    -> the plot account holds the yield; a survivor HARVESTS it (units go into her hands), the plot is empty again
// Weather HAZARDS (storm / heat / cold, data in the weather table) damage plots of an UNSHELTERED farm once at each day change: a growing
// crop loses a % of its future yield, a ripe crop loses a % of what is waiting in the plot account (a ledger sink). The calendar is
// public, so learners can harvest before a storm or upgrade to a greenhouse. Everything is whole numbers and a pure function of the tick.
// A farm only grows and can be worked while it is fully repaired; a ruined farm still suffers hazards (it is open ground).

export const farmDefOf = (defs, b) => defs.buildings[b.type]?.levels?.[b.level]?.farm ?? null;
export const isFarm = (defs, b) => Boolean(farmDefOf(defs, b));
export const farmWorking = (defs, b) => isFarm(defs, b) && b.condition === 'repaired';
export const farmsOf = (state, defs) => Object.values(state.buildings).filter((b) => isFarm(defs, b)).sort((a, b) => (a.id < b.id ? -1 : 1));

/** A farm level with a `power.use` (the hydroponic level) only grows while the grid powers it (`b.power.powered`, set by the power module). */
export const farmPowered = (defs, b) => defs.buildings[b.type].levels[b.level].power?.use === undefined || Boolean(b.power?.powered);

/** Plots of one farm in order (plot_1, plot_2 … by index, not by text). */
export const plotsOf = (state, farmId) => Object.values(state.plots).filter((p) => p.farmId === farmId).sort((a, b) => a.index - b.index);

/** Make sure the farm has all the plots its level allows (a greenhouse has more than a field). Plots are never removed. */
export function syncPlots(state, defs, b) {
  const f = farmDefOf(defs, b);
  if (!f) return;
  for (let i = 1; i <= f.plots; i++) {
    const id = `${b.id}_${i}`;
    if (state.plots[id]) continue;
    openAccount(state, plotKey(id), 0);
    state.plots[id] = { id, farmId: b.id, index: i, crop: null, stage: 'empty', progress: 0, water: 0, damage: 0, fertilized: false, nutrients: 0 };
  }
}

const needed = (defs, crop) => crop.growthTicks * 100; // progress is counted in percent-ticks, so a 150 % greenhouse stays an integer

/** Units a plot will give when it ripens: the crop's yield x the farm's yield % x what the weather left (>= 1). */
export const yieldFor = (defs, farm, cropId, damage, fertilized = false) => Math.max(1, Math.floor((defs.crops[cropId].yield * farm.yield * (100 - damage) * (100 + (fertilized ? (defs.farming.fertilizer.better && fertilized === defs.farming.fertilizer.better.item ? defs.farming.fertilizer.better.yieldBonus : defs.farming.fertilizer.yieldBonus) : 0))) / 1000000));

/** True while rain is falling today. */
export const raining = (defs, tick) => Boolean(defs.environment.weather[weatherAt(defs, tick)].rainfall);

/** One tick of every working farm: rain waters, thirsty plots do not grow, a plot that reaches 100 % ripens. ctx = { state, defs, emit }. */
export function tickFarms(ctx) {
  const { state, defs, emit } = ctx;
  if (Object.keys(state.plots).length === 0) return;
  const raining0 = raining(defs, state.tick);
  for (const b of farmsOf(state, defs)) {
    if (b.condition !== 'repaired') continue;
    const farm = farmDefOf(defs, b);
    if (!farmPowered(defs, b)) continue; // a hydroponic farm without power holds its crops: nothing grows (nothing is lost either)
    const rain = raining0 && !farm.indoor;
    for (const p of plotsOf(state, b.id)) {
      if (p.stage !== 'growing') continue;
      if (rain) p.water = defs.farming.cap;
      if (p.water <= 0) continue;
      if (farm.nutrients && (p.nutrients ?? 0) <= 0) continue; // hydroponic plots starve without a nutrient solution
      p.water -= 1;
      if (farm.nutrients) p.nutrients -= 1;
      p.progress += farm.growth;
      if (p.progress >= needed(defs, defs.crops[p.crop])) {
        const qty = yieldFor(defs, farm, p.crop, p.damage, p.fertilized);
        p.stage = 'ready';
        p.progress = needed(defs, defs.crops[p.crop]);
        credit(state, plotKey(p.id), qty);
        emit('crop.ready', { plotId: p.id, farmId: b.id, crop: p.crop, qty });
      }
    }
  }
}

/** Called once when the calendar day changes: today's hazard (if any) hits every plot of an unsheltered farm. */
export function farmDay(ctx, day) {
  const { state, defs, emit } = ctx;
  const hazard = defs.environment.weather[weatherForDay(defs, day)].hazard;
  if (!hazard || Object.keys(state.plots).length === 0) return;
  for (const b of farmsOf(state, defs)) {
    if (farmDefOf(defs, b).shelter) continue;
    for (const p of plotsOf(state, b.id)) {
      const pct = p.crop ? (defs.crops[p.crop].hazards?.[hazard] ?? 0) : 0;
      if (pct === 0 || p.stage === 'empty') continue;
      if (p.stage === 'growing') {
        const damage = Math.min(defs.farming.maxDamage, p.damage + pct);
        if (damage === p.damage) continue;
        p.damage = damage;
        emit('crop.damaged', { plotId: p.id, farmId: b.id, crop: p.crop, hazard, damage });
      } else {
        const free = available(state, plotKey(p.id));
        const lost = Math.min(free - 1, Math.max(1, Math.floor((free * pct) / 100))); // a ripe plot always keeps at least one unit
        if (free < 2 || lost < 1) continue;
        discard(state, plotKey(p.id), lost);
        emit('crop.damaged', { plotId: p.id, farmId: b.id, crop: p.crop, hazard, lost });
      }
    }
  }
}

/** The plot's growth in whole percent (0..100). */
export const percentOf = (defs, p) => (p.crop ? Math.min(100, Math.floor((p.progress * 100) / needed(defs, defs.crops[p.crop]))) : 0);

/** Learner/UI view of one farm building, or undefined for other buildings. */
export function farmInfoFor(state, defs, b) {
  const f = farmDefOf(defs, b);
  if (!f) return undefined;
  const rain = raining(defs, state.tick) && !f.indoor;
  const needsPower = defs.buildings[b.type].levels[b.level].power?.use !== undefined;
  return {
    working: b.condition === 'repaired', fertilizerBonus: defs.farming.fertilizer.yieldBonus, ...(defs.farming.fertilizer.better ? { betterFertilizer: { item: defs.farming.fertilizer.better.item, bonus: defs.farming.fertilizer.better.yieldBonus } } : {}), sheltered: f.shelter, growth: f.growth, yield: f.yield, indoor: Boolean(f.indoor), needsNutrients: Boolean(f.nutrients), needsPower, powered: !needsPower || Boolean(b.power?.powered),
    plots: plotsOf(state, b.id).map((p) => ({
      id: p.id, crop: p.crop, stage: p.stage, percent: percentOf(defs, p), water: p.water, dry: p.stage === 'growing' && p.water <= 0 && !rain, nutrients: p.nutrients ?? 0, starved: Boolean(f.nutrients) && p.stage === 'growing' && (p.nutrients ?? 0) <= 0,
      damage: p.damage, fertilized: Boolean(p.fertilized), ready: p.stage === 'ready' ? available(state, plotKey(p.id)) : 0,
    })),
  };
}

/** What each crop needs and gives: the learner's `crops` read. `inStock` = seeds/food of it in base stock right now. */
export function cropBook(state, defs, stockOf) {
  return Object.fromEntries(Object.entries(defs.crops).map(([id, c]) => [id, {
    id, name: c.name, growthTicks: c.growthTicks, seeds: c.seeds, yield: c.yield, hazards: { ...(c.hazards ?? {}) }, inStock: stockOf(id),
  }]));
}

