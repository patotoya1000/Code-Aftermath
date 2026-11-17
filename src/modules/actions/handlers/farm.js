import { hasOwn, own } from '../../../kernel/index.js';
import { stockKey, plotKey, available, reserve, commit, release } from '../../resources/index.js';
import { StopReason } from '../lifecycle.js';
import { addCarried, carryRoom, awardSkillXp } from '../../survivors/index.js';
import { storageRoom } from '../../buildings/index.js';
import { syncStock } from '../../spoilage/index.js';
import { farmDefOf, farmWorking, plotsOf, raining } from '../../farming/index.js';
import { stepDeposit } from './carry.js';
import { ok, fail, failTick, RUNNING, approachThenWork, tooTired } from './shared.js';

/**
 * farm is a STANDING action made of CHORES at ONE farm building (docs/game/16, O10). For one crop she repeats, in this order:
 *   HARVEST a ripe plot (units go from the plot's ledger account into her hands, then she unloads them at storage)
 *   WATER a dry growing plot (1 water from base stock; rain makes this unnecessary)
 *   NOURISH a growing plot of a hydroponic farm that is low on nutrients (1 nutrients from base stock; stop reason NO_NUTRIENTS when none)
 *   FERTILIZE a growing plot that has none yet (1 fertilizer from base stock; ONLY when she was asked with `{ fertilize: true }`, and only
 *     while fertilizer is in stock — running out never stops the farming). A fertilized plot yields `farming.fertilizer.yieldBonus` % more.
 *   PLANT an empty plot (`crop.seeds` units of the crop from base stock)
 * Every chore reserves what it spends in the ledger when it is chosen and commits it when the work finishes, so two survivors never
 * spend or harvest the same unit, and a cancelled chore gives everything back. A plot being worked by someone else is skipped.
 * When nothing needs doing but a plot of this crop is still growing she WAITS at the farm (up to `waitTicks`).
 *
 * Stop reasons: TARGET_REACHED (`count` plots harvested and unloaded) · NO_FARM (the farm stopped working) · NO_SEED · NO_WATER ·
 * STORAGE_FULL · EXHAUSTED · NO_PATH · NO_DEPOT · NOTHING_TO_DO (waited `waitTicks` for nothing).
 * Like gather: ending after some work COMPLETES with the reason; ending before any work FAILS with it.
 * Skill makes chores faster (durationModifier, re-read per chore); it never changes what a chore spends or yields.
 */

const claimedByOthers = (ctx, a) => {
  const out = new Set();
  for (const id of ctx.state.activeActions) {
    const o = ctx.state.actions[id];
    if (o.actionId !== a.actionId && o.actionType === 'farm' && o.chore) out.add(o.chore.plotId);
  }
  return out;
};

/** The next chore: { chore }, { wait: true } or { stop: reason }. Pure: reserves nothing. */
function planChore(ctx, a) {
  const { state, defs } = ctx;
  const farm = own(state.buildings, a.farmId);
  if (!farm || !farmWorking(defs, farm)) return { stop: StopReason.NO_FARM };
  if (a.params.count !== undefined && a.stats.harvested >= a.params.count) return { stop: StopReason.TARGET_REACHED };
  if (tooTired(ctx, a.actorId)) return { stop: StopReason.EXHAUSTED };
  const crop = defs.crops[a.params.crop];
  const cfg = defs.farming;
  const actor = state.survivors[a.actorId];
  const taken = claimedByOthers(ctx, a);
  const rain = raining(defs, state.tick) && !farmDefOf(defs, farm).indoor; // an indoor (hydroponic) farm gets no rain
  const plots = plotsOf(state, farm.id).filter((p) => !taken.has(p.id));

  let blocked = null; // why work that exists cannot be done right now (the stop reason if nothing else is possible)
  // 1. harvest
  for (const p of plots) {
    if (p.crop !== a.params.crop || p.stage !== 'ready') continue;
    const units = Math.min(available(state, plotKey(p.id)), carryRoom(actor, defs, a.params.crop), storageRoom(state, a.params.crop, a.actionId));
    if (units >= 1) return { chore: { kind: 'harvest', plotId: p.id, qty: units } };
    blocked ??= StopReason.STORAGE_FULL;
  }
  // 2. water
  for (const p of plots) {
    if (p.crop !== a.params.crop || p.stage !== 'growing' || p.water >= cfg.ticksPerWater || rain) continue;
    if (available(state, stockKey('water')) >= 1) return { chore: { kind: 'water', plotId: p.id, qty: 1 } };
    blocked ??= StopReason.NO_WATER;
  }
  // 3. nourish (hydroponic farms only): a growing plot below one unit's worth of nutrients gets 1 unit
  if (farmDefOf(defs, farm).nutrients) {
    for (const p of plots) {
      if (p.crop !== a.params.crop || p.stage !== 'growing' || (p.nutrients ?? 0) >= cfg.nutrients.ticksPerUnit) continue;
      if (available(state, stockKey(cfg.nutrients.item)) >= 1) return { chore: { kind: 'nourish', plotId: p.id, qty: 1 } };
      blocked ??= StopReason.NO_NUTRIENTS;
    }
  }
  // 4. fertilize (opt-in; silently skipped when there is none, because it only improves the harvest)
  if (a.params.fertilize) {
    for (const p of plots) {
      if (p.crop !== a.params.crop || p.stage !== 'growing' || p.fertilized) continue;
      if (available(state, stockKey(cfg.fertilizer.item)) >= 1) return { chore: { kind: 'fertilize', plotId: p.id, qty: 1 } };
      break;
    }
  }
  // 5. plant
  for (const p of plots) {
    if (p.stage !== 'empty') continue;
    if (available(state, stockKey(a.params.crop)) >= crop.seeds) return { chore: { kind: 'plant', plotId: p.id, qty: crop.seeds } };
    blocked ??= StopReason.NO_SEED;
  }
  // nothing to do right now: is something still growing (or being worked by a friend)? then wait for it.
  const growing = plotsOf(state, farm.id).some((p) => p.crop === a.params.crop && (p.stage === 'growing' || p.stage === 'ready') && ((p.water > 0 && (!farmDefOf(defs, farm).nutrients || p.nutrients > 0)) || (rain && !farmDefOf(defs, farm).nutrients) || taken.has(p.id) || p.stage === 'ready'));
  if (growing && blocked !== StopReason.STORAGE_FULL) return { wait: true };
  return { stop: blocked ?? StopReason.NOTHING_TO_DO };
}

