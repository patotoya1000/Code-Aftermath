import { chromium } from 'playwright';
import { start } from './scripts/serve.mjs';

const server = await start(8123);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  await page.goto('http://localhost:8123/', { waitUntil: 'load', timeout: 30000 });
  await page.click('#run');
  await page.waitForTimeout(5000);
  console.log('FEEDBACK_TEXT:', await page.locator('#feedback').innerText());
  console.log('REPLAYOUT:', await page.locator('#replayOut').innerText());
  console.log('CONSOLE_ERRORS:', await page.evaluate(() => window.__errors || 'none'));
  const msg = await page.locator('#feedback').textContent();
  console.log('TEXT', msg);
} catch (e) {
  console.log('ERR', e && e.stack ? e.stack : String(e));
} finally {
  await browser.close();
  server.close();
}
