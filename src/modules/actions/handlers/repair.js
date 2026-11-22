import { own } from '../../../kernel/index.js';
import { stockKey } from '../../resources/index.js';
import { maxHealthOf, applyHealth, repairOf } from '../../buildings/index.js';
import { awardSkillXp } from '../../survivors/index.js';
import { ok, fail, approachThenWork, tooTired } from './shared.js';

export const repairHandler = {
  validate(ctx, a) {
    const b = own(ctx.state.buildings, a.params.targetId);
    if (!b) return fail('UNKNOWN_TARGET');
    if (b.health >= maxHealthOf(ctx.defs, b)) return fail('NOTHING_TO_REPAIR');
    if (tooTired(ctx, a.actorId)) return fail('EXHAUSTED');
    a.targetId = b.id;
    return ok;
  },
  reservations(ctx, a) {
    const b = ctx.state.buildings[a.targetId];
    return Object.entries(repairOf(ctx.defs, b).cost).map(([res, qty]) => ({ account: stockKey(res), qty }));
  },
  tick(ctx, a) {
    const b = ctx.state.buildings[a.targetId];
    const def = ctx.defs.actions.repair;
    return approachThenWork(ctx, a, { x: b.x, y: b.y }, {
      range: def.range, ticksPerTile: def.ticksPerTile, workTicks: Math.ceil(repairOf(ctx.defs, b).ticks * (a.durationModifier ?? 1)),
    });
  },
  complete(ctx, a) {
    const b = ctx.state.buildings[a.targetId];
    const healthPerAction = Math.floor(repairOf(ctx.defs, b).healthPerAction * (a.outputModifier ?? 1));
    const { from, to } = applyHealth(ctx.defs, b, healthPerAction);
    awardSkillXp(ctx, ctx.state.survivors[a.actorId], 'repair');
    ctx.emit('building.repaired', { actorId: a.actorId, buildingId: b.id, health: b.health, condition: to });
    if (from !== to) ctx.emit('building.condition_changed', { buildingId: b.id, from, to });
  },
};
