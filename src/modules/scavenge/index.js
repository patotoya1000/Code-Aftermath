import { hashString } from '../../kernel/index.js';
import { stockKey, credit } from '../resources/index.js';
import { storageRoom } from '../buildings/index.js';
import { syncStock } from '../spoilage/index.js';
import { awardSkillXp } from '../survivors/index.js';
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

/** Leave: the survivor stands at the gate. Called by the scavenge handler when she arrives. */
export function depart(ctx, s, siteId) {
  const { state, defs } = ctx;
  const site = defs.scavenge.sites[siteId];
  s.status = 'away';
  s.away = { siteId, departTick: state.tick, returnTick: state.tick + site.ticks, danger: dangerOn(defs, state.seed, siteId, dayOf(defs, state.tick)) };
  ctx.emit('scavenge.departed', { survivorId: s.id, siteId, returnTick: s.away.returnTick, danger: s.away.danger });
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
  const day = dayOf(defs, state.tick);
  const key = `${s.id}:${departTick}:${siteId}`;
  const hurt = num(state.seed, `${key}:danger`) % 100 < danger;
  const percent = recoveryPercent(defs, state, siteId, day);
  const rolled = rollLoot(defs, state.seed, key, siteId, percent, hurt);
  const loot = {}, leftBehind = {};
  for (const [item, qty] of Object.entries(rolled)) {
    const take = Math.min(qty, Math.max(0, storageRoom(state, item)));
    if (take > 0) { credit(state, stockKey(item), take); syncStock(state, defs, item); loot[item] = take; }
    if (take < qty) leftBehind[item] = qty - take;
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
  state.scavenge.history.push({ day, survivorId: s.id, siteId, outcome, loot: { ...loot }, recoveryPercent: percent });
  while (state.scavenge.history.length > cfg.historyLimit) state.scavenge.history.shift();
  ctx.emit('scavenge.returned', { survivorId: s.id, siteId, outcome, loot, leftBehind, recoveryPercent: percent, hurt });
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

/** Why a scavenge command cannot start now (or null). Used by the handler. */
export function scavengeRefusal(state, defs, siteId) {
  if (!Object.prototype.hasOwnProperty.call(defs.scavenge.sites, siteId)) return { code: 'UNKNOWN_TARGET', message: `There is no site \"${siteId}\". Read scavenge.sites for the ids.` };
  if (dayOf(defs, state.tick) < defs.scavenge.startDay) return { code: 'NOT_OPEN', message: `Expeditions start on day ${defs.scavenge.startDay}.` };
  return null;
}

const ticksToDusk = (defs, tick) => {
  const e = defs.environment; const t = timeOf(defs, tick);
  if (t.hour >= e.duskHour || t.hour < e.dawnHour) return 0;
  return Math.max(0, Math.round((e.duskHour - t.hour) * (e.ticksPerDay / 24)));
};

function sitesView(state, defs) {
  const day = dayOf(defs, state.tick);
  return Object.entries(defs.scavenge.sites).map(([id, st]) => {
    const percent = recoveryPercent(defs, state, id, day);
    const expected = {};
    for (const [item, [min, max]] of Object.entries(st.yield)) expected[item] = [Math.floor((min * percent) / 100), Math.floor((max * percent) / 100)];
    const rec = state.scavenge.sites[id];
    return {
      id, name: st.name, ticks: st.ticks, danger: st.danger, dangerToday: dangerOn(defs, state.seed, id, day), regrowDays: st.regrowDays,
      recoveryPercent: percent, lastLootedDay: rec ? rec.lastDay : null, yield: Object.fromEntries(Object.entries(st.yield).map(([i, r]) => [i, [...r]])), expected,
      awayNow: Object.values(state.survivors).filter((s) => s.status === 'away' && s.away?.siteId === id).length,
    };
  });
}

function awayView(state) {
  return sorted(state).filter((s) => s.status === 'away' && s.away).map((s) => ({ survivorId: s.id, siteId: s.away.siteId, returnTick: s.away.returnTick, returnsInTicks: Math.max(0, s.away.returnTick - state.tick), danger: s.away.danger }));
}

/** The learner's `scavenge` read. */
export function scavengeView(state, defs) {
  const day = dayOf(defs, state.tick);
  return {
    open: day >= defs.scavenge.startDay, opensOnDay: defs.scavenge.startDay, day,
    sites: sitesView(state, defs), away: awayView(state),
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
