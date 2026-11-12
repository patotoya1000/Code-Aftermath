import { ok, fail, RUNNING, DONE } from './shared.js';

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

    const energyPerTick = def.energyPerTick / (a.durationModifier ?? 1);
    if (a.progress === 1) a._energyAdded = 0;
    s.needs.energy = Math.min(ctx.defs.needs.max, s.needs.energy + energyPerTick);
    a._energyAdded = (a._energyAdded ?? 0) + energyPerTick;

    if (a.progress >= a.params.ticks || s.needs.energy >= ctx.defs.needs.max) {
      const exactTotal = def.defaultTicks * def.energyPerTick;
      const adjustment = exactTotal - a._energyAdded;
      s.needs.energy = Math.min(ctx.defs.needs.max, s.needs.energy + adjustment);
      return DONE;
    }
    return RUNNING;
  },
  complete(ctx, a) {
    const s = ctx.state.survivors[a.actorId];
    ctx.emit('survivor.rested', { survivorId: s.id, energy: s.needs.energy });
  },
};
