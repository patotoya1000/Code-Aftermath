// Panel HTML for the town, expeditions, power, water, resources, and events (UI-C1E).
// ONE place builds these rows, so the nav-bar panels (hud.js) and the TOWN / FRONT screens (screens.js) can never disagree.
// Every button only INSERTS CODE into the editor (data-action="insert"); nothing here changes the running world.
// Read-only over the learner `view` (studentView): pure functions, no DOM.
import { townActionList, trainActionList, scavengeActionList, stashActionList, actionButtons } from './actions.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const costHtml = (price) => price.map((p) => `<span class="${p.ok ? 'good' : 'bad'}">${p.qty} ${esc(p.item)}</span>`).join(' / ');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function panelEmptyHtml(message = 'Nothing to show.') {
  return `<div class="np-sub uc-empty">${esc(message)}</div>`;
}

/** Recruit board: who is at the gate, what they cost, a Hire button per offer. */
export function recruitHtml(view) {
  const t = view.town;
  if (!t?.open) return `<div class="np-sub">The town sends nobody before day ${esc(t?.opensOnDay ?? '?')}.</div>`;
  const head = `<div class="np-sub">Day ${t.day} · ${t.survivors} survivors · ${plural(t.freeBeds, 'free bed')} · new board in ${plural(t.nextBoardInDays, 'day')}. The town takes supplies only.</div>`;
  const rows = townActionList(view).map((a) => {
    const o = a.offer;
    const stats = [...Object.entries(o.skills).map(([k, v]) => `${k} ${v}`), ...o.traits].join(' · ') || 'no skills yet';
    return `<div class="np-row"><div class="np-main"><strong>${esc(o.name)}${o.train ? ' 🚆' : ''}</strong><span>${esc(stats)}</span><span class="np-sub">STR ${o.attributes.strength} AGI ${o.attributes.agility} END ${o.attributes.endurance} · worth ${o.worth}</span><span class="np-sub">${costHtml(a.price)}</span></div>${actionButtons([a], {})}</div>`;
  }).join('');
  return `${head}${rows || panelEmptyHtml('No recruit offers today.')}`;
}

/** Train status + the goods on board. */
export function trainHtml(view) {
  const t = view.town;
  if (!t?.open) return `<div class="np-sub">The town sends nobody before day ${esc(t?.opensOnDay ?? '?')}.</div>`;
  const tr = t.train;
  const head = tr?.present
    ? `<div class="np-sub"><strong>TRAIN IN</strong> · leaves in ${plural(tr.leavesInDays, 'day')}. Extra recruits are marked on the recruit board; goods below.</div>`
    : `<div class="np-sub">Next train: day ${tr?.nextArrivalDay} (in ${plural(tr?.arrivesInDays, 'day')}).</div>`;
  const goods = trainActionList(view).map((a) => {
    const g = a.goods;
    return `<div class="np-row"><div class="np-main"><strong>${esc(g.name)}</strong><span>${g.left} of ${g.qty} left</span><span class="np-sub">each: ${costHtml(a.price)}</span></div>${actionButtons([a], {})}</div>`;
  }).join('');
  return `${head}${goods}`;
}

/** The whole TOWN nav panel: the recruit board, then the train (identical to what hud.js showed before). */
export function townPanelHtml(view) {
  if (!view.town?.open) return recruitHtml(view);
  return `${recruitHtml(view)}${trainHtml(view)}`;
}

/** Beds and people: read-only. */
export function housingHtml(view) {
  const t = view.town;
  const rows = (view.survivors ?? []).map((s) => `<div class="np-sub"><strong>${esc(s.name)}</strong> · ${esc(s.status)}${s.task ? ` · ${esc(s.task.type)}` : ''}</div>`).join('');
  const beds = t?.open ? `<div class="np-sub">${t.survivors} survivors, ${t.beds} bed${t.beds === 1 ? '' : 's'}, ${plural(t.freeBeds, 'free bed')}. Repair or upgrade the hq or a tent for more beds.</div>` : `<div class="np-sub">The town opens on day ${esc(t?.opensOnDay ?? '?')}.</div>`;
  return `${beds}${rows}`;
}

