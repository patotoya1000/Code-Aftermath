import { sortieOpen } from '../../threats/index.js';
import { depart, scavengeRefusal } from '../../scavenge/index.js';
import { vehicleRefusal } from '../../buildings/index.js';
import { ok, fail, RUNNING, DONE, failTick, walkStep, tooTired } from './shared.js';

/**
 * scavenge (W3, docs/game/21 section 6): walk to the gate and LEAVE for a site (data/scavenge.js). The action COMPLETES at the moment she departs (stop reason
 * DEPARTED); after that she is `away` and the simulation brings her back (`scavengeTick`) with loot - or loses her if a wave starts first.
 * R2 (docs/game/24): the SAME handler serves `stash` (work the site for a few rounds, haul into the site's stash) and `retrieve` (haul the stash home); the action type
 * (`a.actionType`) picks the trip. Extra failures: INVALID_PARAMS (rounds out of range), STORAGE_FULL (the stash is full / base storage cannot take anything), NO_STASH.
 * R5 (docs/game/24 section 3e): `retrieve` may name a `vehicle` (hand_cart, motor_cart, truck): refused with UNKNOWN_TARGET (no such vehicle), HQ_LEVEL, NO_STATION (no garage),
 * NEEDS_REPAIR (garage ruined or too low a level), VEHICLE_BUSY (out with someone else) or INSUFFICIENT_RESOURCE (not enough fuel); checked again when she reaches the gate.
 * Failures: UNKNOWN_TARGET (no such site), NOT_OPEN (before the start day), WAVE_ACTIVE (a wave is on: the gate is shut), EXHAUSTED (too tired), NO_PATH (no way to the gate).
 */
export const scavengeHandler = {
  validate(ctx, a) {
    const { state, defs } = ctx;
    const refusal = scavengeRefusal(state, defs, a.params.siteId, a.actionType, a.params);
    if (refusal) return fail(refusal.code);
    if (!sortieOpen(state)) return fail('WAVE_ACTIVE');
    if (tooTired(ctx, a.actorId)) return fail('EXHAUSTED');
    if (!state.buildings.gate) return fail('NO_PATH');
    a.targetId = a.params.siteId;
    return ok;
  },
  reservations: () => [],
  tick(ctx, a) {
    const { state, defs } = ctx;
    if (!sortieOpen(state)) return failTick('WAVE_ACTIVE'); // dusk came while she walked: the gate is shut
    const s = state.survivors[a.actorId];
    const gate = state.buildings.gate;
    if (s.position.x !== gate.x || s.position.y !== gate.y) {
      a.phase = 'travel';
      a.travelTicks = (a.travelTicks ?? 0) + 1;
      if (a.travelTicks % defs.actions[a.actionType].ticksPerTile === 0 && !walkStep(ctx, a, gate)) return failTick('NO_PATH');
      return s.position.x === gate.x && s.position.y === gate.y ? this.leave(ctx, a) : RUNNING;
    }
    return this.leave(ctx, a);
  },
  leave(ctx, a) {
    if (a.params.vehicle !== undefined) { // R5: she walked to the gate - the vehicle may have left with someone else, or the fuel been spent, meanwhile
      const why = vehicleRefusal(ctx.state, ctx.defs, a.params.vehicle);
      if (why) return failTick(why.code);
    }
    depart(ctx, ctx.state.survivors[a.actorId], a.params.siteId, a.actionType, a.params);
    a.stopReason = 'DEPARTED';
    return { status: 'done', stopReason: 'DEPARTED' };
  },
  complete() {},
};
