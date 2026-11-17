import { chebyshev } from '../../../kernel/index.js';
import { credit, stockKey, total } from '../../resources/index.js';
import { carriedOf, removeCarried } from '../../survivors/index.js';
import { syncStock } from '../../spoilage/index.js';
import { nearestDepot, depotAccepts, storageCapacity } from '../../buildings/index.js';
import { DONE, RUNNING, failTick, walkStep } from './shared.js';

/**
 * The unloading leg shared by gather (after every trip) and deposit (on request). One call = one tick of it:
 *   walk to the nearest working storage building that accepts the first item she carries (alphabetical, so it is
 *   deterministic) → unload for `unloadTicks` → move everything that building accepts into base stock → if she still carries
 *   something it did not take, go to the next one.
 * Base stock never goes over the pooled capacity: gather reserved the room before the units were picked up, and unloading
 * still checks it. If nothing at all could be unloaded the leg FAILS with STORAGE_FULL instead of looping.
 * Leg state lives on the action: a.depotId, a.unload (ticks spent unloading), a.legMoved (units moved so far).
 */
export function stepDeposit(ctx, a, def) {
  const { state } = ctx;
  const s = state.survivors[a.actorId];
  const item = Object.keys(s.inventory.items).sort()[0];
  if (item === undefined) return DONE;

  let depot = a.depotId ? state.buildings[a.depotId] : null;
  if (!depot || !depotAccepts(depot, item)) {
    depot = nearestDepot(state, item, s.position);
    if (!depot) return failTick('NO_DEPOT');
    a.depotId = depot.id;
    a.targetId = depot.id;
    a.travelTicks = 0;
    a.unload = 0;
  }

  if (chebyshev(s.position, depot) > def.range) {
    if (s.needs.energy <= 0) return failTick('EXHAUSTED');
    a.phase = 'travel';
    a.travelTicks += 1;
    if (a.travelTicks % def.ticksPerTile === 0 && !walkStep(ctx, a, depot)) return failTick('NO_PATH');
    return RUNNING;
  }

  a.phase = 'work';
  a.unload = (a.unload ?? 0) + 1;
  if (a.unload < def.unloadTicks) return RUNNING;

  let moved = 0;
  for (const it of Object.keys(s.inventory.items).sort()) {
    if (!depotAccepts(depot, it)) continue;
    const room = Math.max(0, storageCapacity(state, it) - total(state, stockKey(it)));
    const n = Math.min(carriedOf(s, it), room);
    if (n < 1) continue;
    removeCarried(s, it, n);
    credit(state, stockKey(it), n);
    syncStock(state, ctx.defs, it); // perishable crops arrive as a fresh batch
    moved += n;
    ctx.emit('resource.deposited', { actorId: a.actorId, depotId: depot.id, resource: it, amount: n });
  }
  a.legMoved = (a.legMoved ?? 0) + moved;
  a.unload = 0;
  a.depotId = null;
  if (moved === 0) return failTick('STORAGE_FULL');
  return Object.keys(s.inventory.items).length === 0 ? DONE : RUNNING;
}
