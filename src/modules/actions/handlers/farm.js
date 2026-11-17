import { chebyshev, hasOwn, own } from '../../../kernel/index.js';
import { available, nodeKey, plotKey, reserve, commit, release, total, credit } from '../../resources/index.js';
import { StopReason } from '../lifecycle.js';
import { checkCapability } from '../../capability/index.js';
import { addCarried, awardSkillXp } from '../../survivors/index.js';
import { storageRoom } from '../../buildings/index.js';
import { stepDeposit } from './carry.js';
import { ok, fail, failTick, RUNNING, approachThenWork, tooTired } from './shared.js';

/** Standing action: farm is made of TRIPS (R3): walk to a plot → work one growth step → harvest → unload into base stock.
 *  Until a stop reason fires (TARGET_REACHED, NO_PLOT, NO_CROP, EXHAUSTED, NO_PATH, STORAGE_FULL).
 *  Each trip reserves its units from the plot's ledger account so two survivors never take the same crop,
 *  and room for them in storage is counted before pickup, so unloading can never overfill storage.
 *
 *  Crop data lives in `defs.crops[params.crop]`.
 *  Plots are in `state.plots` keyed by plot id, each plot has: { id, x, y, crop, stage, growthProgress }
 *  Plot cycle: empty → planted → growing → ready → harvested → (replant)
 */

// Does any plot exist for this crop?
function hasAnyPlot(ctx, crop) {
  return Object.values(ctx.state.plots).some((p) => p.crop === crop);
}

// Find the nearest plot of `crop` that can be worked on or harvested.
// Prefers ready plots (harvest) over non-ready ones, then by distance, ties by id.
function nearestPlot(ctx, crop, from, want) {
  let best = null;
  for (const p of Object.values(ctx.state.plots)) {
    if (p.crop !== crop) continue;
    const ready = p.stage === 'ready';
    const d = chebyshev(from, p);
    const rank = ready ? 0 : 1;
    if (!best || rank < best.rank || (rank === best.rank && (d < best.d || (d === best.d && p.id < best.p.id)))) {
      best = { p, d, rank };
    }
  }
  return best?.p ?? null;
}

// Plan the next batch: find a suitable plot, set up the action leg.
function planBatch(ctx, a) {
  const def = ctx.defs.crops[a.params.crop];
  if (!def) return { stop: StopReason.INVALID_PARAMS };

  const from = { x: ctx.state.survivors[a.actorId].position.x, y: ctx.state.survivors[a.actorId].position.y };
  const plot = nearestPlot(ctx, a.params.crop, from, a.params.amount ?? 1);

  if (!plot) {
    if (!hasAnyPlot(ctx, a.params.crop)) return { stop: StopReason.NO_PLOT };
    return { stop: StopReason.NO_CROP };
  }

  const outputItem = a.params.crop;
  if (!storageRoom(ctx.state, outputItem, a.actionId)) return { stop: StopReason.STORAGE_FULL };

  a.targetId = plot.id;
  a.plotId = plot.id;
  a.account = plotKey(plot.id);
  a.batch = a.params.amount ?? def.defaultAmount ?? 1;
  a.leg = 'travel';
  a.phase = 'travel';
  a.progress = 0;
  a.workTotal = 0;
  a.stats = a.stats ?? { gathered: 0, trips: 0, harvested: 0 };
  a.stats.harvested = 0;

  return { ok: true };
}

// End the job: nothing harvested -> FAILED; otherwise COMPLETED with stopReason.
function stopWith(ctx, a, reason) {
  if (a.stats.harvested === 0 && a.stats.gathered === 0) return failTick(reason);
  return { status: 'done', stopReason: reason };
}

// The survivor's modifiers are re-read for every batch.
function refreshModifiers(ctx, a) {
  const cap = checkCapability(ctx.state.survivors[a.actorId], ctx.defs.actions.farm, ctx.defs, ctx);
  if (cap.ok) a.durationModifier = cap.durationModifier;
}

// Wait leg: a plot exists for this crop but none is ready yet; check again each tick.
function waitLeg(ctx, a, def) {
  a.phase = 'wait';
  a.waited = (a.waited ?? 0) + 1;
  const from = { x: ctx.state.survivors[a.actorId].position.x, y: ctx.state.survivors[a.actorId].position.y };
  const plot = nearestPlot(ctx, a.params.crop, from, 1);
  if (plot && plot.stage === 'ready') {
    a.waited = 0;
    a.targetId = plot.id;
    a.plotId = plot.id;
    a.account = plotKey(plot.id);
    a.leg = 'travel';
    a.phase = 'travel';
    a.progress = 0;
    a.workTotal = 0;
    return RUNNING;
  }
  return a.waited > (def?.waitTicks ?? 200) ? failTick(StopReason.NO_PLOT) : RUNNING;
}

