// Building & defence card adapter (UI-7C, presentation only).
// Covers HQ, kitchen, workshop, smelter, field/hydroponics, well/pump, generator/solar/battery, storage/tent, tower, wall and gate.
import { esc, cardStateOf, pct, toneFor } from './card-state.js';
import { metricBarHtml, metricRowHtml, mutedHtml, statusPillHtml } from './card-metrics.js';
import { renderCardActions } from './card-actions.js';
import { createCardView, renderCardShell, emptyCardView } from './card-shell.js';
import { buildingActionList } from '../actions.js';
import { isWallCard } from '../wallcard.js';

export const BUILDING_DEFENCE_TABS = Object.freeze([
  Object.freeze({ id: 'info', label: 'Info' }),
  Object.freeze({ id: 'defence', label: 'Defence' }),
  Object.freeze({ id: 'upgrade', label: 'Upgrade' }),
  Object.freeze({ id: 'commands', label: 'Commands' }),
]);

export const BUILDING_GENERAL_TABS = Object.freeze([
  Object.freeze({ id: 'info', label: 'Info' }),
  Object.freeze({ id: 'upgrade', label: 'Upgrade' }),
  Object.freeze({ id: 'storage', label: 'Storage' }),
  Object.freeze({ id: 'commands', label: 'Commands' }),
]);

export const isDefenceBuilding = (b) => b?.type === 'tower' || isWallCard(b);
export const buildingTabsFor = (b) => (isDefenceBuilding(b) ? BUILDING_DEFENCE_TABS.slice() : BUILDING_GENERAL_TABS.slice());

const SIPHON_TEXT = {
  OFF: 'No siphon yet. Upgrade the well to add one.',
  BROKEN: 'Siphon is down: repair the well.',
  NO_POWER: 'Not pumping: the grid is not powering the pump. Repair a generator or solar panel and keep it fuelled.',
  NO_STORAGE: 'Not connected: no working water storage within reach. Repair a water tank near the well.',
  FULL: 'Connected, but base water storage is full.',
  ACTIVE: 'Connected: it fills base storage by itself.',
};

const POWER_TEXT = {
  RUNNING: 'Running: it is feeding the grid.',
  IDLE: 'Idle: nothing needs power (or nothing to store), so it burns no fuel.',
  NO_FUEL: 'Out of fuel: keep wood in base stock.',
  DARK: 'No light right now (night or heavy cloud): a panel makes nothing.',
  BROKEN: 'Ruined: repair it.',
  OFF: 'Not running yet.',
  CHARGING: 'Charging from surplus power.',
  DISCHARGING: 'Discharging: covering demand before any generator burns fuel.',
  POWERED: 'Powered.',
  NO_POWER: 'Not enough power: it is switched off until the grid can supply it.',
};

function waterBody(b) {
  const w = b.water;
  if (!w) return '';
  const every = w.recharge.percent > 0 ? Math.round((w.recharge.every * 100) / w.recharge.percent) : null;
  const refill = !w.working ? 'Ruined: the well gives and refills nothing until it is repaired.'
    : every === null ? 'The aquifer is dry right now (no refill in this weather).'
    : `Refills +${w.recharge.amount} every ~${every} ticks now (${w.recharge.percent}% of normal, about ${w.recharge.perDay}/day).`;
  const siphon = w.siphon
    ? `Siphon ${esc(w.siphon.status)} (reach ${w.siphon.reach}${w.siphon.target ? `, feeds ${esc(w.siphon.target)}` : ''}): ${esc(SIPHON_TEXT[w.siphon.status] ?? '')}`
    : esc(SIPHON_TEXT.OFF);
  return `<div class="needs-grid">${metricBarHtml({ label: 'reservoir', value: w.amount, max: w.capacity, displayValue: `${w.amount}/${w.capacity}`, tone: !w.working ? 'bad' : w.amount < 5 ? 'warn' : 'good' })}</div><div style="margin-top:6px;font-size:11px;">${esc(refill)}</div><div style="margin-top:4px;font-size:11px;">${siphon}</div>`;
}

