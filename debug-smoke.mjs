import { chromium } from 'playwright';
import { start } from './scripts/serve.mjs';

const server = await start(8123);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on('console', (m) => console.log('BROWSER_CONSOLE', m.type(), m.text()));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

try {
  await page.goto('http://localhost:8123/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('TITLE', await page.title());
  console.log('RUN_COUNT', await page.locator('#run').count());
  console.log('BODY_TEXT', await page.locator('body').innerText());
  await page.click('#run');
  await page.waitForTimeout(5000);
  console.log('FEEDBACK', await page.locator('#feedback').innerText());
  console.log('REPLAYOUT', await page.locator('#replayOut').innerText());
} catch (e) {
  console.log('TOPLEVEL_ERROR', e && e.stack ? e.stack : String(e));
} finally {
  await browser.close();
  server.close();
}
