// Action buttons that MIRROR the game's real rules (presentation only).
// Each entry is derived from the student view (what learner code may read), so a button is enabled exactly when the real command's
// documented requirements are met right now, and its tooltip says why not when they are not. A button never runs anything: it only
// puts a code snippet into the editor (data-action="insert"), so every command still goes through the sandbox like typed code.
// Rules come from the Codebook entries (src/modules/api/codebook-data.js): repair, upgrade, gather, deposit, cook/craft, eat, drink, rest, stop, queue, mount, reload, guard, collect, attack.

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
      reason: r.working ? `Runs 5 batches of ${r.id}.` : r.minHq && (view?.hq?.level ?? 0) < r.minHq ? `Needs HQ level ${r.minHq} (it is level ${view?.hq?.level ?? 0}): upgrade the hq first.` : b.condition === 'repaired' ? `Needs ${b.type} level ${r.stationLevel}: upgrade it first.` : 'Repair it first.' });
  }
  if (b.upgrade) {
    const short = Object.entries(b.upgrade.cost).filter(([k, v]) => have(view, k) < v).map(([k, v]) => `${v - have(view, k)} more ${k}`);
    const ready = b.condition === 'repaired' && b.health >= b.maxHealth;
    const lock = b.upgradeLocked ?? null; // P0: { need, have } while the HQ is below the level this upgrade needs
    out.push({ id: 'upgrade', label: `Upgrade → L${b.upgrade.level}`, snippet: `survivor.upgrade(${b.id});`, enabled: ready && !short.length && !lock,
      reason: lock ? `Needs HQ level ${lock.need} (it is level ${lock.have}): upgrade the hq first.` : !ready ? 'It must be fully repaired first.' : short.length ? `Short of ${short.join(', ')}.` : `Level ${b.upgrade.level} costs ${cost(b.upgrade.cost)}.` });
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
  if (s?.status === 'away') {
    return [{ id: 'away', label: 'Away on expedition', snippet: 'scavenge.away', enabled: false, reason: 'Away on expedition: commands are unavailable until return.' }];
  }
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

/** What can be done with a resource node right now. */
export function nodeActionList(node, view = {}) {
  if (!node) return [];
  const free = (view?.survivors ?? []).some((s) => s.status === 'active');
  const hasAmount = (node.amount ?? 0) > 0;
  return [{
    id: `gather:${node.resource}`,
    label: `Gather ${node.resource}`,
    snippet: `survivor.gather("${node.resource}", 20);`,
    enabled: hasAmount && free,
    reason: !hasAmount ? 'This node is depleted.' : !free ? 'No active survivor is available.' : `Hauls ${node.resource} to storage in loads of 20.`,
  }];
}

/** What can be done with a loot pile right now. */
export function lootActionList(pile, view = {}) {
  if (!pile) return [];
  const wave = !!view?.threats?.wave?.active;
  const free = (view?.survivors ?? []).some((s) => s.status === 'active');
  const hasQty = (pile.qty ?? 0) > 0;
  const reason = !hasQty ? 'The loot pile is empty.' : wave ? 'Cannot collect loot while a wave is active.' : !free ? 'No active survivor is available.' : `Collects ${pile.item} from the ground into base stock.`;
  return [{
    id: `collect:${pile.item}`,
    label: `Collect ${pile.item}`,
    snippet: `survivor.collect("${pile.item}");`,
    enabled: hasQty && !wave && free,
    reason,
  }];
}

/** What can be done with a zombie or wanderer right now. */
export function zombieActionList(zombie, view = {}) {
  if (!zombie) return [];
  const wave = !!view?.threats?.wave?.active;
  const isWanderer = zombie.wanderer === true || String(zombie.id ?? '').startsWith('wanderer_');
  const free = (view?.survivors ?? []).some((s) => s.status === 'active');
  const alive = (zombie.health ?? 1) > 0;
  const canAttack = alive && free && (wave || isWanderer);
  const reason = !alive ? 'Already defeated.' : !free ? 'No active survivor is available.' : (!wave && !isWanderer) ? 'No active wave.' : `Orders the survivor to attack ${zombie.id}.`;
  return [{
    id: `attack:${zombie.id}`,
    label: `Attack ${zombie.name ?? zombie.id}`,
    snippet: `survivor.attack("${zombie.id}");`,
    enabled: canAttack,
    reason,
  }];
}

/** What can be done with a mounted weapon on a tower right now. */
export function mountActionList(mount, tower, view = {}) {
  if (!mount || !tower) return [];
  const working = tower.condition !== 'ruined';
  const full = mount.hopper >= mount.hopperMax;
  const inStock = have(view, mount.ammo) > 0;
  return [{
    id: `reload:${mount.weapon}`,
    label: `Reload ${mount.name ?? mount.weapon}`,
    snippet: `survivor.take("${mount.ammo}", 20);\nsurvivor.reload(${tower.id}, "${mount.ammo}", 20);`,
    enabled: working && !full && inStock,
    reason: !working ? 'Repair the tower first.' : full ? 'The hopper is full.' : !inStock ? `No ${mount.ammo} in base stock.` : `Takes up to 20 ${mount.ammo} to the hopper.`,
  }];
}

/** Point a snippet at one specific survivor. The first survivor is plain `survivor.`; others are `survivors[i].`. */
export function addressSurvivor(snippet, view, survivorId) {
  const i = (view?.survivors ?? []).findIndex((x) => x.id === survivorId);
  return i > 0 ? snippet.replace(/\bsurvivor\./g, `survivors[${i}].`) : snippet;
}

/**
 * Town (W4): one entry per offer at the gate. `enabled` follows the real recruit rules (a free bed, not already hired, an accepted item in stock that
 * covers the price), `reason` says why not. The snippet is the real call: it pays with the first item that covers the price, like town.recruit().
 */
export function townActionList(view = {}) {
  const t = view.town;
  if (!t?.open) return [];
  return t.offers.map((o) => {
    const price = Object.entries(o.price).filter(([i]) => t.accepts[i]).map(([i, n]) => ({ item: i, qty: n, ok: (t.accepts[i].inStock ?? 0) >= n }));
    const payer = price.find((p) => p.ok);
    const reason = o.hired ? 'Already working for you.' : t.freeBeds < 1 ? 'No free bed: repair or upgrade the hq or a tent.' : !payer ? `Not enough supplies: ${price.map((p) => `${p.qty} ${p.item}`).join(' or ')}.` : `Pays ${payer.qty} ${payer.item} from base stock.`;
    return { id: `recruit:${o.id}`, offer: o, price, label: `Hire ${o.name}`, snippet: `town.recruit("${o.id}");`, enabled: !o.hired && t.freeBeds >= 1 && Boolean(payer), reason };
  });
}

/**
 * Town train (W5): one entry per goods line while the train is in. Enabled only when some is left, storage-independent rules the player can see
 * (stock covers the price); the snippet is the real call. Storage room is checked by the game itself and reported on refusal.
 */
export function trainActionList(view = {}) {
  const t = view.town;
  if (!t?.open || !t.train?.present) return [];
  return t.train.goods.map((g) => {
    const price = Object.entries(g.price).filter(([i]) => t.accepts[i]).map(([i, n]) => ({ item: i, qty: n, ok: (t.accepts[i].inStock ?? 0) >= n }));
    const payer = price.find((p) => p.ok);
    const reason = g.left < 1 ? 'Sold out.' : !payer ? `Not enough supplies: ${price.map((p) => `${p.qty} ${p.item}`).join(' or ')} each.` : `Pays ${payer.qty} ${payer.item} per unit from base stock.`;
    return { id: `buy:${g.id}`, goods: g, price, label: `Buy ${g.name}`, snippet: `town.buy("${g.id}");`, enabled: g.left > 0 && Boolean(payer), reason };
  });
}

/**
 * Expeditions (W3): one entry per scavenge site. `enabled` mirrors what the player can see: expeditions are open, no wave is on (dusk countdown not 0),
 * and the round trip fits before dusk. The snippet is the real call. Danger, recovery and a regrown site are shown by the panel.
 */
export function scavengeActionList(view = {}) {
  const sv = view.scavenge;
  if (!sv?.open) return [];
  const dusk = view.board?.duskInTicks ?? 0;
  const free = (view.survivors ?? []).some((s) => s.status === 'active');
  return sv.sites.map((s) => {
    const home = dusk > s.ticks + 10;
    const reason = !free ? 'Nobody is free to go.' : dusk === 0 ? 'The gate is shut at night.' : !home ? `The trip takes ${s.ticks} ticks and dusk is ${dusk} away: she would be lost if a wave starts.` : `${s.ticks} ticks away, ${s.dangerToday}% danger, ${s.recoveryPercent}% recovered.`;
    return { id: `scavenge:${s.id}`, site: s, label: `Scavenge ${s.name}`, snippet: `survivor.scavenge(\"${s.id}\");`, enabled: free && home, reason };
  });
}

/**
 * Camp stash (R2): per site a STASH button (a one-round trip into the site's stash, needs room there) and, only where something is stashed, a RETRIEVE button.
 * `enabled` mirrors the rules the player can see (free survivor, gate open, trip home before dusk, room / something to haul). The reason carries the raid warning:
 * a stash is only at risk on a raid night. Snippets are the real calls; rounds and { camp: true } are typed by hand (the Codebook shows them).
 */
export function stashActionList(view = {}) {
  const sv = view.scavenge;
  if (!sv?.open) return [];
  const dusk = view.board?.duskInTicks ?? 0;
  const free = (view.survivors ?? []).some((s) => s.status === 'active');
  const out = [];
  for (const s of sv.sites) {
    const st = s.stash; if (!st) continue;
    const gate = (ticks) => (!free ? 'Nobody is free to go.' : dusk === 0 ? 'The gate is shut at night.' : dusk <= ticks + 10 ? `The trip takes ${ticks} ticks and dusk is ${dusk} away: she would be lost if a wave starts.` : null);
    const stashWhy = gate(s.ticks) ?? (st.room < 1 ? `The stash holds ${st.capacity} units: retrieve it first.` : `One round, ${s.ticks} ticks; the haul stays here (${st.units}/${st.capacity} units). Add rounds or { camp: true } by hand.`);
    out.push({ id: `stash:${s.id}`, site: s, label: `Stash at ${s.name}`, snippet: `survivor.stash(\"${s.id}\");`, enabled: !gate(s.ticks) && st.room >= 1, reason: stashWhy });
    if (st.units > 0) {
      const risk = st.atRiskTonight ? ` A raid is due tonight: it takes ${st.lossPercent}% of this stash${st.protected ? ' (camped)' : ''}.` : ` A raid would take ${st.lossPercent}% of it${st.protected ? ' (camped)' : ''}.`;
      const why = gate(st.retrieveTicks) ?? `${st.retrieveTicks} ticks there and back, ${st.units} units waiting.${risk}`;
      out.push({ id: `retrieve:${s.id}`, site: s, label: `Retrieve ${s.name}`, snippet: `survivor.retrieve(\"${s.id}\");`, enabled: !gate(st.retrieveTicks), reason: why, atRisk: st.atRiskTonight });
    }
  }
  return out;
}

/** HTML for a list of actions. `view`+`survivorId` (optional) address the snippet to that survivor. */
export function actionButtons(list, { view, survivorId } = {}) {
  return `<div class="act-grid">${list.map((a) => {
    const snippet = survivorId ? addressSurvivor(a.snippet, view, survivorId) : a.snippet;
    return `<button type="button" class="act-btn" data-action="insert" data-snippet="${esc(snippet)}" title="${esc(a.reason)}"${a.enabled ? '' : ' disabled'}>${esc(a.label)}</button>`;
  }).join('')}</div>`;
}
