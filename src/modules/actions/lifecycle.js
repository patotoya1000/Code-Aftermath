// QUEUED → VALIDATING → RESERVED → EXECUTING → COMPLETED, with FAILED/CANCELLED allowed from any live state.
export const Status = Object.freeze({
  QUEUED: 'QUEUED', VALIDATING: 'VALIDATING', RESERVED: 'RESERVED', EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED', FAILED: 'FAILED', CANCELLED: 'CANCELLED',
});

const NEXT = {
  QUEUED: ['VALIDATING', 'FAILED', 'CANCELLED'],
  VALIDATING: ['RESERVED', 'FAILED', 'CANCELLED'],
  RESERVED: ['EXECUTING', 'FAILED', 'CANCELLED'],
  EXECUTING: ['COMPLETED', 'FAILED', 'CANCELLED'],
};

export const canTransition = (from, to) => (NEXT[from] ?? []).includes(to);
export const isTerminal = (s) => s === 'COMPLETED' || s === 'FAILED' || s === 'CANCELLED';

export const FailureReason = Object.freeze({
  UNKNOWN_ACTOR: 'UNKNOWN_ACTOR',
  ACTOR_DOWNED: 'ACTOR_DOWNED',
  UNKNOWN_TARGET: 'UNKNOWN_TARGET',
  NO_TARGET: 'NO_TARGET',
  INVALID_PARAMS: 'INVALID_PARAMS',
  OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
  EXHAUSTED: 'EXHAUSTED',
  INSUFFICIENT_RESOURCE: 'INSUFFICIENT_RESOURCE',
  STORAGE_FULL: 'STORAGE_FULL',
  NOT_NEEDED: 'NOT_NEEDED',
  NOTHING_TO_REPAIR: 'NOTHING_TO_REPAIR',
  NOTHING_TO_DEPOSIT: 'NOTHING_TO_DEPOSIT', // deposit() while carrying nothing
  MAX_LEVEL: 'MAX_LEVEL', // upgrade: no higher level exists for this building
  NEEDS_REPAIR: 'NEEDS_REPAIR', // upgrade: repair the building first
  NO_STATION: 'NO_STATION', // cook: no such station building (kitchen) exists in this world
  NO_DEPOT: 'NO_DEPOT', // nothing that still works can store what she carries
  NO_PATH: 'NO_PATH', // walls/buildings leave no way to the destination
  CARRY_FULL: 'CARRY_FULL', // take: her hands are full (carry capacity)
  TOWER_TOO_LOW: 'TOWER_TOO_LOW', // mount: this tower level cannot hold that mounted weapon (upgrade the tower)
  NO_SLOT: 'NO_SLOT', // mount: every slot of the tower is taken by a mounted weapon
  NO_MOUNT: 'NO_MOUNT', // reload: no weapon installed on the tower uses that ammo
  NO_LURE: 'NO_LURE', // lure: she carries no noise lure (survivor.take("noise_lure", 1))
  HOPPER_FULL: 'HOPPER_FULL', // reload: the hopper already holds as much as it can
  CAPABILITY_INSUFFICIENT: 'CAPABILITY_INSUFFICIENT',
  CANCELLED: 'CANCELLED',
  REPLACED: 'REPLACED', // a newer command from the same program took over this survivor
  INTERRUPTED: 'INTERRUPTED', // a needs policy paused this job; an equivalent job is queued right behind the policy's action
});

// Why a STANDING action (e.g. gather) ended on its own. If it ended having done some work the action COMPLETES with
// one of these as its stopReason; if it ended before doing any work it FAILS with the same reason code.
export const StopReason = Object.freeze({
  TARGET_REACHED: 'TARGET_REACHED', // the requested total was gathered
  STORAGE_FULL: 'STORAGE_FULL',     // base storage has no room left for this resource
  NO_TARGET: 'NO_TARGET',           // no node of that resource has anything left
  EXHAUSTED: 'EXHAUSTED',           // the survivor is too tired to keep working
  NO_DEPOT: 'NO_DEPOT',             // no working storage building accepts what she carries
  NO_PATH: 'NO_PATH',               // she cannot walk to where the work is
  NO_INGREDIENTS: 'NO_INGREDIENTS', // cook: the next batch cannot be paid for from base stock
  NO_STATION: 'NO_STATION',         // cook: the station stopped working (or is gone)
  NO_POWER: 'NO_POWER',             // cook/craft: a powered recipe waited too long for the grid (generator out of fuel, night, ...)
  NO_FARM: 'NO_FARM',               // farm: the farm stopped working (ruined / damaged) or is gone
  NO_SEED: 'NO_SEED',               // farm: empty plots wait but base stock has no seeds of the crop
  NO_NUTRIENTS: 'NO_NUTRIENTS',     // farm: a hydroponic plot needs nutrients but base stock has none
  NO_WATER: 'NO_WATER',             // farm: dry plots wait but base stock has no water
  NOTHING_TO_DO: 'NOTHING_TO_DO',   // farm: nothing grew ripe or needed work within the waiting time
  NO_AMMO: 'NO_AMMO',               // attack/guard: the equipped ranged weapon has no ammunition
  NO_WEAPON: 'NO_WEAPON',           // attack/guard: no usable weapon is equipped
  NO_WAVE: 'NO_WAVE',               // combat outside an active wave
  NO_LOOT: 'NO_LOOT',               // collect: no loot lies on the ground (none dropped, picked up already, or it spoiled away at dawn)
  WAVE_ACTIVE: 'WAVE_ACTIVE',       // collect: a wave is on - sorties are only allowed after it is cleared (and a sortie stops when the next wave starts)
});
