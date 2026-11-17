import { createDefinitions } from '../src/modules/definitions/index.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { buildCommand } from '../src/modules/api/index.js';
import { createSandbox } from '../src/modules/sandbox/index.js';

import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { raidSchedule } from '../src/modules/definitions/data/threats.js';

// Risk events (O18) change stock and buildings on random-looking days; the older tests count exact stock over many days, so the shared test world has them
// OFF (chancePercent 0). tests/events.test.js turns them on.
export const defs = createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 0 }, raidSchedule: { ...raidSchedule, chancePercent: 0 } });
export const sandbox = createSandbox();

/** The farm's starting seeds are edible, perishable stock; tests about hunger or spoilage of OTHER foods remove them first. */
export const noCrops = (st) => { for (const c of ['potato', 'carrot']) st.ledger[`stock.${c}`].total = 0; };

export function newSim(scenarioId = 'stage1', seed = 1, mutate) {
  const state = createInitialState({ defs, scenarioId, seed });
  if (mutate) mutate(state);
  return createSimulation({ defs, state });
}

/** Submit by API call name, exactly as learner code would. */
export const call = (sim, name, ...args) => sim.submit(buildCommand('survivor_1', { name, args }));
export const runUntilIdle = (sim, max = 2000) => { while (!sim.isIdle() && sim.tick < max) sim.step(1); return sim; };
export const types = (sim) => sim.log.all().map((e) => e.type);
