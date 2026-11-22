import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSim, sandbox } from './helpers.js';
import {
  CARD_STATES,
  cardStateOf,
  stateNotice,
  isActionAllowedInState,
  normalizeTab,
  renderTabBar,
  nextTabFromKey,
  metricBarHtml,
  metricRowHtml,
  createCardView,
  emptyCardView,
  loadingCardView,
  renderCardShell,
  buildSurvivorCardView,
  renderSurvivorCard,
  buildBuildingCardView,
  renderBuildingCard,
  buildNodeCardView,
  renderNodeCard,
  buildLootCardView,
  renderLootCard,
  buildZombieCardView,
  renderZombieCard,
  buildMountCardView,
  renderMountCard,
  buildOfferCardView,
  renderOfferCard,
} from '../src/app/ui/cards/index.js';
import {
  nodeActionList,
  lootActionList,
  zombieActionList,
  mountActionList,
} from '../src/app/ui/actions.js';
import {
  powerPanelHtml,
  waterPanelHtml,
  resourcesPanelHtml,
  eventsPanelHtml,
  panelEmptyHtml,
} from '../src/app/ui/panels.js';

test('UI-C1A: cardStateOf normalizes loading, empty, damaged, ruined, away, destroyed, unavailable', () => {
  assert.equal(CARD_STATES.length, 8);
  assert.equal(cardStateOf(null), 'empty');
  assert.equal(cardStateOf({}, { loading: true }), 'loading');
  assert.equal(cardStateOf({ status: 'dead' }), 'destroyed');
  assert.equal(cardStateOf({ status: 'away' }), 'away');
  assert.equal(cardStateOf({ condition: 'ruined' }), 'ruined');
  assert.equal(cardStateOf({ condition: 'damaged', health: 40, maxHealth: 100 }), 'damaged');
  assert.equal(cardStateOf({ amount: 0 }), 'empty');
  assert.equal(cardStateOf({ available: false }), 'unavailable');
  assert.equal(cardStateOf({ status: 'active', health: 100, maxHealth: 100 }), 'normal');

  assert.equal(isActionAllowedInState('away'), false);
  assert.equal(isActionAllowedInState('destroyed'), false);
  assert.equal(isActionAllowedInState('loading'), false);
  assert.equal(isActionAllowedInState('normal'), true);
  assert.ok(stateNotice('ruined').text.includes('Ruined'));
});

test('UI-C1A: shared shell, metrics, empty/loading views, and keyboard tab navigation', () => {
  const emptyHtml = renderCardShell(emptyCardView('Nothing selected'));
  assert.match(emptyHtml, /uc-state-empty/);
  assert.match(emptyHtml, /Nothing selected/);

  const loadHtml = renderCardShell(loadingCardView('Fetching'));
  assert.match(loadHtml, /uc-state-loading/);
  assert.match(loadHtml, /Waiting for projection/);

  const tabs = [{ id: 'info', label: 'Info' }, { id: 'stats', label: 'Stats' }, { id: 'command', label: 'Command' }];
  assert.equal(normalizeTab(tabs, 'unknown'), 'info');
  assert.equal(nextTabFromKey(tabs, 'info', 'ArrowRight'), 'stats');
  assert.equal(nextTabFromKey(tabs, 'info', 'ArrowLeft'), 'command');
  assert.equal(nextTabFromKey(tabs, 'stats', 'Home'), 'info');
  assert.equal(nextTabFromKey(tabs, 'stats', 'End'), 'command');

  const tabHtml = renderTabBar(tabs, 'stats');
  assert.match(tabHtml, /role="tablist"/);
  assert.match(tabHtml, /role="tab"/);
  assert.match(tabHtml, /aria-selected="true"/);

  const bar = metricBarHtml({ label: 'health', value: 50, max: 100 });
  assert.match(bar, /width:50%/);
  assert.match(metricRowHtml('Armor', 2), /Armor/);

  const custom = createCardView({ kind: 'panel', id: 'p1', title: 'Test', actions: [{ id: 'a', label: 'Run', snippet: 'survivor.rest(5);', enabled: false, reason: 'Full energy' }] });
  assert.equal(custom.disabledReasons.length, 1);
});

test('UI-C1B: survivor card renders live projection and handles away state', () => {
  const sim = newSim();
  const hashBefore = sim.stateHash();
  const view = sim.studentView();
  const card = sim.inspector(view.survivors[0].id);

  const cv = buildSurvivorCardView(card, view);
  assert.equal(cv.kind, 'survivor');
  assert.equal(cv.tabs.length, 5);
  const html = renderSurvivorCard(card, view);
  assert.match(html, /Needs/);
  assert.match(html, /Skills/);
  assert.match(html, /Carrying 0 \/ 60 wt/);
  assert.match(html, /Equipment/);

  const awayHtml = renderSurvivorCard({ ...card, status: 'away' }, view);
  assert.match(awayHtml, /uc-state-away/);
  assert.match(awayHtml, /Away on expedition/);
  assert.equal(sim.stateHash(), hashBefore, 'card rendering must never mutate simulation state');
});

