import { start } from './scripts/serve.mjs';

const server = await start(8123);
console.log('SERVER_STARTED');
for (const url of [
  'http://localhost:8123/',
  'http://localhost:8123/src/app/browser.js',
  'http://localhost:8123/src/app/index.js',
]) {
  const res = await fetch(url);
  console.log('URL', url, 'STATUS', res.status, 'TYPE', res.headers.get('content-type'));
  console.log((await res.text()).slice(0, 200).replace(/\n/g, ' '));
}
server.close();
