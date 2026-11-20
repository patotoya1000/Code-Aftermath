// Panel HTML for the town and the expeditions (W3/W4/W5). ONE place builds these rows, so the nav-bar panels (hud.js) and the TOWN / FRONT screens
// (screens.js) can never disagree. Every button only INSERTS CODE into the editor (data-action="insert"); nothing here changes the running world.
// Read-only over the learner `view` (studentView): pure functions, no DOM.
import { townActionList, trainActionList, scavengeActionList, actionButtons } from './actions.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const costHtml = (price) => price.map((p) => `<span class="${p.ok ? 'good' : 'bad'}">${p.qty} ${esc(p.item)}</span>`).join(' / ');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
  return `${head}${rows}`;
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
  const away = (sv.away ?? []).map((a) => `<div class="np-sub"><strong>${esc(a.survivorId)}</strong> is at ${esc(a.siteId)}, back in ${a.returnsInTicks} ticks</div>`).join('');
  return `${head}${away}`;
}
export function scavengeLostHtml(view) {
  const lost = view.scavenge?.lost ?? [];
  return lost.length ? `<div class="np-sub bad">Lost outside: ${esc(lost.map((l) => l.name).join(', '))}</div>` : '';
}
/** One site's row (stats, expected loot, the real Scavenge button). `siteId` null = every site. */
export function scavengeRowsHtml(view, siteId = null) {
  if (!view.scavenge?.open) return '';
  return scavengeActionList(view).filter((a) => !siteId || a.site.id === siteId).map((a) => {
    const s = a.site;
    const gain = Object.entries(s.expected).map(([i, r]) => `${r[0]}-${r[1]} ${esc(i)}`).join(', ');
    return `<div class="np-row"><div class="np-main"><strong>${esc(s.name)}</strong><span>${s.ticks} ticks · danger ${s.dangerToday}% · ${s.recoveryPercent}% recovered</span><span class="np-sub">${gain}</span><span class="np-sub">${esc(a.reason)}</span></div>${actionButtons([a], {})}</div>`;
  }).join('');
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
