// W1 zone bar (docs/game/21 sections 3 and 10): TOWN / OUTPOST / FRONT are camera targets derived from the wall. Presentation only: the simulation never sees them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zonesFor, activeZone, neighbourZone, ZONE_IDS } from '../src/app/ui/zones.js';
import { createViewport, centerOn } from '../src/modules/viewport/index.js';
import { newSim } from './helpers.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/app/hud/hud.css', import.meta.url), 'utf8');

test('zones: a perimeter wall gives TOWN (a panel at the west end), OUTPOST (the rectangle interior) and FRONT (east of the wall)', () => {
  const frame = newSim('stage1').renderProjection(); // wall x 6..16, y 3..12 on a 24x16 map
  const z = zonesFor(frame);
  assert.deepEqual(z.map((q) => q.id), ZONE_IDS.slice());
  const by = Object.fromEntries(z.map((q) => [q.id, q]));
  assert.equal(by.outpost.x, (7 + 15 + 1) / 2); assert.equal(by.outpost.y, (4 + 11 + 1) / 2);
  assert.ok(by.front.x > 17 && by.front.x < 24, 'FRONT is beyond the wall');
  assert.ok(by.town.x < by.outpost.x && by.outpost.x < by.front.x, 'west to east');
  assert.equal(by.town.panel, 'town'); assert.equal(by.front.panel, 'scavenge'); assert.equal(by.outpost.panel, null);
});

test('zones: a line wall puts OUTPOST west of the line and FRONT east of it', () => {
  const z = Object.fromEntries(zonesFor(newSim('stage1_line').renderProjection()).map((q) => [q.id, q]));
  assert.ok(z.outpost.x < 16 && z.front.x > 16);
  assert.equal(z.outpost.x, (0 + 15 + 1) / 2); assert.equal(z.front.x, (17 + 23 + 1) / 2); assert.equal(z.outpost.y, 8);
});

test('zones: a world without a fence has one zone covering the map; every zone centre is inside the map', () => {
  const frame = JSON.parse(JSON.stringify(newSim('stage1').renderProjection()));
  frame.buildings = frame.buildings.filter((b) => b.type !== 'fence');
  assert.deepEqual(zonesFor(frame).map((q) => q.id), ['outpost']);
  for (const id of ['stage1', 'stage1_line']) for (const q of zonesFor(newSim(id).renderProjection())) assert.ok(q.x >= 0 && q.x <= 24 && q.y >= 0 && q.y <= 16, `${id} ${q.id}`);
});

test('active zone follows the camera, and the arrows step one zone and stop at the ends', () => {
  const z = zonesFor(newSim('stage1_line').renderProjection());
  assert.equal(activeZone(z, { x: 12, y: 8 }).id, 'outpost');
  assert.equal(activeZone(z, { x: 21, y: 8 }).id, 'front');
  assert.equal(activeZone(z, { x: 0, y: 8 }).id, 'town');
  assert.equal(neighbourZone(z, 'outpost', 1).id, 'front'); assert.equal(neighbourZone(z, 'outpost', -1).id, 'town');
  assert.equal(neighbourZone(z, 'front', 1).id, 'front'); assert.equal(neighbourZone(z, 'town', -1).id, 'town');
});

test('the camera can look at every zone centre, and moving it never changes the game', () => {
  const sim = newSim('stage1'); const hash = sim.stateHash(); const frame = sim.renderProjection();
  let vp = createViewport({ map: frame.map, view: { width: 960, height: 640 } });
  for (const q of zonesFor(frame)) { vp = centerOn(vp, q.x, q.y); assert.ok(vp.center && Number.isFinite(vp.center.x)); }
  assert.equal(sim.stateHash(), hash);
});

test('markup: the zone bar and its buttons exist, nothing is disabled, and the styles are defined', () => {
  for (const id of ['zone-bar', 'zone-west', 'zone-town', 'zone-outpost', 'zone-front', 'zone-east']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(!/id="zone-[a-z]+"[^>]*disabled/.test(html));
  assert.ok(css.includes('.zone-bar'));
});
