// Zero-dependency static server for local development: `npm run serve` → http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function normalizeEntryPath(value) {
  if (!value) return '';
  const path = value.startsWith('file:') ? fileURLToPath(value) : value;
  return normalize(path).replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

export function isDirectExecutionEntry(currentUrl, argvValue = process.argv[1]) {
  if (!argvValue) return false;
  return normalizeEntryPath(currentUrl) === normalizeEntryPath(argvValue);
}

export function start(port = PORT) {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
      if (!file.startsWith(ROOT) || file.includes(`${ROOT}/tests`) || file.includes(`${ROOT}/node_modules`)) { res.writeHead(403).end('Forbidden'); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

if (isDirectExecutionEntry(import.meta.url, process.argv[1])) {
  await start();
  console.log(`CODE: AFTERMATH on http://localhost:${PORT}`);
}
