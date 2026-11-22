// Building card adapter (UI-C1C, presentation only).
// Covers HQ, kitchen, workshop, smelter, field/hydroponics, well/pump, generator/solar/battery, storage/tent, tower, wall and gate.
import { esc, cardStateOf, pct, toneFor } from './card-state.js';
import { metricBarHtml, mutedHtml, statusPillHtml } from './card-metrics.js';
import { renderCardActions } from './card-actions.js';
import { createCardView, renderCardShell, emptyCardView } from './card-shell.js';
import { buildingActionList } from '../actions.js';
import { wallCardHtml, isWallCard } from '../wallcard.js';

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

function towerBody(b) {
  const t = b.tower;
  if (!t) return '';
  const posted = (t.posted ?? []).length ? t.posted.join(', ') : 'nobody posted';
  const mounts = (t.installed ?? []).length
    ? t.installed.map((m) => `<div style="margin-top:4px;"><b>${esc(m.name ?? m.weapon)}</b> · ${esc(m.status)} · hopper ${m.hopper}/${m.hopperMax} ${esc(m.ammo)}</div>`).join('')
    : mutedHtml('No mounted weapons installed.');
  return `<div style="font-size:11px;">Range bonus: +${t.rangeBonus} · Free slots: ${t.freeSlots} · Posted: ${esc(posted)}</div><div style="margin-top:6px;">${mounts}</div>`;
}

function upgradeBody(b, view) {
  if (!b.upgrade) return mutedHtml('Top level reached.');
  const rows = Object.entries(b.upgrade.cost).map(([item, need]) => {
    const got = view?.base?.[item] ?? 0;
    return `<li class="${got >= need ? 'ok' : 'short'}"><span>${esc(item.replace(/_/g, ' '))}</span><span>${got} / ${need}</span></li>`;
  }).join('');
  const lock = b.upgradeLocked ? `<div class="wall-line wall-lock">🔒 Needs HQ level ${b.upgradeLocked.need} (yours is ${b.upgradeLocked.have}).</div>` : '';
  return `<div style="font-size:11px;">Next: <b>${esc(b.nextLevel?.name ?? `L${b.upgrade.level}`)}</b> (L${b.upgrade.level}) · ${b.upgrade.ticks} ticks</div><ul class="wall-cost">${rows}</ul>${lock}`;
}

export function buildBuildingCardView(b, view = {}, { wallTab = 'info', survivorId = null } = {}) {
  if (!b) return emptyCardView('Building not found');
  const severity = cardStateOf(b);
  const actions = buildingActionList(b, view);
  if (isWallCard(b)) {
    return createCardView({
      kind: 'building',
      id: b.id,
      title: b.name,
      subtitle: `${b.condition} · Lvl ${b.level}`,
      icon: '🧱',
      meta: [`ID: ${b.id}`, `Type: ${b.type}`],
      severity,
      sections: [{ id: 'sec:Wall', tab: 'info', raw: true, html: wallCardHtml(b, view, wallTab) }],
      metrics: [{ label: 'health', value: b.health, max: b.maxHealth }],
      actions,
      codeExamples: actions.map((a) => ({ label: a.label, snippet: a.snippet, reason: a.reason })),
    });
  }

  const healthPct = pct(b.health, b.maxHealth);
  const storageHtml = b.storageInfo
    ? Object.entries(b.storageInfo.capacity).map(([k, c]) =>
      metricBarHtml({ label: k, value: b.storageInfo.current[k] ?? 0, max: c, displayValue: `${b.storageInfo.current[k] ?? 0}/${c}`, tone: 'good' })
    ).join('')
    : '';

  const coldHtml = b.cold
    ? `<div style="font-size:11px;">${b.cold.working ? `Keeps the ${b.cold.capacity} oldest food units fresh: they age ${b.cold.factor}× slower.${b.cold.needsPower ? ' Powered.' : ' Needs no power.'}` : b.cold.needsPower && b.condition !== 'ruined' ? 'Freezer is off: it needs power, so food ages at the normal rate. Repair a generator or solar panel and keep it fuelled.' : 'Ruined: it protects nothing until it is repaired.'}</div>`
    : '';

  const sections = [
    { id: 'sec:Building', tab: 'info', icon: '🏗', title: 'Building', html: `<div class="needs-grid">${metricBarHtml({ label: 'health', value: b.health, max: b.maxHealth, tone: toneFor(healthPct) })}</div><div style="margin-top:6px;font-size:11px;">Condition: <b>${esc(b.condition)}</b> · Level ${b.level}${b.maxLevel ? ` of ${b.maxLevel}` : ''}</div>` },
    storageHtml ? { id: 'sec:Storage', tab: 'bag', icon: '📦', title: 'Storage', html: `<div class="needs-grid">${storageHtml}</div>` } : null,
    b.water ? { id: 'sec:Water', tab: 'info', icon: '💧', title: 'Water', html: waterBody(b) } : null,
    b.power ? { id: 'sec:Power', tab: 'info', icon: '⚡', title: 'Power', html: powerBody(b) } : null,
    b.farm ? { id: 'sec:Farm', tab: 'info', icon: '🌾', title: 'Farm', html: farmBody(b) } : null,
    b.tower ? { id: 'sec:Tower', tab: 'info', icon: '🗼', title: 'Tower', html: towerBody(b) } : null,
    b.cold ? { id: 'sec:Cold storage', tab: 'bag', icon: '❄', title: 'Cold storage', html: coldHtml } : null,
    b.upgrade ? { id: 'sec:Upgrade', tab: 'info', icon: '⬆', title: 'Upgrade', html: upgradeBody(b, view) } : null,
    { id: 'sec:Actions', tab: 'command', icon: '🔧', title: 'Actions', html: `${renderCardActions(actions, { view, survivorId: survivorId ?? view?.survivors?.[0]?.id })}${mutedHtml('Buttons add a command to the editor; nothing runs until you press Run.')}` },
  ].filter(Boolean);

  return createCardView({
    kind: 'building',
    id: b.id,
    title: b.name,
    subtitle: `${b.condition} · Lvl ${b.level}`,
    icon: '🏗',
    meta: [`ID: ${b.id}`, `Type: ${b.type}`],
    severity,
    tabs: [
      { id: 'info', label: 'Info' },
      { id: 'bag', label: 'Storage' },
      { id: 'command', label: 'Command' },
    ],
    sections,
    metrics: [{ label: 'health', value: b.health, max: b.maxHealth }],
    actions,
    codeExamples: actions.filter((a) => a.enabled).slice(0, 3).map((a) => ({ label: a.label, snippet: a.snippet, reason: a.reason })),
  });
}

export function renderBuildingCard(b, view, opts = {}) {
  return renderCardShell(buildBuildingCardView(b, view, opts), opts);
}
