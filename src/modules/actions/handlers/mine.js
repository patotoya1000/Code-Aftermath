import { hashString, own, chebyshev } from '../../../kernel/index.js';
import { stockKey, credit } from '../../resources/index.js';
import { StopReason } from '../lifecycle.js';
import { checkCapability } from '../../capability/index.js';
import { awardSkillXp } from '../../survivors/index.js';
import { storageRoom, hqLevelOf, caveInPercent, roundYield } from '../../buildings/index.js';
import { ok, fail, failTick, RUNNING, approachThenWork, tooTired } from './shared.js';

/**
 * mine is a STANDING action made of ROUNDS (docs/game/24, R4): walk to the nearest working mining station, then repeat { dig `ore.ticks` -> roll for a cave-in -> bring the
 * ore into base stock } until `count` rounds are done or a stop reason fires:
 *   TARGET_REACHED (count done) · STORAGE_FULL (base storage has no room for the ore) · EXHAUSTED (too tired) · TOO_HURT (a cave-in left her below mining.minHealth)
 *   · NO_STATION (the station stopped working) · NO_POWER (a powered drill waited too long for the grid) · NO_PATH.
 * Like cook and gather: ending after some work COMPLETES with the stop reason; ending before any work FAILS with it.
 * Ore needs nothing in return (no inputs), so the ledger only ever gains: the ore is credited when a round finishes, and never more than base storage has room for.
 * A cave-in is a PURE roll (hash of seed + survivor + tick, `caveInPercent`): the round is lost, she loses mining.caveIn.damage health (never below 1) and gets no XP.
 * Level yield, speed and risk are data (data/mining.js, buildings.mining_station.levels[n].mine); skill makes rounds faster, adds a little ore and lowers the cave-in chance.
 */

const oreOf = (ctx, a) => ctx.defs.mining.ores[a.params.ore];
const levelOf = (ctx, station) => ctx.defs.buildings[station.type].levels[station.level]?.mine ?? null;
const roll = (seed, key) => parseInt(hashString(`mining:${seed}:${key}`).slice(-8), 16) % 100;

function refreshModifiers(ctx, a) {
  const cap = checkCapability(ctx.state.survivors[a.actorId], ctx.defs.actions[a.actionType], ctx.defs, ctx);
  if (cap.ok) { a.durationModifier = cap.durationModifier; a.outputModifier = cap.outputModifier; }
  a.workTicks = Math.ceil(oreOf(ctx, a).ticks * (a.durationModifier ?? 1));
}

const stopWith = (a, reason) => (a.stats.mined + a.stats.caveIns + a.stats.prior === 0 ? failTick(reason) : { status: 'done', stopReason: reason });

function nearest(list, from) {
  let best = null;
  for (const b of list) {
    const d = chebyshev(b, from);
    if (!best || d < best.d || (d === best.d && b.id < best.b.id)) best = { b, d };
  }
  return best?.b ?? null;
}

