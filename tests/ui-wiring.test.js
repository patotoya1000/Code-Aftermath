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
    dataset: {},
    classList: { toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : on ? classes.add(c) : classes.delete(c)), add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    addEventListener: (t, fn) => { (listeners[t] ??= []).push(fn); },
    fire: async (t, ev = {}) => { for (const fn of listeners[t] ?? []) await fn(ev); },
    focus() {}, getContext: () => ctx, getBoundingClientRect: () => ({ width: 960, height: 640, left: 0, top: 0 }),
  };
}

test('main screen: real play/pause/speed controls, code goes through sandbox, the world runs on its own', { concurrency: false }, async () => {
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
  assert.match(els['inspector-card'].innerHTML, /Stop reason: TARGET_REACHED/);
  assert.match(els['tutor-content'].innerHTML, /Relevant commands/i);
  assert.match(els['tutor-content'].innerHTML, /data-action="open-book" data-entry="command\.(eat|drink|rest|gather)"/);

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
  assert.match(card, /Needs/); assert.match(card, /Skills/); assert.match(card, /Carrying 0 \/ 60 wt/);
  assert.equal(/22 ?kg|Encumbrance: (Light|Heavy|Moderate)/.test(card), false);
  assert.match(card, /Crafting/, 'crafting is a real skill since O12 (workshop), listed from the definitions like every other skill');

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
  assert.match(els['lesson-instructions'].innerHTML, /data-action="open-book" data-entry="command\.(rest|gather)"/);
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

test('mobile layout: narrow screens expose tabbed panels for world, code, book, inspect and lessons', { concurrency: false }, async () => {
  const els = Object.fromEntries(ids.map((i) => [i, makeEl(i)]));
  const docListeners = {};
  globalThis.document = { getElementById: (i) => els[i] ?? null, createElement: () => makeEl('c'), addEventListener: (t, fn) => { (docListeners[t] ??= []).push(fn); }, body: { classList: { toggle() {} } } };
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, innerWidth: 480, matchMedia: () => ({ matches: true, addListener() {}, removeListener() {} }) };
  globalThis.location = { search: '' };
  globalThis.requestAnimationFrame = () => 0;
  await import('../src/app/mainscreen.js?mobile');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(els['mobile-tabs'].style.display, 'flex');
  assert.equal(els['mobile-tab-world'].classList.contains('active'), true);
  assert.equal(els['mobile-tab-inspect'].id, 'mobile-tab-inspect');
  assert.equal(els['mobile-tab-lessons'].id, 'mobile-tab-lessons');
});

test('codebook UI: opens from BOOK, searches, shows an API-built entry, inserts the example, links rejected commands', { concurrency: false }, async () => {
  const els = Object.fromEntries(ids.map((i) => [i, makeEl(i)]));
  const docListeners = {};
  globalThis.document = { getElementById: (i) => els[i] ?? null, createElement: () => makeEl('c'), addEventListener: (t, fn) => { (docListeners[t] ??= []).push(fn); }, body: { classList: { toggle() {} } } };
  globalThis.window = { devicePixelRatio: 1, addEventListener() {} };
  globalThis.location = { search: '' };
  globalThis.requestAnimationFrame = () => 0;
  await import('../src/app/mainscreen.js?codebook');
  await new Promise((r) => setTimeout(r, 50));
  const click = (action, extra = {}) => ({ target: { closest: () => ({ dataset: { action, ...extra } }) } });
  const delegated = async (action, extra) => { for (const fn of docListeners.click) await fn(click(action, extra)); };

  assert.match(els['code-api-list'].innerHTML, /survivor\.gather\(resource/, 'the compact API list is built from the Codebook');
  assert.match(els['code-api-list'].innerHTML, /data-entry="command\.gather"/);
  assert.notEqual(els['codebook-panel'].style.display, 'flex');
  await els['btn-book'].fire('click');
  assert.equal(els['codebook-panel'].style.display, 'flex');
  assert.match(els['codebook-nav'].innerHTML, /Getting Started/);
  await delegated('open-book', { entry: 'command.gather' });
  assert.match(els['codebook-entry'].innerHTML, /survivor\.gather\(\)/);
  assert.match(els['codebook-entry'].innerHTML, /Why it can stop/);
  assert.match(els['codebook-entry'].innerHTML, /data-entry="term\.STORAGE_FULL"/);

  els['codebook-search'].value = 'spoil';
  await els['codebook-search'].fire('input');
  assert.match(els['codebook-nav'].innerHTML, /perishables/i);
  els['codebook-search'].value = '<script>';
  await els['codebook-search'].fire('input');
  assert.equal(/<script>/.test(els['codebook-nav'].innerHTML), false, 'search text is never injected as HTML');

  els['code-editor'].value = 'survivor.rest(5);';
  await delegated('insert-example', { entry: 'command.gather' });
  assert.equal(els['code-editor'].value, 'survivor.rest(5);\nsurvivor.gather("wood", 20, 60);\n');
  assert.equal(els['codebook-panel'].style.display, 'none', 'inserting closes the book so the editor is visible');

  els['code-api-search'].value = 'water';
  await els['code-api-search'].fire('input');
  assert.match(els['code-api-list'].innerHTML, /well\.water|gather/);

  els['code-editor'].value = 'survivor.gather("wood", 99);';
  await els['btn-run-code'].fire('click');
  assert.match(els['code-commands'].innerHTML, /data-action="open-book" data-entry="command\.gather"/, 'a rejected command links to its Codebook entry');
});

const css = readFileSync(new URL('../src/app/mainscreen.css', import.meta.url), 'utf8');

test('cmd hints stay in a fixed-height horizontally scrollable row', () => {
  assert.match(css, /#cmd-hints\s*\{[^}]*height:\s*30px[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*hidden[^}]*flex-wrap:\s*nowrap/s);
  assert.match(css, /#cmd-hints\s+\.hint-chip\s*\{[^}]*flex:\s*0\s+0\s+auto[^}]*white-space:\s*nowrap/s);
});
