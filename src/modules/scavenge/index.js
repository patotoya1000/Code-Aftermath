import { hashString } from '../../kernel/index.js';
import { stockKey, credit, discard } from '../resources/index.js';
import { storageRoom, vehicleRefusal, fuelPlan, vehicleCarry, vehicleTicks, campEffect } from '../buildings/index.js';
import { syncStock } from '../spoilage/index.js';
import { awardSkillXp, carryCapacity, carriedLoad } from '../survivors/index.js';
import { dayOf, timeOf } from '../environment/index.js';
import { raidForDay, bossForDay, threatsView } from '../threats/index.js';
import { eventsView } from '../events/index.js';
import { townView } from '../town/index.js';

// Scavenge expeditions (W3, data/scavenge.js, docs/game/21 section 6). A survivor walks to the gate (the `scavenge` action), departs, is AWAY for the site's
// ticks and comes back with loot. v1 is resolved from rules: no second map, no tile-by-tile walk. Everything is a PURE function of (seed, survivor, departure
// tick, site) plus the site's saved last-looted day, so replays and saves cannot disagree.
//   departure  `depart`: status 'away', `survivor.away = { siteId, departTick, returnTick, danger }` (danger is fixed AT departure and shown to the learner first)
//   return     `scavengeTick` each tick: the survivor whose returnTick has come is put back at the gate and `comeBack` resolves the trip:
//              loot = each yield range rolled from a hash, scaled by the site's RECOVERY (a just-looted site yields little, it regrows over `regrowDays`),
//              halved when hurt (a hash roll under the danger percent), limited by storage room (the rest is left behind); the trip costs needs (paid on return)
//   a wave     `loseAway`: when a wave starts, every survivor still away is LOST for good (removed, recorded in `state.scavenge.lost`): nothing recalls her
// R2 CAMP STASH (docs/game/24): the same departure, two more trip kinds (`away.mode`):
//   stash     `survivor.stash(site, rounds?, { camp }?)`: she works the site for 1..rounds.max rounds in one trip (each extra round adds `stash.rounds.ticks`, each later round
//             yields `falloffPercent` less) and the haul goes into the site's STASH instead of base stock, no storage-room limit but `capPerSite` units per site (overflow is lost).
//             `camp: true` adds `campTicks` and marks that stash PROTECTED until it is emptied.
//   retrieve  `survivor.retrieve(site)`: a haul run of `haulTripPercent` of the site's ticks; she brings home what she can carry (survivor carry capacity, halved when hurt) and what
//             base storage has room for; the rest stays in the stash.
//   a vehicle R5 (docs/game/24 section 3e): `survivor.retrieve(site, { vehicle })` hauls with a hand cart / motor cart / truck from the garage: her carry capacity x `carryPercent`, the run takes `ticksPercent` of the
//             haul time, a motorised run burns fuel paid when she LEAVES (not refunded if she is lost), and one vehicle of each kind can be out at a time (it is busy while `away.vehicle` names it).
//   a raid    `raidStashes`: when a wave starts every stash loses a share of each item (near / deep / protected, rounded up); a stash at a site far from the wall is the easier prize.
// R7 ROAD CAMP (docs/game/24 section 3g): a working road camp shortens the travel of trips to forest / quarry sites (`roadPercent`), cuts the danger of runs there (`runDanger`) and caps a raid
//   night's share of a stash along the roads (`stashLossPercent`). A motor vehicle is loud (its `noisePercent` raises the danger) and a loaded run (retrieve) along a road on a raid day is a target.
// Learner reads: `scavenge` (sites, danger today, recovery, who is away) and `board` (raids + train + events + sites in one place).

const num = (seed, key) => parseInt(hashString(`scavenge:${seed}:${key}`).slice(-8), 16);
const sorted = (state) => Object.values(state.survivors).sort((a, b) => (a.id < b.id ? -1 : 1));

/** Percent of its full yield a site gives on `day`: 100 if never looted, otherwise it regrows over regrowDays but never drops below minRecovery. */
export function recoveryPercent(defs, state, siteId, day) {
  const rec = state.scavenge.sites[siteId];
  if (!rec) return 100;
  const site = defs.scavenge.sites[siteId];
  return Math.min(100, Math.max(defs.scavenge.minRecovery, Math.floor((100 * (day - rec.lastDay)) / site.regrowDays)));
}

