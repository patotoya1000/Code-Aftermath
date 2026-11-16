import { hasOwn } from '../../../kernel/index.js';
import { available, stockKey } from '../../resources/index.js';
import { awardSkillXp } from '../../survivors/index.js';
import { syncStock } from '../../spoilage/index.js';
import { ok, fail, RUNNING, DONE } from './shared.js';

/**
 * The item an eat/drink action would use, or null. `want` (a learner's choice, e.g. survivor.eat("bread")) is HARD: that item or
 * nothing. Without one, the in-stock item with the lowest `rank` goes first (the cheapest food, so the good food is kept for later).
 */
export function pickConsumable(ctx, def, want) {
  if (want !== undefined) return hasOwn(def.items, want) && available(ctx.state, stockKey(want)) >= 1 ? want : null;
  return Object.entries(def.items).filter(([id]) => available(ctx.state, stockKey(id)) >= 1).sort((p, q) => p[1].rank - q[1].rank)[0]?.[0] ?? null;
}

// eat / drink: one data-driven handler. The item is reserved first, so two survivors can't eat the same ration.
export const consumeHandler = {
  validate(ctx, a) {
    const def = ctx.defs.actions[a.actionType];
    const want = a.params.item;
    if (want !== undefined && !hasOwn(def.items, want)) return fail('INVALID_PARAMS'); // not something she can eat / drink
    if (ctx.state.survivors[a.actorId].needs[def.need] >= ctx.defs.needs.max) return fail('NOT_NEEDED');
    a.item = pickConsumable(ctx, def, want);
    return a.item ? ok : fail('INSUFFICIENT_RESOURCE'); // nothing (of that kind) in stock
  },
  reservations: (ctx, a) => [{ account: stockKey(a.item), qty: 1 }],
  tick(ctx, a) {
    a.phase = a.actionType;
    a.progress += 1;
    const ticks = Math.ceil(ctx.defs.actions[a.actionType].ticks * (a.durationModifier ?? 1));
    return a.progress >= ticks ? DONE : RUNNING;
  },
  complete(ctx, a) {
    const def = ctx.defs.actions[a.actionType];
    const s = ctx.state.survivors[a.actorId];
    syncStock(ctx.state, ctx.defs, a.item); // the unit that was eaten is the OLDEST one
    s.needs[def.need] = Math.min(ctx.defs.needs.max, s.needs[def.need] + def.items[a.item].restore);
    awardSkillXp(ctx, s, a.actionType);
    ctx.emit('survivor.consumed', { survivorId: s.id, item: a.item, need: def.need, value: s.needs[def.need] });
  },
};