const accountsOf = (ctx, chore, a) => (chore.kind === 'harvest' ? [{ account: plotKey(chore.plotId), qty: chore.qty }]
  : chore.kind === 'water' ? [{ account: stockKey('water'), qty: 1 }]
    : chore.kind === 'nourish' ? [{ account: stockKey(ctx.defs.farming.nutrients.item), qty: 1 }]
    : chore.kind === 'fertilize' ? [{ account: stockKey(ctx.defs.farming.fertilizer.item), qty: 1 }] : [{ account: stockKey(a.params.crop), qty: chore.qty }]);

function releaseAll(ctx, a) {
  for (const id of a.reservationIds) release(ctx.state, id);
  a.reservationIds = [];
}

function stopWith(ctx, a, reason) {
  releaseAll(ctx, a);
  a.chore = null;
  if (a.stats.chores + a.stats.prior === 0 && a.stats.gathered === 0) return failTick(reason);
  return { status: 'done', stopReason: reason };
}

/** Start a chosen chore: reserve what it spends and set its work time (skill-adjusted). */
function begin(ctx, a, chore) {
  for (const r of accountsOf(ctx, chore, a)) a.reservationIds.push(reserve(ctx.state, { owner: a.actionId, account: r.account, qty: r.qty }));
  a.chore = { ...chore, ticks: Math.max(1, Math.ceil(ctx.defs.actions.farm.chore[chore.kind] * (a.durationModifier ?? 1))) };
  a.targetPlotId = chore.plotId;
  a.progress = 0;
  a.fraction = 0;
  a.leg = 'chore';
}

function finish(ctx, a) {
  const { state, defs } = ctx;
  const { kind, plotId, qty } = a.chore;
  const plot = state.plots[plotId];
  const farm = state.buildings[a.farmId];
  const cropId = a.params.crop;
  for (const id of a.reservationIds) commit(state, id);
  a.reservationIds = [];
  if (kind === 'plant') {
    syncStock(state, defs, cropId); // the seeds came out of stock: the oldest units were used
    Object.assign(plot, { crop: cropId, stage: 'growing', progress: 0, water: 0, damage: 0, fertilized: false, nutrients: 0 });
    ctx.emit('crop.planted', { actorId: a.actorId, plotId, farmId: farm.id, crop: cropId });
  } else if (kind === 'water') {
    plot.water = Math.min(defs.farming.cap, plot.water + defs.farming.ticksPerWater);
  } else if (kind === 'nourish') {
    plot.nutrients = Math.min(defs.farming.nutrients.cap, (plot.nutrients ?? 0) + defs.farming.nutrients.ticksPerUnit);
  } else if (kind === 'fertilize') {
    plot.fertilized = true;
    ctx.emit('crop.fertilized', { actorId: a.actorId, plotId, farmId: farm.id, crop: cropId });
  } else {
    addCarried(state.survivors[a.actorId], defs, cropId, qty);
    ctx.emit('crop.harvested', { actorId: a.actorId, plotId, farmId: farm.id, crop: cropId, qty });
    if (available(state, plotKey(plotId)) === 0 && !Object.values(state.reservations).some((r) => r.account === plotKey(plotId))) {
      Object.assign(plot, { crop: null, stage: 'empty', progress: 0, water: 0, damage: 0, fertilized: false, nutrients: 0 });
      a.stats.harvested += 1;
    }
    a.leg = 'depot'; // carry it to storage before anything else
  }
  a.stats.chores += 1;
  awardSkillXp(ctx, state.survivors[a.actorId], 'farm');
  a.chore = null;
  a.progress = 0;
  a.fraction = 0;
}

