import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSim, sandbox } from './helpers.js';
import {
  SURVIVOR_TABS,
  BUILDING_DEFENCE_TABS,
  BUILDING_GENERAL_TABS,
  isDefenceBuilding,
  buildingTabsFor,
  buildSurvivorCardView,
  renderSurvivorCard,
  buildBuildingCardView,
  renderBuildingCard,
  nextTabFromKey,
} from '../src/app/ui/cards/index.js';
import { OUTPOST_ROADS, outpostRoadState } from '../src/app/ui/screens.js';
import { buildCommand } from '../src/modules/api/index.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('UI-7A & UI-7B: survivor inspector exposes survivor-only tabs with live projections and honest empty states', () => {
  const sim = newSim();
  const hashBefore = sim.stateHash();
  const view = sim.studentView();
  const card = sim.inspector(view.survivors[0].id);

  const cv = buildSurvivorCardView(card, view);
  assert.deepEqual(cv.tabs.map((t) => t.id), ['info', 'attributes', 'equipment', 'bag', 'commands']);
  assert.deepEqual(cv.tabs, SURVIVOR_TABS);
  assert.equal(cv.tabs.some((t) => ['defence', 'upgrade', 'storage'].includes(t.id)), false);

  // Info tab: Needs + Current Task, no duplicated attributes/skills
  const infoHtml = renderSurvivorCard(card, view, { showTabs: true, activeTab: 'info' });
  assert.match(infoHtml, /Needs/);
  assert.match(infoHtml, /Current Task/);
  assert.doesNotMatch(infoHtml, /<h3><span class="icon">⚡<\/span>Attributes<\/h3>/);
  assert.match(infoHtml, /data-card-tabs=/);

  // Attributes tab: Attributes, Skills, Traits & Specialization (honest empty state when no traits)
  const attrHtml = renderSurvivorCard(card, view, { showTabs: true, activeTab: 'attributes' });
  assert.match(attrHtml, /Attributes/);
  assert.match(attrHtml, /Skills/);
  assert.match(attrHtml, /No traits or specialization yet\./);

  // Equipment tab: real slots + honest empty state when nothing equipped
  const eqEmpty = renderSurvivorCard({ ...card, equipment: {} }, view, { showTabs: true, activeTab: 'equipment' });
  assert.match(eqEmpty, /Nothing equipped\./);
  assert.match(eqEmpty, /WEAPON/);
  assert.match(eqEmpty, /Empty/);

  // Bag tab: honest empty state + disabled deposit reason
  const bagHtml = renderSurvivorCard(card, view, { showTabs: true, activeTab: 'bag' });
  assert.match(bagHtml, /Bag is empty\./);
  assert.match(bagHtml, /Carrying 0 \/ 60 wt/);
  assert.match(bagHtml, /She carries nothing\./);

  // Commands tab: real actions + policies + hooks
  const cmdHtml = renderSurvivorCard(card, view, { showTabs: true, activeTab: 'commands' });
  assert.match(cmdHtml, /data-action="insert"/);
  assert.match(cmdHtml, /Policies/);
  assert.match(cmdHtml, /Hooks/);

  assert.equal(sim.stateHash(), hashBefore, 'survivor card rendering must not mutate simulation state');
});