/** Danger percent of a site on `day`: its own danger, plus raidDayDanger on a day with a raid or a boss scheduled (the wave comes at dusk). Capped at 100. */
export function dangerOn(defs, seed, siteId, day) {
  const site = defs.scavenge.sites[siteId];
  const dusk = Boolean(raidForDay(defs, seed, day) || bossForDay(defs, day));
  return Math.min(100, site.danger + (dusk ? defs.scavenge.raidDayDanger : 0));
}

/** Percent of its travel ticks a trip to this site takes now: 100, or the working road camp's `roadTicksPercent` for a road site. Pure. */
export const roadPercent = (state, defs, siteId) => campEffect(state, defs, siteId)?.roadTicksPercent ?? 100;

/**
 * The danger percent a run faces (R7): the site's `dangerOn`, higher for a loud motor vehicle (its `noisePercent` of the danger), plus `roads.loadedRaidDayDanger` for a LOADED run (retrieve)
 * along a road on a raid day, then cut by the working road camp's `dangerCutPercent`. Capped at 100; a site with no danger stays calm unless it is a loaded run on a raid day. Pure.
 */
export function runDanger(state, defs, siteId, day, { mode = 'scavenge', vehicle = null } = {}) {
  let d = dangerOn(defs, state.seed, siteId, day);
  const noise = vehicle ? (defs.vehicles.types[vehicle]?.noisePercent ?? 0) : 0;
  d = Math.floor((d * (100 + noise)) / 100);
  const raidDay = Boolean(raidForDay(defs, state.seed, day) || bossForDay(defs, day));
  const fx = campEffect(state, defs, siteId);
  if (mode === 'retrieve' && raidDay && defs.roads.regions.includes(defs.scavenge.sites[siteId].region ?? 'front')) d += defs.roads.loadedRaidDayDanger;
  if (fx) d = Math.floor((d * (100 - fx.dangerCutPercent)) / 100);
  return Math.min(100, d);
}

/** The loot a trip brings, rolled from a hash: { item: qty } at `percent` recovery. Pure. */
export function rollLoot(defs, seed, key, siteId, percent, hurt) {
  const out = {};
  const scale = percent * (hurt ? defs.scavenge.hurtLootPercent : 100);
  for (const item of Object.keys(defs.scavenge.sites[siteId].yield).sort()) {
    const [min, max] = defs.scavenge.sites[siteId].yield[item];
    const base = min + (num(seed, `${key}:${item}`) % (max - min + 1));
    const qty = Math.floor((base * scale) / 10000);
    if (qty > 0) out[item] = qty;
  }
  return out;
}

/** Trip length and kind for a command. Pure. mode: 'scavenge' | 'stash' | 'retrieve'. */
export function tripPlan(defs, siteId, mode, { rounds = 1, camp = false, vehicle = null, road = 100 } = {}) {
  const site = defs.scavenge.sites[siteId]; const st = defs.scavenge.stash;
  const travel = road >= 100 ? site.ticks : Math.max(1, Math.ceil((site.ticks * road) / 100)); // R7: a working road camp shortens the road (never the extra rounds or the camp pitching)
  if (mode === 'retrieve') {
    const onFoot = Math.max(1, Math.ceil((travel * st.haulTripPercent) / 100));
    return { mode, ticks: vehicleTicks(defs, vehicle, onFoot), ...(vehicle ? { vehicle } : {}) };
  }
  if (mode === 'stash') return { mode, rounds, camp, ticks: travel + (rounds - 1) * st.rounds.ticks + (camp ? st.campTicks : 0) };
  return { mode: 'scavenge', ticks: travel };
}

/** Leave: the survivor stands at the gate. Called by the scavenge handler when she arrives. */
export function depart(ctx, s, siteId, mode = 'scavenge', opts = {}) {
  const { state, defs } = ctx;
  const plan = tripPlan(defs, siteId, mode, { ...opts, road: roadPercent(state, defs, siteId) });
  s.status = 'away';
  s.away = { siteId, mode: plan.mode, departTick: state.tick, returnTick: state.tick + plan.ticks, danger: runDanger(state, defs, siteId, dayOf(defs, state.tick), { mode: plan.mode, vehicle: plan.vehicle ?? null }) };
  if (plan.mode === 'stash') { s.away.rounds = plan.rounds; s.away.camp = plan.camp; }
  let fuel = null;
  if (plan.vehicle) { // R5: the vehicle goes with her; its fuel is paid now (the handler checked the refusal rules a moment ago, at the gate)
    s.away.vehicle = plan.vehicle;
    const f = fuelPlan(state, defs, plan.vehicle);
    if (f && f.units > 0) { discard(state, stockKey(f.item), f.units); syncStock(state, defs, f.item); fuel = { item: f.item, units: f.units }; }
  }
  ctx.emit('scavenge.departed', { survivorId: s.id, siteId, mode: plan.mode, returnTick: s.away.returnTick, danger: s.away.danger, ...(plan.vehicle ? { vehicle: plan.vehicle, fuel } : {}) });
}

