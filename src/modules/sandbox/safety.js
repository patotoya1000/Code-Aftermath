// Static pre-check (Parser/Safety Validator). This is a friendly first gate with clear messages; the real
// containment is the isolated Worker (no DOM/storage) plus hardening inside it — see runtime.js.
export const MAX_SOURCE_CHARS = 10000;

const FORBIDDEN = [
  'eval', 'Function', 'constructor', '__proto__', 'prototype', 'import', 'require', 'process',
  'globalThis', 'window', 'self', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts',
  'postMessage', 'Worker', 'setTimeout', 'setInterval', 'Reflect', 'Proxy', 'Atomics', 'SharedArrayBuffer',
  'WebAssembly', 'indexedDB', 'localStorage', 'sessionStorage', 'navigator', 'Date', 'performance', 'async', 'await',
];
const RE = new RegExp(`(?<![\\w$])(${FORBIDDEN.join('|')})(?![\\w$])`, 'g');

export function validateSource(code) {
  const violations = [];
  if (typeof code !== 'string') return { ok: false, violations: [{ line: 0, token: '', message: 'Code must be text.' }] };
  if (code.length > MAX_SOURCE_CHARS) violations.push({ line: 0, token: '', message: `Code is too long (max ${MAX_SOURCE_CHARS} characters).` });
  const lines = code.split('\n');
  lines.forEach((text, i) => {
    for (const m of text.matchAll(RE)) {
      const why = m[1] === 'async' || m[1] === 'await'
        ? 'waiting for future game state is not allowed; queue commands instead'
        : 'not available to survivor code';
      violations.push({ line: i + 1, token: m[1], message: `"${m[1]}" is ${why} (line ${i + 1}).` });
    }
    if (/\\u|\\x/.test(text)) violations.push({ line: i + 1, token: '\\', message: `Escape sequences like \\u or \\x are not allowed (line ${i + 1}).` });
  });
  return { ok: violations.length === 0, violations };
}
