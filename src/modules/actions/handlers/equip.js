import { chebyshev, hasOwn } from '../../../kernel/index.js';
import { available, stockKey, credit } from '../../resources/index.js';
import { nearestDepot, storageRoom } from '../../buildings/index.js';
import { ok, fail, RUNNING, DONE, failTick, walkStep } from './shared.js';

/**
 * equip (Z5): put a weapon in her hands. Personal weapons only (knife, spear, advanced_spear, bow, crossbow, rifle); mounted weapons belong to towers.
 *  - a STARTER weapon (knife, spear) is never stocked: she just takes it up (2 ticks, no walking);
 *  - a crafted weapon is an item in base stock: she walks to the nearest working storage building that holds it, and the unit is reserved from stock
 *    when the job is accepted (cancel gives it back) and moves into her hands when the work is done;
 *  - the weapon she held goes back into base stock when it is a crafted one (a starter vanishes: it can always be taken up again).
 * Z8: `equip("suppressor")` is an ACCESSORY, not a weapon: she fetches one from base stock the same way and fits it FOR GOOD (`equipment.suppressor`), which cuts the
 * noise of her personal weapon by `noise.suppressorPercent` (a mounted weapon never changes). It does not replace the weapon she holds. NOT_NEEDED when already fitted.
 * Needs `weapons.<id>.minCombat` Combat skill (CAPABILITY_INSUFFICIENT). Failures: INVALID_PARAMS (unknown / mounted weapon), NOT_NEEDED (already held),
 * CAPABILITY_INSUFFICIENT, INSUFFICIENT_RESOURCE (none in stock), NO_DEPOT, STORAGE_FULL (no room to put the old weapon back), NO_PATH.
 */
export const equipHandler = {
  validate(ctx, a) {
    const { defs, state } = ctx;
    const id = a.params.weapon;
    if (id === 'suppressor') {
      const s = state.survivors[a.actorId];
      if (s.equipment.suppressor === true) return fail('NOT_NEEDED');
      const depot = nearestDepot(state, id, s.position);
      if (!depot) return fail('NO_DEPOT');
      if (available(state, stockKey(id)) < 1) return fail('INSUFFICIENT_RESOURCE');
      a.needsStock = true; a.accessory = true; a.depotId = depot.id; a.targetId = depot.id;
      return ok;
    }
    if (typeof id !== 'string' || !hasOwn(defs.weapons, id) || defs.weapons[id].kind === 'mounted') return fail('INVALID_PARAMS');
    const w = defs.weapons[id];
    const s = state.survivors[a.actorId];
    if ((s.equipment.weapon ?? 'spear') === id) return fail('NOT_NEEDED');
    if ((s.skills.combat ?? 0) < w.minCombat) return fail('CAPABILITY_INSUFFICIENT');
    a.needsStock = !w.starter;
    if (a.needsStock) {
      if (!hasOwn(defs.items, id)) return fail('INSUFFICIENT_RESOURCE'); // a weapon nobody can make yet (the rifle) has no stock at all
      const depot = nearestDepot(state, id, s.position);
      if (!depot) return fail('NO_DEPOT');
      if (available(state, stockKey(id)) < 1) return fail('INSUFFICIENT_RESOURCE');
      a.depotId = depot.id; a.targetId = depot.id;
    }
    const old = s.equipment.weapon;
    if (old && !defs.weapons[old]?.starter && hasOwn(defs.items, old) && storageRoom(state, old) < 1) return fail('STORAGE_FULL');
    return ok;
  },
  reservations: (ctx, a) => (a.needsStock ? [{ account: stockKey(a.params.weapon), qty: 1 }] : []),
  tick(ctx, a) {
    const def = ctx.defs.actions.equip;
    const s = ctx.state.survivors[a.actorId];
    if (a.needsStock) {
      const depot = ctx.state.buildings[a.depotId];
      if (!depot || depot.condition === 'ruined') return failTick('NO_DEPOT');
      if (chebyshev(s.position, depot) > def.range) {
        a.phase = 'travel';
        a.travelTicks += 1;
        if (a.travelTicks % def.ticksPerTile === 0 && !walkStep(ctx, a, depot)) return failTick('NO_PATH');
        return RUNNING;
      }
    }
    a.phase = 'work';
    a.progress += 1;
    return a.progress >= def.ticks ? DONE : RUNNING;
  },
  // The engine has committed the reservation (the weapon left stock): she holds it now and the old crafted weapon goes back into stock.
  complete(ctx, a) {
    const { state, defs } = ctx;
    const s = state.survivors[a.actorId];
    if (a.accessory) {
      s.equipment.suppressor = true;
      ctx.emit('suppressor.fitted', { actorId: a.actorId });
      return;
    }
    const old = s.equipment.weapon;
    if (old && !defs.weapons[old]?.starter && hasOwn(defs.items, old)) credit(state, stockKey(old), 1);
    s.equipment.weapon = a.params.weapon;
    ctx.emit('weapon.equipped', { actorId: a.actorId, weapon: a.params.weapon, previous: old ?? null });
  },
};
