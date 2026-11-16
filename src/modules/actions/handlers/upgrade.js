import { own } from '../../../kernel/index.js';
import { stockKey } from '../../resources/index.js';
import { awardSkillXp } from '../../survivors/index.js';
import { maxHealthOf, applyHealth, nextUpgrade } from '../../buildings/index.js';
import { ok, fail, approachThenWork, tooTired } from './shared.js';

/**
 * upgrade: raise a WORKING building one level (docs/game/06). The building must be fully repaired first (ruins and damage are
 * fixed with repair, never skipped by paying more), the next level must exist in its `upgrade` table, and the materials are
 * reserved up front like repair. Level effects come from data: new max health, optional per-level storage.
 */
export const upgradeHandler = {
  validate(ctx, a) {
    const b = own(ctx.state.buildings, a.params.targetId);
    if (!b) return fail('UNKNOWN_TARGET');
    const up = nextUpgrade(ctx.defs, b);
    if (!up) return fail('MAX_LEVEL');
    if (b.condition !== 'repaired' || b.health < maxHealthOf(ctx.defs, b)) return fail('NEEDS_REPAIR');
    if (tooTired(ctx, a.actorId)) return fail('EXHAUSTED');
    a.targetId = b.id;
    a.toLevel = up.level;
    return ok;
  },
  reservations(ctx, a) {
    const b = ctx.state.buildings[a.targetId];
    return Object.entries(nextUpgrade(ctx.defs, b).cost).map(([res, qty]) => ({ account: stockKey(res), qty }));
  },
  tick(ctx, a) {
    const b = ctx.state.buildings[a.targetId];
    if (b.level >= a.toLevel) return { status: 'fail', reason: 'MAX_LEVEL' }; // someone else got there first
    const def = ctx.defs.actions.upgrade;
    return approachThenWork(ctx, a, { x: b.x, y: b.y }, {
      range: def.range, ticksPerTile: def.ticksPerTile, workTicks: Math.ceil(nextUpgrade(ctx.defs, b).ticks * (a.durationModifier ?? 1)),
    });
  },
  complete(ctx, a) {
    const b = ctx.state.buildings[a.targetId];
    const from = b.level;
    b.level = a.toLevel;
    const lv = ctx.defs.buildings[b.type].levels[b.level];
    if (lv.storage) b.storage = { ...lv.storage };
    applyHealth(ctx.defs, b, maxHealthOf(ctx.defs, b)); // freshly refitted: full health at the new maximum
    awardSkillXp(ctx, ctx.state.survivors[a.actorId], 'upgrade');
    ctx.emit('building.upgraded', { actorId: a.actorId, buildingId: b.id, from, to: b.level, health: b.health });
  },
};