test('UI-C1C: building cards cover all variants (hq, kitchen, workshop, well, power, storage, tower, wall, gate)', () => {
  const sim = newSim();
  const view = sim.studentView();
  for (const b of view.buildings) {
    const cv = buildBuildingCardView(b, view);
    assert.equal(cv.kind, 'building');
    const html = renderBuildingCard(b, view);
    assert.match(html, new RegExp(b.id));
  }
  const syntheticTower = {
    id: 'tower_9', type: 'tower', name: 'Dual Minigun Fortress', level: 5, maxLevel: 5,
    condition: 'repaired', health: 360, maxHealth: 360,
    tower: {
      working: true, rangeBonus: 5, freeSlots: 1, posted: ['survivor_1'], mounts: ['minigun'],
      installed: [{ weapon: 'ballista', name: 'Ballista', status: 'READY', hopper: 10, hopperMax: 20, ammo: 'bolts', cooldown: 0 }],
    },
  };
  const towerHtml = renderBuildingCard(syntheticTower, view);
  assert.match(towerHtml, /Range bonus: \+5/);
  assert.match(towerHtml, /Ballista/);
});

test('UI-C1D: node, loot, zombie (wave & wanderer), mount, and offer cards', async () => {
  const sim = newSim();
  const view = sim.studentView();
  const proj = sim.renderProjection();

  const node = view.nodes[0];
  const nodeHtml = renderNodeCard(node, view, { projNode: proj.nodes.find((n) => n.id === node.id) });
  assert.match(nodeHtml, new RegExp(node.id));
  assert.match(nodeHtml, /data-action="insert"/);

  const pile = { id: 'loot_1', item: 'bones', qty: 3, x: 18, y: 6 };
  const lootHtml = renderLootCard(pile, view);
  assert.match(lootHtml, /bones × 3/);
  assert.match(lootHtml, /Sortie/);

  const wanderer = { id: 'wanderer_1', type: 'walker', name: 'Wanderer', health: 20, maxHealth: 20, armor: 0, x: 20, y: 6, wanderer: true };
  const zHtml = renderZombieCard(wanderer, view);
  assert.match(zHtml, /Wanderer/);
  assert.match(zHtml, /data-action="insert"/);

  const mountHtml = renderMountCard(
    { weapon: 'machine_gun', name: 'Machine Gun', ammo: 'bullets', hopper: 30, hopperMax: 120, status: 'READY', cooldown: 0 },
    { id: 'tower_1', name: 'Machine Gun Tower', condition: 'repaired', tower: { posted: ['survivor_1'] } },
    view,
  );
  assert.match(mountHtml, /Machine Gun/);
  assert.match(mountHtml, /30\/120/);

  const recruitHtml = renderOfferCard('none', 'recruit', view);
  assert.match(recruitHtml, /uc-state-empty/);

  // Enabled snippets from new action lists must run cleanly through the real sandbox
  const enabledActions = [
    ...nodeActionList(node, view),
    ...lootActionList(pile, view),
    ...zombieActionList(wanderer, view),
    ...mountActionList({ weapon: 'ballista', ammo: 'bolts', hopper: 0, hopperMax: 20 }, { id: 'tower_1', condition: 'repaired' }, view),
  ].filter((a) => a.enabled);
  assert.ok(enabledActions.length >= 3);
  for (const a of enabledActions) {
    const res = await sandbox.run({ code: a.snippet, view: sim.studentView(), seed: 1 });
    assert.equal(res.ok, true, `${a.id}: ${JSON.stringify(res.error ?? res)}`);
  }
});

test('UI-C1E: power, water, resources, events, and empty-state panel builders', () => {
  const view = newSim().studentView();
  assert.match(powerPanelHtml(view), /Supply:/);
  assert.match(waterPanelHtml(view), /Base water stock:/);
  assert.match(resourcesPanelHtml(view), /wood/);
  assert.match(eventsPanelHtml(view), /No upcoming events announced|Day /);
  assert.match(panelEmptyHtml('Empty'), /uc-empty/);
});

test('UI-C1F: reduced motion and mobile layout rules exist in CSS', () => {
  const hudCss = readFileSync(new URL('../src/app/hud/hud.css', import.meta.url), 'utf8');
  const mainCss = readFileSync(new URL('../src/app/mainscreen.css', import.meta.url), 'utf8');
  assert.match(hudCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(mainCss, /body\.mobile-layout/);
});
