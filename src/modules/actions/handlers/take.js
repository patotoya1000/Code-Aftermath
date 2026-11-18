import { chebyshev, hasOwn } from '../../../kernel/index.js';
import { available, stockKey } from '../../resources/index.js';
import { addCarried, carryRoom } from '../../survivors/index.js';
import { nearestDepot } from '../../buildings/index.js';
import { ok, fail, RUNNING, DONE, failTick, walkStep, tooTired } from './shared.js';

/**
 * take (Z4, "ammo is carried by the survivor"): walk to the nearest working storage building that holds the item and move up to `amount` of it from base
 * stock into her hands. The amount is clamped when the job is accepted to what base stock has free (nobody else's reservation) and what she can still
 * carry; it is reserved in the ledger right away so nobody else can spend it, and it moves into her hands when the work is done. Cancelling gives it back.
 * One-shot: it ends as soon as the units are in her hands. Perishable food cannot be taken (its age would reset when it was put back).
 * Failures: INVALID_PARAMS (unknown item / perishable), NO_DEPOT (nothing that still works stores it), INSUFFICIENT_RESOURCE (none in stock),
 * CARRY_FULL (her hands are full), EXHAUSTED, NO_PATH.
 */
export const takeHandler = {
  validate(ctx, a) {
    const def = ctx.defs.actions.take;
    const { item, amount } = a.params;
    if (typeof item !== 'string' || !hasOwn(ctx.defs.items, item) || ctx.defs.items[item].shelfLife !== undefined) return fail('INVALID_PARAMS');
    if (!Number.isInteger(amount) || amount < 1 || amount > def.maxAmount) return fail('INVALID_PARAMS');
    const s = ctx.state.survivors[a.actorId];
    if (tooTired(ctx, a.actorId)) return fail('EXHAUSTED');
    const depot = nearestDepot(ctx.state, item, s.position);
    if (!depot) return fail('NO_DEPOT');
    const free = available(ctx.state, stockKey(item));
    if (free < 1) return fail('INSUFFICIENT_RESOURCE');
    const room = carryRoom(s, ctx.defs, item);
    if (room < 1) return fail('CARRY_FULL');
    a.batch = Math.min(amount, free, room);
    a.depotId = depot.id;
    a.targetId = depot.id;
    a.stats = { taken: 0 };
    return ok;
  },
  reservations: (ctx, a) => [{ account: stockKey(a.params.item), qty: a.batch }],
  tick(ctx, a) {
    const def = ctx.defs.actions.take;
    const s = ctx.state.survivors[a.actorId];
    const depot = ctx.state.buildings[a.depotId];
    if (!depot || depot.condition === 'ruined') return failTick('NO_DEPOT'); // it was destroyed on the way
    if (chebyshev(s.position, depot) > def.range) {
      if (s.needs.energy <= 0) return failTick('EXHAUSTED');
      a.phase = 'travel';
      a.travelTicks += 1;
      if (a.travelTicks % def.ticksPerTile === 0 && !walkStep(ctx, a, depot)) return failTick('NO_PATH');
      return RUNNING;
    }
    a.phase = 'work';
    a.progress += 1;
    return a.progress >= def.ticks ? DONE : RUNNING;
  },
  // The engine has already committed the reservation (the units left base stock): they go into her hands. The room was checked when the job was
  // accepted and only her own actions change it, so addCarried cannot refuse here.
  complete(ctx, a) {
    addCarried(ctx.state.survivors[a.actorId], ctx.defs, a.params.item, a.batch);
    a.stats.taken = a.batch;
    ctx.emit('resource.taken', { actorId: a.actorId, depotId: a.depotId, resource: a.params.item, amount: a.batch });
  },
};
