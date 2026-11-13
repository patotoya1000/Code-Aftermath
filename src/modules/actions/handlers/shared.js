import { directionFromDelta, chebyshev, own } from '../../../kernel/index.js';

export const ok = { ok: true };
export const fail = (reason) => ({ ok: false, reason });
export const RUNNING = { status: 'running' };
export const DONE = { status: 'done' };
export const failTick = (reason) => ({ status: 'fail', reason });

export function positionOfEntity(state, id) {
  const e = own(state.nodes, id) ?? own(state.buildings, id) ?? own(state.survivors, id);
  if (!e) return null;
  return e.position ? { x: e.position.x, y: e.position.y } : { x: e.x, y: e.y };
}

export const inBounds = (state, p) =>
  Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < state.map.width && p.y < state.map.height;

/** One tile toward dest, 8-directional. Simulation owns direction; the renderer only reads it. */
export function stepToward(survivor, dest) {
  const dx = Math.sign(dest.x - survivor.position.x);
  const dy = Math.sign(dest.y - survivor.position.y);
  survivor.position.x += dx;
  survivor.position.y += dy;
  const dir = directionFromDelta(dx, dy);
  if (dir) survivor.direction = dir;
}

/**
 * Shared "walk to range, then work N ticks" behaviour for gather/repair.
 * Progress counts work ticks only; animation never decides completion.
 */
export function approachThenWork(ctx, a, dest, { range, ticksPerTile, workTicks }) {
  const { state, defs } = ctx;
  const s = state.survivors[a.actorId];
  if (chebyshev(s.position, dest) > range) {
    if (s.needs.energy <= 0) return failTick('EXHAUSTED');
    a.phase = 'travel';
    a.travelTicks += 1;
    if (a.travelTicks % ticksPerTile === 0) stepToward(s, dest);
    return RUNNING;
  }
  if (s.needs.energy <= 0) return failTick('EXHAUSTED');
  a.phase = 'work';
  a.progress += 1;
  // Energy is charged on the action's CUMULATIVE work ticks. (Using the per-batch counter let `gather("wood", 1)` — a
  // 2-tick batch — never reach the "every 10 ticks" mark, so a survivor could work forever without tiring.)
  a.workTotal = (a.workTotal ?? 0) + 1;
  if (a.workTotal % defs.needs.work.energyEvery === 0) s.needs.energy = Math.max(0, s.needs.energy - 1);
  return a.progress >= workTicks ? DONE : RUNNING;
}

export const tooTired = (ctx, actorId) => ctx.state.survivors[actorId].needs.energy < ctx.defs.needs.work.minEnergy;
