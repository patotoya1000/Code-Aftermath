// R7 road camps and road danger (docs/game/24 section 3g): a working road camp shortens forest/quarry trips, cuts run danger and caps stash loss; motor vehicles are loud;
// a loaded run on a raid day is a target.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinitions } from '../src/modules/definitions/index.js';
import { scavenge as scavengeData } from '../src/modules/definitions/data/scavenge.js';
import { roads as roadData } from '../src/modules/definitions/data/roads.js';
import { raidSchedule } from '../src/modules/definitions/data/threats.js';
import { eventSchedule } from '../src/modules/definitions/data/events.js';
import { createInitialState } from '../src/modules/world/index.js';
import { createSimulation } from '../src/modules/simulation/index.js';
import { tripPlan, runDanger, roadPercent, stashLossPercent } from '../src/modules/scavenge/index.js';
import { campLevelOf } from '../src/modules/buildings/index.js';
import { buildCommand } from '../src/modules/api/index.js';
import { buildingActionList } from '../src/app/ui/actions.js';

const calm = { eventSchedule: { ...eventSchedule, chancePercent: 0 }, raidSchedule: { ...raidSchedule, chancePercent: 0 } };
const open = { ...scavengeData, startDay: 1 };
const defs = createDefinitions({ ...calm, scavenge: open });
const raidy = createDefinitions({ eventSchedule: { ...eventSchedule, chancePercent: 0 }, scavenge: open, raidSchedule: { ...raidSchedule, startDay: 1, chancePercent: 100 } });

const fix = (st, id, level = 1) => { const b = st.buildings[id]; const lv = defs.buildings[b.type].levels[level]; b.level = level; b.health = lv.maxHealth; b.condition = 'repaired'; };
const mk = ({ hq = 2, camp = 1, d = defs, mutate } = {}) => {
  const state = createInitialState({ defs: d, scenarioId: 'stage1', seed: 1 });
  fix(state, 'hq', hq); if (camp) fix(state, 'camp_1', camp);
  for (const s of Object.values(state.survivors)) Object.assign(s.needs, { hunger: 100, thirst: 100, energy: 100, health: 100 });
  mutate?.(state);
  return { state, sim: createSimulation({ defs: d, state }) };
};

test('data: the shipped road rules are valid and bad ones are refused at load time', () => {
  assert.equal(defs.roads.camp, 'road_camp'); assert.deepEqual(defs.roads.regions, ['forest', 'quarry']);
  const bad = (mut, re) => assert.throws(() => { const r = structuredClone(roadData); mut(r); createDefinitions({ roads: r }); }, re);
  bad((r) => { r.camp = 'nowhere'; }, /camp must be a known building/);
  bad((r) => { r.minHq = 0; }, /minHq/);
  bad((r) => { r.regions = ['front']; }, /regions/);
  assert.throws(() => { const b = structuredClone(defs.buildings); b.road_camp.levels[2].camp.dangerCutPercent = 5; createDefinitions({ buildings: b }); }, /not be worse/);
  assert.throws(() => { const v = structuredClone(defs.vehicles); v.types.truck.noisePercent = -1; createDefinitions({ vehicles: v }); }, /noisePercent/);
});

test('a camp only works when repaired and the HQ has reached roads.minHq', () => {
  assert.equal(campLevelOf(mk({ camp: 0 }).state, defs), 0, 'a ruin does nothing');
  assert.equal(campLevelOf(mk({ hq: 1 }).state, defs), 0, 'HQ 1 is too low');
  assert.equal(campLevelOf(mk().state, defs), 1);
  assert.equal(campLevelOf(mk({ camp: 2 }).state, defs), 2);
});

test('road sites get shorter trips; front sites and ruined camps change nothing', () => {
  const { state } = mk(); const base = defs.scavenge.sites.forest_edge.ticks;
  assert.equal(roadPercent(state, defs, 'forest_edge'), 85); assert.equal(roadPercent(state, defs, 'junkyard'), 100);
  assert.equal(tripPlan(defs, 'forest_edge', 'scavenge', { road: 85 }).ticks, Math.ceil(base * 0.85));
  assert.equal(tripPlan(defs, 'forest_edge', 'scavenge').ticks, base);
  assert.equal(tripPlan(defs, 'forest_edge', 'stash', { rounds: 2, camp: true, road: 85 }).ticks, Math.ceil(base * 0.85) + defs.scavenge.stash.rounds.ticks + defs.scavenge.stash.campTicks, 'only the travel is shortened');
  assert.equal(roadPercent(mk({ camp: 0 }).state, defs, 'forest_edge'), 100);
  assert.equal(roadPercent(mk({ camp: 2 }).state, defs, 'deep_forest'), 70);
});

