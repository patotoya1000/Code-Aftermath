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
  NO_FARM: 'NO_FARM',               // farm: the farm stopped working (ruined / damaged) or is gone
  NO_SEED: 'NO_SEED',               // farm: empty plots wait but base stock has no seeds of the crop
  NO_WATER: 'NO_WATER',             // farm: dry plots wait but base stock has no water
  NOTHING_TO_DO: 'NOTHING_TO_DO',   // farm: nothing grew ripe or needed work within the waiting time
});
