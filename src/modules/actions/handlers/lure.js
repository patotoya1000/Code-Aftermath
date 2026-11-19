import { chebyshev } from '../../../kernel/index.js';
import { carriedOf, removeCarried } from '../../survivors/index.js';
import { addNoise } from '../../threats/index.js';
import { ok, fail, RUNNING, DONE, failTick, walkStep } from './shared.js';

/**
 * lure (Z8, docs/game/20 section 28): carry a noise lure to a tower and set it off. One lure leaves her hands when the work is done and adds
 * `noise.lure.attention` to the wave's attention meter and `noise.lure.tower` to THAT tower's own noise, so zombies with nobody outside to chase drift toward
 * it (bait) - at the price of a reinforcement walker once the attention passes the threshold. One-shot.
 * Failures: UNKNOWN_TARGET (not a tower), NEEDS_REPAIR (ruined), NO_LURE (she carries none), NO_PATH.
 */
export const lureHandler = {
  validate(ctx, a) {
    const { state } = ctx;
    const tower = state.buildings[a.params.targetId];
    if (!tower || tower.type !== 'tower') return fail('UNKNOWN_TARGET');
    if (tower.condition === 'ruined') return fail('NEEDS_REPAIR');
    if (carriedOf(state.survivors[a.actorId], 'noise_lure') < 1) return fail('NO_LURE');
    a.targetId = tower.id;
    return ok;
  },
  reservations: () => [],
  tick(ctx, a) {
    const def = ctx.defs.actions.lure;
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
    const s = state.survivors[a.actorId];
    // The lure was checked when the job was accepted and only her own actions change what she carries, so removeCarried cannot come up short.
    removeCarried(s, 'noise_lure', 1);
    const lure = defs.noise.lure;
    addNoise(ctx, lure.attention, null);
    state.threats.towerNoise[a.targetId] = (state.threats.towerNoise[a.targetId] ?? 0) + lure.tower;
    ctx.emit('noise.lured', { actorId: a.actorId, towerId: a.targetId, attention: lure.attention, tower: lure.tower });
  },
};
