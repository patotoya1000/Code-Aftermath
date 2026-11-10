import { validateSource } from './safety.js';
import { DEFAULT_BUDGET } from './runtime.js';

const WORKER_URL = new URL('./worker-entry.js', import.meta.url);

async function spawn() {
  if (typeof Worker !== 'undefined') {
    const w = new Worker(WORKER_URL, { type: 'module' });
    return {
      post: (m) => w.postMessage(m),
      onMessage: (cb) => { w.onmessage = (e) => cb(e.data); },
      onFail: (cb) => { w.onerror = (e) => cb(e.message || 'worker error'); },
      terminate: () => w.terminate(),
    };
  }
  const { Worker: NodeWorker } = await import('node:worker_threads');
  const w = new NodeWorker(WORKER_URL);
  return {
    post: (m) => w.postMessage(m),
    onMessage: (cb) => w.on('message', cb),
    onFail: (cb) => { w.on('error', (e) => cb(e.message)); w.on('exit', () => cb('worker exited')); },
    terminate: () => w.terminate(),
  };
}

const failure = (code, message, extra = {}) => ({ ok: false, calls: [], logs: [], error: { code, message }, ...extra });

/**
 * Sandbox: static check → fresh isolated worker → bounded execution → commands back as plain data.
 * A runaway loop is killed by terminating the worker after `timeoutMs` (a Worker cannot be interrupted any other way).
 */
export function createSandbox(options = {}) {
  const budget = { ...DEFAULT_BUDGET, ...options };
  return {
    budget,
    async run({ code, view, seed }) {
      const check = validateSource(code);
      if (!check.ok) return failure('SAFETY_VIOLATION', check.violations.map((v) => v.message).join('\n'), { violations: check.violations });

      const worker = await spawn();
      return new Promise((resolve) => {
        let done = false;
        const finish = (r) => { if (done) return; done = true; clearTimeout(timer); worker.terminate(); resolve(r); };
        const timer = setTimeout(
          () => finish(failure('EXECUTION_TIMEOUT', `Your code ran longer than ${budget.timeoutMs} ms. Check for a loop that never ends.`)),
          budget.timeoutMs,
        );
        worker.onMessage((r) => finish(r));
        worker.onFail((msg) => finish(failure('WORKER_ERROR', msg)));
        worker.post({ type: 'run', code, view, seed, budget });
      });
    },
  };
}
