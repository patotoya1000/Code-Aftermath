// Shared kernel: tiny, dependency-free primitives every module may import.
export { createRng } from './rng.js';
export { stableStringify, hashString, hashValue } from './hash.js';
export { createEventLog } from './eventlog.js';
export { AftermathError } from './errors.js';
export {
  SIM_VERSION, API_VERSION, SUPPORTED_API_VERSIONS, REPLAY_FORMAT, SAVE_FORMAT, STATE_SCHEMA,
} from './versions.js';
export { deepFreeze, clone, hasOwn, own } from './util.js';
export { DIRECTIONS, directionFromDelta, chebyshev } from './grid.js';