function powerBody(b) {
  const p = b.power;
  if (!p) return '';
  const status = esc(POWER_TEXT[p.status] ?? p.status);
  const body = p.role === 'storage'
    ? `Battery: ${p.charge}/${p.capacity} stored, up to ${p.rate} per tick. <b>${esc(p.status)}</b>: ${status}`
    : p.role === 'consumer'
    ? `Uses ${p.use} power per tick. <b>${esc(p.status)}</b>: ${status}`
    : `${esc(p.kind === 'solar' ? 'Solar panel' : 'Generator')}: up to ${p.output} power, making ${p.producing} now. <b>${esc(p.status)}</b>: ${status}${p.fuel ? `<div style="margin-top:4px;">Fuel: 1 ${esc(p.fuel.item)} lasts ${p.fuel.every} ticks (${p.fuel.inStock} in stock, ${p.fuel.burnLeft} ticks left in the current one).</div>` : ''}`;
  return `<div style="font-size:11px;">${body}</div>`;
}

function farmBody(b) {
  const f = b.farm;
  if (!f) return '';
  const plots = f.plots ?? [];
  const growing = plots.filter((p) => p.crop && !p.ripe).length;
  const ripe = plots.filter((p) => p.ripe).length;
  const flags = [
    f.indoor ? 'Indoor' : 'Outdoor',
    f.needsPower ? (f.powered ? 'Powered' : 'Unpowered') : null,
    f.needsNutrients ? 'Needs nutrients' : null,
  ].filter(Boolean).map((x) => statusPillHtml(x)).join(' ');
  return `<div style="font-size:11px;">Plots: ${plots.length} · Growing: ${growing} · Ripe: ${ripe}</div><div style="margin-top:6px;">${flags}</div>`;
}

function recipesBody(b, view) {
  const list = b.recipes ?? [];
  if (!list.length) return mutedHtml('No recipes on this station.');
  const hqLevel = view?.hq?.level ?? 0;
  return `<div class="uc-metric-list">${list.map((r) => {
    const status = r.working
      ? 'Ready'
      : r.minHq && hqLevel < r.minHq
      ? `Needs HQ L${r.minHq}`
      : b.condition === 'repaired'
      ? `Needs ${b.type} L${r.stationLevel}`
      : 'Needs repair';
    return metricRowHtml(`${r.action}: ${r.id}`, status, { tone: r.working ? 'good' : 'warn' });
  }).join('')}</div>`;
}

function towerDefenceBody(b, actions, view, survivorId) {
  const t = b.tower;
  if (!t) return '';
  const posted = (t.posted ?? []).length ? t.posted.join(', ') : 'nobody posted';
  const maxMountRange = Math.max(0, ...(t.installed ?? []).map((m) => m.range ?? 0));
  const totalReach = maxMountRange > 0 ? maxMountRange + (t.rangeBonus ?? 0) : null;
  const mounts = (t.installed ?? []).length
    ? t.installed.map((m) => {
      const aim = m.aim ? ` · target ${esc(m.aim.id ?? `${m.aim.x},${m.aim.y}`)}` : '';
      const cd = m.cooldown ? ` · cooldown ${m.cooldown}` : '';
      return `<div style="margin-top:4px;"><b>${esc(m.name ?? m.weapon)}</b> · ${esc(m.status)} · hopper ${m.hopper}/${m.hopperMax} ${esc(m.ammo)}${cd}${aim}</div>`;
    }).join('')
    : mutedHtml('No mounted weapons installed.');
  const defActions = actions.filter((a) => a.id.startsWith('mount:') || a.id.startsWith('reload:') || a.id === 'guard');
  const btns = defActions.length ? `<div style="margin-top:8px;">${renderCardActions(defActions, { view, survivorId, showDisabledReasons: true })}</div>` : '';
  return `<div style="font-size:11px;">Range bonus: +${t.rangeBonus}${totalReach !== null ? ` (effective reach ${totalReach})` : ''} · Free slots: ${t.freeSlots} · Posted: ${esc(posted)}</div><div style="margin-top:6px;">${mounts}</div>${btns}`;
}

