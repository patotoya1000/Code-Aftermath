import { AftermathError, deepFreeze } from '../../kernel/index.js';
import { items, carry } from './data/items.js';
import { actions, needs, clock, policies, hooks } from './data/actions.js';
import { survivorTemplates, SKILLS, TRAITS, progression } from './data/survivors.js';
import { nodeTypes, buildings, scenarios } from './data/world.js';
import { lessons } from './data/lessons.js';
import { environment } from './data/environment.js';
import { recipes } from './data/recipes.js';
import { crops, farming } from './data/crops.js';
import { events, eventSchedule } from './data/events.js';
import { zombies, raidSchedule, bosses, bossSchedule, waveRules, lootTables } from './data/threats.js';
import { weapons, towers, noise } from './data/arsenal.js';
import { town } from './data/town.js';

const KNOWN_HANDLERS = ['move', 'gather', 'deposit', 'rest', 'consume', 'repair', 'upgrade', 'cook', 'farm', 'combat', 'guard', 'collect', 'take', 'equip', 'mount', 'reload', 'lure'];

const onRectEdge = ({ x1, y1, x2, y2 }, x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2 && (x === x1 || x === x2 || y === y1 || y === y2);
const isTile = (s, x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < s.map.width && y < s.map.height;

/** Geometry rules a scenario must satisfy (so a bad layout fails at load time, not as a rendering glitch). */
function validateWorldLayout(id, s, d, need) {
  const where = (e) => `${e.id} (${e.x},${e.y})`;
  const fences = s.buildings.filter((b) => b.bounds);
  for (const f of fences) {
    const { x1, y1, x2, y2 } = f.bounds;
    need(isTile(s, x1, y1) && isTile(s, x2, y2) && x1 < x2 && y1 < y2, `scenario ${id}: ${f.id} bounds must be a rectangle inside the map`);
  }
  const ids = new Set();
  for (const e of [...s.buildings, ...s.nodes, ...s.survivors]) {
    need(typeof e.id === 'string' && e.id, `scenario ${id}: every building, node and survivor needs an id`);
    need(!ids.has(e.id), `scenario ${id}: id \"${e.id}\" is used twice (learner code names things by id)`);
    ids.add(e.id);
  }
  const taken = new Map();
  const footCells = (b) => { const f = d.buildings[b.type]?.footprint; if (!f || b.bounds) return null; return { x1: b.x + f.x, y1: b.y + f.y, x2: b.x + f.x + f.w - 1, y2: b.y + f.y + f.h - 1 }; };
  for (const b of s.buildings) { // PA-5: every cell of a footprint is owned by that building
    const r = footCells(b); if (!r) continue;
    need(isTile(s, r.x1, r.y1) && isTile(s, r.x2, r.y2), `scenario ${id}: ${where(b)} footprint is outside the map`);
    for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) {
      if (x === b.x && y === b.y) continue; // the door cell is registered with the building below
      const k = `${x},${y}`;
      need(!taken.has(k), `scenario ${id}: ${where(b)} footprint overlaps ${taken.get(k)} at ${k}`);
      taken.set(k, b.id);
      need(!fences.some((f) => onRectEdge(f.bounds, x, y)), `scenario ${id}: ${where(b)} footprint touches the fence line at ${k}`);
      for (const sv of s.survivors) need(sv.x !== x || sv.y !== y, `scenario ${id}: survivor ${sv.id} starts inside the footprint of ${b.id}`);
    }
  }
  for (const e of [...s.buildings.filter((b) => !b.bounds), ...s.nodes]) {
    need(isTile(s, e.x, e.y), `scenario ${id}: ${where(e)} is outside the ${s.map.width}x${s.map.height} map`);
    const key = `${e.x},${e.y}`;
    need(!taken.has(key), `scenario ${id}: ${where(e)} shares a tile with ${taken.get(key)}`);
    taken.set(key, e.id);
  }
  for (const b of s.buildings.filter((q) => !q.bounds)) {
    const onFence = fences.some((f) => onRectEdge(f.bounds, b.x, b.y));
    const wantsFence = Boolean(d.buildings[b.type]?.perimeter);
    need(wantsFence === onFence, wantsFence ? `scenario ${id}: ${where(b)} is a ${b.type} and must sit on the fence line` : `scenario ${id}: ${where(b)} must not sit on the fence line (only perimeter buildings such as the gate may)`);
  }
  for (const sv of s.survivors) need(isTile(s, sv.x, sv.y), `scenario ${id}: survivor ${where(sv)} is outside the map`);
  const t = s.terrain ?? {};
  for (const z of t.zones ?? []) need(isTile(s, z.x1, z.y1) && isTile(s, z.x2, z.y2) && z.x1 <= z.x2 && z.y1 <= z.y2 && typeof z.label === 'string', `scenario ${id}: zone ${z.id} needs a label and a rectangle inside the map`);
  for (const p of t.paths ?? []) need(p.cells?.length > 0 && p.cells.every(([x, y]) => isTile(s, x, y)), `scenario ${id}: path ${p.id} needs cells inside the map`);
}

export function validateDefinitions(d) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  for (const [id, it] of Object.entries(d.items)) {
    need(it.unitWeight > 0, `item ${id}: unitWeight must be > 0`);
    if (it.shelfLife !== undefined) need(Number.isInteger(it.shelfLife) && it.shelfLife >= 1, `item ${id}: shelfLife must be a whole number of days >= 1`);
  }
  for (const [id, n] of Object.entries(d.nodeTypes)) {
    need(d.items[n.yields], `nodeType ${id}: unknown item "${n.yields}"`);
    need(n.amount > 0, `nodeType ${id}: amount must be > 0`);
  }
  need(d.carry && d.carry.base > 0 && d.carry.perStrength >= 0, 'carry: base must be > 0 and perStrength >= 0');
  for (const [t, m] of Object.entries(d.carry?.traits ?? {})) need(d.traits[t] && m > 0, `carry: trait "${t}" is unknown or its multiplier is not > 0`);
  const c = d.clock;
  need(c && c.ticksPerSecond > 0, 'clock: ticksPerSecond must be > 0');
  need(Array.isArray(c?.speeds) && c.speeds.length > 0 && c.speeds.every((v) => v > 0), 'clock: speeds must be a non-empty list of positive numbers');
  need(c?.maxTicksPerFrame >= 1, 'clock: maxTicksPerFrame must be >= 1');
  need(c?.strategy?.max >= 1 && c.strategy.start >= 0 && c.strategy.start <= c.strategy.max && c.strategy.regenEvery >= 1, 'clock: strategy needs start <= max, max >= 1 and regenEvery >= 1');
  for (const [id, a] of Object.entries(d.actions)) {
    need(KNOWN_HANDLERS.includes(a.handler), `action ${id}: unknown handler "${a.handler}"`);
    if (a.item) need(d.items[a.item], `action ${id}: unknown item "${a.item}"`);
    if (a.handler === 'consume') {
      need(a.items && Object.keys(a.items).length > 0, `action ${id}: a consume action needs an items table`);
      for (const [it, c] of Object.entries(a.items ?? {})) need(d.items[it] && Number.isInteger(c.restore) && c.restore > 0 && Number.isInteger(c.rank) && c.rank >= 1, `action ${id}: item "${it}" needs a known item, a whole restore > 0 and a whole rank >= 1`);
      need(new Set(Object.values(a.items ?? {}).map((c) => c.rank)).size === Object.keys(a.items ?? {}).length, `action ${id}: item ranks must all differ (they decide the default order)`);
    }
    if (a.handler === 'farm') {
      need(Number.isInteger(a.maxCount) && a.maxCount >= 1, `action ${id}: maxCount must be a whole number >= 1`);
      need(Number.isInteger(a.waitTicks) && a.waitTicks >= 1, `action ${id}: waitTicks must be a whole number >= 1`);
      for (const k of ['plant', 'water', 'nourish', 'fertilize', 'harvest']) need(Number.isInteger(a.chore?.[k]) && a.chore[k] >= 1, `action ${id}: chore.${k} must be a whole number >= 1`);
    }
    if (a.handler === 'cook') {
      need(Number.isInteger(a.maxCount) && a.maxCount >= 1, `action ${id}: maxCount must be a whole number >= 1`);
      need(Number.isInteger(a.powerWaitTicks) && a.powerWaitTicks >= 1, `action ${id}: powerWaitTicks must be a whole number >= 1`);
    }
    if (a.handler === 'collect') need(['range', 'ticksPerTile', 'ticksPerUnit', 'unloadTicks'].every((k) => Number.isInteger(a[k]) && a[k] >= 1), `action ${id}: range, ticksPerTile, ticksPerUnit and unloadTicks must be whole numbers >= 1`);
    if (a.handler === 'equip') need(['range', 'ticksPerTile', 'ticks'].every((k) => Number.isInteger(a[k]) && a[k] >= 1), `action ${id}: range, ticksPerTile and ticks must be whole numbers >= 1`);
    if (a.handler === 'take') need(['range', 'ticksPerTile', 'ticks', 'maxAmount'].every((k) => Number.isInteger(a[k]) && a[k] >= 1), `action ${id}: range, ticksPerTile, ticks and maxAmount must be whole numbers >= 1`);
    if (a.handler === 'mount') need(['range', 'ticksPerTile', 'ticks', 'installTicks'].every((k) => Number.isInteger(a[k]) && a[k] >= 1), `action ${id}: range, ticksPerTile, ticks and installTicks must be whole numbers >= 1`);
    if (a.handler === 'lure') need(['range', 'ticksPerTile', 'ticks'].every((k) => Number.isInteger(a[k]) && a[k] >= 1), `action ${id}: range, ticksPerTile and ticks must be whole numbers >= 1`);
    if (a.handler === 'reload') need(['range', 'ticksPerTile', 'ticks', 'maxAmount'].every((k) => Number.isInteger(a[k]) && a[k] >= 1), `action ${id}: range, ticksPerTile, ticks and maxAmount must be whole numbers >= 1`);
    if (a.waitTicks !== undefined) need(Number.isInteger(a.waitTicks) && a.waitTicks >= 0, `action ${id}: waitTicks must be a whole number >= 0`);
  }
  const wholeAtLeast = (n, min) => Number.isInteger(n) && n >= min;
  const ROLES = ['common', 'runner', 'boomer', 'thrower', 'screamer', 'tank'];
  const whole = (n, min) => Number.isInteger(n) && n >= min;
  for (const [id, z] of Object.entries(d.zombies ?? {})) {
    need(typeof z.name === 'string' && ['threat', 'weight', 'health', 'speed'].every((k) => whole(z[k], 1)), `zombie ${id}: needs a name and whole threat, weight, health and speed >= 1`);
    need(whole(z.damage, 0) && whole(z.armor ?? 0, 0) && whole(z.firstDay ?? 1, 1), `zombie ${id}: damage and armor must be whole numbers >= 0 and firstDay a whole number >= 1`);
    need(ROLES.includes(z.role), `zombie ${id}: role must be one of ${ROLES.join(', ')}`);
    const bh = z.behaviour;
    if (bh) {
      need(['rush', 'siege', 'explode', 'throw', 'scream'].includes(bh.type), `zombie ${id}: unknown behaviour "${bh.type}"`);
      if (bh.type === 'rush') need(typeof bh.vanguard === 'boolean' && whole(bh.attackEveryTicks, 1), `zombie ${id}: rush needs a boolean vanguard and a whole attackEveryTicks >= 1`);
      if (bh.type === 'siege') need(whole(bh.stepTicks, 1) && whole(bh.attackEveryTicks, 1) && whole(bh.wallMultiplier, 1), `zombie ${id}: siege needs whole stepTicks, attackEveryTicks and wallMultiplier >= 1`);
      if (bh.type === 'explode') need(whole(bh.radius, 1) && whole(bh.fenceDamage, 0) && whole(bh.survivorDamage, 0), `zombie ${id}: explode needs a whole radius >= 1 and fenceDamage/survivorDamage >= 0`);
      if (bh.type === 'throw') need(whole(bh.range, 1) && whole(bh.damage, 1) && whole(bh.everyTicks, 1) && whole(bh.rubble, 0), `zombie ${id}: throw needs whole range, damage, everyTicks >= 1 and rubble >= 0`);
      if (bh.type === 'scream') need(whole(bh.cooldownTicks, 1) && whole(bh.summons, 1) && whole(bh.waveCap, bh.summons ?? 1), `zombie ${id}: scream needs whole cooldownTicks, summons >= 1 and waveCap >= summons`);
    }
  }
  for (const [id, b] of Object.entries(d.bosses ?? {})) {
    need(typeof b.name === 'string' && ['health', 'speed'].every((k) => whole(b[k], 1)) && whole(b.damage, 0) && whole(b.armor ?? 0, 0), `boss ${id}: needs a name, whole health and speed >= 1, damage and armor >= 0`);
    need(Object.entries(b.escorts ?? {}).every(([z, n]) => d.zombies?.[z] && whole(n, 1)), `boss ${id}: escorts must be known zombies with a whole count >= 1`);
    if (b.behaviour) need(b.behaviour.type === 'siege' && whole(b.behaviour.stepTicks, 1) && whole(b.behaviour.attackEveryTicks, 1) && whole(b.behaviour.wallMultiplier, 1), `boss ${id}: behaviour must be a siege with whole stepTicks, attackEveryTicks and wallMultiplier >= 1`);
    let last = 100;
    for (const ph of b.phases ?? []) {
      need(typeof ph.name === 'string' && whole(ph.belowPercent, 1) && ph.belowPercent < last && whole(ph.summons ?? 0, 0) && (ph.set === undefined || (b.behaviour && Object.keys(ph.set).every((k) => k in b.behaviour && whole(ph.set[k], 1)))), `boss ${id}: each phase needs a name, a belowPercent (1..99, falling), whole summons >= 0 and a \`set\` that only changes whole fields of its behaviour`);
      last = ph.belowPercent;
    }
  }
  const bs = d.bossSchedule;
  need(bs && d.bosses?.[bs.boss] && ['firstDay', 'everyDays', 'warnDays'].every((k) => whole(bs[k], 1)), 'bossSchedule: needs a known boss and whole firstDay, everyDays and warnDays >= 1');
  const wr = d.waveRules;
  need(wr && wr.recall === 'learner' && typeof wr.outsideFirst === 'boolean' && typeof wr.gateClosesDuringWave === 'boolean' && typeof wr.sortieOnlyAfterClear === 'boolean' && whole(wr.lootLingerDays, 0) && ['spawnEveryTicks', 'zombieStepTicks', 'attackEveryTicks'].every((k) => whole(wr[k], 1)) && whole(wr.wallArmorPerLevel, 0), 'waveRules: recall must be "learner", the flags booleans, lootLingerDays and wallArmorPerLevel whole numbers >= 0, spawnEveryTicks, zombieStepTicks and attackEveryTicks whole numbers >= 1');
  for (const [id, rows] of Object.entries(d.lootTables ?? {})) {
    need(d.zombies?.[id] || d.bosses?.[id], `lootTable ${id}: unknown zombie or boss`);
    for (const r of rows) need(d.items[r.item] && whole(r.min, 0) && whole(r.max, r.min ?? 0) && whole(r.chancePercent, 1) && r.chancePercent <= 100 && (r.requires === undefined || r.requires === 'not_exploded'), `lootTable ${id}: "${r.item}" needs a known item, whole min <= max and chancePercent 1..100`);
  }
  for (const id of [...Object.keys(d.zombies ?? {}), ...Object.keys(d.bosses ?? {})]) need((d.lootTables?.[id] ?? []).length > 0, `lootTable ${id}: every zombie and boss needs a loot table`);
  const WK = ['melee', 'ranged', 'mounted'];
  for (const [id, w] of Object.entries(d.weapons ?? {})) {
    need(typeof w.name === 'string' && WK.includes(w.kind) && whole(w.tier, 0) && whole(w.minCombat, 0) && whole(w.damage, 1) && whole(w.pierce, 0) && whole(w.noise, 0) && whole(w.reload, 1), `weapon ${id}: needs a name, a kind (${WK.join('/')}) and whole tier, damage >= 1, pierce, noise >= 0, reload >= 1`);
    need(w.kind === 'melee' ? whole(w.reach, 2) && w.ammo === null : whole(w.range, 1) && d.items[w.ammo], `weapon ${id}: melee needs reach >= 2 (the fence cell counts) and no ammo; ranged/mounted need a range and a known ammo item`);
    if (w.kind === 'mounted') need(whole(w.minTowerLevel, 2) && whole(w.hopper, 1) && (w.power === undefined || whole(w.power, 1)), `weapon ${id}: mounted needs minTowerLevel >= 2 (level 1 mounts nothing), hopper >= 1 and a whole power >= 1 if it uses the grid`);
    else need(w.power === undefined && w.hopper === undefined && w.minTowerLevel === undefined, `weapon ${id}: only mounted weapons have power, hopper or minTowerLevel`);
    if (w.craft) need(whole(w.craft.stationLevel, 1) && whole(w.craft.minSkill, 0) && Object.keys(w.craft.materials ?? {}).length > 0 && Object.entries(w.craft.materials).every(([i, n]) => d.items[i] && whole(n, 1)), `weapon ${id}: craft needs a station level, a minSkill and known materials with whole counts >= 1`);
    else need(w.starter === true, `weapon ${id}: only a starter weapon may have no craft recipe`);
  }
  need(Object.values(d.weapons ?? {}).some((w) => w.starter && w.kind === 'melee'), 'weapons: at least one starter melee weapon is required (a survivor always starts armed)');
  const tl = Object.keys(d.towers ?? {}).map(Number).sort((a, b) => a - b);
  need(tl.length > 0 && tl.every((l, i) => l === i + 1), 'towers: levels must be 1..n without gaps');
  for (const [lv, t] of Object.entries(d.towers ?? {})) {
    need(typeof t.name === 'string' && whole(t.maxHealth, 1) && whole(t.slots, 1) && whole(t.rangeBonus, 0), `tower ${lv}: needs a name and whole maxHealth, slots >= 1 and rangeBonus >= 0`);
    for (const m of t.mounts ?? []) need(d.weapons?.[m]?.kind === 'mounted' && d.weapons[m].minTowerLevel <= Number(lv), `tower ${lv}: "${m}" must be a mounted weapon whose minTowerLevel is at most ${lv}`);
  }
  for (const [lv, t] of Object.entries(d.towers ?? {})) {
    const L = d.buildings?.tower?.levels?.[lv];
    if (d.buildings?.tower) need(L && L.maxHealth === t.maxHealth && (L.name ?? d.buildings.tower.name) === t.name, `tower ${lv}: the tower building's level name and maxHealth must equal the towers table (${t.name}, ${t.maxHealth})`);
  }
  for (const [id, w] of Object.entries(d.weapons ?? {})) if (w.kind === 'mounted') {
    need(Object.values(d.towers ?? {}).some((t) => (t.mounts ?? []).includes(id)), `weapon ${id}: a mounted weapon must be listed in some tower level's mounts`);
    need(d.items?.[id] && d.recipes?.[id]?.outputs?.[id] === 1, `weapon ${id}: a mounted weapon needs an item and a workshop recipe that makes exactly one`);
  }
  const nz = d.noise;
  need(nz && ['decayPerTick', 'threshold', 'reinforceEvery', 'reinforceCap'].every((k) => whole(nz[k], 1)) && typeof nz.driftToLoudest === 'boolean' && whole(nz.suppressorPercent, 0) && nz.suppressorPercent <= 100 && whole(nz.scream, 0) && whole(nz.explosion, 0) && nz.lure && whole(nz.lure.attention, 1) && whole(nz.lure.tower, 1), 'noise: whole decayPerTick, threshold, reinforceEvery, reinforceCap >= 1, a boolean driftToLoudest, suppressorPercent 0..100, whole scream and explosion >= 0 and lure { attention, tower } >= 1');
  const rs = d.raidSchedule;
  need(rs && Object.keys(d.zombies ?? {}).length > 0 && ['startDay', 'warnDays', 'historyLimit', 'strengthBase'].every((k) => Number.isInteger(rs[k]) && rs[k] >= 1) && Number.isInteger(rs.strengthPerDay) && rs.strengthPerDay >= 0 && Number.isInteger(rs.chancePercent) && rs.chancePercent >= 0 && rs.chancePercent <= 100 && Number.isInteger(rs.variancePercent) && rs.variancePercent >= 0 && rs.variancePercent <= 99, 'raidSchedule: whole numbers (chancePercent 0..100, variancePercent 0..99) and at least one zombie are required');
  need(rs && Number.isInteger(rs.defense?.perLevel) && rs.defense.perLevel >= 1 && Number.isInteger(rs.defense.damagedPercent) && rs.defense.damagedPercent >= 0 && rs.defense.damagedPercent <= 100 && Number.isInteger(rs.breached?.lootPercent) && rs.breached.lootPercent >= 0 && rs.breached.lootPercent <= 100 && Array.isArray(rs.breached?.loot) && rs.breached.loot.every((i) => d.items[i]), 'raidSchedule: defense and breached tables need whole numbers and known loot items');
  const es = d.eventSchedule;
  need(es && Number.isInteger(es.startDay) && es.startDay >= 1 && Number.isInteger(es.chancePercent) && es.chancePercent >= 0 && es.chancePercent <= 100 && Number.isInteger(es.warnDays) && es.warnDays >= 1 && Number.isInteger(es.historyLimit) && es.historyLimit >= 1, 'eventSchedule: startDay >= 1, chancePercent 0..100, warnDays >= 1 and historyLimit >= 1 must be whole numbers');
  for (const [id, ev] of Object.entries(d.events ?? {})) {
    need(typeof ev.name === 'string' && Number.isInteger(ev.weight) && ev.weight >= 1 && typeof ev.harm === 'boolean', `event ${id}: needs a name, a whole weight >= 1 and a true/false harm`);
    if (ev.kind === 'lose_stock') need(Array.isArray(ev.items) && ev.items.length > 0 && ev.items.every((i) => d.items[i]) && Number.isInteger(ev.percent) && ev.percent >= 1 && ev.percent <= 100, `event ${id}: lose_stock needs known items and a whole percent 1..100`);
    else if (ev.kind === 'damage_building') need(Array.isArray(ev.types) && ev.types.length > 0 && ev.types.every((t) => d.buildings[t]) && Number.isInteger(ev.healthPercent) && ev.healthPercent >= 1 && ev.healthPercent <= 99, `event ${id}: damage_building needs known building types and a whole healthPercent 1..99`);
    else if (ev.kind === 'gain_stock') need(ev.items && Object.keys(ev.items).length > 0 && Object.entries(ev.items).every(([i, q]) => d.items[i] && Number.isInteger(q) && q >= 1), `event ${id}: gain_stock needs known items with whole quantities`);
    else need(false, `event ${id}: unknown kind "${ev.kind}"`);
  }
  const tw = d.town;
  need(tw && ['startDay', 'rotateDays', 'offers', 'historyLimit'].every((k) => Number.isInteger(tw[k]) && tw[k] >= 1), 'town: startDay, rotateDays, offers and historyLimit must be whole numbers >= 1');
  need(tw && Object.keys(tw.payWith ?? {}).length > 0 && Object.entries(tw.payWith).every(([i, v]) => d.items[i] && Number.isInteger(v) && v >= 1), 'town: payWith needs known items with a whole value >= 1 (no money, only items)');
  need(tw && Array.isArray(tw.payOrder) && tw.payOrder.length > 0 && tw.payOrder.every((i) => tw.payWith?.[i]), 'town: payOrder must list only items in payWith');
  need(tw && Object.entries(tw.beds ?? {}).every(([t, n]) => d.buildings[t] && Number.isInteger(n) && n >= 1), 'town: beds needs known building types with a whole bed count >= 1');
  const tp = tw?.pricing;
  need(tp && ['base', 'perSkillLevel', 'perAttributePoint', 'perTrait', 'minWorth'].every((k) => Number.isInteger(tp[k]) && tp[k] >= 0) && tp.minWorth >= 1, 'town: pricing numbers must be whole numbers >= 0 (minWorth >= 1)');
  const tc = tw?.candidates;
  need(tc && d.survivorTemplates[tc.template] && Number.isInteger(tc.attribute?.min) && Number.isInteger(tc.attribute?.max) && tc.attribute.min >= 1 && tc.attribute.min <= tc.attribute.max && Number.isInteger(tc.skills?.count) && tc.skills.count >= 0 && Number.isInteger(tc.skills?.maxLevel) && tc.skills.maxLevel >= 1 && tc.skills.maxLevel <= d.progression.thresholds.length - 1 && (tc.skills.pool ?? []).every((s) => d.skills[s]) && tc.skills.pool.length >= tc.skills.count && Number.isInteger(tc.traitPercent) && tc.traitPercent >= 0 && tc.traitPercent <= 100 && Array.isArray(tc.names) && tc.names.length > 0, 'town: candidates needs a known template, an attribute range, skills { count, maxLevel, pool of known skills }, traitPercent 0..100 and names');
  const fm = d.farming;
  need(fm?.nutrients && d.items[fm.nutrients.item] && Number.isInteger(fm.nutrients.ticksPerUnit) && fm.nutrients.ticksPerUnit >= 1 && Number.isInteger(fm.nutrients.cap) && fm.nutrients.cap >= fm.nutrients.ticksPerUnit, 'farming: nutrients needs a known item, whole ticksPerUnit >= 1 and cap >= ticksPerUnit');
  need(fm?.fertilizer && d.items[fm.fertilizer.item] && Number.isInteger(fm.fertilizer.yieldBonus) && fm.fertilizer.yieldBonus >= 1, 'farming: fertilizer needs a known item and a whole yieldBonus % >= 1');
  if (fm?.fertilizer?.better) need(d.items[fm.fertilizer.better.item] && Number.isInteger(fm.fertilizer.better.yieldBonus) && fm.fertilizer.better.yieldBonus > fm.fertilizer.yieldBonus, 'farming: fertilizer.better needs a known item and a yieldBonus % above the plain fertilizer');
  need(fm && wholeAtLeast(fm.ticksPerWater, 1) && wholeAtLeast(fm.cap, fm.ticksPerWater ?? 1) && wholeAtLeast(fm.maxDamage, 0) && fm.maxDamage <= 99, 'farming: ticksPerWater >= 1, cap >= ticksPerWater and maxDamage 0..99 must be whole numbers');
  const hazards = new Set(Object.values(d.environment?.weather ?? {}).map((w) => w.hazard).filter(Boolean));
  for (const [id, crop] of Object.entries(d.crops ?? {})) {
    need(typeof crop.name === 'string' && crop.name, `crop ${id}: name must be non-empty text`);
    need(d.items[id], `crop ${id}: must also be an item (it is its own seed and its own harvest)`);
    need(wholeAtLeast(crop.growthTicks, 1), `crop ${id}: growthTicks must be a whole number >= 1`);
    need(wholeAtLeast(crop.seeds, 1), `crop ${id}: seeds must be a whole number >= 1`);
    need(wholeAtLeast(crop.yield, 1), `crop ${id}: yield must be a whole number >= 1`);
    for (const [h, pct] of Object.entries(crop.hazards ?? {})) need(hazards.has(h) && wholeAtLeast(pct, 0) && pct <= 100, `crop ${id}: hazard "${h}" must be a weather hazard with a whole % from 0 to 100`);
  }
  for (const [id, p] of Object.entries(d.policies ?? {})) {
    need(d.actions[p.action], `policy ${id}: unknown action \"${p.action}\"`);
    need(Object.values(d.survivorTemplates).every((t) => p.need in t.needs), `policy ${id}: unknown need \"${p.need}\"`);
    const range = (r) => r && Number.isInteger(r.min) && Number.isInteger(r.max) && r.min >= 1 && r.min <= r.default && r.default <= r.max && r.max <= d.needs.max;
    need(range(p.below), `policy ${id}: below needs integer min <= default <= max within 1..${d.needs.max}`);
    if (p.until) need(range(p.until) && p.until.default > p.below.default, `policy ${id}: until needs a valid range and a default above below's default`);
    need(Number.isInteger(p.retryEvery) && p.retryEvery >= 1, `policy ${id}: retryEvery must be >= 1`);
    if (p.prefer) need(d.actions[p.action]?.items, `policy ${id}: prefer needs an action with an items table`);
  }
  const hk = d.hooks ?? { events: {}, limits: {} };
  for (const [id, e] of Object.entries(hk.events)) need((e.on === 'condition' && typeof e.condition === 'string') || e.on === 'stopped', `hook ${id}: unknown trigger`);
  for (const k of ['perSurvivor', 'maxSourceChars', 'maxCommands', 'cooldownTicks']) need(Number.isInteger(hk.limits[k]) && hk.limits[k] >= 1, `hooks.limits.${k} must be a whole number >= 1`);
  for (const [id, b] of Object.entries(d.buildings)) {
    need(b.levels?.[1]?.maxHealth > 0, `building ${id}: level 1 needs maxHealth`);
    need(b.visual?.ruinedBelow < b.visual?.damagedBelow, `building ${id}: visual thresholds must be ruinedBelow < damagedBelow`);
    if (b.storage) {
      for (const [res, cap] of Object.entries(b.storage)) {
        need(d.items[res], `building ${id}: storage uses unknown item "${res}"`);
        need(cap > 0, `building ${id}: storage for ${res} must be > 0`);
      }
    }
    for (const res of Object.keys(b.repair?.cost ?? {})) need(d.items[res], `building ${id}: repair cost uses unknown item \"${res}\"`);
    if (b.footprint !== undefined) {
      const f = b.footprint;
      need(Number.isInteger(f.x) && Number.isInteger(f.y) && Number.isInteger(f.w) && Number.isInteger(f.h) && f.w >= 1 && f.h >= 1, `building ${id}: footprint needs whole numbers x, y and w, h >= 1`);
      need(f.x <= 0 && 0 < f.x + f.w && f.y <= 0 && 0 < f.y + f.h, `building ${id}: the footprint must contain the door cell (0, 0)`);
      need(!b.perimeter, `building ${id}: a perimeter building (the gate) has no footprint`);
    }
    const whole = (n) => Number.isInteger(n) && n >= 1;
    let sourceSeen = false;
    for (const [lvl, L] of Object.entries(b.levels)) {
      for (const [res, cap] of Object.entries(L.storage ?? {})) need(d.items[res] && cap > 0, `building ${id} level ${lvl}: storage for \"${res}\" needs a known item and a capacity > 0`);
      if (L.farm) {
        const f = L.farm;
        need(wholeAtLeast(f.plots, 1) && wholeAtLeast(f.growth, 1) && wholeAtLeast(f.yield, 1) && typeof f.shelter === 'boolean' && (f.indoor === undefined || typeof f.indoor === 'boolean') && (f.nutrients === undefined || typeof f.nutrients === 'boolean'), `building ${id} level ${lvl}: farm needs whole plots/growth/yield >= 1, a true/false shelter and an optional true/false indoor`);
      }
      if (sourceSeen) need(L.source, `building ${id} level ${lvl}: a source must continue at every higher level`);
      if (L.source) {
        sourceSeen = true;
        const s = L.source;
        need(d.items[s.resource], `building ${id} level ${lvl}: source uses unknown item \"${s.resource}\"`);
        need(whole(s.reservoir), `building ${id} level ${lvl}: source reservoir must be a whole number >= 1`);
        need(s.recharge && whole(s.recharge.every) && whole(s.recharge.amount), `building ${id} level ${lvl}: source recharge needs whole numbers every >= 1 and amount >= 1`);
      }
      if (L.power) {
        const p = L.power;
        const producer = p.output !== undefined; const consumer = p.use !== undefined; const storage = p.store !== undefined;
        need([producer, consumer, storage].filter(Boolean).length === 1, `building ${id} level ${lvl}: power must be EITHER a producer (output) OR a consumer (use) OR a battery (store)`);
        if (storage) need(whole(p.store.capacity) && whole(p.store.rate), `building ${id} level ${lvl}: a battery needs a whole capacity and rate >= 1`);
        if (producer) {
          need(whole(p.output), `building ${id} level ${lvl}: power output must be a whole number >= 1`);
          need((p.solar === true) !== Boolean(p.fuel), `building ${id} level ${lvl}: a producer is either solar (solar: true) or fuelled (fuel), not both and not neither`);
          if (p.fuel) need(d.items[p.fuel.item] && whole(p.fuel.every), `building ${id} level ${lvl}: fuel needs a known item and a whole number of ticks (every) >= 1`);
          if (p.fuel?.better) need(d.items[p.fuel.better.item] && whole(p.fuel.better.every) && p.fuel.better.item !== p.fuel.item, `building ${id} level ${lvl}: fuel.better needs a different known item and a whole number of ticks (every) >= 1`);
        }
        if (consumer) need(whole(p.use), `building ${id} level ${lvl}: power use must be a whole number >= 1`);
      }
      if (L.cold) need(Number.isInteger(L.cold.capacity) && L.cold.capacity >= 1 && Number.isInteger(L.cold.factor) && L.cold.factor >= 2, `building ${id} level ${lvl}: cold needs a whole capacity >= 1 and a whole factor >= 2`);
      if (L.siphon) {
        need(L.source, `building ${id} level ${lvl}: a siphon needs a source at the same level`);
        need(whole(L.siphon.every) && whole(L.siphon.amount) && whole(L.siphon.reach), `building ${id} level ${lvl}: siphon needs whole numbers every, amount and reach (all >= 1)`);
      }
    }
    if (b.note !== undefined) need(typeof b.note === 'string' && b.note, `building ${id}: note must be non-empty text`);
  }
  for (const [id, r] of Object.entries(d.recipes ?? {})) {
    const qtys = (t) => t && Object.keys(t).length > 0 && Object.entries(t).every(([it, q]) => d.items[it] && Number.isInteger(q) && q >= 1);
    need(d.buildings[r.station], `recipe ${id}: unknown station building "${r.station}"`);
    need(d.buildings[r.station]?.levels?.[r.stationLevel], `recipe ${id}: station "${r.station}" has no level ${r.stationLevel}`);
    need(qtys(r.inputs), `recipe ${id}: inputs need known items with whole quantities >= 1`);
    need(qtys(r.outputs), `recipe ${id}: outputs need known items with whole quantities >= 1`);
    need(Number.isInteger(r.ticks) && r.ticks >= 1, `recipe ${id}: ticks must be a whole number >= 1`);
    need(d.actions[r.action]?.handler === 'cook', `recipe ${id}: action "${r.action}" must be an action that uses the cook handler (cook or craft)`);
    need(d.skills[r.skill] && d.progression?.awards?.[r.action]?.skill === r.skill, `recipe ${id}: skill "${r.skill}" must be a known skill that the "${r.action}" award teaches`);
    need(r.power === undefined || (Number.isInteger(r.power) && r.power >= 1), `recipe ${id}: power must be a whole number >= 1`);
    need(Number.isInteger(r.minSkill) && r.minSkill >= 0, `recipe ${id}: minSkill must be a whole number >= 0`);
  }
  for (const [id, s] of Object.entries(d.scenarios)) {
    for (const b of s.buildings) {
      need(d.buildings[b.type], `scenario ${id}: unknown building type \"${b.type}\"`);
      if (b.water !== undefined) {
        const cap = d.buildings[b.type]?.levels?.[b.level ?? 1]?.source?.reservoir ?? 0;
        need(Number.isInteger(b.water) && b.water >= 0 && b.water <= cap, `scenario ${id}: ${b.id} water must be a whole number from 0 to its reservoir (${cap})`);
      }
    }
    for (const n of s.nodes) need(d.nodeTypes[n.type], `scenario ${id}: unknown node type "${n.type}"`);
    for (const sv of s.survivors) need(d.survivorTemplates[sv.template], `scenario ${id}: unknown template "${sv.template}"`);
    for (const k of Object.keys(s.stock)) need(d.items[k], `scenario ${id}: stock uses unknown item "${k}"`);
    validateWorldLayout(id, s, d, need);
  }
  for (const [skillId, skill] of Object.entries(d.skills)) {
    need(typeof skill.name === 'string' && skill.name, `skill ${skillId}: name must be non-empty text`);
    need(typeof skill.description === 'string', `skill ${skillId}: description must be text`);
  }
  const en = d.environment;
  need(en && Number.isInteger(en.ticksPerDay) && en.ticksPerDay >= 24 && en.ticksPerDay % 24 === 0, 'environment: ticksPerDay must be a multiple of 24');
  need(en && en.dawnHour >= 0 && en.duskHour <= 24 && en.dawnHour < en.duskHour && en.startHour >= 0 && en.startHour < 24, 'environment: dawnHour < duskHour within 0..24 and startHour within 0..23');
  for (const s of en?.seasons ?? []) {
    need(s.days >= 1 && (s.phases ?? []).reduce((n, p) => n + p.days, 0) === s.days, `environment season ${s.id}: phase lengths must add up to ${s.days} days`);
    for (const p of s.phases ?? []) need(en.weather[p.weather] && p.days >= 1, `environment season ${s.id}: unknown weather "${p.weather}" or empty phase`);
  }
  for (const [wid, w] of Object.entries(en?.weather ?? {})) {
    need(Number.isInteger(w.recharge) && w.recharge >= 0 && w.recharge <= 1000, `environment weather ${wid}: recharge must be a whole number of percent from 0 to 1000`);
    need(Number.isInteger(w.solar) && w.solar >= 0 && w.solar <= 200, `environment weather ${wid}: solar must be a whole number of percent from 0 to 200`);
  }
  need((en?.seasons ?? []).length > 0, 'environment: needs at least one season');
  const pr = d.progression;
  need(pr && Array.isArray(pr.thresholds) && pr.thresholds[0] === 0 && pr.thresholds.every((t, i) => i === 0 || t > pr.thresholds[i - 1]), 'progression: thresholds must start at 0 and strictly increase');
  need(pr && pr.floor >= 0 && pr.floor <= 1, 'progression: floor must be between 0 and 1');
  for (const [id, aw] of Object.entries(pr?.awards ?? {})) {
    need(d.skills[aw.skill], `progression award ${id}: unknown skill "${aw.skill}"`);
    need(aw.xp > 0 && aw.fullUntil >= 0 && aw.teachesUpTo > aw.fullUntil, `progression award ${id}: needs xp > 0 and teachesUpTo > fullUntil >= 0`);
  }
  for (const [traitId, trait] of Object.entries(d.traits)) {
    need(typeof trait.name === 'string' && trait.name, `trait ${traitId}: name must be non-empty text`);
    need(typeof trait.description === 'string', `trait ${traitId}: description must be text`);
  }
  for (const [id, s] of Object.entries(d.survivorTemplates)) {
    for (const skillId of Object.keys(s.skills ?? {})) need(d.skills[skillId], `survivor template ${id}: unknown skill \"${skillId}\"`);
    for (const traitId of s.traits ?? []) need(d.traits[traitId], `survivor template ${id}: unknown trait \"${traitId}\"`);
  }
  for (const [id, l] of Object.entries(d.lessons)) {
    need(d.scenarios[l.scenario], `lesson ${id}: unknown scenario "${l.scenario}"`);
    need(Array.isArray(l.goals) && l.goals.length > 0, `lesson ${id}: needs goals`);
    for (const g of l.goals ?? []) need(typeof g.check === 'string', `lesson ${id}: goal ${g.id} missing check`);
  }
  if (errors.length) throw new AftermathError('INVALID_DEFINITIONS', `Invalid definitions:\n- ${errors.join('\n- ')}`, { errors });
}

/** Build the validated, deeply-frozen definition set. `overrides` replaces whole top-level tables. */
export function createDefinitions(overrides = {}) {
  const defs = structuredClone({ items, carry, actions, needs, clock, policies, hooks, survivorTemplates, progression, environment, recipes, crops, farming, events, eventSchedule, town, zombies, raidSchedule, bosses, bossSchedule, waveRules, lootTables, weapons, towers, noise, nodeTypes, buildings, scenarios, lessons, skills: SKILLS, traits: TRAITS, ...overrides });
  for (const [id, crop] of Object.entries(defs.crops ?? {})) crop.id ??= id; // a crop knows its own id (the table key)
  validateDefinitions(defs);
  return deepFreeze(defs);
}
