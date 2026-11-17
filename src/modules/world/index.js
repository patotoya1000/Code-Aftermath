import { AftermathError, createRng, STATE_SCHEMA } from '../../kernel/index.js';
import { openAccount, stockKey, nodeKey, sourceKey, plotKey } from '../resources/index.js';
import { createSurvivor } from '../survivors/index.js';
import { createBuilding } from '../buildings/index.js';
import { perishableItems, syncStock } from '../spoilage/index.js';

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
    plots: {}, // farming plots: { id, x, y, crop, stage, growthProgress }
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
  for (const spec of sc.plots ?? []) {
    openAccount(state, plotKey(spec.id), 0); // plot ledger account: units harvested from it are reserved here
    state.plots[spec.id] = { id: spec.id, x: spec.x, y: spec.y, crop: spec.crop, stage: spec.stage, growthProgress: spec.growthProgress ?? 0 };
  }
  for (const item of perishableItems(defs)) syncStock(state, defs, item); // starting stock counts as fresh
  for (const spec of sc.survivors) state.survivors[spec.id] = createSurvivor(defs, spec);
  state.rngState = rng.state;
  return state;
}
