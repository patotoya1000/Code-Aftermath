// Map screens (docs/game/21 sections 3 and 10): MAP 1 TOWN · MAP 2 OUTPOST (live canvas) · MAP 3 FRONT. Presentation only: pure functions over the learner view.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { SCREENS, SCREEN_IDS, neighbourScreen, arrowState, alertLevel, spotStatus, screenOf, TOWN_SPOTS } from '../src/app/ui/screens.js';
import { townSceneSvg, frontSceneSvg } from '../src/app/ui/scenes.js';
import { recruitHtml, trainHtml, housingHtml, scavengeRowsHtml, raidHtml, townPanelHtml, scavengePanelHtml, esc } from '../src/app/ui/panels.js';
import { newSim } from './helpers.js';
import { buildCommand } from '../src/modules/api/index.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../index.html'); const css = read('../src/app/hud/hud.css'); const main = read('../src/app/mainscreen.js');
const DAY = 240;
// the real default schedules (raids ON): seed 1 has its first raid on day 6 (dusk is at tick 1320)
const live = createDefinitions();
const liveSim = (seed = 1) => createSimulation({ defs: live, state: createInitialState({ defs: live, scenarioId: 'stage1_long', seed }) });
const at = (sim, tick) => { sim.step(tick - sim.tick); return sim.studentView(); };

test('three screens in west-to-east order, numbered MAP 1..3', () => {
  assert.deepEqual(SCREEN_IDS.slice(), ['town', 'outpost', 'front']);
  assert.deepEqual(SCREENS.map((s) => s.no), [1, 2, 3]);
  assert.equal(screenOf('nonsense').id, 'outpost', 'an unknown id falls back to the live map');
});

test('arrows: each edge arrow leads one map over and the end of the line is disabled', () => {
  assert.deepEqual(arrowState('outpost'), { west: { to: 'town', label: 'TOWN', disabled: false }, east: { to: 'front', label: 'FRONT', disabled: false } });
  assert.equal(arrowState('town').west.disabled, true); assert.equal(arrowState('town').east.to, 'outpost');
  assert.equal(arrowState('front').east.disabled, true); assert.equal(arrowState('front').west.to, 'outpost');
  assert.equal(neighbourScreen('town', -1).id, 'town'); assert.equal(neighbourScreen('front', 1).id, 'front');
  assert.equal(neighbourScreen('outpost', 1).id, 'front'); assert.equal(neighbourScreen('outpost', -1).id, 'town');
});

test('alert: quiet by day, "soon" when a raid is due tonight and dusk is close, "raid" once the wave is on', () => {
  const s = liveSim();
  assert.equal(alertLevel(at(s, 100)), 'none');
  assert.equal(alertLevel(at(s, 5 * DAY - 200)), 'none', 'day 5: nothing is due tonight');
  assert.equal(alertLevel(at(s, 1265)), 'soon');
  assert.equal(alertLevel(at(s, 1330)), 'raid');
  assert.equal(alertLevel(null), 'none'); assert.equal(alertLevel({}), 'none');
});

test('town scene: three clickable objects with live status; the train is drawn only while it is in', () => {
  const day1 = newSim('stage1_long').studentView();
  const svg = townSceneSvg(day1);
  for (const sp of TOWN_SPOTS) assert.ok(svg.includes(`data-spot="${sp.id}"`), sp.id);
  assert.ok(svg.includes('opens day 2'), 'the town is closed on day 1');
  assert.ok(!svg.includes('sc-train-a'), 'no train on day 1');
  // find a day with the train in, from the real schedule
  const s = liveSim(); let withTrain = null;
  for (let t = 2 * DAY; t < 20 * DAY && !withTrain; t += 10) { const v = at(s, t); if (v.town.train.present) withTrain = v; }
  assert.ok(withTrain, 'a train arrives within three weeks');
  const tsvg = townSceneSvg(withTrain);
  assert.ok(tsvg.includes('sc-train-a') && tsvg.includes('TRAIN IN'));
  assert.equal(spotStatus(withTrain, 'hall'), `${withTrain.town.offers.filter((o) => !o.hired).length} for hire`);
  assert.equal(spotStatus(withTrain, 'housing'), `${withTrain.town.freeBeds} free beds`);
});

