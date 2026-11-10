import { moveHandler } from './move.js';
import { gatherHandler } from './gather.js';
import { restHandler } from './rest.js';
import { consumeHandler } from './consume.js';
import { repairHandler } from './repair.js';

// Keyed by the `handler` field in action definitions.
export const createHandlers = () => ({
  move: moveHandler, gather: gatherHandler, rest: restHandler, consume: consumeHandler, repair: repairHandler,
});
