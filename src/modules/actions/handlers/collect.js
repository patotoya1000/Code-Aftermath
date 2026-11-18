import { chebyshev, hasOwn } from '../../../kernel/index.js';
import { StopReason } from '../lifecycle.js';
import { checkCapability } from '../../capability/index.js';
import { addCarried, carryRoom, awardSkillXp } from '../../survivors/index.js';
import { nearestDepot, storageRoom } from '../../buildings/index.js';
import { sortieOpen } from '../../threats/index.js';
import { ok, fail, failTick, RUNNING, approachThenWork, tooTired } from './shared.js';
import { stepDeposit } from './carry.js';

/**
 * collect (Z4, docs/game/20 section 4) is the SORTIE: a standing action of TRIPS, like gather, but its draw points are the loot piles zombies left on the
 * ground (state.threats.loot):
 *   pick the nearest pile (optionally only of one item) -> walk -> work (`ticksPerUnit` per unit) -> the units move from the pile into her inventory
 *   -> walk to the nearest working storage building that takes them -> unload -> repeat
 * until a stop reason fires: NO_LOOT (nothing left on the ground), WAVE_ACTIVE (a wave is on: sorties are only allowed after a wave is cleared, and a sortie
 * ends the moment the next wave starts - she is NOT pulled back, bringing her in is the learner's job), STORAGE_FULL, NO_DEPOT, EXHAUSTED, NO_PATH.
 * A trip takes only what she can carry AND what storage has room for. A unit is always in exactly one place: a pile, her inventory, or base stock.
 * Ending after some work COMPLETES with a stopReason; ending before any work FAILS with the same code (exactly like gather).
 */

const pilesOf = (ctx, item) => Object.values(ctx.state.threats.loot).filter((p) => p.qty > 0 && (item === undefined || p.item === item)).sort((a, b) => (a.id < b.id ? -1 : 1));

/** Nearest pile she can actually pick something up from (storage must take the item and have room, her hands must have room). Ties by id. */
function nearestPile(ctx, a, from) {
  const actor = ctx.state.survivors[a.actorId];
  let best = null, blockedBy = null;
  for (const p of pilesOf(ctx, a.params.item)) {
    if (!nearestDepot(ctx.state, p.item, from)) { blockedBy ??= StopReason.NO_DEPOT; continue; }
    if (storageRoom(ctx.state, p.item) < 1) { blockedBy ??= StopReason.STORAGE_FULL; continue; }
    if (carryRoom(actor, ctx.defs, p.item) < 1) { blockedBy ??= StopReason.EXHAUSTED; continue; } // cannot lift even one unit of it (not reachable with the shipped data)
    const d = chebyshev(from, p);
    if (!best || d < best.d || (d === best.d && p.id < best.p.id)) best = { p, d };
  }
  return { pile: best?.p ?? null, blockedBy };
}

/** Decide the next trip: sets the target pile and the batch, or says why not. */
function planTrip(ctx, a) {
  const def = ctx.defs.actions.collect;
  const actor = ctx.state.survivors[a.actorId];
  if (!sortieOpen(ctx.state)) return { stop: StopReason.WAVE_ACTIVE };
  if (tooTired(ctx, a.actorId)) return { stop: StopReason.EXHAUSTED };
  const cap = checkCapability(actor, def, ctx.defs, ctx);
  if (cap.ok) a.durationModifier = cap.durationModifier;
  const { pile, blockedBy } = nearestPile(ctx, a, actor.position);
  if (!pile) return { stop: blockedBy ?? StopReason.NO_LOOT };
  a.pileId = pile.id;
  a.targetId = pile.id;
  a.batch = Math.min(pile.qty, carryRoom(actor, ctx.defs, pile.item), storageRoom(ctx.state, pile.item));
  a.workTicks = Math.max(1, Math.ceil(a.batch * def.ticksPerUnit * (a.durationModifier ?? 1)));
  a.progress = 0;
  a.travelTicks = 0;
  a.leg = 'pile';
  return { qty: a.batch };
}

