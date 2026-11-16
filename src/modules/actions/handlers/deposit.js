import { ok, fail } from './shared.js';
import { stepDeposit } from './carry.js';

/** deposit: unload everything the survivor carries into base storage (walks to the nearest building that takes it). */
export const depositHandler = {
  validate(ctx, a) {
    if (Object.keys(ctx.state.survivors[a.actorId].inventory.items).length === 0) return fail('NOTHING_TO_DEPOSIT');
    a.stats = { deposited: 0 };
    a.legMoved = 0;
    return ok;
  },
  reservations: () => [],
  tick(ctx, a) {
    const r = stepDeposit(ctx, a, ctx.defs.actions.deposit);
    a.stats.deposited = a.legMoved;
    if (r.status === 'fail' && a.legMoved > 0) return { status: 'done', stopReason: r.reason }; // part of the load got in before it stopped
    return r;
  },
  complete(ctx, a) {
    ctx.emit('task.stopped', { actionId: a.actionId, actorId: a.actorId, taskType: 'deposit', reason: a.stopReason ?? 'DONE', deposited: a.stats.deposited });
  },
};
