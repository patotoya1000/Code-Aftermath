import { hasOwn, own, chebyshev } from '../../../kernel/index.js';
import { stockKey, reserve, commit, release, credit, available } from '../../resources/index.js';
import { StopReason } from '../lifecycle.js';
import { checkCapability } from '../../capability/index.js';
import { awardSkillXp } from '../../survivors/index.js';
import { storageRoom, stationsFor, hqLevelOf } from '../../buildings/index.js';
import { syncStock } from '../../spoilage/index.js';
import { ok, fail, failTick, RUNNING, approachThenWork, tooTired } from './shared.js';

/**
 * cook is a STANDING action made of BATCHES (docs/game/16): walk to the nearest working station for the recipe (a repaired kitchen of
 * high enough level), then repeat { reserve the batch's inputs from base stock -> work `recipe.ticks` -> consume the inputs and add the
 * outputs to base stock } until `count` batches are done or a stop reason fires:
 *   TARGET_REACHED (count done) · NO_INGREDIENTS (the next batch cannot be paid for) · STORAGE_FULL (no room for the output)
 *   · EXHAUSTED (too tired) · NO_STATION (the station stopped working) · NO_PATH.
 * Like gather: ending after some work COMPLETES with the stop reason; ending before any work FAILS with it (a first batch that cannot
 * be paid for fails as INSUFFICIENT_RESOURCE, like every action that is missing something).
 * Conservation: inputs leave stock only when a batch FINISHES (commit); a cancelled or interrupted batch releases them untouched.
 * The same handler serves `cook` (kitchen) and `craft` (workshop): the action TYPE (a.actionType) picks the action definition, the XP award
 * and the event name, and a recipe may only be made by the action named in its `action` field (bread cannot be crafted, packaging not cooked).
 * A recipe with `power` draws that much from the grid while a batch is worked (the power module registers the demand and sets `a.powered`);
 * without power the work WAITS, and after `powerWaitTicks` of waiting the job stops with NO_POWER.
 * Skill makes batches faster (durationModifier, re-read per batch); it never changes how much a batch consumes or makes.
 */

const recipeOf = (ctx, a) => ctx.defs.recipes[a.params.recipe];
const inputsOf = (rc) => Object.entries(rc.inputs).map(([item, qty]) => ({ account: stockKey(item), qty }));
const roomForOutputs = (ctx, a, rc) => Object.entries(rc.outputs).every(([item, qty]) => storageRoom(ctx.state, item, a.actionId) >= qty);

function releaseAll(ctx, a) {
  for (const id of a.reservationIds) release(ctx.state, id);
  a.reservationIds = [];
}

/** End the job: nothing finished at all -> FAILED with the reason; otherwise COMPLETED with it as the stopReason. */
function stopWith(ctx, a, reason) {
  releaseAll(ctx, a);
  if (a.stats.crafted + a.stats.prior === 0) return failTick(reason);
  return { status: 'done', stopReason: reason };
}

/** The survivor's modifiers are re-read for every batch (she gets tired / hungry during a long job). */
function refreshModifiers(ctx, a) {
  const cap = checkCapability(ctx.state.survivors[a.actorId], ctx.defs.actions[a.actionType], ctx.defs, ctx);
  if (cap.ok) a.durationModifier = cap.durationModifier;
  a.workTicks = Math.ceil(recipeOf(ctx, a).ticks * (a.durationModifier ?? 1));
}

