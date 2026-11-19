import { moveHandler } from './move.js';
import { gatherHandler } from './gather.js';
import { depositHandler } from './deposit.js';
import { restHandler } from './rest.js';
import { consumeHandler } from './consume.js';
import { repairHandler } from './repair.js';
import { upgradeHandler } from './upgrade.js';
import { cookHandler } from './cook.js';
import { farmHandler } from './farm.js';
import { combatHandler, guardHandler } from './combat.js';
import { collectHandler } from './collect.js';
import { takeHandler } from './take.js';
import { equipHandler } from './equip.js';
import { mountHandler } from './mount.js';
import { reloadHandler } from './reload.js';
import { lureHandler } from './lure.js';

// Keyed by the `handler` field in action definitions.
export const createHandlers = () => ({
  move: moveHandler, gather: gatherHandler, deposit: depositHandler, rest: restHandler, consume: consumeHandler, repair: repairHandler, upgrade: upgradeHandler, cook: cookHandler, farm: farmHandler, combat: combatHandler, guard: guardHandler, collect: collectHandler, take: takeHandler, equip: equipHandler, mount: mountHandler, reload: reloadHandler, lure: lureHandler,
});