test('UI-7C: building and defence cards expose contextual tabs and live projection data', async () => {
  const sim = newSim();
  const hashBefore = sim.stateHash();
  const view = sim.studentView();

  const hq = view.buildings.find((b) => b.type === 'hq');
  const tower = view.buildings.find((b) => b.type === 'tower');
  const fence = view.buildings.find((b) => b.type === 'fence');
  const gate = view.buildings.find((b) => b.type === 'gate');
  const kitchen = view.buildings.find((b) => b.type === 'kitchen');
  const well = view.buildings.find((b) => b.type === 'well');
  const gen = view.buildings.find((b) => b.type === 'generator');

  for (const defB of [tower, fence, gate]) {
    assert.equal(isDefenceBuilding(defB), true);
    assert.deepEqual(buildingTabsFor(defB), BUILDING_DEFENCE_TABS);
    const cv = buildBuildingCardView(defB, view);
    assert.deepEqual(cv.tabs.map((t) => t.id), ['info', 'defence', 'upgrade', 'commands']);
    assert.equal(cv.tabs.some((t) => ['storage', 'attributes', 'equipment', 'bag'].includes(t.id)), false);
  }

  for (const genB of [hq, kitchen, well, gen]) {
    assert.equal(isDefenceBuilding(genB), false);
    assert.deepEqual(buildingTabsFor(genB), BUILDING_GENERAL_TABS);
    const cv = buildBuildingCardView(genB, view);
    assert.deepEqual(cv.tabs.map((t) => t.id), ['info', 'upgrade', 'storage', 'commands']);
    assert.equal(cv.tabs.some((t) => ['defence', 'attributes', 'equipment', 'bag'].includes(t.id)), false);
  }

  // Tower Defence tab shows range, mounts, and disabled refusal reasons
  const towerDef = renderBuildingCard({
    ...tower,
    condition: 'repaired',
    health: tower.maxHealth,
    tower: {
      working: true,
      rangeBonus: 3,
      freeSlots: 1,
      posted: ['survivor_1'],
      mounts: ['minigun'],
      installed: [{ weapon: 'machine_gun', name: 'Machine Gun', status: 'NO_AMMO', hopper: 0, hopperMax: 120, ammo: 'bullets', range: 6, cooldown: 0, aim: { id: 'zombie_1', x: 25, y: 7 } }],
    },
  }, view, { showTabs: true, activeTab: 'defence' });
  assert.match(towerDef, /Range bonus: \+3 \(effective reach 9\)/);
  assert.match(towerDef, /Machine Gun/);
  assert.match(towerDef, /target zombie_1/);
  assert.match(towerDef, /Guarding only works during a wave\./);

  // Fence & Gate Defence tabs show armor and gate state
  const gateDef = renderBuildingCard(gate, view, { showTabs: true, activeTab: 'defence' });
  assert.match(gateDef, /Armor/);
  assert.match(gateDef, /Gate state/);

  // HQ Storage & Upgrade tabs
  const hqStorage = renderBuildingCard(hq, view, { showTabs: true, activeTab: 'storage' });
  assert.match(hqStorage, /Storage/);
  const maxUpgrade = renderBuildingCard({ ...hq, upgrade: null }, view, { showTabs: true, activeTab: 'upgrade' });
  assert.match(maxUpgrade, /Top level reached/);

  // Kitchen Production tab
  const kitchenStorage = renderBuildingCard(kitchen, view, { showTabs: true, activeTab: 'storage' });
  assert.match(kitchenStorage, /Production/);
  assert.match(kitchenStorage, /bread/);

  // Enabled commands on building cards execute cleanly in sandbox
  const hqCv = buildBuildingCardView(hq, view);
  for (const a of hqCv.actions.filter((x) => x.enabled)) {
    const res = await sandbox.run({ code: a.snippet, view: sim.studentView(), seed: 1 });
    assert.equal(res.ok, true, `${a.id}: ${JSON.stringify(res.error ?? res)}`);
  }

  assert.equal(sim.stateHash(), hashBefore, 'building card rendering must not mutate simulation state');
});

test('UI-7D: outpost top/bottom road buttons open FOREST and QUARRY with live status and return navigation', () => {
  const sim = newSim('stage1_outpost');
  sim.step(2 * 240 + 10);
  const hashBefore = sim.stateHash();
  const v = sim.studentView();

  assert.deepEqual(OUTPOST_ROADS.map((r) => r.to), ['forest', 'quarry']);
  const state0 = outpostRoadState(v);
  assert.equal(state0.north.to, 'forest');
  assert.equal(state0.south.to, 'quarry');
  assert.match(state0.north.status, /^\d+-\d+ ticks$/);
  assert.match(state0.south.status, /^\d+-\d+ ticks$/);
  assert.equal(state0.north.awayCount, 0);

  sim.submit(buildCommand('survivor_1', { name: 'scavenge', args: ['forest_edge'] }));
  for (let i = 0; i < 300 && !(sim.studentView().scavenge.away ?? []).length; i++) sim.step(1);
  const state1 = outpostRoadState(sim.studentView());
  assert.equal(state1.north.awayCount, 1);
  assert.match(state1.north.status, /1 away/);
  assert.equal(sim.stateHash(), sim.stateHash());
  assert.notEqual(sim.stateHash(), hashBefore); // scavenge step changed sim, not outpostRoadState

  const html = read('../index.html');
  const main = read('../src/app/mainscreen.js');
  assert.ok(html.includes('id="screen-north"') && html.includes('data-screen-to="forest"'));
  assert.ok(html.includes('id="screen-south"') && html.includes('data-screen-to="quarry"'));
  assert.ok(html.includes('class="screen-return-outpost" data-screen-to="outpost"'));
  assert.ok(main.includes("setScreen('forest')") && main.includes("setScreen('quarry')"));
  assert.ok(main.includes("b.hidden = screenId !== 'outpost'"));
});

test('UI-7E: keyboard tab navigation, dynamic hud tab sync, mobile & reduced-motion CSS', () => {
  assert.equal(nextTabFromKey(SURVIVOR_TABS, 'info', 'ArrowRight'), 'attributes');
  assert.equal(nextTabFromKey(SURVIVOR_TABS, 'info', 'ArrowLeft'), 'commands');
  assert.equal(nextTabFromKey(BUILDING_DEFENCE_TABS, 'info', 'ArrowRight'), 'defence');
  assert.equal(nextTabFromKey(BUILDING_GENERAL_TABS, 'upgrade', 'ArrowRight'), 'storage');

  const hudJs = read('../src/app/hud/hud.js');
  const hudCss = read('../src/app/hud/hud.css');
  assert.ok(hudJs.includes('syncInspectorTabs'));
  assert.ok(hudJs.includes('cardTabs'));
  assert.ok(hudCss.includes('.screen-road-north') && hudCss.includes('.screen-road-south'));
  assert.ok(hudCss.includes('.screen-return-outpost'));
  assert.match(hudCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.screen-road/);
  assert.match(hudCss, /@media \(max-width:900px\)[\s\S]*\.screen-road-north/);
});
