import { createDefinitions } from './src/modules/definitions/index.js';
import { createInitialState } from './src/modules/world/index.js';
import { createSimulation } from './src/modules/simulation/index.js';
import { createApp } from './src/app/index.js';

const defs = createDefinitions();
const state = createInitialState({ defs, scenarioId: 'stage1_tired', seed: 1 });
const sim = createSimulation({ defs, state });
sim.submit({ apiVersion: 1, type: 'rest', actorId: 'survivor_1', params: { ticks: 10 } });
sim.step(1);
console.log('energy-after-1-tick=', sim.studentView().survivor.needs.energy);
const app = createApp();
console.log('runTurnCode-type=', typeof app.runTurnCode);
