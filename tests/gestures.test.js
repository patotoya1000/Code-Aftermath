import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindMapGestures, DRAG_THRESHOLD, WHEEL_STEP } from '../src/app/ui/gestures.js';

// UI-R1: the map moves with the pointer (drag, wheel, pinch) without ever picking by accident. Fakes only: no DOM, no renderer.
function rig({ hit = null } = {}) {
  const handlers = {}; const calls = []; const classes = new Set();
  const canvas = {
    addEventListener: (t, fn) => { handlers[t] = fn; },
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 }),
    setPointerCapture() {}, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
  };
  const camera = { panPixels: (dx, dy) => calls.push(['pan', dx, dy]), zoomAt: (f, x, y) => calls.push(['zoom', f, x, y]), resetCamera: () => calls.push(['reset']) };
  const out = { picked: [], empty: 0 };
  bindMapGestures(canvas, { camera, pick: () => hit, onHit: (h) => out.picked.push(h), onEmpty: () => { out.empty += 1; } });
  const ptr = (id, x, y) => ({ pointerId: id, pointerType: 'touch', button: 0, clientX: x + 10, clientY: y + 20 }); // canvas-local x, y
  return { handlers, calls, classes, out, ptr };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('a drag pans by the pointer movement, shows the grabbing cursor and does not pick on release', async () => {
  const r = rig({ hit: { kind: 'building', id: 'hq' } });
  r.handlers.pointerdown(r.ptr(1, 100, 100));
  r.handlers.pointermove(r.ptr(1, 140, 130));
  r.handlers.pointermove(r.ptr(1, 150, 150));
  assert.deepEqual(r.calls, [['pan', 40, 30], ['pan', 10, 20]]);
  assert.equal(r.classes.has('panning'), true);
  r.handlers.pointerup(r.ptr(1, 150, 150));
  r.handlers.click(r.ptr(1, 150, 150)); // the browser still sends a click after a drag
  assert.deepEqual(r.out.picked, [], 'a drag is not a click');
  assert.equal(r.classes.has('panning'), false);
  await tick();
  r.handlers.click(r.ptr(1, 150, 150)); // a later, real click works again
  assert.equal(r.out.picked.length, 1);
});

test('a press that barely moves is still a click: it picks, or reports empty ground', () => {
  const hit = rig({ hit: { kind: 'npc', id: 'survivor_1' } });
  hit.handlers.pointerdown(hit.ptr(1, 50, 50)); hit.handlers.pointermove(hit.ptr(1, 50 + DRAG_THRESHOLD - 1, 50)); hit.handlers.pointerup(hit.ptr(1, 50, 50));
  hit.handlers.click(hit.ptr(1, 50, 50));
  assert.deepEqual(hit.calls, [], 'jitter below the threshold does not pan');
  assert.deepEqual(hit.out.picked, [{ kind: 'npc', id: 'survivor_1' }]);
  const none = rig({ hit: null });
  none.handlers.click(none.ptr(1, 5, 5));
  assert.equal(none.out.empty, 1, 'a click on bare ground tells the screen to close the card');
});

test('wheel zooms at the pointer (in on scroll up, out on scroll down) and stops the page from scrolling', () => {
  const r = rig();
  let prevented = false;
  r.handlers.wheel({ clientX: 110, clientY: 120, deltaY: -100, preventDefault() { prevented = true; } });
  r.handlers.wheel({ clientX: 110, clientY: 120, deltaY: 100, preventDefault() {} });
  assert.equal(prevented, true);
  assert.deepEqual(r.calls, [['zoom', WHEEL_STEP, 100, 100], ['zoom', 1 / WHEEL_STEP, 100, 100]]);
});

test('two fingers pinch-zoom around their midpoint and never count as a click', () => {
  const r = rig({ hit: { kind: 'node', id: 'tree_1' } });
  r.handlers.pointerdown(r.ptr(1, 100, 100)); r.handlers.pointerdown(r.ptr(2, 200, 100));
  r.handlers.pointermove(r.ptr(2, 300, 100)); // fingers 100 apart → 200 apart
  assert.equal(r.calls.length, 1);
  const [kind, factor, x, y] = r.calls[0];
  assert.equal(kind, 'zoom'); assert.equal(factor, 2); assert.equal(x, 200); assert.equal(y, 100);
  r.handlers.pointerup(r.ptr(2, 300, 100)); r.handlers.pointerup(r.ptr(1, 100, 100));
  r.handlers.click(r.ptr(1, 100, 100));
  assert.deepEqual(r.out.picked, []);
});

test('double-click resets the view on bare ground only; the secondary mouse button never drags', () => {
  const ground = rig({ hit: null }); ground.handlers.dblclick(ground.ptr(1, 5, 5));
  assert.deepEqual(ground.calls, [['reset']]);
  const onThing = rig({ hit: { kind: 'building', id: 'hq' } }); onThing.handlers.dblclick(onThing.ptr(1, 5, 5));
  assert.deepEqual(onThing.calls, [], 'double-clicking a building does not move the camera');
  const right = rig();
  right.handlers.pointerdown({ pointerId: 1, pointerType: 'mouse', button: 2, clientX: 0, clientY: 0 });
  right.handlers.pointermove({ pointerId: 1, pointerType: 'mouse', button: 2, clientX: 80, clientY: 80 });
  assert.deepEqual(right.calls, []);
});
