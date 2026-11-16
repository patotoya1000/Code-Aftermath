// The modular-monolith contract. One deployable app, many modules; each module may import:
//   - its own files,
//   - the shared kernel (src/kernel/index.js),
//   - the PUBLIC index.js of modules listed here — nothing else.
// tests/architecture.test.js enforces this on every run. src/app/* (composition root) may import any module index.
export const MODULES = {
  definitions: [],
  environment: [],
  resources: [],
  survivors: [],
  buildings: ['resources'],
  spoilage: ['resources', 'buildings'],
  water: ['resources', 'buildings', 'environment'],
  world: ['resources', 'survivors', 'buildings', 'spoilage'],
  projection: ['resources', 'survivors', 'buildings', 'environment', 'water', 'spoilage'],
  actions: ['resources', 'survivors', 'buildings', 'capability', 'water', 'spoilage'],
  simulation: ['survivors', 'actions', 'projection', 'capability', 'environment', 'water', 'spoilage'],
  api: [],
  sandbox: ['api'],
  session: ['world', 'simulation', 'api'],
  lessons: ['session'],
  replay: ['session'],
  persistence: [],
  capability: ['definitions'],
  assets: [],
  render: ['assets'],
};
