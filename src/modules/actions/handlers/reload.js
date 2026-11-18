import { chebyshev, hasOwn } from '../../../kernel/index.js';
import { carriedOf, removeCarried } from '../../survivors/index.js';
import { ok, fail, RUNNING, DONE, failTick, walkStep } from './shared.js';

const matching = (defs, tower, item) => (tower.mounts ?? []).filter((m) => defs.weapons[m.weapon].ammo === item);
const roomOf = (defs, tower, item) => matching(defs, tower, item).reduce((n, m) => n + Math.max(0, defs.weapons[m.weapon].hopper - m.hopper), 0);

/**
 * reload (Z6b): carry ammo to a tower and pour it into the hoppers of its mounted weapons that use it (in install order). The ammo comes from her hands
 * (survivor.take brings it from storage); it moves when she has walked next to the tower and worked `ticks`, clamped THEN to what she still carries
 * and to the room in the hoppers (`amount` is optional: without it she pours in everything that fits). One-shot.
 * Failures: INVALID_PARAMS, UNKNOWN_TARGET (not a tower), NEEDS_REPAIR (ruined), NO_MOUNT (no installed weapon uses that ammo), NO_AMMO (she carries none),
 * HOPPER_FULL, NO_PATH.
 */
export const reloadHandler = {
  validate(ctx, a) {
    const { defs, state } = ctx;
    const { item, amount } = a.params;
    if (typeof item !== 'string' || !hasOwn(defs.items, item)) return fail('INVALID_PARAMS');
    if (amount !== undefined && (!Number.isInteger(amount) || amount < 1 || amount > defs.actions.reload.maxAmount)) return fail('INVALID_PARAMS');
    const tower = state.buildings[a.params.targetId];
    if (!tower || tower.type !== 'tower') return fail('UNKNOWN_TARGET');
    if (tower.condition === 'ruined') return fail('NEEDS_REPAIR');
    if (matching(defs, tower, item).length === 0) return fail('NO_MOUNT');
    if (carriedOf(state.survivors[a.actorId], item) < 1) return fail('NO_AMMO');
    if (roomOf(defs, tower, item) < 1) return fail('HOPPER_FULL');
    a.targetId = tower.id;
    return ok;
  },
  reservations: () => [],
  tick(ctx, a) {
    const def = ctx.defs.actions.reload;
    const s = ctx.state.survivors[a.actorId];
    const tower = ctx.state.buildings[a.targetId];
    if (!tower || tower.condition === 'ruined') return failTick('NEEDS_REPAIR');
    if (chebyshev(s.position, tower) > def.range) {
      a.phase = 'travel';
      a.travelTicks += 1;
      if (a.travelTicks % def.ticksPerTile === 0 && !walkStep(ctx, a, tower)) return failTick('NO_PATH');
      return RUNNING;
    }
    a.phase = 'work';
    a.progress += 1;
    return a.progress >= def.ticks ? DONE : RUNNING;
  },
  complete(ctx, a) {
    const { state, defs } = ctx;
    const { item } = a.params;
    const s = state.survivors[a.actorId];
    const tower = state.buildings[a.targetId];
    let left = Math.min(a.params.amount ?? Infinity, carriedOf(s, item));
    let moved = 0;
    for (const m of matching(defs, tower, item)) {
      const put = Math.min(left, Math.max(0, defs.weapons[m.weapon].hopper - m.hopper));
      if (put < 1) continue;
      m.hopper += put; left -= put; moved += put;
    }
    if (moved > 0) removeCarried(s, item, moved);
    ctx.emit('hopper.loaded', { actorId: a.actorId, towerId: tower.id, item, amount: moved, hoppers: (tower.mounts ?? []).map((m) => ({ weapon: m.weapon, hopper: m.hopper })) });
  },
};
