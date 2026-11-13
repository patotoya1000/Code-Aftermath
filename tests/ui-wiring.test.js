import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Browser-free wiring check: a tiny fake DOM drives src/app/mainscreen.js exactly as index.html would.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);

function makeEl(id) {
  const listeners = {};
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  const classes = new Set();
  return {
    id, innerHTML: '', textContent: '', value: '', className: '', style: {}, disabled: false, width: 960, height: 640,
    classList: { toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : on ? classes.add(c) : classes.delete(c)), add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    addEventListener: (t, fn) => { (listeners[t] ??= []).push(fn); },
    fire: async (t, ev = {}) => { for (const fn of listeners[t] ?? []) await fn(ev); },
    focus() {}, getContext: () => ctx, getBoundingClientRect: () => ({ width: 960, height: 640, left: 0, top: 0 }),
  };
}

test('main screen: real play/pause/speed controls, code goes through sandbox, the world runs on its own', async () => {
  const els = Object.fromEntries(ids.map((i) => [i, makeEl(i)]));
  els['code-editor'].value = 'survivor.gather("wood", 5, 5);';
  const docListeners = {};
  globalThis.document = { getElementById: (i) => els[i] ?? null, createElement: () => makeEl('c'), addEventListener: (t, fn) => { (docListeners[t] ??= []).push(fn); } };
  globalThis.window = { devicePixelRatio: 1, addEventListener() {} };
  globalThis.location = { search: '' };
  let frame = null; // the page's animation-frame callback; the test plays the role of the browser
  globalThis.requestAnimationFrame = (fn) => { frame = fn; return 0; };
  await import('../src/app/mainscreen.js');
  await new Promise((r) => setTimeout(r, 50));
  let now = 1000;
  const run = (ms, step = 16) => { for (let t = 0; t < ms; t += step) { now += step; frame(now); } };

  // Turns are gone; the controls are real. Starts paused so nothing drains while the learner reads.
  assert.equal(html.includes('btn-next-turn'), false);
  assert.match(els['clock-label'].textContent, /PAUSED · 1×/);
  assert.match(els['clock-detail'].textContent, /STRATEGY 10\/10 · TICK 0/);
  run(2000);
  assert.match(els['clock-detail'].textContent, /TICK 0\b/, 'paused: time does not move');

  // C3: every future control is disabled and labelled
  for (const id of ['btn-assign', 'btn-task', 'btn-build', 'btn-survivors', 'btn-research', 'btn-menu', 'btn-settings']) {
    assert.match(html, new RegExp(`id="${id}" disabled`), `${id} must be disabled`);
  }
  assert.equal((html.match(/class="soon"/g) ?? []).length, 7);

  // Running code sends the command to the live world, costs a strategy point, and resumes the clock
  await els['btn-run-code'].fire('click');
  assert.match(els['code-execution-result'].textContent, /1 command\(s\) sent/);
  assert.match(els['clock-detail'].textContent, /STRATEGY 9\/10/);
  assert.match(els['clock-label'].textContent, /RUNNING/);

  // sandbox errors are shown as friendly structured text and spend nothing
  els['code-editor'].value = 'fetch("x")';
  await els['btn-run-code'].fire('click');
  assert.match(els['code-execution-result'].textContent, /fetch/);
  assert.match(els['clock-detail'].textContent, /STRATEGY 9\/10/, 'failed run spends nothing');

  // the simulation advances by itself as frames arrive, and the result shows up without any button
  run(30_000);
  assert.match(els['resources'].innerHTML, /<b>5<\/b>/, 'wood stock shows 5');
  assert.match(els['event-feed'].innerHTML, /\+5 wood/);
  assert.match(els['event-feed'].innerHTML, /stopped gather: TARGET_REACHED/);
  assert.match(els['inspector-card'].innerHTML, /Last: gather completed — TARGET_REACHED/);

  // pause freezes time; speed button cycles through the data-defined speeds
  await els['btn-play'].fire('click');
  assert.match(els['clock-label'].textContent, /PAUSED/);
  const frozen = els['clock-detail'].textContent.match(/TICK (\d+)/)[1];
  run(2000);
  assert.equal(els['clock-detail'].textContent.match(/TICK (\d+)/)[1], frozen);
  await els['btn-speed'].fire('click');
  assert.match(els['btn-speed'].textContent, /2×/);
  assert.match(els['clock-label'].textContent, /2×/);

  // C6/C8: card is projection-driven; no hardcoded carry numbers
  const card = els['inspector-card'].innerHTML;
  assert.match(card, /Needs/); assert.match(card, /Skills/); assert.match(card, /not active yet/);
  assert.equal(/22 ?kg|Encumbrance: (Light|Heavy|Moderate)/.test(card), false);
  assert.equal(/Crafting/.test(card), false, 'crafting is not an attribute');

  // Shortcuts never eat typing: the letter "l" in the editor must not open lesson mode; Alt+L does (it used to be bare "l")
  globalThis.document.activeElement = { tagName: 'TEXTAREA' };
  for (const fn of docListeners.keydown) await fn({ key: 'l', altKey: false, preventDefault() {} });
  for (const fn of docListeners.keydown) await fn({ key: ' ', altKey: false, preventDefault() {} });
  assert.notEqual(els['lesson-player-panel'].style.display, 'block', 'typing "l" did not open lesson mode');
  assert.match(els['clock-label'].textContent, /PAUSED/, 'typing a space in the editor did not toggle the clock');
  globalThis.document.activeElement = null;
  for (const fn of docListeners.keydown) await fn({ key: 'l', altKey: true, preventDefault() {} });
  assert.equal(els['lesson-player-panel'].style.display, 'block', 'Alt+L opens lesson mode');
  // lesson buttons are plain data-action elements (inline onclick is blocked by the CSP) handled by one delegated listener
  const click = (action, extra = {}) => ({ target: { closest: () => ({ dataset: { action, ...extra } }) } });
  for (const fn of docListeners.click) await fn(click('start-lesson', { lesson: 'm1_rest_first' }));
  assert.match(els['lesson-instructions'].innerHTML, /Rest First/);
  assert.match(els['clock-detail'].textContent, /TICK \d+/, 'free-play world was not reset by opening a lesson');
  for (const fn of docListeners.click) await fn(click('exit-lesson'));
  assert.equal(els['lesson-player-panel'].style.display, 'none');

  // save / load buttons round-trip the live session
  els['code-editor'].value = 'survivor.rest(5);';
  await els['btn-run-code'].fire('click');
  const tickBeforeSave = els['clock-detail'].textContent.match(/TICK (\d+)/)[1];
  await els['btn-save'].fire('click');
  assert.match(els['event-feed'].innerHTML, /Saved: tick/);
  await els['btn-restart'].fire('click');
  assert.match(els['clock-detail'].textContent, /TICK 0\b/);
  await els['btn-load'].fire('click');
  assert.match(els['event-feed'].innerHTML, /Loaded: tick/);
  assert.equal(els['clock-detail'].textContent.match(/TICK (\d+)/)[1], tickBeforeSave, 'loaded world is back at the saved tick');

  // restart gives a fresh scenario
  await els['btn-restart'].fire('click');
  assert.match(els['clock-detail'].textContent, /STRATEGY 10\/10 · TICK 0/);
});