/** Bring back every survivor whose trip is over, resolve it, and pay its costs. ctx = { state, defs, emit }. */
export function scavengeTick(ctx) {
  const { state } = ctx;
  for (const s of sorted(state)) if (s.status === 'away' && s.away && s.away.returnTick <= state.tick) comeBack(ctx, s);
}

function comeBack(ctx, s) {
  const { state, defs } = ctx;
  const cfg = defs.scavenge;
  const { siteId, departTick, danger, returnTick } = s.away;
  const mode = s.away.mode ?? 'scavenge';
  if (mode === 'retrieve') return comeBackRetrieve(ctx, s);
  const day = dayOf(defs, state.tick);
  const key = `${s.id}:${departTick}:${siteId}`;
  const hurt = num(state.seed, `${key}:danger`) % 100 < danger;
  const percent = recoveryPercent(defs, state, siteId, day);
  const loot = {}, leftBehind = {};
  if (mode === 'stash') {
    // R2: every round is rolled on its own and the haul goes to the site's stash (capped), never to base stock.
    const rolled = {};
    for (let r = 0; r < (s.away.rounds ?? 1); r++) {
      const scale = Math.max(0, 100 - cfg.stash.rounds.falloffPercent * r);
      for (const [item, qty] of Object.entries(rollLoot(defs, state.seed, `${key}:r${r}`, siteId, Math.floor((percent * scale) / 100), hurt))) rolled[item] = (rolled[item] ?? 0) + qty;
    }
    const entry = state.scavenge.stash[siteId] ?? { items: {}, protected: false };
    let room = Math.max(0, cfg.stash.capPerSite - stashUnits(entry));
    for (const item of Object.keys(rolled).sort()) {
      const take = Math.min(rolled[item], room);
      if (take > 0) { entry.items[item] = (entry.items[item] ?? 0) + take; room -= take; loot[item] = take; }
      if (take < rolled[item]) leftBehind[item] = rolled[item] - take;
    }
    if (s.away.camp) entry.protected = true;
    if (stashUnits(entry) > 0) state.scavenge.stash[siteId] = entry;
  } else {
    const rolled = rollLoot(defs, state.seed, key, siteId, percent, hurt);
    for (const [item, qty] of Object.entries(rolled)) {
      const take = Math.min(qty, Math.max(0, storageRoom(state, item)));
      if (take > 0) { credit(state, stockKey(item), take); syncStock(state, defs, item); loot[item] = take; }
      if (take < qty) leftBehind[item] = qty - take;
    }
  }
  const away = returnTick - departTick;
  for (const need of ['hunger', 'thirst', 'energy']) s.needs[need] = Math.max(0, s.needs[need] - Math.floor((away * cfg.needsPer10Ticks[need]) / 10));
  if (hurt) s.needs.health = Math.max(1, s.needs.health - cfg.hurtDamage);
  s.status = 'active';
  delete s.away;
  const gate = state.buildings.gate ?? state.buildings.hq;
  s.position = { x: gate.x, y: gate.y };
  state.scavenge.sites[siteId] = { lastDay: day, trips: (state.scavenge.sites[siteId]?.trips ?? 0) + 1 };
  const got = Object.keys(loot).length > 0;
  if (got) awardSkillXp(ctx, s, 'scavenge');
  const outcome = hurt ? 'hurt' : got ? 'clean' : 'empty';
  state.scavenge.history.push({ day, survivorId: s.id, siteId, mode, outcome, loot: { ...loot }, recoveryPercent: percent });
  while (state.scavenge.history.length > cfg.historyLimit) state.scavenge.history.shift();
  ctx.emit('scavenge.returned', { survivorId: s.id, siteId, mode, outcome, loot, leftBehind, recoveryPercent: percent, hurt });
  if (mode === 'stash') ctx.emit('stash.stored', { survivorId: s.id, siteId, stored: loot, leftBehind, units: stashUnits(state.scavenge.stash[siteId]), protected: Boolean(state.scavenge.stash[siteId]?.protected) });
}