test('a real trip leaves with the shorter time and the camp-cut danger', () => {
  const { sim } = mk();
  sim.submit(buildCommand('survivor_1', { name: 'scavenge', args: ['forest_edge'] }));
  let n = 0; while (!sim.log.all().some((e) => e.type === 'scavenge.departed') && n++ < 400) sim.step(1);
  const e = sim.log.all().find((x) => x.type === 'scavenge.departed');
  assert.ok(e, 'she departed');
  assert.equal(e.returnTick - sim.snapshot().tick, Math.ceil(defs.scavenge.sites.forest_edge.ticks * 0.85));
  assert.equal(e.danger, Math.floor((defs.scavenge.sites.forest_edge.danger * 70) / 100));
});

test('danger: the camp cuts it, a motor is louder, a loaded run on a raid day is a target', () => {
  const { state } = mk(); const none = mk({ camp: 0 }).state;
  assert.equal(runDanger(none, defs, 'forest_edge', 3), 10);
  assert.equal(runDanger(state, defs, 'forest_edge', 3), 7);
  assert.equal(runDanger(none, defs, 'forest_edge', 3, { mode: 'retrieve', vehicle: 'motor_cart' }), 12, 'motor cart +25 %');
  assert.equal(runDanger(none, defs, 'forest_edge', 3, { mode: 'retrieve', vehicle: 'truck' }), 15, 'truck +50 %');
  assert.equal(runDanger(none, defs, 'junkyard', 3), 25, 'front sites are unchanged');
  const r = mk({ d: raidy, camp: 0 }).state; const rc = mk({ d: raidy }).state;
  const plain = runDanger(r, raidy, 'forest_edge', 3); const loaded = runDanger(r, raidy, 'forest_edge', 3, { mode: 'retrieve' });
  assert.equal(loaded - plain, raidy.roads.loadedRaidDayDanger);
  assert.ok(runDanger(rc, raidy, 'forest_edge', 3, { mode: 'retrieve' }) < loaded, 'the camp helps on a raid day too');
  assert.equal(runDanger(r, raidy, 'junkyard', 3, { mode: 'retrieve' }), runDanger(r, raidy, 'junkyard', 3), 'no loaded-run penalty off the roads');
  const calmZero = createDefinitions({ ...calm, scavenge: { ...open, sites: { ...open.sites, forest_edge: { ...open.sites.forest_edge, danger: 0 } } } });
  assert.equal(runDanger(mk({ camp: 0, d: calmZero }).state, calmZero, 'forest_edge', 3, { mode: 'retrieve', vehicle: 'truck' }), 0, 'a calm site stays calm');
});

test('stash loss: the guard caps the loss along the roads, never worsens it', () => {
  const { state } = mk(); const l2 = mk({ camp: 2 }).state; const none = mk({ camp: 0 }).state;
  assert.equal(stashLossPercent(defs, none, 'deep_forest'), 50);
  assert.equal(stashLossPercent(defs, state, 'deep_forest'), 10); assert.equal(stashLossPercent(defs, state, 'forest_edge'), 10);
  assert.equal(stashLossPercent(defs, l2, 'forest_edge'), 5);
  state.scavenge.stash.forest_edge = { items: { wood: 5 }, protected: true };
  assert.equal(stashLossPercent(defs, state, 'forest_edge'), 10, 'camped = 10 already');
  assert.equal(stashLossPercent(defs, state, 'junkyard'), 30, 'front site: no guard');
});

test('learner view and UI: camp_1.camp and the site road numbers', () => {
  const { sim } = mk();
  const v = sim.studentView();
  const c = v.buildings.find((b) => b.id === 'camp_1').camp;
  assert.equal(c.working, true); assert.equal(c.active, true); assert.deepEqual(c.now, { roadTicksPercent: 85, dangerCutPercent: 30, stashLossPercent: 10 });
  assert.equal(c.next.roadTicksPercent, 70);
  const site = v.scavenge.sites.find((s) => s.id === 'forest_edge');
  assert.equal(site.ticksNow, Math.ceil(site.ticks * 0.85)); assert.equal(site.road.camp, 1); assert.equal(site.dangerToday, 7);
  assert.equal(v.scavenge.sites.find((s) => s.id === 'junkyard').road.road, false);
  const acts = buildingActionList(v.buildings.find((b) => b.id === 'camp_1'), v);
  assert.ok(acts.some((a) => a.id === 'roads' && a.enabled));
});
