import { chebyshev, hasOwn } from '../../../kernel/index.js';
import { available, stockKey } from '../../resources/index.js';
import { nearestDepot } from '../../buildings/index.js';
import { canMount } from '../../threats/index.js';
import { ok, fail, RUNNING, DONE, failTick, walkStep, tooTired } from './shared.js';

/**
 * mount (Z6b): install a crafted MOUNTED weapon (ballista, repeating_crossbow, minigun) on a tower. Three stages: she walks to the nearest working storage
 * building that holds it and picks it up (`ticks`), hauls it to the tower (a haul needs no carry capacity), and fits it (`installTicks`). The unit is reserved
 * in the ledger when the job is accepted (cancel gives it back) and leaves stock when the weapon is installed. A mount takes one of the tower's `slots`
 * and the tower level must be able to hold it (`towers[level].mounts`); `weapons.<id>.minCombat` Combat skill is needed. The new mount starts with an
 * empty hopper (survivor.reload fills it).
 * Failures: INVALID_PARAMS (not a mounted weapon), UNKNOWN_TARGET (not a tower), NEEDS_REPAIR (tower ruined), TOWER_TOO_LOW (this level cannot hold it),
 * NO_SLOT (every slot is taken), CAPABILITY_INSUFFICIENT, EXHAUSTED, NO_DEPOT, INSUFFICIENT_RESOURCE (none in stock), NO_PATH.
 */
export const mountHandler = {
  validate(ctx, a) {
    const { defs, state } = ctx;
    const id = a.params.weapon;
    if (typeof id !== 'string' || !hasOwn(defs.weapons, id) || defs.weapons[id].kind !== 'mounted') return fail('INVALID_PARAMS');
    const tower = state.buildings[a.params.targetId];
    if (!tower || tower.type !== 'tower') return fail('UNKNOWN_TARGET');
    if (tower.condition === 'ruined') return fail('NEEDS_REPAIR');
    if (!canMount(defs, id, tower.level)) return fail('TOWER_TOO_LOW');
    if ((tower.mounts ?? []).length >= defs.towers[tower.level].slots) return fail('NO_SLOT');
    const s = state.survivors[a.actorId];
    if ((s.skills.combat ?? 0) < defs.weapons[id].minCombat) return fail('CAPABILITY_INSUFFICIENT');
    if (tooTired(ctx, a.actorId)) return fail('EXHAUSTED');
    const depot = nearestDepot(state, id, s.position);
    if (!depot) return fail('NO_DEPOT');
    if (available(state, stockKey(id)) < 1) return fail('INSUFFICIENT_RESOURCE');
    a.depotId = depot.id;
    a.towerId = tower.id;
    a.targetId = tower.id;
    a.stage = 'fetch';
    return ok;
  },
  reservations: (ctx, a) => [{ account: stockKey(a.params.weapon), qty: 1 }],
  tick(ctx, a) {
    const { state, defs } = ctx;
    const def = defs.actions.mount;
    const s = state.survivors[a.actorId];
    const tower = state.buildings[a.towerId];
    if (!tower || tower.condition === 'ruined') return failTick('NEEDS_REPAIR');
    if (a.stage === 'fetch') {
      const depot = state.buildings[a.depotId];
      if (!depot || depot.condition === 'ruined') return failTick('NO_DEPOT');
      if (chebyshev(s.position, depot) > def.range) {
        a.phase = 'travel';
        a.travelTicks += 1;
        if (a.travelTicks % def.ticksPerTile === 0 && !walkStep(ctx, a, depot)) return failTick('NO_PATH');
        return RUNNING;
      }
      a.phase = 'work';
      a.progress += 1;
      if (a.progress >= def.ticks) { a.stage = 'haul'; a.progress = 0; }
      return RUNNING;
    }
    if (chebyshev(s.position, tower) > def.range) {
      a.phase = 'travel';
      a.travelTicks += 1;
      if (a.travelTicks % def.ticksPerTile === 0 && !walkStep(ctx, a, tower)) return failTick('NO_PATH');
      return RUNNING;
    }
    if ((tower.mounts ?? []).length >= defs.towers[tower.level].slots) return failTick('NO_SLOT'); // someone else filled the slot meanwhile
    a.phase = 'work';
    a.progress += 1;
    return a.progress >= def.installTicks ? DONE : RUNNING;
  },
  // The engine has committed the reservation (the weapon left stock): it now stands on the tower with an empty hopper.
  complete(ctx, a) {
    const tower = ctx.state.buildings[a.towerId];
    tower.mounts.push({ weapon: a.params.weapon, hopper: 0, cooldown: 0, status: 'NO_AMMO', powered: false });
    ctx.emit('mount.installed', { actorId: a.actorId, towerId: tower.id, weapon: a.params.weapon, slot: tower.mounts.length - 1 });
  },
};