/** End the job: nothing done at all -> FAILED with the reason, otherwise COMPLETED with it as stopReason. */
function stopWith(ctx, a, reason) {
  if (a.legMoved > 0) { a.stats.gathered += a.legMoved; a.stats.trips += 1; a.legMoved = 0; }
  a.batch = 0;
  if (a.stats.gathered + a.stats.picked + a.stats.prior === 0) return failTick(reason);
  return { status: 'done', stopReason: reason };
}

function unloadLeg(ctx, a, def) {
  const r = stepDeposit(ctx, a, def);
  if (r.status === 'fail') return stopWith(ctx, a, r.reason);
  if (r.status !== 'done') return RUNNING;
  if (a.legMoved > 0) { a.stats.gathered += a.legMoved; a.stats.trips += 1; a.legMoved = 0; }
  const next = planTrip(ctx, a);
  if (next.stop) return stopWith(ctx, a, next.stop);
  return RUNNING;
}

export const collectHandler = {
  validate(ctx, a) {
    const { item } = a.params;
    if (item !== undefined && (typeof item !== 'string' || !hasOwn(ctx.defs.items, item))) return fail('INVALID_PARAMS');
    if (!sortieOpen(ctx.state)) return fail(StopReason.WAVE_ACTIVE);
    a.stats = { gathered: 0, trips: 0, picked: 0, prior: a.resumeOf?.gathered ?? 0 }; // gathered = units that reached base stock; picked = units taken from piles
    a.legMoved = 0;
    if (Object.keys(ctx.state.survivors[a.actorId].inventory.items).length > 0) { a.leg = 'depot'; a.batch = 0; return ok; } // she still carries something: unload it first
    const plan = planTrip(ctx, a);
    if (plan.stop) return fail(plan.stop);
    return ok;
  },
  reservations: () => [], // piles are not in the ledger: a pickup takes whatever is still there when the work is done
  tick(ctx, a) {
    const def = ctx.defs.actions.collect;
    if (!a.stats.started) {
      a.stats.started = true;
      ctx.emit('task.started', { actionId: a.actionId, actorId: a.actorId, taskType: 'collect', ...(a.params.item ? { resource: a.params.item } : {}) });
    }
    if (!sortieOpen(ctx.state)) return stopWith(ctx, a, StopReason.WAVE_ACTIVE); // the next wave started: the sortie is over (she keeps what she carries)
    if (a.leg === 'depot') return unloadLeg(ctx, a, def);

    const pile = ctx.state.threats.loot[a.pileId];
    if (!pile || pile.qty < 1) { // somebody else took it, or it spoiled away at dawn: pick another one
      const next = planTrip(ctx, a);
      return next.stop ? stopWith(ctx, a, next.stop) : RUNNING;
    }
    const r = approachThenWork(ctx, a, pile, { range: def.range, ticksPerTile: def.ticksPerTile, workTicks: a.workTicks });
    a.fraction = a.phase === 'work' ? Math.min(1, a.progress / a.workTicks) : 0;
    if (r.status === 'fail') return stopWith(ctx, a, r.reason);
    if (r.status !== 'done') return RUNNING;

    // The work is done: what is still in the pile (up to the batch) goes into her hands, then she walks it to storage.
    const actor = ctx.state.survivors[a.actorId];
    const qty = Math.min(a.batch, pile.qty, carryRoom(actor, ctx.defs, pile.item));
    if (qty < 1) { const next = planTrip(ctx, a); return next.stop ? stopWith(ctx, a, next.stop) : RUNNING; }
    pile.qty -= qty;
    addCarried(actor, ctx.defs, pile.item, qty);
    a.stats.picked += qty;
    awardSkillXp(ctx, actor, 'gather', qty);
    ctx.emit('loot.picked', { actorId: a.actorId, pileId: pile.id, item: pile.item, amount: qty, x: pile.x, y: pile.y });
    if (pile.qty < 1) delete ctx.state.threats.loot[pile.id];
    a.batch = 0;
    a.leg = 'depot';
    a.depotId = null;
    a.unload = 0;
    a.travelTicks = 0;
    a.progress = 0;
    a.fraction = 0;
    return RUNNING;
  },
  complete(ctx, a) {
    ctx.emit('task.stopped', { actionId: a.actionId, actorId: a.actorId, taskType: 'collect', reason: a.stopReason, collected: a.stats.gathered, trips: a.stats.trips });
  },
};
