import { chromium } from 'playwright';
import { start } from './scripts/serve.mjs';

const server = await start(8123);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  console.log('START');
  await page.goto('http://localhost:8123/', { waitUntil: 'load', timeout: 30000 });
  console.log('TITLE', await page.title());
  console.log('RUN_COUNT', await page.locator('#run').count());
} catch (e) {
  console.log('ERR', e && e.stack ? e.stack : String(e));
} finally {
  console.log('CLOSE');
  await browser.close();
  server.close();
}
