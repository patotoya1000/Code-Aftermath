import { AftermathError, hashString } from '../../kernel/index.js';
import { stockKey, available, discard } from '../resources/index.js';
import { isOperational } from '../buildings/index.js';
import { syncStock } from '../spoilage/index.js';
import { createSurvivor } from '../survivors/index.js';
import { dayOf } from '../environment/index.js';

// The town (W4, data/town.js, docs/game/21). It offers survivors to recruit, paid with resources. The offers are a pure function of (seed, day);
// the only state is which offers were already hired (`state.town.hired`) so one candidate cannot be hired twice, and a short history.
// Learner reads: the `town` view. Learner command: `town.recruit(offerId, item?)` (api `recruit`, instant: it either works now or says why not).

const num = (seed, key) => parseInt(hashString(`town:${seed}:${key}`).slice(-8), 16);

/** The board period a calendar day belongs to (0 = before the town opens). */
export function periodOf(defs, day) {
  const t = defs.town;
  return day < t.startDay ? 0 : Math.floor((day - t.startDay) / t.rotateDays) + 1;
}

/** Trade points a candidate is worth: a function of their skills, attributes and traits only. */
export function worthOf(defs, c) {
  const p = defs.town.pricing;
  const skills = Object.values(c.skills).reduce((n, v) => n + v, 0);
  const attrs = Object.values(c.attributes).reduce((n, v) => n + Math.max(0, v - 5), 0);
  return Math.max(p.minWorth, p.base + p.perSkillLevel * skills + p.perAttributePoint * attrs + p.perTrait * c.traits.length);
}

/** What the worth costs in each accepted item: { bread: 3, wheat: 8, ... } (whole units, rounded up). */
export function priceIn(defs, worth) {
  const out = {};
  for (const [item, value] of Object.entries(defs.town.payWith)) out[item] = Math.ceil(worth / value);
  return out;
}

/** One candidate, rolled from (seed, period, slot). Pure. */
export function candidateFor(defs, seed, period, slot) {
  const cfg = defs.town.candidates;
  const base = defs.survivorTemplates[cfg.template];
  const key = (salt) => num(seed, `${period}:${slot}:${salt}`);
  const range = cfg.attribute.max - cfg.attribute.min + 1;
  const attributes = {};
  for (const a of Object.keys(base.attributes)) attributes[a] = cfg.attribute.min + (key(`a:${a}`) % range);
  const skills = {};
  const pool = [...cfg.skills.pool];
  for (let i = 0; i < cfg.skills.count && pool.length; i++) {
    const pickAt = key(`s${i}`) % pool.length;
    const [name] = pool.splice(pickAt, 1);
    skills[name] = 1 + (key(`l${i}`) % cfg.skills.maxLevel);
  }
  const traitIds = Object.keys(defs.traits).sort();
  const traits = key('t') % 100 < cfg.traitPercent ? [traitIds[key('tt') % traitIds.length]] : [];
  const name = cfg.names[key('n') % cfg.names.length];
  const full = { name, attributes, skills: { ...base.skills, ...skills }, traits };
  const worth = worthOf(defs, full);
  return { id: `offer_${period}_${slot + 1}`, period, name, attributes, skills, traits, worth, price: priceIn(defs, worth) };
}

/** The offers standing at the gate on `day`: [] before the town opens; hired ones are marked, not removed. */
export function offersForDay(defs, seed, day) {
  const period = periodOf(defs, day);
  if (!period) return [];
  const out = [];
  for (let slot = 0; slot < defs.town.offers; slot++) out.push(candidateFor(defs, seed, period, slot));
  return out;
}

const bedsOf = (state, defs) => Object.values(state.buildings).reduce((n, b) => (isOperational(b) ? n + (defs.town.beds[b.type] ?? 0) : n), 0);
const stockOf = (state, item) => available(state, stockKey(item));

/** Pick what to pay with: the named item (must be accepted), or the first of `payOrder` in stock that covers the price. Returns { item, qty } or throws. */
function chooseItem(state, defs, offer, wanted) {
  if (wanted !== undefined) {
    if (!defs.town.payWith[wanted]) throw new AftermathError('NOT_ACCEPTED', `The town does not take ${wanted}. It accepts: ${Object.keys(defs.town.payWith).join(', ')}.`);
    const qty = offer.price[wanted];
    if (stockOf(state, wanted) < qty) throw new AftermathError('CANNOT_AFFORD', `${offer.name} costs ${qty} ${wanted} and base stock has ${stockOf(state, wanted)}.`);
    return { item: wanted, qty };
  }
  for (const item of defs.town.payOrder) {
    const qty = offer.price[item];
    if (qty && stockOf(state, item) >= qty) return { item, qty };
  }
  const cheapest = defs.town.payOrder.map((item) => `${offer.price[item]} ${item}`).join(' or ');
  throw new AftermathError('CANNOT_AFFORD', `Base stock cannot cover ${offer.name}: the price is ${cheapest}.`);
}

