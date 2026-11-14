// Real-browser smoke test (needs Playwright + Chromium): main screen, Worker sandbox, real-time clock, renderer, CSP.
import { chromium } from 'playwright';
import { start } from './serve.mjs';

const server = await start(8123);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) problems.push(msg); };
const text = (sel) => page.textContent(sel);

await page.goto('http://localhost:8123/');
await page.waitForFunction(() => document.querySelector('#clock-label')?.textContent.includes('PAUSED'));
check((await text('#clock-detail')).includes('STRATEGY 10/10'), 'clock bar shows 10 strategy points and starts paused');
check(await page.$('#btn-next-turn') === null && await page.$('#btn-play') !== null && await page.$('#btn-speed') !== null, 'turn button is gone; play and speed controls exist');
check(await page.locator('#cmd-bar button:disabled').count() === 7, 'all future controls are disabled');

await page.click('#btn-code');
await page.fill('#code-editor', 'survivor.gather("wood", 5, 5);');
await page.click('#btn-run-code');
await page.waitForFunction(() => document.querySelector('#code-execution-result')?.textContent.includes('sent'), null, { timeout: 15000 });
check((await text('#code-execution-result')).includes('1 command(s) sent'), 'code runs in the Worker and the command reaches the live world');
check((await text('#clock-label')).includes('RUNNING'), 'running code resumes the clock');

await page.fill('#code-editor', 'while (true) {}');
await page.click('#btn-run-code');
await page.waitForFunction(() => document.querySelector('#code-execution-result')?.textContent.includes('never finished'), null, { timeout: 15000 });
check(true, 'infinite loop is stopped by the Worker timeout');

await page.fill('#code-editor', 'fetch("http://example.com")');
await page.click('#btn-run-code');
await page.waitForFunction(() => document.querySelector('#code-execution-result')?.textContent.includes('fetch'));
check(true, 'forbidden call is rejected before it runs');

await page.click('#code-close'); // the code panel is a full-screen overlay; close it like a user would
await page.click('#btn-speed'); await page.click('#btn-speed'); // 4x so the check does not take long
await page.waitForFunction(() => document.querySelector('#event-feed')?.textContent.includes('TARGET_REACHED'), null, { timeout: 45000 });
check((await text('#event-feed')).includes('+5 wood'), 'the world runs on its own and reports the result in the event feed');
await page.click('#btn-play');
check((await text('#clock-label')).includes('PAUSED'), 'PAUSE freezes the clock');

const box = await page.locator('#map-canvas').boundingBox();
await page.screenshot({ path: process.argv[2] ?? 'smoke.png' });
check(box.width > 200 && box.height > 200, 'map canvas is visible');
const shell = await page.locator('#app-shell').boundingBox();
const bar = await page.locator('#top-bar').boundingBox();
check(shell.y >= bar.y + bar.height - 1, 'game shell starts below the header (nothing hidden underneath it)');
check(box.width > 400, 'map uses the full world column, not a narrow strip');

// I2: the gate is a real, selectable world object, and the code hint the UI shows for it actually runs
const t = Math.min(box.width / 24, box.height / 16);
const ox = box.x + (box.width - 24 * t) / 2; const oy = box.y + (box.height - 16 * t) / 2;
await page.mouse.click(ox + 16.5 * t, oy + 7.5 * t); // gate tile (16, 7)
check((await text('#inspector-card')).includes('Gate'), 'clicking the gate selects it');
check((await text('#inspector-card')).includes('survivor.repair(gate)'), 'inspector hint names the gate by id');
await page.click('#btn-code');
await page.fill('#code-editor', 'survivor.repair(gate);');
await page.click('#btn-run-code');
await page.waitForFunction(() => document.querySelector('#code-execution-result')?.textContent.includes('sent'), null, { timeout: 15000 });
check((await text('#code-execution-result')).includes('1 command(s) sent'), 'repair(gate) runs with a building selected');

// Stabilization pass: shortcuts never eat typing, lesson buttons work under the CSP, save/load round-trips
const panelOpen = () => page.evaluate(() => document.querySelector('#code-panel')?.classList.contains('open'));
if (!(await panelOpen())) await page.click('#btn-code');
await page.focus('#code-editor');
await page.keyboard.press('End');
await page.keyboard.type('l L ');
check(await page.evaluate(() => getComputedStyle(document.querySelector('#lesson-player-panel')).display) === 'none', 'typing the letter "l" in the editor does not open lesson mode');
await page.click('#code-close');
await page.click('#btn-lessons');
await page.waitForSelector('[data-action="start-lesson"]');
await page.click('[data-action="start-lesson"]'); // first lesson
await page.waitForFunction(() => document.querySelector('#lesson-instructions')?.textContent.includes('Goals'));
check(true, 'lesson buttons respond (no inline handlers needed under the CSP)');
await page.click('#btn-run-code');
await page.waitForSelector('#lesson-result .lesson-result-header', { timeout: 15000 });
check((await text('#lesson-result .lesson-result-header')).includes('Passed'), 'the first lesson passes with its starter code');
await page.click('[data-action="exit-lesson"]');
check(await page.evaluate(() => getComputedStyle(document.querySelector('#lesson-player-panel')).display) === 'none', 'exit lesson closes the lesson player');
if (await panelOpen()) await page.click('#code-close');
await page.click('#btn-save');
await page.waitForFunction(() => document.querySelector('#event-feed')?.textContent.includes('Saved: tick'));
await page.click('#btn-restart');
await page.click('#btn-load');
await page.waitForFunction(() => document.querySelector('#event-feed')?.textContent.includes('Loaded: tick'));
check(!(await text('#clock-detail')).includes('TICK 0'), 'LOAD brings the saved session back (restart had reset it to tick 0)');

<<<<<<< HEAD
=======
// R4a: a policy set from the editor shows on the survivor card and reacts in the live world (interrupt → eat → resume)
await page.click('#btn-restart');
if (!(await panelOpen())) await page.click('#btn-code');
await page.fill('#code-editor', 'survivor.policy("eat", { below: 100 });\nsurvivor.gather("wood", 5, 15);');
await page.click('#btn-run-code');
await page.waitForFunction(() => document.querySelector('#code-execution-result')?.textContent.includes('2 command(s) sent'), null, { timeout: 15000 });
await page.click('#code-close');
if ((await text('#clock-label')).includes('PAUSED')) await page.click('#btn-play');
await page.waitForFunction(() => /policy eat fired/.test(document.querySelector('#event-feed')?.textContent ?? ''), null, { timeout: 45000 });
check((await text('#inspector-card')).includes('eat: below 100'), 'the survivor card lists the active policy');
await page.waitForFunction(() => /resumed gather|TARGET_REACHED/.test(document.querySelector('#event-feed')?.textContent ?? ''), null, { timeout: 60000 });
check(true, 'the policy fired in the live world and the job carried on');

>>>>>>> 29b1943 (docs: document real-time policies, save/load, and phase tracker)
await browser.close();
server.close();
if (problems.length) { console.error('\nProblems:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('\nSmoke test OK');
