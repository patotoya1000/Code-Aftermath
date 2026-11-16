import { directionFromDelta, chebyshev, own } from '../../../kernel/index.js';
import { findPath, blockedTiles } from '../../buildings/index.js';
import { awardSkillXp } from '../../survivors/index.js';

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

/**
 * Take ONE step along a route to `dest` (the caller decides when: once per `ticksPerTile`). Routes come from the buildings
 * module's A* and are cached on the action (`a.route`, for goal `a.routeGoal`); a route is replanned when the goal changes
 * or the next tile has become blocked. Returns false when there is no way to get there (the caller fails with NO_PATH).
 * Simulation owns direction; the renderer only reads it.
 */
export function walkStep(ctx, a, dest) {
  const s = ctx.state.survivors[a.actorId];
  if (s.position.x === dest.x && s.position.y === dest.y) return true;
  const goal = `${dest.x},${dest.y}`;
  let blocked = null;
  const next = () => a.route?.[0];
  const usable = () => {
    const n = next();
    if (!n) return false;
    if (Math.max(Math.abs(n.x - s.position.x), Math.abs(n.y - s.position.y)) !== 1) return false;
    if (n.x === dest.x && n.y === dest.y) return true;
    blocked ??= blockedTiles(ctx.state);
    return !blocked.has(`${n.x},${n.y}`);
  };
  if (a.routeGoal !== goal || !usable()) {
    blocked ??= blockedTiles(ctx.state);
    a.route = findPath(ctx.state, s.position, dest, blocked);
    a.routeGoal = goal;
    if (a.route === null) { a.route = undefined; a.routeGoal = undefined; return false; }
  }
  const n = a.route.shift();
  const dx = n.x - s.position.x, dy = n.y - s.position.y;
  s.position.x = n.x;
  s.position.y = n.y;
  const dir = directionFromDelta(dx, dy);
  if (dir) s.direction = dir;
  awardSkillXp(ctx, s, 'move'); // every tile walked, by any action, is practice
  return true;
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
    if (a.travelTicks % ticksPerTile === 0 && !walkStep(ctx, a, dest)) return failTick('NO_PATH');
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
