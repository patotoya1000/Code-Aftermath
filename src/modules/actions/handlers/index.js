import { moveHandler } from './move.js';
import { gatherHandler } from './gather.js';
import { depositHandler } from './deposit.js';
import { restHandler } from './rest.js';
import { consumeHandler } from './consume.js';
import { repairHandler } from './repair.js';
import { upgradeHandler } from './upgrade.js';

// Keyed by the `handler` field in action definitions.
export const createHandlers = () => ({
  move: moveHandler, gather: gatherHandler, deposit: depositHandler, rest: restHandler, consume: consumeHandler, repair: repairHandler, upgrade: upgradeHandler,
});
