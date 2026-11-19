// Action buttons that MIRROR the game's real rules (presentation only).
// Each entry is derived from the student view (what learner code may read), so a button is enabled exactly when the real command's
// documented requirements are met right now, and its tooltip says why not when they are not. A button never runs anything: it only
// puts a code snippet into the editor (data-action="insert"), so every command still goes through the sandbox like typed code.
// Rules come from the Codebook entries (src/modules/api/codebook-data.js): repair, upgrade, gather, deposit, cook/craft, eat, drink, rest, stop, queue, mount, reload, guard.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const cost = (c) => Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ');
const have = (view, item) => view?.base?.[item] ?? 0;

/** What can be done with this building right now. `view` = studentView(). */
export function buildingActionList(b, view = {}) {
  const out = [];
  const damaged = b.health < b.maxHealth || b.condition === 'ruined';
  const wood = have(view, 'wood');
  out.push({ id: 'repair', label: 'Repair', snippet: `survivor.repair(${b.id});`, enabled: damaged && wood > 0,
    reason: !damaged ? 'Already at full health.' : wood <= 0 ? 'Needs wood in base stock.' : 'She repairs it in steps, spending wood, until it is at full health.' });
  if (b.water) {
    out.push({ id: 'water', label: 'Fetch water', snippet: 'survivor.gather("water", 10);', enabled: !!b.water.working,
      reason: b.water.working ? 'Carries water from the well to storage.' : 'The well is ruined: repair it first.' });
  }
  for (const r of b.recipes ?? []) {
    out.push({ id: `${r.action}:${r.id}`, label: `${cap(r.action)} ${r.id}`, snippet: `survivor.${r.action}("${r.id}", 5);`, enabled: !!r.working,
      reason: r.working ? `Runs 5 batches of ${r.id}.` : b.condition === 'repaired' ? `Needs ${b.type} level ${r.stationLevel}: upgrade it first.` : 'Repair it first.' });
  }
  if (b.upgrade) {
    const short = Object.entries(b.upgrade.cost).filter(([k, v]) => have(view, k) < v).map(([k, v]) => `${v - have(view, k)} more ${k}`);
    const ready = b.condition === 'repaired' && b.health >= b.maxHealth;
    out.push({ id: 'upgrade', label: `Upgrade → L${b.upgrade.level}`, snippet: `survivor.upgrade(${b.id});`, enabled: ready && !short.length,
      reason: !ready ? 'It must be fully repaired first.' : short.length ? `Short of ${short.join(', ')}.` : `Level ${b.upgrade.level} costs ${cost(b.upgrade.cost)}.` });
  }
  if (b.tower) {
    const t = b.tower; const wave = !!view?.threats?.wave?.active;
    for (const w of t.mounts ?? []) {
      out.push({ id: `mount:${w}`, label: `Mount ${w}`, snippet: `survivor.mount(${b.id}, "${w}");`, enabled: !!t.working && t.freeSlots > 0 && have(view, w) > 0,
        reason: !t.working ? 'Repair the tower first.' : t.freeSlots <= 0 ? 'No free slot on this tower.' : have(view, w) <= 0 ? `No ${w} in base stock: craft it at the workshop.` : `Fits one ${w} in a free slot.` });
    }
    for (const m of t.installed ?? []) {
      const full = m.hopper >= m.hopperMax;
      out.push({ id: `reload:${m.weapon}`, label: `Reload ${m.name ?? m.weapon}`, snippet: `survivor.take("${m.ammo}", 20);\nsurvivor.reload(${b.id}, "${m.ammo}", 20);`, enabled: !!t.working && !full && have(view, m.ammo) > 0,
        reason: !t.working ? 'Repair the tower first.' : full ? 'The hopper is full.' : have(view, m.ammo) <= 0 ? `No ${m.ammo} in base stock.` : `Takes up to 20 ${m.ammo} to the hopper.` });
    }
    out.push({ id: 'guard', label: 'Guard', snippet: `survivor.guard(${b.id});`, enabled: wave && !!t.working,
      reason: !t.working ? 'Repair the tower first.' : wave ? 'She stands guard and shoots the nearest zombie in range.' : 'Guarding only works during a wave.' });
  }
  return out;
}

/** What this survivor can do right now (`s` = a student-view survivor or inspector card). */
export function survivorActionList(s, view = {}) {
  const out = [];
  const needs = s.needs ?? {};
  const food = Object.values(view?.foods ?? {}).some((f) => f.available > 0);
  out.push({ id: 'eat', label: 'Eat', snippet: 'survivor.eat();', enabled: needs.hunger < 100 && food,
    reason: needs.hunger >= 100 ? 'Not hungry.' : !food ? 'No food in base stock.' : 'Eats the cheapest food first.' });
  out.push({ id: 'drink', label: 'Drink', snippet: 'survivor.drink();', enabled: needs.thirst < 100 && have(view, 'water') > 0,
    reason: needs.thirst >= 100 ? 'Not thirsty.' : have(view, 'water') <= 0 ? 'No water in base stock.' : 'Drinks one water.' });
  out.push({ id: 'rest', label: 'Rest', snippet: 'survivor.rest(20);', enabled: needs.energy < 100,
    reason: needs.energy >= 100 ? 'Energy is full.' : 'Recovers energy for 20 ticks.' });
  const resources = [...new Set((view?.nodes ?? []).filter((n) => n.amount > 0).map((n) => n.resource))];
  const well = (view?.buildings ?? []).find((b) => b.water);
  if (well && !resources.includes('water')) resources.push('water');
  for (const r of resources) {
    const ok = r !== 'water' || !!well?.water?.working;
    out.push({ id: `gather:${r}`, label: `Gather ${r}`, snippet: `survivor.gather("${r}", 20);`, enabled: ok,
      reason: ok ? `Hauls ${r} to storage in loads of 20.` : 'The well is ruined: repair it first.' });
  }
  out.push({ id: 'deposit', label: 'Deposit', snippet: 'survivor.deposit();', enabled: (s.carry?.load ?? 0) > 0,
    reason: (s.carry?.load ?? 0) > 0 ? 'Unloads what she carries into base stock.' : 'She carries nothing.' });
  out.push({ id: 'queue', label: 'Queue next', snippet: 'survivor.queue();', enabled: true, reason: 'Commands after this are added to the end of her queue.' });
  out.push({ id: 'stop', label: 'Stop', snippet: 'survivor.stop();', enabled: !!s.task || (s.queued ?? 0) > 0,
    reason: s.task || (s.queued ?? 0) > 0 ? 'Cancels her running and queued jobs.' : 'She is not doing anything.' });
  return out;
}

/** Point a snippet at one specific survivor. The first survivor is plain `survivor.`; others are `survivors[i].`. */
export function addressSurvivor(snippet, view, survivorId) {
  const i = (view?.survivors ?? []).findIndex((x) => x.id === survivorId);
  return i > 0 ? snippet.replace(/\bsurvivor\./g, `survivors[${i}].`) : snippet;
}

/** HTML for a list of actions. `view`+`survivorId` (optional) address the snippet to that survivor. */
export function actionButtons(list, { view, survivorId } = {}) {
  return `<div class="act-grid">${list.map((a) => {
    const snippet = survivorId ? addressSurvivor(a.snippet, view, survivorId) : a.snippet;
    return `<button type="button" class="act-btn" data-action="insert" data-snippet="${esc(snippet)}" title="${esc(a.reason)}"${a.enabled ? '' : ' disabled'}>${esc(a.label)}</button>`;
  }).join('')}</div>`;
}
