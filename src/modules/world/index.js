import { AftermathError, createRng, STATE_SCHEMA } from '../../kernel/index.js';
import { openAccount, stockKey, nodeKey, sourceKey } from '../resources/index.js';
import { createSurvivor } from '../survivors/index.js';
import { createBuilding } from '../buildings/index.js';
import { perishableItems, syncStock } from '../spoilage/index.js';
import { syncPlots } from '../farming/index.js';

/** Build the authoritative GameState for a scenario. Same defs + scenario + seed => identical state. */
export function createInitialState({ defs, scenarioId, seed }) {
  const sc = defs.scenarios[scenarioId];
  if (!sc) throw new AftermathError('UNKNOWN_SCENARIO', `Unknown scenario ${scenarioId}`);
  const rng = createRng(seed);
  const state = {
    schema: STATE_SCHEMA, scenarioId, seed, tick: 0, rngState: 0,
    map: { ...sc.map },
    counters: { action: 0, reservation: 0 },
    strategyPoints: defs.clock.strategy.start, // spent by learner commands, regenerates over time (see simulation tick)
    ledger: {}, reservations: {},
    nodes: {}, buildings: {}, survivors: {},
    actions: {}, activeActions: [], hooks: {},
    perishables: {}, // spoilage batches per perishable item: [{ qty, age }], oldest first (see the spoilage module)
    power: { produced: 0, demand: 0 }, // the grid totals of the last tick (see the power module)
    threats: { history: [], wave: null, zombies: {}, counter: 0, loot: {}, lootCounter: 0, attention: 0, towerNoise: {} }, // night raids resolved (newest last), the wave in progress and its zombies (see the threats module)
    events: { history: [] }, // risk events that have happened (see the events module), newest last
    plots: {}, // farming plots (see the farming module): { id, farmId, index, crop, stage, progress, water, damage }
  };
  for (const item of Object.keys(defs.items)) openAccount(state, stockKey(item), sc.stock[item] ?? 0);
  for (const spec of sc.buildings) {
    state.buildings[spec.id] = createBuilding(defs, spec);
    if (state.buildings[spec.id].water) openAccount(state, sourceKey(spec.id), spec.water ?? 0); // a well's reservoir is a ledger account
  }
  for (const spec of sc.nodes) {
    const nt = defs.nodeTypes[spec.type];
    const amount = nt.amount + rng.int(nt.variance + 1);
    openAccount(state, nodeKey(spec.id), amount);
    state.nodes[spec.id] = { id: spec.id, type: spec.type, resource: nt.yields, x: spec.x, y: spec.y };
  }
  for (const b of Object.values(state.buildings)) syncPlots(state, defs, b); // every farm gets its plots (each has a ledger account)
  for (const item of perishableItems(defs)) syncStock(state, defs, item); // starting stock counts as fresh
  for (const spec of sc.survivors) state.survivors[spec.id] = createSurvivor(defs, spec);
  state.rngState = rng.state;
  return state;
}
