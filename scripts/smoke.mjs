// Real-browser smoke test (needs Playwright + Chromium): worker sandbox, lessons, replay, IndexedDB saves, CSP.
import { chromium } from 'playwright';
import { start } from './serve.mjs';

const server = await start(8123);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) problems.push(msg); };

await page.goto('http://localhost:8123/');
await page.click('#run');
await page.waitForFunction(() => document.querySelector('#feedback .pass'), null, { timeout: 15000 });
check((await page.textContent('#feedback')).includes('Lesson passed'), 'lesson 1 starter passes in a real Worker');
check((await page.textContent('#events')).includes('resource.gathered'), 'event log shows gathered resource');
check((await page.textContent('#stock')).includes('wood 10'), 'stock shows 10 wood');

await page.click('#replay');
await page.waitForFunction(() => document.querySelector('#replayOut').textContent.length > 0);
check((await page.textContent('#replayOut')).includes('Replay matches'), 'replay verifies in the browser');

await page.click('#save');
await page.waitForFunction(() => document.querySelector('#replayOut').textContent.includes('Saved'));
await page.click('#load');
await page.waitForFunction(() => document.querySelector('#replayOut').textContent.includes('Loaded'));
check(true, 'IndexedDB save + load round-trip');

await page.fill('#code', 'while (true) {}');
await page.click('#run');
await page.waitForFunction(() => document.querySelector('#feedback .fail'), null, { timeout: 15000 });
check((await page.textContent('#feedback')).includes('EXECUTION_TIMEOUT'), 'infinite loop is stopped in the browser');

await page.fill('#code', 'fetch("http://example.com")');
await page.click('#run');
await page.waitForFunction(() => document.querySelector('#feedback')?.textContent.includes('SAFETY_VIOLATION'));
check(true, 'forbidden call is rejected before it runs');

await page.selectOption('#lesson', 'm1_repair_fence');
await page.click('#run');
await page.waitForFunction(() => document.querySelector('#feedback .pass'), null, { timeout: 15000 });
await page.screenshot({ path: process.argv[2] ?? 'smoke.png' });
check((await page.textContent('#feedback')).includes('Lesson passed'), 'repair-fence lesson passes; fence redraws');

await browser.close();
server.close();
if (problems.length) { console.error('\nProblems:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('\nSmoke test OK');