export const mineHandler = {
  validate(ctx, a) {
    const { defs, state } = ctx;
    const def = defs.actions[a.actionType];
    const { ore, count } = a.params;
    if (typeof ore !== 'string' || !Object.hasOwn(defs.mining.ores, ore)) return fail('INVALID_PARAMS');
    if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > def.maxCount)) return fail('INVALID_PARAMS');
    const s = state.survivors[a.actorId];
    if ((s.skills.mining ?? 0) < defs.mining.ores[ore].minSkill) return fail('CAPABILITY_INSUFFICIENT');
    if (hqLevelOf(state) < defs.mining.minHq) return fail('HQ_LEVEL'); // the mine opens with the headquarters (docs/game/24: HQ 3)
    const all = Object.values(state.buildings).filter((b) => b.type === defs.mining.station);
    if (all.length === 0) return fail('NO_STATION');
    const station = nearest(all.filter((b) => b.condition === 'repaired'), s.position);
    if (!station) return fail('NEEDS_REPAIR');
    if (tooTired(ctx, a.actorId)) return fail('EXHAUSTED');
    if (s.needs.health < defs.mining.minHealth) return fail('TOO_HURT');
    if (storageRoom(state, defs.mining.ores[ore].item, a.actionId) < 1) return fail('STORAGE_FULL');
    a.targetId = station.id;
    a.stats = { mined: 0, caveIns: 0, prior: a.resumeOf?.gathered ?? 0 }; // `prior`: rounds finished before a needs policy interrupted this job
    refreshModifiers(ctx, a);
    a.progress = 0;
    return ok;
  },
  reservations: () => [], // digging costs nothing but time and energy
  tick(ctx, a) {
    const { state, defs } = ctx;
    const mining = defs.mining;
    const ore = oreOf(ctx, a);
    const station = own(state.buildings, a.targetId);
    const s = state.survivors[a.actorId];
    if (!a.stats.started) {
      a.stats.started = true;
      ctx.emit('task.started', { actionId: a.actionId, actorId: a.actorId, taskType: 'mine', ore: a.params.ore });
    }
    if (!station || station.condition !== 'repaired') return stopWith(a, StopReason.NO_STATION);
    // A powered drill works only on ticks when the grid serves it (the power module set a.powered from where she stands at the start of this tick).
    const power = levelOf(ctx, station)?.power;
    if (power && chebyshev(s.position, station) <= defs.actions.mine.range && !a.powered) {
      a.powerWaited = (a.powerWaited ?? 0) + 1;
      if (a.powerWaited > mining.powerWaitTicks) return stopWith(a, StopReason.NO_POWER);
      a.fraction = Math.min(1, a.progress / a.workTicks);
      return RUNNING;
    }
    a.powerWaited = 0;
    const adef = defs.actions.mine;
    const r = approachThenWork(ctx, a, { x: station.x, y: station.y }, { range: adef.range, ticksPerTile: adef.ticksPerTile, workTicks: a.workTicks });
    a.fraction = a.phase === 'work' ? Math.min(1, a.progress / a.workTicks) : 0;
    if (r.status === 'fail') return stopWith(a, r.reason);
    if (r.status !== 'done') return RUNNING;

    // A round finished.
    a.progress = 0;
    a.fraction = 0;
    const pct = caveInPercent(mining, station.level, s.skills.mining ?? 0);
    if (roll(state.seed, `${a.actorId}:${state.tick}`) < pct) {
      s.needs.health = Math.max(1, s.needs.health - mining.caveIn.damage);
      a.stats.caveIns += 1;
      ctx.emit('mine.caveIn', { actorId: a.actorId, stationId: station.id, ore: a.params.ore, damage: mining.caveIn.damage, percent: pct });
      if (s.needs.health < mining.minHealth) return stopWith(a, StopReason.TOO_HURT);
    } else {
      const room = storageRoom(state, ore.item, a.actionId); // someone else may have filled the room meanwhile
      const qty = Math.min(roundYield(defs, ore, station, a.outputModifier ?? 1), room);
      if (qty < 1) return stopWith(a, StopReason.STORAGE_FULL);
      credit(state, stockKey(ore.item), qty);
      a.stats.mined += 1;
      a.stats.ore = (a.stats.ore ?? 0) + qty;
      awardSkillXp(ctx, s, 'mine');
      ctx.emit('ore.mined', { actorId: a.actorId, stationId: station.id, ore: a.params.ore, item: ore.item, qty });
    }

    // Plan the next round.
    if (a.params.count !== undefined && a.stats.mined >= a.params.count) return stopWith(a, StopReason.TARGET_REACHED);
    if (tooTired(ctx, a.actorId)) return stopWith(a, StopReason.EXHAUSTED);
    if (storageRoom(state, ore.item, a.actionId) < 1) return stopWith(a, StopReason.STORAGE_FULL);
    refreshModifiers(ctx, a);
    return RUNNING;
  },
  complete(ctx, a) {
    ctx.emit('task.stopped', { actionId: a.actionId, actorId: a.actorId, taskType: 'mine', reason: a.stopReason, mined: a.stats.mined, ore: a.stats.ore ?? 0, caveIns: a.stats.caveIns });
  },
};
