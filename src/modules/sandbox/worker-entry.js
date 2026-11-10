// Worker entry: works as a browser module Worker and as a Node worker_thread (used by tests/CI).
import { runLearnerCode } from './runtime.js';

const isNode = typeof process !== 'undefined' && !!process.versions?.node && typeof self === 'undefined';
let post;
let onMessage;
if (isNode) {
  const wt = await import('node:worker_threads');
  post = (m) => wt.parentPort.postMessage(m);
  onMessage = (cb) => wt.parentPort.on('message', cb);
} else {
  post = (m) => self.postMessage(m);
  onMessage = (cb) => self.addEventListener('message', (e) => cb(e.data));
}

onMessage((msg) => {
  if (msg?.type !== 'run') return;
  post(runLearnerCode(msg));
});
