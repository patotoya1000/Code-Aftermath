import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { createAssetResolver, placeholderManifestFor } from '../src/modules/assets/index.js';
import { mountRenderer } from '../src/modules/render/index.js';
import { ledgerViolations } from '../src/modules/resources/index.js';
import { newSim, call, runUntilIdle, defs, sandbox } from './helpers.js';
import { createFreeSim, runLiveCode } from '../src/modules/session/index.js';

const clone = () => structuredClone(defs);
const rejects = (mutate, pattern) => {
  const d = clone(); mutate(d);
  assert.throws(() => createDefinitions({ scenarios: d.scenarios, buildings: d.buildings }), pattern);
};

test('stage 1 contains a ruined storehouse, a damaged gate on the fence line, and a forest with a path', () => {
  const v = newSim().studentView();
  const storage = v.buildings.find((b) => b.id === 'storage_1');
  const gate = v.buildings.find((b) => b.id === 'gate');
  assert.equal(storage.condition, 'ruined');
  assert.equal(gate.condition, 'damaged');
  assert.equal(gate.x, 16); // x2 edge of the fence bounds (6..16)
  assert.match(storage.note, /Phase I5/);
  assert.equal(storage.storageInfo, undefined, 'no pretend capacity before inventory/carry exists');
  const proj = newSim().renderProjection();
  assert.equal(proj.terrain.zones[0].label, 'Forest');
  assert.deepEqual(proj.terrain.paths[0].cells[0], [17, 7]);
  assert.equal(proj.buildings.find((b) => b.id === 'gate').name, 'Gate');
});

test('storage info is attached to every building that has a capacity table (not just HQ and tent)', () => {
  const v = newSim().studentView();
  for (const b of v.buildings) assert.equal(Boolean(b.storageInfo), Boolean(defs.buildings[b.type].storage), b.id);
  assert.equal(v.buildings.find((b) => b.id === 'hq').storageInfo.capacity.wood, 150);
});

test('layout validation: gate off the fence line, overlapping tiles and out-of-map objects are rejected', () => {
  rejects((d) => { d.scenarios.stage1.buildings.find((b) => b.id === 'gate').x = 12; }, /must sit on the fence line/);
  rejects((d) => { d.scenarios.stage1.buildings.find((b) => b.id === 'storage_1').x = 16; d.scenarios.stage1.buildings.find((b) => b.id === 'storage_1').y = 4; }, /must not sit on the fence line/);
  rejects((d) => { d.scenarios.stage1.buildings.find((b) => b.id === 'storage_1').x = 11; d.scenarios.stage1.buildings.find((b) => b.id === 'storage_1').y = 7; }, /shares a tile/);
  rejects((d) => { d.scenarios.stage1.nodes[0].x = 99; }, /outside the 24x16 map/);
  rejects((d) => { d.scenarios.stage1.terrain.paths[0].cells.push([30, 30]); }, /needs cells inside the map/);
  rejects((d) => { d.scenarios.stage1.terrain.zones[0].label = 5; }, /needs a label/);
});

test('every building type has atlas frames for all three conditions, and the resolver finds them', () => {
  const r = createAssetResolver(placeholderManifestFor(defs));
  for (const type of ['storage', 'gate']) for (const c of ['ruined', 'damaged', 'repaired']) {
    const e = r.resolveBuilding({ type, level: 1, condition: c });
    assert.equal(e.step, 1, `${type} ${c}`);
    assert.equal(e.key, `building_${type}_lv1_${c}`);
  }
});

test('renderer survives a projection with no terrain (older/minimal projections)', () => {
  const canvas = { width: 960, height: 640, getContext: () => new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } }), getBoundingClientRect: () => ({ width: 960, height: 640 }) };
  const r = mountRenderer(canvas, { manifest: placeholderManifestFor(defs), createCanvas: () => canvas });
  const proj = JSON.parse(JSON.stringify(newSim().renderProjection())); delete proj.terrain;
  assert.doesNotThrow(() => r.draw(proj));
});

test('gate and storehouse are repairable through the normal pipeline, with no double-spend', () => {
  const sim = newSim();
  call(sim, 'gather', 'wood', 20, 20); call(sim, 'gather', 'wood', 10, 10); runUntilIdle(sim);
  assert.equal(sim.studentView().base.wood, 30);
  // gate: 30/80 + 20 = 50/80 (62%) is already "repaired" (4 wood); storehouse: 15/120 → 45 → 75 (two repairs, 16 wood)
  call(sim, 'repair', 'gate'); call(sim, 'repair', 'storage_1'); call(sim, 'repair', 'storage_1'); runUntilIdle(sim);
  const v = sim.studentView();
  assert.equal(v.buildings.find((b) => b.id === 'gate').condition, 'repaired');
  assert.equal(v.buildings.find((b) => b.id === 'storage_1').condition, 'repaired');
  assert.deepEqual(ledgerViolations(sim.snapshot()), []);
  assert.equal(v.base.wood, 30 - 4 - 8 - 8, 'wood is spent exactly once per completed repair');
  assert.equal(sim.log.all().filter((e) => e.type === 'action.failed').length, 0);
});

test('learner code can name any building or node by id, exactly as the UI hints show', async () => {
  const { sim } = createFreeSim({ defs });
  for (const code of ['survivor.repair(tent_1)', 'survivor.repair(gate)', 'survivor.repair(storage_1)', 'survivor.moveTo(tree_1)', 'survivor.repair(fence)']) {
    const r = await runLiveCode({ sim, sandbox, code, actorId: 'survivor_1' });
    assert.ok(r.ok, `${code}: ${r.error?.message}`);
  }
  const bad = await runLiveCode({ sim, sandbox, code: 'tent_1.health = 999;', actorId: 'survivor_1' });
  assert.equal(bad.ok, false, 'entities stay read-only');
});