// Harvest leg: move harvested units from the plot into the survivor's inventory, then go to depot.
function harvestLeg(ctx, a) {
  const plot = own(ctx.state.plots, a.plotId);
  if (!plot) return failTick(StopReason.NO_PLOT);

  const def = ctx.defs.crops[plot.crop];
  const harvestable = Math.min(a.batch, def.yield);
  if (harvestable <= 0) {
    // Plot is spent for this cycle; mark it harvested (awaiting replant) and move on.
    plot.stage = 'harvested';
    a.batch = 0;
    a.reservationIds = [];
    a.leg = 'depot';
    a.depotId = null;
    a.unload = 0;
    a.travelTicks = 0;
    a.progress = 0;
    a.fraction = 0;
    return RUNNING;
  }

  // Reserve then commit the harvested units from the plot's ledger account.
  const resId = reserve(ctx.state, { owner: a.actionId, account: a.account, qty: harvestable });
  commit(ctx.state, resId);
  a.reservationIds = [];

  // Add to survivor's inventory.
  addCarried(ctx.state.survivors[a.actorId], plot.crop, harvestable);

  // Plot is done for this cycle: reset growth, mark harvested.
  plot.growthProgress = 0;
  plot.stage = 'harvested';

  a.stats.harvested += harvestable;
  a.batch -= harvestable;

  if (a.batch <= 0) {
    a.leg = 'depot';
    a.depotId = null;
    a.unload = 0;
    a.travelTicks = 0;
    a.progress = 0;
    a.fraction = 0;
    return RUNNING;
  }

  return RUNNING;
}

// Walk to storage, unload harvested crops, then plan the next trip (or stop).
// No reservation here: the target plot may not be ready yet; reservation happens
// in harvestLeg once the plot's ledger account has been credited with its yield.
function unloadLeg(ctx, a, def) {
  const r = stepDeposit(ctx, a, def);
  a.fraction = 0;
  if (r.status === 'fail') return stopWith(ctx, a, r.reason);
  if (r.status !== 'done') return RUNNING;
  if (a.legMoved > 0) { a.stats.gathered += a.legMoved; a.stats.trips += 1; a.legMoved = 0; }
  const next = planBatch(ctx, a);
  if (next.stop) { a.batch = 0; return stopWith(ctx, a, next.stop); }
  return RUNNING;
}

// Consolidated farmHandler export
export const farmHandler = {
  validate(ctx, a) {
    const def = ctx.defs.actions.farm;
    const { crop } = a.params;
    if (typeof crop !== 'string' || !hasOwn(ctx.defs.crops, crop)) return fail('INVALID_PARAMS');
    const amount = a.params.amount;
    if (amount !== undefined && (!Number.isInteger(amount) || amount < 1)) return fail('INVALID_PARAMS');
    if (tooTired(ctx, a.actorId)) return fail('EXHAUSTED');
    if (!hasAnyPlot(ctx, crop)) return fail('NO_PLOT');
    return ok;
  },

  reservations: (ctx, a) => (a.batch > 0 ? [{ account: a.account, qty: a.batch }] : []),

  tick(ctx, a) {
    const rc = ctx.defs.crops[a.params.crop];

    if (!a.stats.started) {
      a.stats.started = true;
      ctx.emit('task.started', { actionId: a.actionId, actorId: a.actorId, taskType: 'farm', crop: a.params.crop });
    }

    if (a.leg === 'depot') return unloadLeg(ctx, a, ctx.defs.actions.farm);
    if (a.leg === 'wait') return waitLeg(ctx, a, { waitTicks: 200 });
    if (a.leg === 'harvest') return harvestLeg(ctx, a);

    if (a.targetId) {
      const plot = own(ctx.state.plots, a.targetId);
      if (!plot) return fail(StopReason.NO_PLOT);
      if (plot.crop !== a.params.crop) return fail(StopReason.NO_CROP);

      const workTicks = rc.growthTicks;
      const r = approachThenWork(ctx, a, { x: plot.x, y: plot.y }, {
        range: ctx.defs.actions.farm.range,
        ticksPerTile: ctx.defs.actions.farm.ticksPerTile,
        workTicks,
      });

      a.fraction = a.phase === 'work' ? Math.min(1, a.progress / workTicks) : 0;

      if (r.status === 'fail') return fail(r.reason);
      if (r.status !== 'done') return RUNNING;

      // One work cycle complete: advance plot growth progress.
      plot.growthProgress = (plot.growthProgress ?? 0) + workTicks;

      // When the plot reaches full growth, credit its ledger account with the crop yield
      // so the units can be reserved and harvested, then move to the harvest leg.
      if (plot.growthProgress >= rc.growthTicks) {
        plot.stage = 'ready';
        credit(ctx.state, a.account, rc.yield);
        a.leg = 'harvest';
        a.plotId = plot.id;
        a.batch = a.params.amount ?? rc.yield;
        a.progress = 0;
        a.fraction = 0;
        return RUNNING;
      }

      // Not ready yet: keep working on the same plot.
      return RUNNING;
    }

    const plan = planBatch(ctx, a);
    if (plan.stop) return fail(plan.stop);
    return RUNNING;
  },

  complete(ctx, a) {
    ctx.emit('task.stopped', { actionId: a.actionId, actorId: a.actorId, taskType: 'farm', reason: a.stopReason, harvested: a.stats.harvested });
  },
};