const stashUnits = (entry) => Object.values(entry?.items ?? {}).reduce((a, b) => a + b, 0);

/** The retrieve run is over: she is at the gate with what she could carry; what base storage or her hands could not take stays in the stash. */
function comeBackRetrieve(ctx, s) {
  const { state, defs } = ctx;
  const cfg = defs.scavenge;
  const { siteId, departTick, danger, returnTick } = s.away;
  const vehicle = s.away.vehicle ?? null;
  const day = dayOf(defs, state.tick);
  const key = `${s.id}:${departTick}:${siteId}`;
  const hurt = num(state.seed, `${key}:danger`) % 100 < danger;
  const entry = state.scavenge.stash[siteId];
  const loot = {}, left = {};
  if (entry) {
    // her hands: the weight she can still carry (a hurt survivor drops part of the load: it stays in the stash)
    let weight = Math.max(0, vehicleCarry(defs, s.away.vehicle, carryCapacity(s, defs)) - carriedLoad(s, defs)); // R5: a vehicle multiplies what she can bring home
    if (hurt) weight = Math.floor((weight * cfg.hurtLootPercent) / 100);
    for (const item of Object.keys(entry.items).sort()) {
      const unit = defs.items[item]?.unitWeight ?? 1;
      const take = Math.min(entry.items[item], Math.floor(weight / unit), Math.max(0, storageRoom(state, item)));
      if (take > 0) { credit(state, stockKey(item), take); syncStock(state, defs, item); loot[item] = take; weight -= take * unit; entry.items[item] -= take; }
      if (entry.items[item] > 0) left[item] = entry.items[item]; else delete entry.items[item];
    }
    if (stashUnits(entry) === 0) delete state.scavenge.stash[siteId];
  }
  const away = returnTick - departTick;
  for (const need of ['hunger', 'thirst', 'energy']) s.needs[need] = Math.max(0, s.needs[need] - Math.floor((away * cfg.needsPer10Ticks[need]) / 10));
  if (hurt) s.needs.health = Math.max(1, s.needs.health - cfg.hurtDamage);
  s.status = 'active';
  delete s.away;
  const gate = state.buildings.gate ?? state.buildings.hq;
  s.position = { x: gate.x, y: gate.y };
  const got = Object.keys(loot).length > 0;
  if (got) awardSkillXp(ctx, s, 'scavenge');
  const outcome = hurt ? 'hurt' : got ? 'clean' : 'empty';
  // a retrieve run never touches the site's recovery (nothing was searched): only the history and the event
  state.scavenge.history.push({ day, survivorId: s.id, siteId, mode: 'retrieve', outcome, loot: { ...loot }, recoveryPercent: recoveryPercent(defs, state, siteId, day) });
  while (state.scavenge.history.length > cfg.historyLimit) state.scavenge.history.shift();
  ctx.emit('scavenge.returned', { survivorId: s.id, siteId, mode: 'retrieve', outcome, loot, leftBehind: left, recoveryPercent: recoveryPercent(defs, state, siteId, day), hurt, ...(vehicle ? { vehicle } : {}) });
  ctx.emit('stash.retrieved', { survivorId: s.id, siteId, hauled: loot, left, hurt, ...(vehicle ? { vehicle } : {}) });
}

/** Percent of each item a raid takes from the stash at `siteId` (data: stash.lossPercent). Pure. */
export function stashLossPercent(defs, state, siteId) {
  const st = defs.scavenge.stash; const entry = state.scavenge.stash?.[siteId];
  const base = entry?.protected ? st.lossPercent.protected : defs.scavenge.sites[siteId].ticks >= st.deepFromTicks ? st.lossPercent.deep : st.lossPercent.near;
  const fx = campEffect(state, defs, siteId); // R7: the road camp's guard caps the loss along its roads, never makes it worse
  return fx ? Math.min(base, fx.stashLossPercent) : base;
}

/** A wave started: every stash loses a share of each item (rounded up, never more than it holds). A protected (camped) stash loses the least. */
export function raidStashes(ctx) {
  const { state, defs } = ctx;
  for (const siteId of Object.keys(state.scavenge.stash).sort()) {
    const entry = state.scavenge.stash[siteId];
    const percent = stashLossPercent(defs, state, siteId);
    const lost = {};
    for (const item of Object.keys(entry.items).sort()) {
      const take = Math.min(entry.items[item], Math.ceil((entry.items[item] * percent) / 100));
      if (take > 0) { entry.items[item] -= take; lost[item] = take; }
      if (entry.items[item] <= 0) delete entry.items[item];
    }
    const wasProtected = Boolean(entry.protected);
    if (stashUnits(entry) === 0) delete state.scavenge.stash[siteId];
    if (Object.keys(lost).length) ctx.emit('stash.raided', { siteId, lost, percent, protected: wasProtected });
  }
}