function wallDefenceBody(b, view, actions, survivorId) {
  const rows = [];
  if (b.armor !== undefined) rows.push(metricRowHtml('Armor', `${b.armor} (reduces hits by ${b.armor})`));
  if (b.type === 'gate') {
    const closed = Boolean(view?.threats?.wave?.active && view?.threats?.wave?.gateClosed);
    rows.push(metricRowHtml('Gate state', closed ? 'Closed (wave active)' : 'Open', { tone: closed ? 'warn' : 'good' }));
  }
  if (b.type === 'fence') {
    rows.push(metricRowHtml('Structure', 'Shared perimeter health'));
  }
  if (b.nextLevel?.armor !== undefined) {
    rows.push(metricRowHtml(`Next (L${b.level + 1})`, `${b.nextLevel.maxHealth} HP · armor ${b.nextLevel.armor}`));
  }
  const repairAct = actions.filter((a) => a.id === 'repair');
  const btns = repairAct.length ? `<div style="margin-top:8px;">${renderCardActions(repairAct, { view, survivorId, showDisabledReasons: true })}</div>` : '';
  return `<div class="uc-metric-list">${rows.join('')}</div>${btns}`;
}

function upgradeBody(b, view, actions, survivorId) {
  const upActions = actions.filter((a) => a.id === 'upgrade' || a.id === 'repair');
  const btns = upActions.length ? `<div style="margin-top:8px;">${renderCardActions(upActions, { view, survivorId, showDisabledReasons: true })}</div>` : '';
  if (!b.upgrade) return `${mutedHtml('Top level reached: there is no further upgrade.')}${btns}`;
  const rows = Object.entries(b.upgrade.cost).map(([item, need]) => {
    const got = view?.base?.[item] ?? 0;
    return `<li class="${got >= need ? 'ok' : 'short'}"><span>${esc(item.replace(/_/g, ' '))}</span><span>${got} / ${need}</span></li>`;
  }).join('');
  const lock = b.upgradeLocked ? `<div class="wall-line wall-lock">🔒 Needs HQ level ${b.upgradeLocked.need} (yours is ${b.upgradeLocked.have}).</div>` : '';
  const repairNote = b.condition !== 'repaired' || b.health < b.maxHealth ? '<div class="wall-line wall-muted">Repair it fully before upgrading.</div>' : '';
  return `<div style="font-size:11px;">Next: <b>${esc(b.nextLevel?.name ?? `L${b.upgrade.level}`)}</b> (L${b.upgrade.level}) · ${b.upgrade.ticks} ticks</div><ul class="wall-cost">${rows}</ul>${lock}${repairNote}${btns}`;
}

