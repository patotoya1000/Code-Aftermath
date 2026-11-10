import { ok, fail, RUNNING, DONE, positionOfEntity, inBounds, stepToward } from './shared.js';

export const moveHandler = {
  validate(ctx, a) {
    const dest = a.params.targetId ? positionOfEntity(ctx.state, a.params.targetId) : { x: a.params.x, y: a.params.y };
    if (!dest || dest.x === undefined) return fail('UNKNOWN_TARGET');
    if (!inBounds(ctx.state, dest)) return fail('OUT_OF_BOUNDS');
    a.params = { ...a.params, x: dest.x, y: dest.y };
    return ok;
  },
  reservations: () => [],
  tick(ctx, a) {
    const s = ctx.state.survivors[a.actorId];
    const dest = { x: a.params.x, y: a.params.y };
    if (s.position.x === dest.x && s.position.y === dest.y) return DONE;
    a.phase = 'travel';
    a.progress += 1;
    if (a.progress % ctx.defs.actions.move.ticksPerTile === 0) stepToward(s, dest);
    return s.position.x === dest.x && s.position.y === dest.y ? DONE : RUNNING;
  },
  complete(ctx, a) {
    const s = ctx.state.survivors[a.actorId];
    ctx.emit('survivor.moved', { survivorId: s.id, x: s.position.x, y: s.position.y });
  },
};
