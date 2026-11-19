import { chromium } from 'playwright';
import { start } from '../serve.mjs';

const server = await start(8123);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (m) => console.log('console', m.type(), m.text()));
page.on('pageerror', (e) => console.log('pageerror', e.message));

try {
  await page.goto('http://localhost:8123/', { waitUntil: 'load', timeout: 30000 });
  const result = await page.evaluate(async () => {
    try {
      const { createApp } = await import('../../src/app/index.js');
      const app = createApp();
      const out = await app.runLesson('m1_first_wood', 'survivor.gather("wood", 10);');
      return {
        passed: out.evaluation.passed,
        feedback: out.evaluation.feedback,
        commands: out.attempt.commands.length,
        ok: out.attempt.ok,
      };
    } catch (e) {
      return { thrown: String(e && e.stack ? e.stack : e) };
    }
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  server.close();
}