/** A wave started: everyone still outside is lost (removed for good). Nothing recalls a survivor; bringing everyone in before dusk is the learner's job. */
export function loseAway(ctx) {
  const { state } = ctx;
  const day = dayOf(ctx.defs, state.tick);
  for (const s of sorted(state)) {
    if (s.status !== 'away') continue;
    state.scavenge.lost.push({ id: s.id, name: s.identity?.name ?? s.id, day, siteId: s.away?.siteId ?? null });
    for (const k of Object.keys(state.hooks ?? {})) if (state.hooks[k]?.actorId === s.id || k.startsWith(`${s.id}:`)) delete state.hooks[k];
    delete state.survivors[s.id];
    ctx.emit('survivor.lost', { survivorId: s.id, name: s.identity?.name ?? s.id, siteId: s.away?.siteId ?? null, cause: 'wave' });
  }
}

/** Why a scavenge / stash / retrieve command cannot start now (or null). Used by the handler. `mode` is the action type, `params` its command parameters. */
export function scavengeRefusal(state, defs, siteId, mode = 'scavenge', params = {}) {
  if (!Object.prototype.hasOwnProperty.call(defs.scavenge.sites, siteId)) return { code: 'UNKNOWN_TARGET', message: `There is no site \"${siteId}\". Read scavenge.sites for the ids.` };
  if (dayOf(defs, state.tick) < defs.scavenge.startDay) return { code: 'NOT_OPEN', message: `Expeditions start on day ${defs.scavenge.startDay}.` };
  const st = defs.scavenge.stash; const entry = state.scavenge.stash?.[siteId];
  if (mode === 'stash') {
    const rounds = params.rounds ?? 1;
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > st.rounds.max) return { code: 'INVALID_PARAMS', message: `rounds must be a whole number from 1 to ${st.rounds.max}.` };
    if (stashUnits(entry) >= st.capPerSite) return { code: 'STORAGE_FULL', message: `The stash at ${siteId} already holds ${st.capPerSite} units: retrieve it first.` };
  }
  if (mode === 'retrieve') {
    if (stashUnits(entry) === 0) return { code: 'NO_STASH', message: `There is no stash at ${siteId}. Read scavenge.sites[].stash.` };
    if (!Object.keys(entry.items).some((item) => storageRoom(state, item) > 0)) return { code: 'STORAGE_FULL', message: 'Base storage has no room for anything in that stash.' };
  }
  if (params.vehicle !== undefined) { // R5: only a haul run takes a vehicle; its own rules (garage, HQ, busy, fuel) live in buildings/vehicles.js
    if (mode !== 'retrieve') return { code: 'INVALID_PARAMS', message: 'Only survivor.retrieve takes a vehicle.' };
    const why = vehicleRefusal(state, defs, params.vehicle);
    if (why) return why;
  }
  return null;
}

const ticksToDusk = (defs, tick) => {
  const e = defs.environment; const t = timeOf(defs, tick);
  if (t.hour >= e.duskHour || t.hour < e.dawnHour) return 0;
  return Math.max(0, Math.round((e.duskHour - t.hour) * (e.ticksPerDay / 24)));
};

/** One site's stash for the learner: what it holds, how full it is, what a raid would take, and whether tonight is a raid night (an unprotected warning). */
function stashSiteView(state, defs, id, day) {
  const st = defs.scavenge.stash; const entry = state.scavenge.stash?.[id];
  const units = stashUnits(entry);
  const raidNight = !state.threats?.wave && Boolean(raidForDay(defs, state.seed, day) || bossForDay(defs, day));
  const road = roadPercent(state, defs, id);
  const retrieveTicks = tripPlan(defs, id, 'retrieve', { road }).ticks;
  return {
    items: { ...(entry?.items ?? {}) }, units, capacity: st.capPerSite, room: Math.max(0, st.capPerSite - units), protected: Boolean(entry?.protected),
    deep: defs.scavenge.sites[id].ticks >= st.deepFromTicks, lossPercent: stashLossPercent(defs, state, id), atRiskTonight: units > 0 && raidNight, retrieveTicks,
    retrieveTicksWith: Object.fromEntries(Object.keys(defs.vehicles.types).map((v) => [v, tripPlan(defs, id, 'retrieve', { vehicle: v, road }).ticks])), // R5: the same run with each vehicle
  };
}

