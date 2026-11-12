import { AftermathError, createRng, STATE_SCHEMA } from '../../kernel/index.js';
import { openAccount, stockKey, nodeKey } from '../resources/index.js';
import { createSurvivor } from '../survivors/index.js';
import { createBuilding } from '../buildings/index.js';

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
    actions: {}, activeActions: [],
  };
  for (const item of Object.keys(defs.items)) openAccount(state, stockKey(item), sc.stock[item] ?? 0);
  for (const spec of sc.buildings) state.buildings[spec.id] = createBuilding(defs, spec);
  for (const spec of sc.nodes) {
    const nt = defs.nodeTypes[spec.type];
    const amount = nt.amount + rng.int(nt.variance + 1);
    openAccount(state, nodeKey(spec.id), amount);
    state.nodes[spec.id] = { id: spec.id, type: spec.type, resource: nt.yields, x: spec.x, y: spec.y };
  }
  for (const spec of sc.survivors) state.survivors[spec.id] = createSurvivor(defs, spec);
  state.rngState = rng.state;
  return state;
}
