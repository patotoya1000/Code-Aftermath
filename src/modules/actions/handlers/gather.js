import { chebyshev, hasOwn } from '../../../kernel/index.js';
import { available, nodeKey, stockKey, credit, total, reserve, commit, release } from '../../resources/index.js';
import { StopReason } from '../lifecycle.js';
import { checkCapability } from '../../capability/index.js';
import { addCarried, carriedOf, carryRoom } from '../../survivors/index.js';
import { storageCapacity } from '../../buildings/index.js';
import { ok, fail, failTick, RUNNING, approachThenWork, tooTired } from './shared.js';
import { stepDeposit } from './carry.js';

/**
 * gather is a STANDING action made of TRIPS (R3):
 *   pick the nearest node → walk → work one batch (`amount` units, capped by what she can carry) → the units move from the node
 *   into her inventory → walk to the nearest working storage building → unload into base stock → repeat
 * until a stop reason fires: STORAGE_FULL, NO_TARGET (nothing left), EXHAUSTED (too tired), NO_DEPOT or TARGET_REACHED (the
 * optional `total`, counted in units that reached base stock). Each batch reserves its units from the node in the ledger so two
 * survivors never take the same wood, and the room for them in storage is counted before pickup (stock + what everybody
 * carries + batches in flight), so unloading can never overfill storage.
 *
 * A unit is always in exactly one place: a node, a survivor's inventory, or base stock. If the job is interrupted or
 * stopped while she carries something, it stays in her inventory; the next gather (or `deposit()`) unloads it first.
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

/**
 * Room left in pooled storage for `resource`, minus every unit already on its way there: what any survivor carries and what
 * other gatherers have reserved at a node but not picked up yet.
 */
function storageSpace(ctx, resource, exceptActionId) {
  let incoming = 0;
  for (const sv of Object.values(ctx.state.survivors)) incoming += carriedOf(sv, resource);
  for (const id of ctx.state.activeActions) {
    const o = ctx.state.actions[id];
    if (o.actionId !== exceptActionId && o.actionType === 'gather' && o.params.resource === resource && o.batch > 0 && o.reservationIds.length > 0) incoming += o.batch;
  }
  return Math.max(0, storageCapacity(ctx.state, resource) - total(ctx.state, stockKey(resource)) - incoming);
}

/**
 * Decide the next batch. Returns { qty } (and sets a.targetId / a.batch / a.workTicks) or { stop: reason }.
 * The survivor's modifiers are re-read for every batch: a standing job can last a long time and the survivor gets
 * tired / hungry meanwhile. Output modifiers (skill, traits) change HOW MUCH a trip carries — never the amount the node
 * loses vs. the amount the base receives, so the ledger always balances.
 */
function planBatch(ctx, a) {
  const def = ctx.defs.actions.gather;
  const { resource } = a.params;
  const actor = ctx.state.survivors[a.actorId];
  const cap = checkCapability(actor, def, ctx.defs, ctx);
  if (cap.ok) { a.durationModifier = cap.durationModifier; a.outputModifier = cap.outputModifier; }
  const wanted = Math.max(1, Math.floor((a.params.amount ?? def.defaultAmount) * (a.outputModifier ?? 1)));
  const load = Math.min(wanted, carryRoom(actor, ctx.defs, resource)); // a trip never carries more than she can hold
  const remaining = a.params.total === undefined ? Infinity : a.params.total - a.stats.gathered;
  if (remaining <= 0) return { stop: StopReason.TARGET_REACHED };
  if (tooTired(ctx, a.actorId)) return { stop: StopReason.EXHAUSTED };
  const space = storageSpace(ctx, resource, a.actionId);
  if (space <= 0) return { stop: StopReason.STORAGE_FULL };
  if (load < 1) return { stop: StopReason.EXHAUSTED }; // cannot lift even one unit (not reachable with the shipped data)
  const want = Math.min(load, remaining, space);
  const node = nearestNode(ctx, resource, actor.position, want);
  if (!node) return { stop: StopReason.NO_TARGET };
  a.nodeId = node.id;
  a.targetId = node.id;
  a.batch = Math.min(want, available(ctx.state, nodeKey(node.id)));
  a.workTicks = Math.ceil(a.batch * def.ticksPerUnit * (a.durationModifier ?? 1));
  a.progress = 0;
  a.travelTicks = 0;
  a.leg = 'node';
  return { qty: a.batch };
}

/** The batch is done: its units leave the node (already committed in the ledger) and go into the survivor's inventory. */
function pickUp(ctx, a, qty) {
  const node = ctx.state.nodes[a.nodeId];
  addCarried(ctx.state.survivors[a.actorId], ctx.defs, node.resource, qty);
  a.stats.picked += qty;
  ctx.emit('resource.gathered', { actorId: a.actorId, resource: node.resource, amount: qty, nodeId: node.id });
  if (total(ctx.state, nodeKey(node.id)) === 0) ctx.emit('node.depleted', { nodeId: node.id });
}