/** Day, dusk, raid line + who is out, shared by the expeditions panel and the front screen. */
export function scavengeHeadHtml(view) {
  const sv = view.scavenge;
  if (!sv?.open) return `<div class="np-sub">Expeditions start on day ${esc(sv?.opensOnDay ?? '?')}.</div>`;
  const b = view.board ?? {};
  const head = `<div class="np-sub">Day ${sv.day} · ${b.duskInTicks > 0 ? `dusk in ${b.duskInTicks} ticks` : 'night: the gate is shut'} · ${(b.raids ?? []).length ? `raid on day ${esc(b.raids[0].day)}` : 'no raid announced'}. A survivor outside when a wave starts is lost.</div>`;
  const away = (sv.away ?? []).map((a) => `<div class="np-sub"><strong>${esc(a.survivorId)}</strong> is ${a.mode === 'stash' ? 'stashing at' : a.mode === 'retrieve' ? 'hauling the stash from' : 'at'} ${esc(a.siteId)}, back in ${a.returnsInTicks} ticks</div>`).join('');
  return `${head}${away}`;
}
export function scavengeLostHtml(view) {
  const lost = view.scavenge?.lost ?? [];
  return lost.length ? `<div class="np-sub bad">Lost outside: ${esc(lost.map((l) => l.name).join(', '))}</div>` : '';
}
/** One site's row (stats, expected loot, the real Scavenge button, and the camp stash with its Stash / Retrieve buttons). `siteId` null = every site. */
export function scavengeRowsHtml(view, siteId = null) {
  if (!view.scavenge?.open) return '';
  const stash = stashActionList(view);
  return scavengeActionList(view).filter((a) => !siteId || a.site.id === siteId).map((a) => {
    const s = a.site;
    const gain = Object.entries(s.expected).map(([i, r]) => `${r[0]}-${r[1]} ${esc(i)}`).join(', ');
    const mine = stash.filter((x) => x.site.id === s.id);
    return `<div class="np-row"><div class="np-main"><strong>${esc(s.name)}</strong><span>${s.ticks} ticks · danger ${s.dangerToday}% · ${s.recoveryPercent}% recovered</span><span class="np-sub">${gain}</span><span class="np-sub">${esc(a.reason)}</span>${stashLineHtml(s)}</div>${actionButtons([a, ...mine], {})}</div>`;
  }).join('');
}
/** The stash line of a site: what is out there, how full, the raid warning. Empty text when nothing is stashed. */
export function stashLineHtml(site) {
  const st = site.stash; if (!st || st.units < 1) return '';
  const items = Object.entries(st.items).map(([i, q]) => `${q} ${esc(i)}`).join(', ');
  const risk = st.atRiskTonight ? ` · <strong class="bad">RAID TONIGHT: ${st.lossPercent}% would be taken</strong>` : ` · a raid takes ${st.lossPercent}%`;
  return `<span class="np-sub${st.atRiskTonight ? ' bad' : ''}">Stash ${st.units}/${st.capacity}: ${items}${st.protected ? ' · camped' : ''}${risk}</span>`;
}
/** The whole EXPEDITIONS nav panel (identical to what hud.js showed before). */
export function scavengePanelHtml(view) {
  if (!view.scavenge?.open) return scavengeHeadHtml(view);
  return `${scavengeHeadHtml(view)}${scavengeRowsHtml(view)}${scavengeLostHtml(view)}`;
}

/** Raid forecast for the front screen: read-only (waves start by themselves at dusk; there is no command that starts one). */
export function raidHtml(view) {
  const b = view.board ?? {}; const w = view.threats?.wave;
  const lines = [];
  if (w?.active) lines.push(`<div class="np-sub bad"><strong>WAVE ACTIVE</strong>${w.gateClosed ? ' · the gate is shut' : ''}. Anyone outside the wall is prey.</div>`);
  lines.push(`<div class="np-sub">${b.duskInTicks > 0 ? `Dusk in ${b.duskInTicks} ticks.` : 'It is night.'}</div>`);
  const raids = (b.raids ?? []).map((r) => `<div class="np-sub"><strong>Day ${r.day}</strong> (${r.inDays === 0 ? 'tonight' : `in ${plural(r.inDays, 'day')}`}) · strength ${r.strength}</div>`).join('');
  const bosses = (b.bosses ?? []).map((r) => `<div class="np-sub bad"><strong>BOSS</strong> day ${r.day} (in ${plural(r.inDays, 'day')}): ${esc(r.boss)}</div>`).join('');
  lines.push(raids || (w?.active ? '' : '<div class="np-sub">No raid announced.</div>'), bosses);
  lines.push('<div class="np-sub">Waves come by themselves at dusk. Prepare: repair the wall, post guards, craft weapons. Bring everyone inside first.</div>');
  return lines.join('');
}