/** What the road camp does for one site now (R7): { road, camp (the working level, 0 = none), ticksPercent, dangerCutPercent, stashLossPercent }. A front site is not on a road. */
function roadSiteView(state, defs, id) {
  const fx = campEffect(state, defs, id);
  return { road: defs.roads.regions.includes(defs.scavenge.sites[id].region ?? 'front'), camp: fx?.level ?? 0, ticksPercent: fx?.roadTicksPercent ?? 100, dangerCutPercent: fx?.dangerCutPercent ?? 0, stashLossPercent: fx?.stashLossPercent ?? null };
}

function sitesView(state, defs) {
  const day = dayOf(defs, state.tick);
  return Object.entries(defs.scavenge.sites).map(([id, st]) => {
    const percent = recoveryPercent(defs, state, id, day);
    const expected = {};
    for (const [item, [min, max]] of Object.entries(st.yield)) expected[item] = [Math.floor((min * percent) / 100), Math.floor((max * percent) / 100)];
    const rec = state.scavenge.sites[id];
    return {
      stash: stashSiteView(state, defs, id, day),
      id, name: st.name, region: st.region ?? 'front', ticks: st.ticks, ticksNow: tripPlan(defs, id, 'scavenge', { road: roadPercent(state, defs, id) }).ticks, danger: st.danger, dangerToday: runDanger(state, defs, id, day), regrowDays: st.regrowDays,
      road: roadSiteView(state, defs, id),
      recoveryPercent: percent, lastLootedDay: rec ? rec.lastDay : null, yield: Object.fromEntries(Object.entries(st.yield).map(([i, r]) => [i, [...r]])), expected,
      awayNow: Object.values(state.survivors).filter((s) => s.status === 'away' && s.away?.siteId === id).length,
    };
  });
}

function awayView(state) {
  return sorted(state).filter((s) => s.status === 'away' && s.away).map((s) => ({ survivorId: s.id, siteId: s.away.siteId, mode: s.away.mode ?? 'scavenge', returnTick: s.away.returnTick, returnsInTicks: Math.max(0, s.away.returnTick - state.tick), danger: s.away.danger, ...(s.away.vehicle ? { vehicle: s.away.vehicle } : {}) }));
}

/** The stash rules the learner can read (data: stash). */
function stashRulesView(defs) {
  const st = defs.scavenge.stash;
  return { capPerSite: st.capPerSite, deepFromTicks: st.deepFromTicks, lossPercent: { ...st.lossPercent }, maxRounds: st.rounds.max, roundTicks: st.rounds.ticks, falloffPercent: st.rounds.falloffPercent, campTicks: st.campTicks, haulTripPercent: st.haulTripPercent };
}

/** The learner's `scavenge` read. */
export function scavengeView(state, defs) {
  const day = dayOf(defs, state.tick);
  return {
    open: day >= defs.scavenge.startDay, opensOnDay: defs.scavenge.startDay, day,
    sites: sitesView(state, defs), away: awayView(state), stash: stashRulesView(defs),
    lost: state.scavenge.lost.map((l) => ({ ...l })), history: state.scavenge.history.map((h) => ({ ...h, loot: { ...h.loot } })),
  };
}

/** The learner's `board` read: everything that is coming or open, in one place (docs/game/21 section 9 `events.board`). */
export function boardView(state, defs) {
  const threats = threatsView(state, defs);
  const town = townView(state, defs);
  const events = eventsView(state, defs);
  const day = dayOf(defs, state.tick);
  return {
    day, duskInTicks: ticksToDusk(defs, state.tick),
    raids: threats.upcoming.map((r) => ({ day: r.day, inDays: r.inDays, strength: r.strength })),
    bosses: threats.bosses.map((b) => ({ day: b.day, inDays: b.inDays, boss: b.boss })),
    events: events.upcoming.map((e) => ({ day: e.day, inDays: e.inDays, id: e.id, name: e.name })),
    train: { present: town.train.present, arrivesInDays: town.train.arrivesInDays, leavesInDays: town.train.leavesInDays },
    sites: sitesView(state, defs).map((s) => ({ id: s.id, name: s.name, ticks: s.ticks, dangerToday: s.dangerToday, recoveryPercent: s.recoveryPercent })),
    away: awayView(state),
  };
}
