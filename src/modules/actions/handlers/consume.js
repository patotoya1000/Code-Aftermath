import { stockKey } from '../../resources/index.js';
import { ok, fail, RUNNING, DONE } from './shared.js';

// eat / drink: one data-driven handler. The item is reserved first, so two survivors can't eat the same ration.
export const consumeHandler = {
  validate(ctx, a) {
    const def = ctx.defs.actions[a.actionType];
    if (ctx.state.survivors[a.actorId].needs[def.need] >= ctx.defs.needs.max) return fail('NOT_NEEDED');
    return ok;
  },
  reservations: (ctx, a) => [{ account: stockKey(ctx.defs.actions[a.actionType].item), qty: 1 }],
  tick(ctx, a) {
    a.phase = a.actionType;
    a.progress += 1;
    const ticks = Math.ceil(ctx.defs.actions[a.actionType].ticks * (a.durationModifier ?? 1));
    return a.progress >= ticks ? DONE : RUNNING;
  },
  complete(ctx, a) {
    const def = ctx.defs.actions[a.actionType];
    const s = ctx.state.survivors[a.actorId];
    s.needs[def.need] = Math.min(ctx.defs.needs.max, s.needs[def.need] + def.restore);
    ctx.emit('survivor.consumed', { survivorId: s.id, item: def.item, need: def.need, value: s.needs[def.need] });
  },
};