test('front scene: one clickable site per scavenge site (nearest first) plus the raid road; a wave changes the sky and the pill', () => {
  const v = liveSim().studentView();
  const svg = frontSceneSvg(v);
  const ids = [...svg.matchAll(/data-spot="([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, [...v.scavenge.sites.map((x) => x.id), 'raid']);
  assert.ok(svg.includes('#0d1a14') && !svg.includes('is-alarm'));
  const s = liveSim(); const w = at(s, 1330);
  const wsvg = frontSceneSvg(w);
  assert.ok(wsvg.includes('#2a0d12') && wsvg.includes('is-alarm') && wsvg.includes('WAVE ACTIVE') && wsvg.includes('is-moving'));
  assert.equal(spotStatus(v, 'junkyard'), `80t · ${v.scavenge.sites.find((x) => x.id === 'junkyard').dangerToday}% danger`);
});

test('front scene shows who is away at which site, and drops the marker when she is back', () => {
  const s = newSim('stage1_long'); s.step(2 * DAY + 10);
  assert.ok(!frontSceneSvg(s.studentView()).includes('sc-away'), 'nobody away yet');
  s.submit(buildCommand('survivor_1', { name: 'scavenge', args: ['roadside_store'] }));
  let n = 0; while (!(s.studentView().scavenge.away ?? []).length && n++ < 300) s.step(1);
  const away = s.studentView();
  assert.equal(away.scavenge.away.length, 1, 'she left through the gate');
  const svg = frontSceneSvg(away);
  assert.ok(svg.includes('sc-away') && svg.includes('survivor_1'));
  while ((s.studentView().scavenge.away ?? []).length && n++ < 900) s.step(1);
  assert.ok(!frontSceneSvg(s.studentView()).includes('sc-away'), 'back home: no marker');
});

test('panels: every button only inserts code, text is escaped, and the nav panels use the same builders', () => {
  const s = newSim('stage1_long'); s.step(3 * DAY);
  const v = s.studentView();
  for (const out of [recruitHtml(v), trainHtml(v), housingHtml(v), scavengeRowsHtml(v), raidHtml(v), townPanelHtml(v), scavengePanelHtml(v)]) {
    assert.ok(!/onclick=|<script/i.test(out));
    for (const b of out.matchAll(/<button[^>]*>/g)) assert.ok(b[0].includes('data-action="insert"'), b[0]);
  }
  assert.ok(scavengeRowsHtml(v).includes('survivor.scavenge(&quot;roadside_store&quot;);'));
  assert.ok(scavengeRowsHtml(v, 'junkyard').includes('Junkyard') && !scavengeRowsHtml(v, 'junkyard').includes('Army depot'), 'one site only');
  assert.equal(esc('<b a="1">&\'</b>'), '&lt;b a=&quot;1&quot;&gt;&amp;&#39;&lt;/b&gt;');
  assert.ok(recruitHtml(newSim('stage1_long').studentView()).includes('before day 2'));
  const hud = read('../src/app/hud/hud.js');
  assert.ok(hud.includes("townPanelHtml(view)") && hud.includes("scavengePanelHtml(view)"), 'hud.js has no copy of the town / expedition rows');
});

test('building scenes and panels never change the game', () => {
  const s = newSim('stage1_long'); s.step(3 * DAY); const hash = s.stateHash(); const v = s.studentView();
  townSceneSvg(v, { active: 'hall' }); frontSceneSvg(v, { active: 'raid' }); recruitHtml(v); raidHtml(v); scavengePanelHtml(v);
  assert.equal(s.stateHash(), hash);
});

test('markup: edge arrows, identifier badge and both panes exist; the old zone bar is gone', () => {
  for (const id of ['screen-west', 'screen-east', 'screen-west-label', 'screen-east-label', 'screen-badge', 'sb-no', 'sb-name', 'sb-dots', 'screen-town', 'screen-front', 'scene-town', 'scene-front', 'detail-town', 'detail-front']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(!html.includes('zone-bar') && !html.includes('zone-btn') && !css.includes('.zone-bar'));
  assert.ok(html.indexOf('id="screen-badge"') < html.indexOf('</header>'), 'the badge sits in the top bar flow, so it can never cover the clock');
});

test('styles: arrows hug the left and right screen edges, panes slide, the east arrow pulses red, reduced motion is respected', () => {
  assert.match(css, /\.screen-arrow-west \{ left:0;/); assert.match(css, /\.screen-arrow-east \{ right:0;/);
  assert.ok(css.includes('.screen-pane-town { transform:translateX(-100%)') && css.includes('.screen-pane-front { transform:translateX(100%)'));
  assert.ok(css.includes('.screen-arrow[data-alert="raid"]') && css.includes('@keyframes sa-pulse-red') && css.includes('prefers-reduced-motion'));
  assert.ok(css.includes('body.hud.card-open .screen-arrow-east'), 'the east arrow clears the inspector');
});

test('wiring: the live game starts on the 40x16 line-wall map, arrows and keys switch screens, no zone code is left', () => {
  assert.ok(main.includes("scenarioId: 'stage1_long'"));
  assert.ok(main.includes("'ArrowLeft'") && main.includes('stepScreen') && main.includes('bindScreens();'));
  assert.ok(!/zonesFor|goZone|stepZone|paintZones/.test(main));
});
