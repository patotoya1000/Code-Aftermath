import { createDefinitions } from '../../src/modules/definitions/index.js';
import { createInitialState } from '../../src/modules/world/index.js';
import { createSandbox } from '../../src/modules/sandbox/index.js';

const defs = createDefinitions();
const view = createInitialState({ defs, scenarioId: 'stage1', seed: 1001 });
const sandbox = createSandbox({ timeoutMs: 1500 });
console.log('before run');
const result = await sandbox.run({ code: 'survivor.gather("wood",10);', view, seed: 1001 });
console.log('after run', result);
