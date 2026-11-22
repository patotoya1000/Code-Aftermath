// The wall / gate card (docs/game/23 section 7). Presentation only: it reads the student view and puts code in the editor (buttons never run anything).
// Tabs: INFO (level, health, armor, what the next level gives) | UPGRADE (recipe with have/need, the HQ level it needs, the real button) | CODE (copyable snippets).
// The STRIPS tab arrives with P4 (reserved catwalk / outer-defence slots).
import { buildingActionList, actionButtons } from './actions.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const WALL_TABS = Object.freeze(['info', 'upgrade', 'code']);
export const isWallCard = (b) => b?.type === 'fence' || b?.type === 'gate';
const have = (view, item) => view?.base?.[item] ?? 0;

function tabBar(tab) {
  return `<div class="wall-tabs" role="tablist">${WALL_TABS.map((t) => `<button type="button" role="tab" class="wall-tab${t === tab ? ' on' : ''}" aria-selected="${t === tab}" data-action="wall-tab" data-tab="${t}">${t.toUpperCase()}</button>`).join('')}</div>`;
}

function infoTab(b) {
  const pct = Math.round((b.health / b.maxHealth) * 100);
  const armor = b.armor !== undefined ? `<div class="wall-line">Armor <b>${b.armor}</b>: every zombie hit on it is reduced by ${b.armor}.</div>` : '';
  const next = b.nextLevel ? `<div class="wall-line">Next: <b>${esc(b.nextLevel.name)}</b> (L${b.level + 1}) · ${b.nextLevel.maxHealth} HP${b.nextLevel.armor !== undefined ? ` · armor ${b.nextLevel.armor}` : ''}</div>` : '<div class="wall-line">Top level: nothing stronger to build.</div>';
  const pooled = b.type === 'fence' ? '<div class="wall-line wall-muted">One building: every wall segment shares this health.</div>' : '';
  return `<div class="wall-line"><b>${esc(b.name)}</b> · level ${b.level} of ${b.maxLevel} · ${esc(b.condition)}</div>
    <div class="wall-hp"><i style="width:${pct}%" class="${pct < 25 ? 'bad' : pct < 60 ? 'warn' : 'good'}"></i></div>
    <div class="wall-line">${b.health} / ${b.maxHealth} HP</div>${armor}${pooled}${next}`;
}

function upgradeTab(b, view) {
  const up = b.upgrade;
  const list = buildingActionList(b, view).filter((a) => a.id === 'repair' || a.id === 'upgrade');
  const buttons = actionButtons(list, { view });
  if (!up) return `<div class="wall-line">Top level reached: there is no further upgrade.</div>${buttons}`;
  const rows = Object.entries(up.cost).map(([item, need]) => {
    const got = have(view, item);
    return `<li class="${got >= need ? 'ok' : 'short'}"><span>${esc(item.replace(/_/g, ' '))}</span><span>${got} / ${need}</span></li>`;
  }).join('');
  const lock = b.upgradeLocked ?? null;
  const hqLine = up.minHq ? `<div class="wall-line ${lock ? 'wall-lock' : 'wall-ok'}">${lock ? `🔒 Needs HQ level ${lock.need} (yours is ${lock.have}).` : `HQ level ${up.minHq} needed: yours is high enough.`}</div>` : '';
  const repairLine = b.condition !== 'repaired' || b.health < b.maxHealth ? '<div class="wall-line wall-muted">Repair it fully before upgrading.</div>' : '';
  return `<div class="wall-line">To <b>${esc(b.nextLevel?.name ?? `L${up.level}`)}</b> (L${up.level}) · ${up.ticks} ticks of work</div>
    <ul class="wall-cost">${rows}</ul>${hqLine}${repairLine}${buttons}`;
}

function codeTab(b, view) {
  const snippets = [
    { id: 'repair', label: `survivor.repair(${b.id})`, snippet: `survivor.repair(${b.id});`, enabled: true, reason: 'Puts this command in the editor.' },
    { id: 'upgrade', label: `survivor.upgrade(${b.id})`, snippet: `survivor.upgrade(${b.id});`, enabled: true, reason: 'Puts this command in the editor.' },
  ];
  return `<div class="wall-line wall-muted">These buttons only add the command to the editor. Press Run to send it.</div>${actionButtons(snippets, { view })}`;
}

/** The whole wall / gate card for a student-view building `b` and the selected tab (an unknown tab shows INFO). */
export function wallCardHtml(b, view, tab = 'info') {
  const t = WALL_TABS.includes(tab) ? tab : 'info';
  const body = t === 'upgrade' ? upgradeTab(b, view) : t === 'code' ? codeTab(b, view) : infoTab(b);
  return `<div class="section wall-card"><h3><span class="icon">🧱</span>${esc(b.type === 'gate' ? 'Gate' : 'Wall')}</h3>${tabBar(t)}<div class="wall-body">${body}</div></div>`;
}
