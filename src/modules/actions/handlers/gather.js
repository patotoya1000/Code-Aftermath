import { chebyshev, hasOwn } from '../../../kernel/index.js';
import { available, nodeKey, stockKey, credit, total, reserve, commit, release } from '../../resources/index.js';
import { StopReason } from '../lifecycle.js';
import { ok, fail, failTick, RUNNING, approachThenWork, tooTired } from './shared.js';

/**
 * gather is a STANDING action. One action = one job that keeps going:
 *   pick the nearest node → walk → work one batch (`amount` units, the load per trip) → credit base stock → repeat
 * until a stop reason fires: STORAGE_FULL, NO_TARGET (nothing left), EXHAUSTED (too tired) or TARGET_REACHED
 * (the optional `total`). Each batch reserves its units from the node in the ledger, so two survivors never take the
 * same wood, and the same step reserves room in storage, so they never overfill it either.
 *
 * If the job ends after doing some work it COMPLETES with a stopReason; if it ends before any work it FAILS with the
 * same reason code (so "no trees at all" still reads as a failure, exactly like before).
 */

/** Nearest node with `resource` that can supply the WHOLE batch; if none can, the nearest with anything left. Ties by id. */
function nearestNode(ctx, resource, from, want = 1) {
  let best = null;
  for (const n of Object.values(ctx.state.nodes)) {
    const left = available(ctx.state, nodeKey(n.id));
    if (n.resource !== resource || left < 1) continue;
    const d = chebyshev(from, n);
    const full = left >= want ? 0 : 1; // 0 = can fill the batch
    if (!best || full < best.full || (full === best.full && (d < best.d || (d === best.d && n.id < best.n.id)))) best = { n, d, full };
  }
  return best?.n ?? null;
}

/** Room left in base storage for `resource`, minus what other gatherers already have in flight. Infinity = no limit. */
function storageSpace(ctx, resource, exceptActionId) {
  const cap = ctx.state.buildings.hq?.storage?.[resource];
  if (cap === undefined) return Infinity;
  let incoming = 0;
  for (const id of ctx.state.activeActions) {
    const o = ctx.state.actions[id];
    if (o.actionId !== exceptActionId && o.actionType === 'gather' && o.params.resource === resource && o.batch > 0 && o.reservationIds.length > 0) incoming += o.batch;
  }
  return Math.max(0, cap - total(ctx.state, stockKey(resource)) - incoming);
}

/** Decide the next batch. Returns { qty } (and sets a.targetId / a.batch) or { stop: reason }. */
function planBatch(ctx, a) {
  const def = ctx.defs.actions.gather;
  const { resource } = a.params;
  const load = a.params.amount ?? def.defaultAmount;
  const remaining = a.params.total === undefined ? Infinity : a.params.total - a.stats.gathered;
  if (remaining <= 0) return { stop: StopReason.TARGET_REACHED };
  if (tooTired(ctx, a.actorId)) return { stop: StopReason.EXHAUSTED };
  const space = storageSpace(ctx, resource, a.actionId);
  if (space <= 0) return { stop: StopReason.STORAGE_FULL };
  const want = Math.min(load, remaining, space);
  const node = nearestNode(ctx, resource, ctx.state.survivors[a.actorId].position, want);
  if (!node) return { stop: StopReason.NO_TARGET };
  a.targetId = node.id;
  a.batch = Math.min(want, available(ctx.state, nodeKey(node.id)));
  a.progress = 0;
  a.travelTicks = 0;
  return { qty: a.batch };
}

/** Units reach base stock; the batch counts as one trip. */
function deposit(ctx, a, qty) {
  const node = ctx.state.nodes[a.targetId];
  credit(ctx.state, stockKey(node.resource), qty); // gathered units go to base stock; carry & deposit trips arrive in Phase I5
  a.stats.gathered += qty;
  a.stats.trips += 1;
  ctx.emit('resource.gathered', { actorId: a.actorId, resource: node.resource, amount: qty, nodeId: node.id });
  if (total(ctx.state, nodeKey(node.id)) === 0) ctx.emit('node.depleted', { nodeId: node.id });
}

function releaseAll(ctx, a) {
  for (const id of a.reservationIds) release(ctx.state, id);
  a.reservationIds = [];
  a.batch = 0;
}

/**
 * End the job. `partial` = the unfinished batch is cut short (tired): units already chopped still count.
 * Nothing gathered at all → FAILED with the reason; otherwise → COMPLETED with stopReason.
 */
function stopWith(ctx, a, reason, { partial = false } = {}) {
  const def = ctx.defs.actions.gather;
  const units = partial && a.phase === 'work' ? Math.floor(a.progress / def.ticksPerUnit) : 0;
  const node = a.targetId;
  releaseAll(ctx, a);
  if (units > 0) {
    commit(ctx.state, reserve(ctx.state, { owner: a.actionId, account: nodeKey(node), qty: units }));
    deposit(ctx, a, units);
  }
  if (a.stats.gathered === 0) return failTick(reason);
  return { status: 'done', stopReason: reason };
}

export const gatherHandler = {
  validate(ctx, a) {
    const def = ctx.defs.actions.gather;
    const { resource, amount, total: wantTotal } = a.params;
    if (!hasOwn(ctx.defs.items, resource)) return fail('INVALID_PARAMS');
    const load = amount ?? def.defaultAmount;
    if (!Number.isInteger(load) || load < 1 || load > def.maxAmount) return fail('INVALID_PARAMS');
    if (wantTotal !== undefined && (!Number.isInteger(wantTotal) || wantTotal < 1 || wantTotal > def.maxTotal)) return fail('INVALID_PARAMS');
    a.stats = { gathered: 0, trips: 0 };
    const plan = planBatch(ctx, a);
    return plan.stop ? fail(plan.stop) : ok;
  },
  reservations: (ctx, a) => [{ account: nodeKey(a.targetId), qty: a.batch }],
  tick(ctx, a) {
    const def = ctx.defs.actions.gather;
    if (!a.stats.started) {
      a.stats.started = true;
      ctx.emit('task.started', { actionId: a.actionId, actorId: a.actorId, taskType: 'gather', resource: a.params.resource });
    }
    const r = approachThenWork(ctx, a, ctx.state.nodes[a.targetId], {
      range: def.range, ticksPerTile: def.ticksPerTile, workTicks: Math.ceil(a.batch * def.ticksPerUnit * (a.durationModifier ?? 1)),
    });
    a.fraction = a.phase === 'work' ? Math.min(1, a.progress / Math.ceil(a.batch * def.ticksPerUnit * (a.durationModifier ?? 1))) : 0;
    if (r.status === 'fail') return stopWith(ctx, a, r.reason, { partial: true });
    if (r.status !== 'done') return RUNNING;

    // Batch finished: commit what was reserved, credit stock, then decide whether to keep going.
    const qty = Math.floor(a.batch * (a.outputModifier ?? 1));
    for (const id of a.reservationIds) commit(ctx.state, id);
    a.reservationIds = [];
    deposit(ctx, a, qty);
    const next = planBatch(ctx, a);
    if (next.stop) { a.batch = 0; return stopWith(ctx, a, next.stop); }
    a.reservationIds.push(reserve(ctx.state, { owner: a.actionId, account: nodeKey(a.targetId), qty: a.batch }));
    return RUNNING;
  },
  complete(ctx, a) {
    ctx.emit('task.stopped', { actionId: a.actionId, actorId: a.actorId, taskType: 'gather', reason: a.stopReason, gathered: a.stats.gathered, trips: a.stats.trips });
  },
};
