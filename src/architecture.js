// The modular-monolith contract. One deployable app, many modules; each module may import:
//   - its own files,
//   - the shared kernel (src/kernel/index.js),
//   - the PUBLIC index.js of modules listed here — nothing else.
// tests/architecture.test.js enforces this on every run. src/app/* (composition root) may import any module index.
export const MODULES = {
  definitions: [],
  resources: [],
  survivors: [],
  buildings: [],
  world: ['resources', 'survivors', 'buildings'],
  projection: ['resources', 'survivors', 'buildings'],
  actions: ['resources', 'buildings'],
  simulation: ['survivors', 'actions', 'projection'],
  api: [],
  sandbox: ['api'],
  session: ['world', 'simulation', 'api'],
  lessons: ['session'],
  replay: ['session'],
  persistence: [],
  debugview: [],
};