export const cookHandler = {
  validate(ctx, a) {
    const { defs, state } = ctx;
    const def = defs.actions[a.actionType];
    const { recipe, count } = a.params;
    if (typeof recipe !== 'string' || !hasOwn(defs.recipes, recipe)) return fail('INVALID_PARAMS');
    if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > def.maxCount)) return fail('INVALID_PARAMS');
    const rc = defs.recipes[recipe];
    if (rc.action !== a.actionType) return fail('INVALID_PARAMS'); // e.g. survivor.craft("bread")
    if ((state.survivors[a.actorId].skills[rc.skill] ?? 0) < rc.minSkill) return fail('CAPABILITY_INSUFFICIENT');
    if (rc.minHq && hqLevelOf(state) < rc.minHq) return fail('HQ_LEVEL'); // P2: the recipe is still closed (docs/game/23: the smelter opens at HQ level 2)
    const stations = stationsFor(state, defs, rc);
    if (stations.all.length === 0) return fail('NO_STATION');
    const station = nearest(stations.working, state.survivors[a.actorId].position);
    if (!station) return fail('NEEDS_REPAIR'); // a station exists but is ruined / damaged / too low a level: repair or upgrade it first
    if (tooTired(ctx, a.actorId)) return fail('EXHAUSTED');
    if (!roomForOutputs(ctx, a, rc)) return fail('STORAGE_FULL');
    a.targetId = station.id;
    a.stats = { crafted: 0, prior: a.resumeOf?.gathered ?? 0 }; // `prior`: batches finished before a needs policy interrupted this job
    refreshModifiers(ctx, a);
    a.progress = 0;
    return ok;
  },
  // The first batch's inputs; the engine reserves them (so a missing ingredient fails the action before any work, with nothing spent).
  reservations: (ctx, a) => inputsOf(recipeOf(ctx, a)),
  tick(ctx, a) {
    const { state, defs } = ctx;
    const rc = recipeOf(ctx, a);
    const station = own(state.buildings, a.targetId);
    if (!a.stats.started) {
      a.stats.started = true;
      ctx.emit('task.started', { actionId: a.actionId, actorId: a.actorId, taskType: a.actionType, recipe: a.params.recipe });
    }
    if (!station || station.condition !== 'repaired' || station.level < rc.stationLevel) return stopWith(ctx, a, StopReason.NO_STATION);
    const adef = defs.actions[a.actionType];
    // A powered recipe works only on ticks when the grid serves it (the power module set a.powered from where she stands at the start of this tick).
    if (rc.power && chebyshev(state.survivors[a.actorId].position, station) <= adef.range && !a.powered) {
      a.powerWaited = (a.powerWaited ?? 0) + 1;
      if (a.powerWaited > adef.powerWaitTicks) return stopWith(ctx, a, StopReason.NO_POWER);
      a.fraction = Math.min(1, a.progress / a.workTicks);
      return RUNNING;
    }
    a.powerWaited = 0;
    const r = approachThenWork(ctx, a, { x: station.x, y: station.y }, { range: adef.range, ticksPerTile: adef.ticksPerTile, workTicks: a.workTicks });
    a.fraction = a.phase === 'work' ? Math.min(1, a.progress / a.workTicks) : 0;
    if (r.status === 'fail') return stopWith(ctx, a, r.reason);
    if (r.status !== 'done') return RUNNING;

    // Batch finished: someone else may have filled the room meanwhile, so check again before the inputs are spent.
    if (!roomForOutputs(ctx, a, rc)) return stopWith(ctx, a, StopReason.STORAGE_FULL);
    for (const id of a.reservationIds) commit(state, id);
    a.reservationIds = [];
    for (const [item, qty] of Object.entries(rc.outputs)) credit(state, stockKey(item), qty);
    for (const item of [...Object.keys(rc.inputs), ...Object.keys(rc.outputs)]) syncStock(state, defs, item); // inputs: the oldest units were used; outputs: a fresh batch
    a.stats.crafted += 1;
    awardSkillXp(ctx, state.survivors[a.actorId], a.actionType);
    ctx.emit('item.crafted', { actorId: a.actorId, recipe: a.params.recipe, stationId: station.id, outputs: { ...rc.outputs } });
    a.progress = 0;
    a.fraction = 0;

    // Plan the next batch.
    if (a.params.count !== undefined && a.stats.crafted >= a.params.count) return stopWith(ctx, a, StopReason.TARGET_REACHED);
    if (tooTired(ctx, a.actorId)) return stopWith(ctx, a, StopReason.EXHAUSTED);
    if (!roomForOutputs(ctx, a, rc)) return stopWith(ctx, a, StopReason.STORAGE_FULL);
    if (inputsOf(rc).some((i) => available(state, i.account) < i.qty)) return stopWith(ctx, a, StopReason.NO_INGREDIENTS);
    for (const i of inputsOf(rc)) a.reservationIds.push(reserve(state, { owner: a.actionId, account: i.account, qty: i.qty }));
    refreshModifiers(ctx, a);
    return RUNNING;
  },
  complete(ctx, a) {
    ctx.emit('task.stopped', { actionId: a.actionId, actorId: a.actorId, taskType: a.actionType, reason: a.stopReason, crafted: a.stats.crafted });
  },
};

function nearest(list, from) {
  let best = null;
  for (const b of list) {
    const d = Math.max(Math.abs(b.x - from.x), Math.abs(b.y - from.y));
    if (!best || d < best.d || (d === best.d && b.id < best.b.id)) best = { b, d };
  }
  return best?.b ?? null;
}
