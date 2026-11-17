import { hashString } from '../../kernel/index.js';
import { stockKey, available, credit, discard } from '../resources/index.js';
import { applyHealth, maxHealthOf, isOperational, storageRoom } from '../buildings/index.js';
import { syncStock } from '../spoilage/index.js';
import { dayOf } from '../environment/index.js';

// Risk events (O18, data/events.js). The SCHEDULE is a pure function of (seed, day); applying one at dawn changes state only through the ledger and
// building health, and records a short history in state.events. Same seed + same ticks => same events: replay-safe.

const num = (seed, day, salt) => parseInt(hashString(`${seed}:${day}:${salt}`).slice(-8), 16);

/** The event scheduled for a calendar day: { day, id, roll } or null. Does not look at state. */
export function eventForDay(defs, seed, day) {
  const sc = defs.eventSchedule;
  if (day < sc.startDay) return null;
  if (num(seed, day, 'chance') % 100 >= sc.chancePercent) return null;
  const ids = Object.keys(defs.events).sort();
  const sum = ids.reduce((n, id) => n + defs.events[id].weight, 0);
  let pick = num(seed, day, 'kind') % sum;
  for (const id of ids) {
    if (pick < defs.events[id].weight) return { day, id, roll: num(seed, day, 'roll') };
    pick -= defs.events[id].weight;
  }
  return null;
}

const describe = (defs, e) => ({ id: e.id, name: defs.events[e.id].name, kind: defs.events[e.id].kind, harm: defs.events[e.id].harm });

/** Events scheduled for the days AFTER `tick`'s day, up to `warnDays` ahead: [{ day, inDays, id, name, kind, harm }]. */
export function upcomingEvents(defs, seed, tick) {
  const today = dayOf(defs, tick);
  const out = [];
  for (let d = today + 1; d <= today + defs.eventSchedule.warnDays; d++) {
    const e = eventForDay(defs, seed, d);
    if (e) out.push({ day: d, inDays: d - today, ...describe(defs, e) });
  }
  return out;
}

function applyEvent(ctx, e) {
  const { state, defs } = ctx;
  const def = defs.events[e.id];
  const detail = {};
  let outcome = 'none';
  if (def.kind === 'lose_stock') {
    for (const item of def.items) {
      const have = available(state, stockKey(item));
      const lost = Math.min(have, Math.ceil((have * def.percent) / 100));
      if (lost < 1) continue;
      discard(state, stockKey(item), lost);
      syncStock(state, defs, item);
      detail[item] = lost;
    }
    if (Object.keys(detail).length) outcome = 'lost';
  } else if (def.kind === 'damage_building') {
    const targets = Object.values(state.buildings).filter((b) => def.types.includes(b.type) && b.condition === 'repaired').sort((a, b) => (a.id < b.id ? -1 : 1));
    if (targets.length) {
      const b = targets[e.roll % targets.length];
      const to = Math.floor((maxHealthOf(defs, b) * def.healthPercent) / 100);
      const c = applyHealth(defs, b, Math.min(0, to - b.health));
      detail.buildingId = b.id;
      outcome = 'damaged';
      if (c.from !== c.to) ctx.emit('building.condition_changed', { buildingId: b.id, from: c.from, to: c.to });
    }
  } else if (def.kind === 'gain_stock') {
    for (const [item, qty] of Object.entries(def.items)) {
      const n = Math.min(qty, storageRoom(state, item));
      if (n < 1) continue;
      credit(state, stockKey(item), n);
      syncStock(state, defs, item);
      detail[item] = n;
    }
    if (Object.keys(detail).length) outcome = 'gained';
  }
  ctx.emit('event.happened', { day: e.day, event: e.id, kind: def.kind, outcome, detail });
  state.events.history.push({ day: e.day, id: e.id, name: def.name, outcome, detail });
  while (state.events.history.length > defs.eventSchedule.historyLimit) state.events.history.shift();
}

/** Called once when the calendar day changes (after the new day starts): warn about what is coming, then apply today's event. ctx = { state, defs, emit }. */
export function eventDay(ctx, day) {
  const { state, defs } = ctx;
  const ahead = eventForDay(defs, state.seed, day + defs.eventSchedule.warnDays);
  if (ahead) ctx.emit('event.warning', { day: ahead.day, inDays: defs.eventSchedule.warnDays, event: ahead.id, harm: defs.events[ahead.id].harm });
  const today = eventForDay(defs, state.seed, day);
  if (today) applyEvent(ctx, today);
}

/** The learner's `events` read: what is scheduled soon and what happened lately (oldest first). */
export function eventsView(state, defs) {
  return { upcoming: upcomingEvents(defs, state.seed, state.tick), history: state.events.history.map((h) => ({ day: h.day, id: h.id, name: h.name, outcome: h.outcome, detail: { ...h.detail } })) };
}