/** Power grid panel (UI-C1E): production, demand, battery storage, and building rows. */
export function powerPanelHtml(view) {
  const p = view?.power;
  if (!p) return panelEmptyHtml('No power grid data.');
  const head = `<div class="np-sub">Supply: <strong>${p.supply ?? 0}</strong> · Demand: <strong>${p.demand ?? 0}</strong> · Stored: <strong>${p.stored ?? 0}/${p.capacity ?? 0}</strong></div>`;
  const rows = (view.buildings ?? []).filter((b) => b.power).map((b) => {
    const bp = b.power;
    const detail = bp.role === 'storage' ? `${bp.charge}/${bp.capacity} stored` : bp.role === 'consumer' ? `uses ${bp.use}` : `${bp.producing}/${bp.output} power`;
    return `<div class="np-row"><div class="np-main"><strong>${esc(b.name)}</strong><span>${esc(bp.status)} · ${esc(detail)}</span></div></div>`;
  }).join('');
  return `${head}${rows || panelEmptyHtml('No power buildings.')}`;
}

/** Water panel (UI-C1E): wells, reservoirs, siphon status, and base water stock. */
export function waterPanelHtml(view) {
  const wells = (view?.buildings ?? []).filter((b) => b.water);
  const stock = view?.base?.water ?? 0;
  const cap = view?.base?.capacity?.water ?? 0;
  const head = `<div class="np-sub">Base water stock: <strong>${stock} / ${cap}</strong></div>`;
  if (!wells.length) return `${head}${panelEmptyHtml('No wells on this map.')}`;
  const rows = wells.map((b) => {
    const w = b.water;
    return `<div class="np-row"><div class="np-main"><strong>${esc(b.name)}</strong><span>${w.amount}/${w.capacity} reservoir · ${w.working ? 'working' : 'ruined'}</span>${w.siphon ? `<span class="np-sub">Siphon: ${esc(w.siphon.status)}</span>` : ''}</div></div>`;
  }).join('');
  return `${head}${rows}`;
}

/** Resources panel (UI-C1E): base stock vs capacity and perishables. */
export function resourcesPanelHtml(view) {
  const base = view?.base;
  if (!base) return panelEmptyHtml('No resource stock data.');
  const capMap = base.capacity ?? {};
  const rows = Object.keys(capMap).filter((k) => (base[k] ?? 0) > 0 || (capMap[k] ?? 0) > 0).map((k) => {
    const qty = base[k] ?? 0;
    const max = capMap[k] ?? 0;
    const res = base.reserved?.[k] ?? 0;
    return `<div class="np-row"><div class="np-main"><strong>${esc(k)}</strong><span>${qty}${max ? ` / ${max}` : ''}${res ? ` (${res} reserved)` : ''}</span></div></div>`;
  }).join('');
  return rows || panelEmptyHtml('No stored resources.');
}

/** Events panel (UI-C1E): upcoming risk events and recent history. */
export function eventsPanelHtml(view) {
  const ev = view?.events;
  if (!ev) return panelEmptyHtml('No event schedule.');
  const up = (ev.upcoming ?? []).map((e) => `<div class="np-row"><div class="np-main"><strong>Day ${e.day}: ${esc(e.kind)}</strong><span class="np-sub">${esc(e.summary ?? '')}</span></div></div>`).join('');
  const hist = (ev.history ?? []).slice(-5).reverse().map((e) => `<div class="np-sub">Day ${e.day}: ${esc(e.kind)}</div>`).join('');
  return `${up || panelEmptyHtml('No upcoming events announced.')}${hist ? `<div class="np-sub" style="margin-top:6px;"><strong>Recent</strong></div>${hist}` : ''}`;
}
