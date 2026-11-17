import { chebyshev, hasOwn, own } from '../../../kernel/index.js';
import { available, nodeKey, reserve, commit, release, total } from '../../resources/index.js';
import { StopReason } from '../lifecycle.js';
import { checkCapability } from '../../capability/index.js';
import { addCarried, carryRoom, awardSkillXp } from '../../survivors/index.js';
import { storageRoom } from '../../buildings/index.js';
import { workingSources } from '../../water/index.js';
import { ok, fail, failTick, RUNNING, approachThenWork, tooTired } from './shared.js';

/** Standing action: farm is made of TRIPS (R3): walk to a plot → work one growth step → check ready → harvest → unload into base stock.
 *  Until a stop reason fires (TARGET_REACHED, NO_PLOT, NO_CROP, EXHAUSTED, NO_PATH).
 *  Each trip reserves its units from the plot so two survivors never take the same crop,
 *  and room for them in storage is counted before pickup, so unloading can never overfill storage.
 *
 *  Crop data lives in `defs.crops[params.crop]`.
 *  Plots are in `state.plots` keyed by plot id, each plot has: { id, x, y, crop, stage, growthProgress }
 */

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
  a.stats = { gathered: 0, trips: 0, harvested: 0 };

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

// Wait leg at an empty plot (similar to waitLeg in gather).
function waitLeg(ctx, a, def) {
  a.phase = 'wait';
  a.waited = (a.waited ?? 0) + 1;
  if (hasAnyPlot(ctx, a.params.crop)) {
    a.waited = 0;
    a.targetId = null;
    a.plotId = null;
    a.account = null;
    a.leg = 'travel';
    a.phase = 'travel';
    a.progress = 0;
    a.workTotal = 0;
    return RUNNING;
  }
  return a.waited > (def?.waitTicks ?? 200) ? failTick(StopReason.NO_PLOT) : RUNNING;
}

// Harvest leg: move units from plot into inventory, then plan unload to storage.
function harvestLeg(ctx, a) {
  const plot = own(ctx.state.plots, a.plotId);
  if (!plot) return failTick(StopReason.NO_PLOT);

  // Determine harvestable units from plot's growth progress
  const harvestable = Math.min(a.batch, plot.growthProgress !== undefined ? Math.max(0, plot.growthProgress - (a.stats.harvested ?? 0)) : a.batch);
  if (harvestable <= 0) {
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

  // Remove harvested units from plot's progress
  plot.growthProgress = Math.max(0, (plot.growthProgress ?? 0) - harvestable);

  // Add to survivor's inventory
  addCarried(ctx.state.survivors[a.actorId], a.params.crop, harvestable);

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

  a.reservationIds = [];
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

  reservations: (ctx, a) => {
    return [];
  },

  tick(ctx, a) {
    const rc = ctx.defs.crops[a.params.crop];

    if (!a.stats.started) {
      a.stats.started = true;
      ctx.emit('task.started', { actionId: a.actionId, actorId: a.actorId, taskType: 'farm', crop: a.params.crop });
    }

    if (a.leg === 'depot') return harvestLeg(ctx, a);
    if (a.leg === 'wait') return waitLeg(ctx, a, { waitTicks: 200 });

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

      // Advance plot growth progress
      plot.growthProgress = (plot.growthProgress ?? 0) + workTicks;

      // Check if plot is ready for harvest
      if (plot.growthProgress >= rc.growthTicks) {
        plot.stage = 'ready';
      }

      // Re-plan to continue or harvest
      return planBatch(ctx, a);
    }

    const plan = planBatch(ctx, a);
    if (plan.stop) return fail(plan.stop);
    if (plan.ok) {
      if (!a.targetId) return RUNNING;
    }
    return RUNNING;
  },

  complete(ctx, a) {
    ctx.emit('task.stopped', { actionId: a.actionId, actorId: a.actorId, taskType: 'farm', reason: a.stopReason, harvested: a.stats.harvested });
  },
};