import { chebyshev } from '../../../kernel/index.js';
import { available, nodeKey, stockKey, credit, total } from '../../resources/index.js';
import { FailureReason } from '../lifecycle.js';
import { ok, fail, approachThenWork, tooTired } from './shared.js';

/** Nearest node yielding `resource` that still has unreserved content. Ties break by id (deterministic). */
function nearestNode(ctx, resource, from) {
  let best = null;
  for (const n of Object.values(ctx.state.nodes)) {
    if (n.resource !== resource || available(ctx.state, nodeKey(n.id)) < 1) continue;
    const d = chebyshev(from, n);
    if (!best || d < best.d || (d === best.d && n.id < best.n.id)) best = { n, d };
  }
  return best?.n ?? null;
}

export const gatherHandler = {
  validate(ctx, a) {
    const def = ctx.defs.actions.gather;
    const { resource } = a.params;
    if (typeof resource !== 'string' || !ctx.defs.items[resource]) return fail('INVALID_PARAMS');
    const want = a.params.amount ?? def.defaultAmount;
    if (!Number.isInteger(want) || want < 1 || want > def.maxAmount) return fail('INVALID_PARAMS');
    if (tooTired(ctx, a.actorId)) return fail('EXHAUSTED');
    const node = nearestNode(ctx, resource, ctx.state.survivors[a.actorId].position);
    if (!node) return fail('NO_TARGET');
    a.targetId = node.id;
    // Check HQ storage capacity if HQ exists and has storage
    const hq = ctx.state.buildings['hq'];
    if (hq && hq.storage) {
      const slot = hq.storage[resource];
      if (slot) {
        const current = total(ctx.state, stockKey(resource));
        const spaceLeft = slot - current;
        if (spaceLeft <= 0) {
          a.params.amount = Math.min(want, Math.max(1, slot - current));
          return fail(FailureReason.STORAGE_FULL);
        }
        a.params.amount = Math.min(want, Math.min(available(ctx.state, nodeKey(node.id)), Math.max(1, spaceLeft)));
      }
    } else {
      a.params = { ...a.params, amount: Math.min(want, available(ctx.state, nodeKey(node.id))) };
    }
    return ok;
  },
  reservations: (ctx, a) => [{ account: nodeKey(a.targetId), qty: a.params.amount }],
  tick(ctx, a) {
    const def = ctx.defs.actions.gather;
    return approachThenWork(ctx, a, ctx.state.nodes[a.targetId], {
      range: def.range, ticksPerTile: def.ticksPerTile, workTicks: a.params.amount * def.ticksPerUnit,
    });
  },
  complete(ctx, a, committed) {
    const node = ctx.state.nodes[a.targetId];
    const qty = committed[0].qty;
    credit(ctx.state, stockKey(node.resource), qty); // gathered units go to base stock (Phase 1); carry rules come in Phase 5
    ctx.emit('resource.gathered', { actorId: a.actorId, resource: node.resource, amount: qty, nodeId: node.id });
    if (total(ctx.state, nodeKey(node.id)) === 0) ctx.emit('node.depleted', { nodeId: node.id });
  },
};
