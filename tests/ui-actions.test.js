import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim, sandbox } from './helpers.js';
import { buildingActionList, survivorActionList, addressSurvivor, actionButtons } from '../src/app/ui/actions.js';

const find = (list, id) => list.find((a) => a.id === id);

test('building buttons mirror real state: damaged enables Repair, full health disables it', () => {
  const sim = newSim(); const view = sim.studentView();
  const b = view.buildings.find((x) => x.type !== 'fence' && x.health < x.maxHealth) ?? null;
  const any = view.buildings.find((x) => x.type !== 'fence');
  const list = buildingActionList(b ?? any, view);
  const repair = find(list, 'repair');
  assert.equal(repair.enabled, b ? (view.base.wood > 0) : false);
  assert.match(repair.snippet, /^survivor\.repair\(/);
});

test('every enabled building and survivor snippet runs through the sandbox', async () => {
  const sim = newSim(); const view = sim.studentView();
  const lists = [...view.buildings.flatMap((b) => buildingActionList(b, view)), ...view.survivors.flatMap((s) => survivorActionList(s, view))];
  assert.ok(lists.length > 0);
  for (const a of lists.filter((x) => x.enabled)) {
    const r = await sandbox.run({ code: a.snippet, view: sim.studentView(), seed: 1 });
    assert.equal(r.ok, true, `${a.id}: ${JSON.stringify(r.error ?? r)}`);
  }
});

test('survivor buttons: Stop needs a task, Deposit needs a load, disabled ones explain why', () => {
  const view = newSim().studentView(); const s = view.survivors[0];
  const list = survivorActionList({ ...s, task: null, queued: 0, carry: { load: 0 } }, view);
  assert.equal(find(list, 'stop').enabled, false);
  assert.equal(find(list, 'deposit').enabled, false);
  assert.ok(list.filter((a) => !a.enabled).every((a) => a.reason.length > 0));
  assert.equal(find(survivorActionList({ ...s, task: { type: 'gather' } }, view), 'stop').enabled, true);
});

test('addressSurvivor: first survivor stays plain, others become survivors[i]', () => {
  const view = { survivors: [{ id: 'a' }, { id: 'b' }] };
  assert.equal(addressSurvivor('survivor.eat();', view, 'a'), 'survivor.eat();');
  assert.equal(addressSurvivor('survivor.eat();', view, 'b'), 'survivors[1].eat();');
});

test('actionButtons only insert code (no direct state change) and escape the snippet', () => {
  const html = actionButtons([{ id: 'x', label: 'X', snippet: 'a("b");', enabled: false, reason: 'no' }]);
  assert.match(html, /data-action="insert"/); assert.match(html, /disabled/); assert.match(html, /&quot;b&quot;/);
});
