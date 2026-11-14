import { createDefinitions } from './src/modules/definitions/index.js';
import { createInitialState } from './src/modules/world/index.js';
import { createSimulation } from './src/modules/simulation/index.js';
import { createSandbox } from './src/modules/sandbox/index.js';

const defs = createDefinitions();
const initial = createInitialState({ defs, scenarioId: 'stage1', seed: 1001 });
const sim = createSimulation({ defs, state: initial });
const sandbox = createSandbox({ timeoutMs: 1500 });
const view = sim.studentView();
console.log('survivors type', Array.isArray(view.survivors), view.survivors.length, view.survivor && view.survivor.id);
console.log('sandbox result', await sandbox.run({ code: 'survivor.gather("wood",10);', view, seed: 1001 }));