export function buildBuildingCardView(b, view = {}, { survivorId = null } = {}) {
  if (!b) return emptyCardView('Building not found');
  const severity = cardStateOf(b);
  const actions = buildingActionList(b, view);
  const actorId = survivorId ?? view?.survivors?.[0]?.id;
  const tabs = buildingTabsFor(b);

  const healthPct = pct(b.health, b.maxHealth);
  const storageHtml = b.storageInfo
    ? Object.entries(b.storageInfo.capacity).map(([k, c]) =>
      metricBarHtml({ label: k, value: b.storageInfo.current[k] ?? 0, max: c, displayValue: `${b.storageInfo.current[k] ?? 0}/${c}`, tone: 'good' })
    ).join('')
    : '';

  const coldHtml = b.cold
    ? `<div style="font-size:11px;">${b.cold.working ? `Keeps the ${b.cold.capacity} oldest food units fresh: they age ${b.cold.factor}× slower.${b.cold.needsPower ? ' Powered.' : ' Needs no power.'}` : b.cold.needsPower && b.condition !== 'ruined' ? 'Freezer is off: it needs power, so food ages at the normal rate. Repair a generator or solar panel and keep it fuelled.' : 'Ruined: it protects nothing until it is repaired.'}</div>`
    : '';

  const hasStorageTabContent = Boolean(storageHtml || b.cold || b.recipes || b.farm || b.water || b.power);

  const sections = [
    {
      id: 'sec:Building',
      tab: 'info',
      icon: isWallCard(b) ? '🧱' : b.type === 'tower' ? '🗼' : '🏗',
      title: 'Building',
      html: `<div class="needs-grid">${metricBarHtml({ label: 'health', value: b.health, max: b.maxHealth, tone: toneFor(healthPct) })}</div><div style="margin-top:6px;font-size:11px;">Condition: <b>${esc(b.condition)}</b> · Level ${b.level}${b.maxLevel ? ` of ${b.maxLevel}` : ''}</div>`,
    },
    b.water ? { id: 'sec:Water', tab: 'info', icon: '💧', title: 'Water', html: waterBody(b) } : null,
    b.power ? { id: 'sec:Power', tab: 'info', icon: '⚡', title: 'Power', html: powerBody(b) } : null,
    b.farm ? { id: 'sec:Farm', tab: 'info', icon: '🌾', title: 'Farm', html: farmBody(b) } : null,
    b.recipes ? { id: 'sec:Station', tab: 'info', icon: '🔨', title: 'Station', html: `<div style="font-size:11px;">Status: <b>${b.condition === 'repaired' ? 'Operating' : 'Ruined (needs repair)'}</b> · ${b.recipes.length} recipe(s)</div>` } : null,
    b.tower ? { id: 'sec:Defence', tab: 'defence', icon: '🗼', title: 'Defence', html: towerDefenceBody(b, actions, view, actorId) } : null,
    isWallCard(b) ? { id: 'sec:Defence', tab: 'defence', icon: '🧱', title: 'Defence', html: wallDefenceBody(b, view, actions, actorId) } : null,
    { id: 'sec:Upgrade', tab: 'upgrade', icon: '⬆', title: 'Upgrade', html: upgradeBody(b, view, actions, actorId) },
    !isDefenceBuilding(b) && storageHtml ? { id: 'sec:Storage', tab: 'storage', icon: '📦', title: 'Storage', html: `<div class="needs-grid">${storageHtml}</div>` } : null,
    !isDefenceBuilding(b) && b.cold ? { id: 'sec:Cold storage', tab: 'storage', icon: '❄', title: 'Cold storage', html: coldHtml } : null,
    !isDefenceBuilding(b) && b.recipes ? { id: 'sec:Production', tab: 'storage', icon: '🍳', title: 'Production', html: recipesBody(b, view) } : null,
    !isDefenceBuilding(b) && b.farm ? { id: 'sec:Plots', tab: 'storage', icon: '🌱', title: 'Plots', html: farmBody(b) } : null,
    !isDefenceBuilding(b) && b.water ? { id: 'sec:Reservoir', tab: 'storage', icon: '💧', title: 'Reservoir', html: waterBody(b) } : null,
    !isDefenceBuilding(b) && b.power ? { id: 'sec:Output', tab: 'storage', icon: '⚡', title: 'Power Output', html: powerBody(b) } : null,
    !isDefenceBuilding(b) && !hasStorageTabContent ? { id: 'sec:Storage', tab: 'storage', icon: '📦', title: 'Storage', html: mutedHtml('No storage or production capacity on this building.') } : null,
    { id: 'sec:Commands', tab: 'commands', icon: '🔧', title: 'Commands', html: `${renderCardActions(actions, { view, survivorId: actorId, showDisabledReasons: true })}${mutedHtml('Buttons add a command to the editor; nothing runs until you press Run.')}` },
  ].filter(Boolean);

  return createCardView({
    kind: 'building',
    id: b.id,
    title: b.name,
    subtitle: `${b.condition} · Lvl ${b.level}`,
    icon: isWallCard(b) ? '🧱' : b.type === 'tower' ? '🗼' : '🏗',
    meta: [`ID: ${b.id}`, `Type: ${b.type}`],
    severity,
    tabs,
    sections,
    metrics: [{ label: 'health', value: b.health, max: b.maxHealth }],
    actions,
    codeExamples: actions.filter((a) => a.enabled).slice(0, 3).map((a) => ({ label: a.label, snippet: a.snippet, reason: a.reason })),
  });
}

export function renderBuildingCard(b, view, opts = {}) {
  return renderCardShell(buildBuildingCardView(b, view, opts), opts);
}