export const farmHandler = {
  validate(ctx, a) {
    const { state, defs } = ctx;
    const { crop, count } = a.params;
    const farm = own(state.buildings, a.params.targetId);
    if (!farm || !farmDefOf(defs, farm)) return fail('UNKNOWN_TARGET');
    if (typeof crop !== 'string' || !hasOwn(defs.crops, crop)) return fail('INVALID_PARAMS');
    if (a.params.fertilize !== undefined && typeof a.params.fertilize !== 'boolean') return fail('INVALID_PARAMS');
    if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > defs.actions.farm.maxCount)) return fail('INVALID_PARAMS');
    if (!farmWorking(defs, farm)) return fail('NEEDS_REPAIR');
    if (tooTired(ctx, a.actorId)) return fail('EXHAUSTED');
    a.farmId = farm.id;
    a.targetId = farm.id;
    a.leg = 'chore';
    a.chore = null;
    a.waited = 0;
    a.stats = { gathered: 0, trips: 0, chores: 0, harvested: 0, prior: a.resumeOf?.gathered ?? 0 };
    const plan = planChore(ctx, a);
    if (plan.stop) return fail(plan.stop);
    return ok;
  },
  reservations: () => [], // chores reserve what they spend one at a time
  tick(ctx, a) {
    const { state, defs } = ctx;
    const def = defs.actions.farm;
    if (!a.stats.started) {
      a.stats.started = true;
      ctx.emit('task.started', { actionId: a.actionId, actorId: a.actorId, taskType: 'farm', crop: a.params.crop, farmId: a.farmId });
    }
    const farm = own(state.buildings, a.farmId);
    if (!farm || !farmWorking(defs, farm)) return stopWith(ctx, a, StopReason.NO_FARM);

    if (a.leg === 'depot') {
      const r = stepDeposit(ctx, a, def);
      a.fraction = 0;
      if (r.status === 'fail') return stopWith(ctx, a, r.reason);
      if (r.status !== 'done') return RUNNING;
      if (a.legMoved > 0) { a.stats.gathered += a.legMoved; a.stats.trips += 1; a.legMoved = 0; }
      a.leg = 'chore';
      a.depotId = null;
      return RUNNING;
    }

    if (!a.chore) {
      const plan = planChore(ctx, a);
      if (plan.stop) return stopWith(ctx, a, plan.stop);
      if (plan.wait) {
        a.phase = 'wait';
        a.fraction = 0;
        a.waited += 1;
        return a.waited > def.waitTicks ? stopWith(ctx, a, StopReason.NOTHING_TO_DO) : RUNNING;
      }
      a.waited = 0;
      a.durationModifier = a.durationModifier ?? 1;
      begin(ctx, a, plan.chore);
    }

    // The plot must still be what the chore expects (a hazard, or the farm, may have changed it).
    const plot = state.plots[a.chore.plotId];
    const stillValid = a.chore.kind === 'plant' ? plot.stage === 'empty' : a.chore.kind === 'water' || a.chore.kind === 'nourish' ? plot.stage === 'growing' : a.chore.kind === 'fertilize' ? plot.stage === 'growing' && !plot.fertilized : plot.stage === 'ready';
    if (!stillValid) { releaseAll(ctx, a); a.chore = null; return RUNNING; }

    const r = approachThenWork(ctx, a, { x: farm.x, y: farm.y }, { range: def.range, ticksPerTile: def.ticksPerTile, workTicks: a.chore.ticks });
    a.fraction = a.phase === 'work' ? Math.min(1, a.progress / a.chore.ticks) : 0;
    if (r.status === 'fail') return stopWith(ctx, a, r.reason);
    if (r.status !== 'done') return RUNNING;
    finish(ctx, a);
    return RUNNING;
  },
  complete(ctx, a) {
    ctx.emit('task.stopped', { actionId: a.actionId, actorId: a.actorId, taskType: 'farm', reason: a.stopReason, harvested: a.stats.harvested, delivered: a.stats.gathered });
  },
};