/**
 * Hire a candidate (instant command `recruit`). Everything is checked BEFORE anything changes, so a refusal costs nothing.
 * ctx = { state, defs, emit }.  params = { offerId, item? }.  Returns the new survivor's id.
 */
export function recruit(ctx, params) {
  const { state, defs } = ctx;
  const t = defs.town;
  const day = dayOf(defs, state.tick);
  if (day < t.startDay) throw new AftermathError('TOWN_CLOSED', `The town sends nobody before day ${t.startDay}.`);
  const offer = offersForDay(defs, state.seed, day).find((o) => o.id === params.offerId);
  if (!offer) throw new AftermathError('NO_SUCH_OFFER', `There is no offer "${params.offerId}" at the gate today. Read town.offers for the ids.`);
  if (state.town.hired[offer.id]) throw new AftermathError('ALREADY_HIRED', `${offer.name} (${offer.id}) is already working for you.`);
  const beds = bedsOf(state, defs);
  if (Object.keys(state.survivors).length >= beds) throw new AftermathError('NO_FREE_BED', `No free bed: ${Object.keys(state.survivors).length} survivors and ${beds} beds. Repair or upgrade housing (hq, tent) first.`);
  const pay = chooseItem(state, defs, offer, params.item);
  const gate = state.buildings.gate ?? state.buildings.hq;
  let n = Object.keys(state.survivors).length + 1;
  while (state.survivors[`survivor_${n}`]) n += 1;
  const id = `survivor_${n}`;
  const s = createSurvivor(defs, { id, template: t.candidates.template, name: offer.name, x: gate.x - 1, y: gate.y });
  Object.assign(s.attributes, offer.attributes);
  Object.assign(s.skills, offer.skills);
  s.traits = [...offer.traits];
  s.identity.background = `Sent by the town for ${pay.qty} ${pay.item}.`;
  discard(state, stockKey(pay.item), pay.qty);
  syncStock(state, defs, pay.item);
  state.survivors[id] = s;
  state.town.hired[offer.id] = id;
  state.town.history.push({ day, offerId: offer.id, survivorId: id, name: offer.name, paid: { [pay.item]: pay.qty }, worth: offer.worth });
  while (state.town.history.length > t.historyLimit) state.town.history.shift();
  ctx.emit('town.recruited', { offerId: offer.id, survivorId: id, name: offer.name, item: pay.item, qty: pay.qty, worth: offer.worth });
  return id;
}

/** Called once when the calendar day changes: announce a new board. ctx = { state, defs, emit }. */
export function townDay(ctx, day) {
  const { state, defs } = ctx;
  if (day < defs.town.startDay || periodOf(defs, day) === periodOf(defs, day - 1)) return;
  ctx.emit('town.offers', { day, period: periodOf(defs, day), offers: offersForDay(defs, state.seed, day).map((o) => o.id) });
}

/** The learner's `town` read (a plain frozen-able object). */
export function townView(state, defs) {
  const t = defs.town;
  const day = dayOf(defs, state.tick);
  const period = periodOf(defs, day);
  const count = Object.keys(state.survivors).length;
  const beds = bedsOf(state, defs);
  const nextChangeDay = period ? defs.town.startDay + period * t.rotateDays : t.startDay;
  return {
    open: period > 0, day, opensOnDay: t.startDay, nextBoardInDays: nextChangeDay - day,
    survivors: count, beds, freeBeds: Math.max(0, beds - count),
    accepts: Object.fromEntries(Object.entries(t.payWith).map(([item, value]) => [item, { value, inStock: stockOf(state, item) }])),
    offers: offersForDay(defs, state.seed, day).map((o) => ({ id: o.id, name: o.name, attributes: { ...o.attributes }, skills: { ...o.skills }, traits: [...o.traits], worth: o.worth, price: { ...o.price }, hired: Boolean(state.town.hired[o.id]), canAfford: !state.town.hired[o.id] && t.payOrder.some((item) => stockOf(state, item) >= o.price[item]) })),
    history: state.town.history.map((h) => ({ ...h, paid: { ...h.paid } })),
  };
}
