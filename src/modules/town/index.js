import { AftermathError, hashString } from '../../kernel/index.js';
import { stockKey, available, discard, credit } from '../resources/index.js';
import { isOperational, storageRoom } from '../buildings/index.js';
import { syncStock } from '../spoilage/index.js';
import { createSurvivor } from '../survivors/index.js';
import { dayOf } from '../environment/index.js';

// The town (W4, data/town.js, docs/game/21). It offers survivors to recruit, paid with resources. The offers are a pure function of (seed, day);
// the only state is which offers were already hired (`state.town.hired`) so one candidate cannot be hired twice, and a short history.
// Learner reads: the `town` view. Learner commands: `town.recruit(offerId, item?)` and `town.buy(goodsId, qty?, item?)` (api `recruit` / `buy`, instant: they work now or say why not).
// W5 the train: a pure (seed, visit number) schedule (`trainArrival`), cargo rolled from (seed, visit) (`trainCargo`); the only state is `state.town.bought` (units bought per goods id).

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

/** One candidate, rolled from (seed, period, slot). Pure. `extraSkills` (the train) adds that many starting skills. */
export function candidateFor(defs, seed, period, slot, extraSkills = 0) {
  const cfg = defs.town.candidates;
  const base = defs.survivorTemplates[cfg.template];
  const key = (salt) => num(seed, `${period}:${slot}:${salt}`);
  const range = cfg.attribute.max - cfg.attribute.min + 1;
  const attributes = {};
  for (const a of Object.keys(base.attributes)) attributes[a] = cfg.attribute.min + (key(`a:${a}`) % range);
  const skills = {};
  const pool = [...cfg.skills.pool];
  for (let i = 0; i < cfg.skills.count + extraSkills && pool.length; i++) {
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

/** Arrival day of train visit number `k` (1-based): firstDay, then a hashed gap of gapDays.min..max days after the previous one. Pure. */
export function trainArrival(defs, seed, k) {
  const tr = defs.town.train;
  let day = tr.firstDay;
  for (let i = 2; i <= k; i++) day += tr.gapDays.min + (num(seed, `gap:${i}`) % (tr.gapDays.max - tr.gapDays.min + 1));
  return day;
}

/** The train visit standing at the platform on `day`: { k, arrives, leaves } or null. */
export function trainOn(defs, seed, day) {
  const tr = defs.town.train;
  for (let k = 1; ; k++) {
    const arrives = trainArrival(defs, seed, k);
    if (arrives > day) return null;
    if (day < arrives + tr.stayDays) return { k, arrives, leaves: arrives + tr.stayDays };
  }
}

/** The next visit that arrives AFTER `day`: { k, arrives }. */
export function nextTrain(defs, seed, day) {
  for (let k = 1; ; k++) { const arrives = trainArrival(defs, seed, k); if (arrives > day) return { k, arrives }; }
}

/** What visit `k` carries: extra recruits and limited goods, each with a price per unit. Pure. */
export function trainCargo(defs, seed, k) {
  const tr = defs.town.train;
  const recruits = [];
  for (let slot = 0; slot < tr.recruits; slot++) recruits.push({ ...candidateFor(defs, seed, `t${k}`, slot, tr.bonusSkills), train: true });
  const ids = Object.keys(tr.goods).sort((a, b) => num(seed, `g:${k}:${a}`) - num(seed, `g:${k}:${b}`)).slice(0, tr.goodsPerVisit).sort();
  const goods = ids.map((item) => {
    const g = tr.goods[item];
    const qty = g.qty[0] + (num(seed, `q:${k}:${item}`) % (g.qty[1] - g.qty[0] + 1));
    return { id: `train_${k}_${item}`, item, name: defs.items[item].name, qty, worth: g.worth, price: priceIn(defs, g.worth) };
  });
  return { k, recruits, goods };
}

/** The offers standing at the gate on `day` (plus the train's recruits while it is in): [] before the town opens; hired ones are marked, not removed. */
export function offersForDay(defs, seed, day) {
  const period = periodOf(defs, day);
  if (!period) return [];
  const out = [];
  for (let slot = 0; slot < defs.town.offers; slot++) out.push(candidateFor(defs, seed, period, slot));
  const visit = trainOn(defs, seed, day);
  if (visit) out.push(...trainCargo(defs, seed, visit.k).recruits);
  return out;
}

const bedsOf = (state, defs) => Object.values(state.buildings).reduce((n, b) => (isOperational(b) ? n + (defs.town.beds[b.type] ?? 0) : n), 0);
const stockOf = (state, item) => available(state, stockKey(item));

/** Pick what to pay with: the named item (must be accepted), or the first of `payOrder` in stock that covers the price. Returns { item, qty } or throws. */
function chooseItem(state, defs, offer, wanted) {
  const price = offer.price;
  if (wanted !== undefined) {
    if (!defs.town.payWith[wanted]) throw new AftermathError('NOT_ACCEPTED', `The town does not take ${wanted}. It accepts: ${Object.keys(defs.town.payWith).join(', ')}.`);
    const qty = price[wanted];
    if (stockOf(state, wanted) < qty) throw new AftermathError('CANNOT_AFFORD', `${offer.name} costs ${qty} ${wanted} and base stock has ${stockOf(state, wanted)}.`);
    return { item: wanted, qty };
  }
  for (const item of defs.town.payOrder) {
    const qty = price[item];
    if (qty && stockOf(state, item) >= qty) return { item, qty };
  }
  const cheapest = defs.town.payOrder.map((item) => `${price[item]} ${item}`).join(' or ');
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

/**
 * Buy goods from the train (instant command `buy`). params = { offerId, qty? } (qty defaults to 1). Checked before anything changes: no train in
 * (NO_TRAIN), unknown goods (NO_SUCH_OFFER), not enough left (SOLD_OUT), no room in storage (STORAGE_FULL), payment (NOT_ACCEPTED / CANNOT_AFFORD).
 * Payment is the worth of the units, rounded up per item, from available stock; the goods go into base stock.
 */
export function buy(ctx, params) {
  const { state, defs } = ctx;
  const day = dayOf(defs, state.tick);
  const visit = trainOn(defs, state.seed, day);
  if (!visit) throw new AftermathError('NO_TRAIN', 'No train is in. Read town.train.nextArrivalDay.');
  const g = trainCargo(defs, state.seed, visit.k).goods.find((x) => x.id === params.offerId);
  if (!g) throw new AftermathError('NO_SUCH_OFFER', `The train carries no "${params.offerId}". Read town.train.goods for the ids.`);
  const qty = params.qty ?? 1;
  const left = g.qty - (state.town.bought[g.id] ?? 0);
  if (qty > left) throw new AftermathError('SOLD_OUT', left < 1 ? `${g.name} is sold out.` : `Only ${left} ${g.name} left on the train.`);
  if (storageRoom(state, g.item) < qty) throw new AftermathError('STORAGE_FULL', `Base storage has no room for ${qty} ${g.item}.`);
  const total = { name: `${qty} ${g.name}`, price: priceIn(defs, g.worth * qty) };
  const pay = chooseItem(state, defs, total, params.item);
  discard(state, stockKey(pay.item), pay.qty);
  syncStock(state, defs, pay.item);
  credit(state, stockKey(g.item), qty);
  syncStock(state, defs, g.item);
  state.town.bought[g.id] = (state.town.bought[g.id] ?? 0) + qty;
  state.town.history.push({ day, offerId: g.id, goods: g.item, qty, paid: { [pay.item]: pay.qty }, worth: g.worth * qty });
  while (state.town.history.length > defs.town.historyLimit) state.town.history.shift();
  ctx.emit('town.bought', { offerId: g.id, item: g.item, qty, paidItem: pay.item, paidQty: pay.qty });
}

/** Called once when the calendar day changes: announce a new board and the train's warning, arrival and departure. ctx = { state, defs, emit }. */
export function townDay(ctx, day) {
  const { state, defs } = ctx;
  const tr = defs.town.train;
  const arriving = nextTrain(defs, state.seed, day - 1);
  if (arriving.arrives === day + tr.warnDays) ctx.emit('train.warning', { day: arriving.arrives, inDays: tr.warnDays, visit: arriving.k });
  const here = trainOn(defs, state.seed, day);
  if (here && here.arrives === day) {
    const cargo = trainCargo(defs, state.seed, here.k);
    ctx.emit('train.arrived', { day, visit: here.k, leaves: here.leaves, recruits: cargo.recruits.map((r) => r.id), goods: cargo.goods.map((g) => g.id) });
  }
  const before = trainOn(defs, state.seed, day - 1);
  if (before && !here) ctx.emit('train.left', { day, visit: before.k });
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
    offers: offersForDay(defs, state.seed, day).map((o) => ({ id: o.id, name: o.name, attributes: { ...o.attributes }, skills: { ...o.skills }, traits: [...o.traits], worth: o.worth, price: { ...o.price }, train: o.train === true, hired: Boolean(state.town.hired[o.id]), canAfford: !state.town.hired[o.id] && t.payOrder.some((item) => stockOf(state, item) >= o.price[item]) })),
    train: trainView(state, defs, day),
    history: state.town.history.map((h) => ({ ...h, paid: { ...h.paid } })),
  };
}

function trainView(state, defs, day) {
  const visit = trainOn(defs, state.seed, day);
  const next = nextTrain(defs, state.seed, day);
  const base = { present: Boolean(visit), nextArrivalDay: next.arrives, arrivesInDays: next.arrives - day };
  if (!visit) return { ...base, leavesInDays: null, goods: [] };
  const goods = trainCargo(defs, state.seed, visit.k).goods.map((g) => {
    const left = g.qty - (state.town.bought[g.id] ?? 0);
    return { id: g.id, item: g.item, name: g.name, qty: g.qty, left, worth: g.worth, price: { ...g.price }, canAfford: left > 0 && defs.town.payOrder.some((i) => stockOf(state, i) >= g.price[i]) };
  });
  return { ...base, visit: visit.k, leavesInDays: visit.leaves - day, goods };
}
