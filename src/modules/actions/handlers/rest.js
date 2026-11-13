import { ok, fail, RUNNING, DONE } from './shared.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * rest: +`energyPerTick` energy per tick (faster with rest skill / endurance, slower when hungry or thirsty) until the
 * requested ticks have passed or energy is full. Plain arithmetic only: what you see is what you get, so
 * `rest(10)` on a rookie is exactly +20 energy.
 */
export const restHandler = {
  validate(ctx, a) {
    const def = ctx.defs.actions.rest;
    const ticks = a.params.ticks ?? def.defaultTicks;
    if (!Number.isInteger(ticks) || ticks < 1 || ticks > def.maxTicks) return fail('INVALID_PARAMS');
    if (ctx.state.survivors[a.actorId].needs.energy >= ctx.defs.needs.max) return fail('NOT_NEEDED');
    a.params = { ...a.params, ticks };
    return ok;
  },
  reservations: () => [],
  tick(ctx, a) {
    const s = ctx.state.survivors[a.actorId];
    const def = ctx.defs.actions.rest;
    a.phase = 'rest';
    a.progress += 1;
    s.needs.energy = Math.min(ctx.defs.needs.max, round2(s.needs.energy + def.energyPerTick / (a.durationModifier ?? 1)));
    return a.progress >= a.params.ticks || s.needs.energy >= ctx.defs.needs.max ? DONE : RUNNING;
  },
  complete(ctx, a) {
    const s = ctx.state.survivors[a.actorId];
    ctx.emit('survivor.rested', { survivorId: s.id, energy: s.needs.energy });
  },
};