/** Units that reached base stock count toward the job's total; one unloading = one trip. */
function countUnloaded(a) {
  if (a.legMoved > 0) { a.stats.gathered += a.legMoved; a.stats.trips += 1; a.legMoved = 0; }
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
  countUnloaded(a);
  // Cut short mid-batch: the units chopped so far = the share of the batch's work ticks already done (always < batch).
  const units = partial && a.leg === 'node' && a.phase === 'work' && a.workTicks > 0 ? Math.min(a.batch - 1, Math.floor((a.progress * a.batch) / a.workTicks)) : 0;
  const node = a.nodeId;
  releaseAll(ctx, a);
  if (units > 0) {
    commit(ctx.state, reserve(ctx.state, { owner: a.actionId, account: nodeKey(node), qty: units }));
    pickUp(ctx, a, units); // she keeps what she chopped; `deposit()` or the next gather unloads it
  }
<<<<<<< HEAD
  if (a.stats.gathered + a.stats.picked + a.stats.prior === 0) return failTick(reason); // a resumed job that already worked before it was interrupted still ends as COMPLETED
=======
  if (a.stats.gathered + a.stats.prior === 0) return failTick(reason); // a resumed job that already gathered before it was interrupted still ends as COMPLETED
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e
  return { status: 'done', stopReason: reason };
}

/** Walk to storage, unload, then plan the next trip (or stop). */
function unloadLeg(ctx, a, def) {
  const r = stepDeposit(ctx, a, def);
  a.fraction = 0;
  if (r.status === 'fail') return stopWith(ctx, a, r.reason);
  if (r.status !== 'done') return RUNNING;
  countUnloaded(a);
  const next = planBatch(ctx, a);
  if (next.stop) { a.batch = 0; return stopWith(ctx, a, next.stop); }
  a.reservationIds.push(reserve(ctx.state, { owner: a.actionId, account: nodeKey(a.nodeId), qty: a.batch }));
  return RUNNING;
}

export const gatherHandler = {
  validate(ctx, a) {
    const def = ctx.defs.actions.gather;
    const { resource, amount, total: wantTotal } = a.params;
    if (!hasOwn(ctx.defs.items, resource)) return fail('INVALID_PARAMS');
    const actor = ctx.state.survivors[a.actorId];
    const load = amount ?? def.defaultAmount;
    if (!Number.isInteger(load) || load < 1 || load > def.maxAmount) return fail('INVALID_PARAMS');
    if (wantTotal !== undefined && (!Number.isInteger(wantTotal) || wantTotal < 1 || wantTotal > def.maxTotal)) return fail('INVALID_PARAMS');
<<<<<<< HEAD
    a.stats = { gathered: 0, trips: 0, picked: 0, prior: a.resumeOf?.gathered ?? 0 }; // gathered = units that reached base stock; picked = units taken from nodes; `prior`: units gathered before a policy interrupted this job
    a.legMoved = 0;
    if (Object.keys(actor.inventory.items).length > 0) { a.leg = 'depot'; a.batch = 0; return ok; } // she still carries something from before: unload it first, then plan the first trip
=======
    a.stats = { gathered: 0, trips: 0, prior: a.resumeOf?.gathered ?? 0 }; // `prior`: units gathered before a policy interrupted this job
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e
    const plan = planBatch(ctx, a);
    return plan.stop ? fail(plan.stop) : ok;
  },
  reservations: (ctx, a) => (a.batch > 0 ? [{ account: nodeKey(a.nodeId), qty: a.batch }] : []),
  tick(ctx, a) {
    const def = ctx.defs.actions.gather;
    if (!a.stats.started) {
      a.stats.started = true;
      ctx.emit('task.started', { actionId: a.actionId, actorId: a.actorId, taskType: 'gather', resource: a.params.resource });
    }
    if (a.leg === 'depot') return unloadLeg(ctx, a, def);
    const r = approachThenWork(ctx, a, ctx.state.nodes[a.nodeId], { range: def.range, ticksPerTile: def.ticksPerTile, workTicks: a.workTicks });
    a.fraction = a.phase === 'work' ? Math.min(1, a.progress / a.workTicks) : 0;
    if (r.status === 'fail') return stopWith(ctx, a, r.reason, { partial: true });
    if (r.status !== 'done') return RUNNING;

    // Batch finished: the node's reservation is committed, the units go into her inventory, then she walks them to storage.
    const qty = a.batch; // exactly what was reserved from the node
    for (const id of a.reservationIds) commit(ctx.state, id);
    a.reservationIds = [];
    a.batch = 0;
    pickUp(ctx, a, qty);
    a.leg = 'depot';
    a.depotId = null;
    a.unload = 0;
    a.travelTicks = 0;
    a.progress = 0;
    a.fraction = 0;
    return RUNNING;
  },
  complete(ctx, a) {
    ctx.emit('task.stopped', { actionId: a.actionId, actorId: a.actorId, taskType: 'gather', reason: a.stopReason, gathered: a.stats.gathered, trips: a.stats.trips });
  },
};
