import { AftermathError, hashValue, SAVE_FORMAT, SIM_VERSION } from '../../kernel/index.js';

// ---- Storage adapters (swap freely: memory for tests, IndexedDB in the browser/Capacitor) ----
export function createMemoryAdapter() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, keys: async () => [...m.keys()] };
}

export function createIndexedDbAdapter(dbName = 'code-aftermath') {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('saves');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('saves', mode);
      const req = fn(t.objectStore('saves'));
      t.oncomplete = () => { db.close(); res(req?.result ?? null); };
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: (k) => tx('readonly', (s) => s.get(k)),
    set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
    delete: (k) => tx('readwrite', (s) => s.delete(k)),
    keys: () => tx('readonly', (s) => s.getAllKeys()),
  };
}

// ---- Save store: versioned envelope + integrity hash ----
export function createSaveStore(adapter, { clock = () => 0 } = {}) {
  return {
    async save(slot, { state, progress }) {
      const envelope = { format: SAVE_FORMAT, simVersion: SIM_VERSION, savedAt: clock(), stateHash: hashValue(state), state, progress };
      await adapter.set(slot, JSON.stringify(envelope));
    },
    async load(slot) {
      const raw = await adapter.get(slot);
      if (!raw) return null;
      let env;
      try { env = JSON.parse(raw); } catch { throw new AftermathError('SAVE_CORRUPT', 'Save is not valid JSON'); }
      if (env.format !== SAVE_FORMAT) throw new AftermathError('SAVE_FORMAT_UNSUPPORTED', `Save format ${env.format} is not supported`); // migration hook point
      if (hashValue(env.state) !== env.stateHash) throw new AftermathError('SAVE_CORRUPT', 'Save failed its integrity check');
      return { state: env.state, progress: env.progress, simVersion: env.simVersion, savedAt: env.savedAt };
    },
    delete: (slot) => adapter.delete(slot),
    list: () => adapter.keys(),
  };
}

// ---- Campaign progress: grows only when a lesson is passed ----
export const emptyProgress = () => ({ attempts: 0, completed: {} });

/** Pure. Failed attempts bump a counter but can never remove or weaken what was already earned. */
export function recordLessonResult(progress, evaluation, { commandCount = null } = {}) {
  const next = { attempts: progress.attempts + 1, completed: { ...progress.completed } };
  if (evaluation.passed) {
    const prev = next.completed[evaluation.lessonId];
    next.completed[evaluation.lessonId] = {
      passes: (prev?.passes ?? 0) + 1,
      bestCommandCount: commandCount === null ? prev?.bestCommandCount ?? null : Math.min(commandCount, prev?.bestCommandCount ?? Infinity),
    };
  }
  return next;
}
