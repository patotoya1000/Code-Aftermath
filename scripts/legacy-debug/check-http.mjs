import { start } from '../serve.mjs';

const server = await start(8123);
try {
  const res = await fetch('http://localhost:8123/');
  console.log('STATUS', res.status);
  console.log((await res.text()).slice(0, 200));
} finally {
  server.close();
}
