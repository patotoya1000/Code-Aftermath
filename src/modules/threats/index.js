import { hashString, chebyshev, directionFromDelta } from '../../kernel/index.js';
import { stockKey, available, discard } from '../resources/index.js';
import { applyHealth, blockedTiles, findPath } from '../buildings/index.js';
import { syncStock } from '../spoilage/index.js';
import { dayOf, timeOf } from '../environment/index.js';
import { awardSkillXp } from '../survivors/index.js';

// Threats (O19 groundwork, data/threats.js). A RAID is a night attack by a number of zombies. Whether a day has a raid, its strength and its zombies are
// a pure function of (seed, day): nothing random is saved, replays cannot diverge, and the schedule (strength + composition) is public `warnDays` ahead.
// It is resolved abstractly at DUSK against the base's defence (the fence). No zombie moves on the map yet: that is the later combat phase.

const num = (seed, day, salt) => parseInt(hashString(`${seed}:${day}:raid:${salt}`).slice(-8), 16);

/** The stat block of a zombie OR boss type (`defs.zombies` first, then `defs.bosses`). */
export const statsOf = (defs, type) => defs.zombies[type] ?? defs.bosses[type];

/** The behaviour a living zombie acts on NOW: its stat block's behaviour with the `set` of every boss phase it has entered applied. */
export function behaviourFor(defs, z) {
  const def = statsOf(defs, z.type);
  if (!def.behaviour || !(z.phase > 0)) return def.behaviour;
  const out = { ...def.behaviour };
  for (let i = 0; i < z.phase; i++) Object.assign(out, def.phases?.[i]?.set ?? {});
  return out;
}

/** Zombie types that can appear on a calendar day (their `firstDay` has come), sorted by id. Bosses are never picked here: they are a fixed milestone. */
export function zombiesAvailable(defs, day) {
  return Object.keys(defs.zombies).filter((id) => day >= (defs.zombies[id].firstDay ?? 1)).sort();
}

/** The fixed boss milestone on a calendar day: { day, boss, name, escorts } or null (first on `firstDay`, then every `everyDays`). Pure, no state. */
export function bossForDay(defs, day) {
  const b = defs.bossSchedule;
  if (day < b.firstDay || (day - b.firstDay) % b.everyDays !== 0) return null;
  const boss = defs.bosses[b.boss];
  return { day, boss: b.boss, name: boss.name, escorts: { ...boss.escorts } };
}

/** Bosses still to come, up to the boss schedule's `warnDays` ahead (longer than a raid's warning, so the learner can prepare). */
export function upcomingBosses(defs, tick) {
  const today = dayOf(defs, tick);
  const t = timeOf(defs, tick);
  const first = t.hour >= defs.environment.duskHour || t.hour < defs.environment.dawnHour ? today + 1 : today;
  const out = [];
  for (let d = first; d <= today + defs.bossSchedule.warnDays; d++) {
    const b = bossForDay(defs, d);
    if (b) out.push({ ...b, inDays: d - today });
  }
  return out;
}

/** How far a weapon reaches (cells). Melee: its reach. Ranged: range + the tower's bonus when posted on a tower. Mounted: its range, only on a tower of its `minTowerLevel`+ (else 0). */
export function effectiveRange(defs, weaponId, towerLevel = 0) {
  const w = defs.weapons[weaponId];
  if (!w) return 0;
  if (w.kind === 'melee') return w.reach;
  if (w.kind === 'mounted') return towerLevel >= w.minTowerLevel ? w.range : 0;
  return w.range + (defs.towers[towerLevel]?.rangeBonus ?? 0);
}

const byIdAsc = (x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

/** The working tower a survivor stands next to (nearest, ties by id), or null. Ruined towers count for nothing. */
function towerOfSurvivor(state, s) {
  if (!s || s.status !== 'active') return null;
  let best = null;
  for (const b of Object.values(state.buildings)) {
    if (b.type !== 'tower' || b.condition === 'ruined') continue;
    const d = chebyshev(s.position, b);
    if (d > 1) continue;
    if (!best || d < best.d || (d === best.d && b.id < best.b.id)) best = { b, d };
  }
  return best?.b ?? null;
}

/** The survivors POSTED on a tower: active ones standing next to it (it is their nearest tower), lowest ids first, at most its `slots`. Z6b: the first M of them (M = installed mounts) are the OPERATORS, one per mounted weapon in install order. */
export function crewOf(state, defs, tower) {
  if (!tower || tower.type !== 'tower' || tower.condition === 'ruined') return [];
  const here = Object.values(state.survivors).filter((o) => towerOfSurvivor(state, o)?.id === tower.id).map((o) => o.id).sort();
  return here.slice(0, defs.towers[tower.level]?.slots ?? 0);
}

/**
 * Z6: the tower level a survivor is POSTED on (0 = none). She must stand next to a tower that is not ruined (nearest one, ties by id) and be among the first
 * `slots` active survivors there (by id): a tower holds only so many. The level then feeds `effectiveRange` (ranged weapons only).
 */
export function postedLevel(state, defs, survivorId) {
  const t = towerOfSurvivor(state, state.survivors[survivorId]);
  return t && crewOf(state, defs, t).includes(survivorId) ? t.level : 0;
}

/** Z6b: is this survivor a mount OPERATOR (one of the first M crew of a tower holding M mounted weapons)? Returns { tower, index } or null. An operator crews the mount instead of firing a personal weapon. */
export function operatorOf(state, defs, survivorId) {
  const t = towerOfSurvivor(state, state.survivors[survivorId]);
  if (!t || !(t.mounts?.length)) return null;
  const i = crewOf(state, defs, t).indexOf(survivorId);
  return i >= 0 && i < t.mounts.length ? { tower: t, index: i } : null;
}

/** The learner-facing tower record for a tower building: { level, name, slots, freeSlots, rangeBonus, mounts (what it CAN mount), installed (what it HAS), working, posted: [survivor ids] }, or null for other buildings. */
export function towerInfoFor(state, defs, b) {
  if (b.type !== 'tower') return null;
  const t = defs.towers[b.level];
  const crew = crewOf(state, defs, b);
  const installed = (b.mounts ?? []).map((m, i) => {
    const w = defs.weapons[m.weapon];
    return { weapon: m.weapon, name: w.name, ammo: w.ammo, hopper: m.hopper, hopperMax: w.hopper, range: w.range, damage: w.damage, reload: w.reload, ...(w.power ? { power: w.power } : {}), status: m.status, operator: crew[i] ?? null };
  });
  return { level: b.level, name: t.name, slots: t.slots, freeSlots: Math.max(0, t.slots - installed.length), rangeBonus: t.rangeBonus, mounts: [...t.mounts], installed, working: b.condition !== 'ruined', posted: crew };
}

/** The tower a posted survivor shoots from (its id), or null. */
export function postedTowerId(state, defs, survivorId) {
  const t = towerOfSurvivor(state, state.survivors[survivorId]);
  return t && crewOf(state, defs, t).includes(survivorId) ? t.id : null;
}

// ---- Noise (Z6c, docs/game/20 section 21). Every shot adds its weapon's `noise` to the wave's ATTENTION meter and, when fired from a tower (a mount or a posted
// shooter), to that tower's own noise. Both fall by `noise.decayPerTick`. Above `noise.threshold`, one reinforcement walker per `reinforceEvery` points of excess joins
// the wave (at most `reinforceCap` per wave). Zombies with nobody outside to chase drift to the wall nearest the LOUDEST tower (bait). ----

/** Add `amount` noise to the wave's attention meter and, when `towerId` is given, to that tower's own noise (shots, screams, blasts, lures). */
export function addNoise(ctx, amount, towerId = null) {
  const { state, defs } = ctx;
  if (!(amount > 0)) return;
  const was = state.threats.attention;
  state.threats.attention = was + amount;
  if (towerId) state.threats.towerNoise[towerId] = (state.threats.towerNoise[towerId] ?? 0) + amount;
  if (was <= defs.noise.threshold && state.threats.attention > defs.noise.threshold) ctx.emit('noise.high', { attention: state.threats.attention, threshold: defs.noise.threshold });
}

/** A shot was fired: add noise (a weapon's noise, `towerId` = the tower it was fired from, if any; `suppressed` = a suppressor is fitted to the shooter). */
export function makeNoise(ctx, weaponId, towerId = null, suppressed = false) {
  addNoise(ctx, shotNoise(ctx.defs, weaponId, suppressed), towerId);
}

/** The tower currently making the most noise (ties by id), or null when none is audible. */
export function loudestTower(state) {
  let best = null;
  for (const id of Object.keys(state.threats.towerNoise).sort()) { const v = state.threats.towerNoise[id]; if (v > 0 && (!best || v > best.v)) best = { id, v }; }
  return best ? state.buildings[best.id] ?? null : null;
}

/** One tick of noise (after the shooters, before the wave moves): reinforcements for the excess attention, then decay. */
export function tickNoise(ctx) {
  const { state, defs } = ctx;
  const nz = defs.noise, th = state.threats, wave = th.wave;
  if (wave && !wave.cleared) {
    const want = Math.min(nz.reinforceCap, Math.floor(Math.max(0, th.attention - nz.threshold) / nz.reinforceEvery));
    const add = want - (wave.reinforced ?? 0);
    if (add > 0) {
      for (let i = 0; i < add; i++) wave.queue.push('walker');
      wave.reinforced = want;
      wave.composition.walker = (wave.composition.walker ?? 0) + add;
      ctx.emit('wave.reinforced', { day: wave.day, added: add, total: want, attention: th.attention });
    }
  }
  th.attention = Math.max(0, th.attention - nz.decayPerTick);
  for (const id of Object.keys(th.towerNoise)) { th.towerNoise[id] = Math.max(0, th.towerNoise[id] - nz.decayPerTick); if (th.towerNoise[id] === 0) delete th.towerNoise[id]; }
}

/** Can a tower of this level hold this mounted weapon? */
export function canMount(defs, weaponId, towerLevel) {
  return !!defs.towers[towerLevel]?.mounts.includes(weaponId);
}

/** Noise one shot adds to the wave's attention; a suppressor (personal weapons only) cuts it. */
export function shotNoise(defs, weaponId, suppressed = false) {
  const w = defs.weapons[weaponId];
  if (!w) return 0;
  return suppressed && w.kind !== 'mounted' ? Math.floor((w.noise * (100 - defs.noise.suppressorPercent)) / 100) : w.noise;
}

// ---- Mounted weapons (Z6b, docs/game/20 section 20). A tower holds `mounts` ({ weapon, hopper, cooldown, status, powered }); each is crewed by an OPERATOR (see crewOf)
// and fires by itself at the nearest zombie in its range, spending one unit of its HOPPER per shot. The minigun draws grid power ONLY on ticks it fires. ----

/** Is this zombie alive and on the map? */
const alive = (z) => z.health > 0 && z.state !== 'dead';

/** One entry per installed mount (towers by id, mounts in install order): everything needed to decide whether it fires this tick. Pure: reads state only. */
function mountPlan(state, defs) {
  const out = [];
  const zs = Object.values(state.threats?.zombies ?? {}).filter(alive).sort(byIdAsc);
  for (const tower of Object.values(state.buildings).filter((b) => b.type === 'tower').sort(byIdAsc)) {
    const crew = crewOf(state, defs, tower);
    (tower.mounts ?? []).forEach((m, i) => {
      const w = defs.weapons[m.weapon];
      const operatorId = crew[i] ?? null;
      const range = effectiveRange(defs, m.weapon, tower.level);
      const target = zs.reduce((best, z) => (chebyshev(tower, z) <= range && (!best || chebyshev(tower, z) < chebyshev(tower, best)) ? z : best), null);
      let status;
      if (tower.condition === 'ruined') status = 'BROKEN';
      else if (!operatorId) status = 'NO_OPERATOR';
      else if (m.hopper <= 0) status = 'NO_AMMO';
      else if (!target) status = 'IDLE';
      else if (m.cooldown > 0) status = 'RELOADING';
      else status = 'READY';
      const ready = status === 'READY';
      if (ready && w.power && !m.powered) status = 'NO_POWER';
      out.push({ tower, m, i, w, operatorId, target, ready, status });
    });
  }
  return out;
}

/**
 * Called by the simulation just before the grid ticks: the mounts that WANT to fire this tick and need power are returned as consumers for the grid
 * ({ use, grant(bool) }); the grid says whether it can serve them. A mount that needs no power is simply allowed. A mount that does not want to fire draws nothing.
 */
export function mountDemands(state, defs) {
  const out = [];
  for (const p of mountPlan(state, defs)) {
    p.m.powered = false;
    if (!p.ready) continue;
    if (!p.w.power) { p.m.powered = true; continue; }
    out.push({ use: p.w.power, grant: (g) => { p.m.powered = g; } });
  }
  return out;
}

/** One tick of every mounted weapon (after the survivors acted, before the wave moves): update status, fire the ready ones, count the reload down. */
export function tickMounts(ctx) {
  const { state, defs } = ctx;
  for (const p of mountPlan(state, defs)) {
    const { m, w } = p;
    if (p.status !== m.status) {
      ctx.emit('mount.status', { towerId: p.tower.id, weapon: m.weapon, from: m.status, to: p.status });
      m.status = p.status;
    }
    if (p.status === 'READY') {
      const z = p.target;
      m.hopper -= 1;
      m.cooldown = w.reload;
      const reduction = Math.max(0, (statsOf(defs, z.type).armor ?? 0) - w.pierce);
      const damage = Math.max(0, w.damage - reduction);
      z.health = Math.max(0, z.health - damage);
      z.state = 'hurt';
      ctx.emit('zombie.hurt', { zombieId: z.id, survivorId: p.operatorId, weapon: m.weapon, towerId: p.tower.id, damage, health: z.health });
      awardSkillXp(ctx, state.survivors[p.operatorId], 'combat', 1);
      makeNoise(ctx, m.weapon, p.tower.id);
      if (z.health <= 0) killZombie(ctx, z, p.operatorId, m.weapon);
    }
    if (m.cooldown > 0) m.cooldown -= 1;
  }
}

/** The raid on a calendar day: { day, strength, composition: { walker: n, ... }, threat } or null. Does not look at state. */
export function raidForDay(defs, seed, day) {
  const sc = defs.raidSchedule;
  if (day < sc.startDay || num(seed, day, 'chance') % 100 >= sc.chancePercent) return null;
  const v = sc.variancePercent;
  const base = sc.strengthBase + sc.strengthPerDay * (day - sc.startDay);
  const strength = Math.max(1, Math.floor((base * (100 - v + (num(seed, day, 'var') % (2 * v + 1)))) / 100));
  const ids = zombiesAvailable(defs, day);
  const composition = {};
  let left = strength, threat = 0;
  for (let i = 0; i < 60; i++) {
    const fits = ids.filter((id) => defs.zombies[id].threat <= left);
    if (!fits.length) break;
    const sum = fits.reduce((n, id) => n + defs.zombies[id].weight, 0);
    let pick = num(seed, day, `z${i}`) % sum;
    for (const id of fits) {
      if (pick < defs.zombies[id].weight) { composition[id] = (composition[id] ?? 0) + 1; left -= defs.zombies[id].threat; threat += defs.zombies[id].threat; break; }
      pick -= defs.zombies[id].weight;
    }
  }
  return { day, strength, composition, threat };
}

/** The base's defence value now: the fence's level x perLevel, scaled by its condition. */
export function defenseOf(state, defs) {
  const f = Object.values(state.buildings).find((b) => b.type === 'fence');
  const d = defs.raidSchedule.defense;
  if (!f || f.condition === 'ruined') return { value: 0, fence: f ? { level: f.level, condition: f.condition } : null };
  const full = d.perLevel * f.level;
  return { value: f.condition === 'damaged' ? Math.floor((full * d.damagedPercent) / 100) : full, fence: { level: f.level, condition: f.condition } };
}

/** Raids still to come: from today (while it is before dusk) or tomorrow, up to `warnDays` ahead. */
export function upcomingRaids(defs, seed, tick) {
  const today = dayOf(defs, tick);
  const first = timeOf(defs, tick).hour >= defs.environment.duskHour || timeOf(defs, tick).hour < defs.environment.dawnHour ? today + 1 : today;
  const out = [];
  for (let d = first; d <= today + defs.raidSchedule.warnDays; d++) {
    const r = raidForDay(defs, seed, d);
    if (r) out.push({ ...r, inDays: d - today, composition: { ...r.composition } });
  }
  return out;
}

/** Called at dawn: announce the raid `warnDays` ahead. */
export function raidWarning(ctx, day) {
  const { state, defs } = ctx;
  const r = raidForDay(defs, state.seed, day + defs.raidSchedule.warnDays);
  if (r) ctx.emit('raid.warning', { day: r.day, inDays: defs.raidSchedule.warnDays, strength: r.strength, composition: { ...r.composition } });
}

// ---- The wave (Z2): zombie ENTITIES. A raid starts at dusk as a wave, spawns on one map edge, walks to its target and hits the wall; resolved at dawn. ----
// Targets: the nearest survivor OUTSIDE the fence first (any survivor once a wall is breached); otherwise the nearest wall cell (the fence perimeter, or the
// closed gate). Z2 has no combat: nobody can kill a zombie and a zombie does not hurt a survivor (it only reaches one). Both arrive with Z3.

const SIDES = ['north', 'east', 'south', 'west'];
const cellKey = (x, y) => `${x},${y}`;
const fenceOf = (state) => Object.values(state.buildings).find((b) => b.type === 'fence');
const gateOf = (state) => Object.values(state.buildings).find((b) => b.type === 'gate');
const isInside = (fence, p) => !!fence?.bounds && p.x > fence.bounds.x1 && p.x < fence.bounds.x2 && p.y > fence.bounds.y1 && p.y < fence.bounds.y2;

/** Tiles zombies cannot walk through: what blocks survivors (closed gate included), except that a destroyed fence (0 health) no longer blocks. */
function zombieBlocked(state) {
  const blocked = blockedTiles(state);
  const f = fenceOf(state);
  if (f?.bounds && f.health <= 0) {
    const { x1, y1, x2, y2 } = f.bounds;
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) if (x === x1 || x === x2 || y === y1 || y === y2) blocked.delete(cellKey(x, y));
  }
  return blocked;
}

/** Wall cells a zombie can attack: [{x, y, building}] - fence perimeter cells (not the gate's), and the gate's cell while it stands closed. */
function wallCells(state) {
  const f = fenceOf(state), g = gateOf(state);
  const out = [];
  if (!f?.bounds || f.health <= 0) return out;
  const { x1, y1, x2, y2 } = f.bounds;
  const gateCell = g && g.health > 0 ? cellKey(g.x, g.y) : null;
  const openGate = g && g.health <= 0 ? cellKey(g.x, g.y) : null;
  for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) {
    if (!(x === x1 || x === x2 || y === y1 || y === y2)) continue;
    const k = cellKey(x, y);
    if (k === openGate) continue; // a destroyed gate is an opening, not a wall
    out.push({ x, y, building: k === gateCell ? g : f });
  }
  return out;
}

/** Where the wave's zombies enter the map: a tile on one edge (chosen from the seed and day), spread a little along it. */
function spawnCell(state, day, n, blocked) {
  const { width: w, height: h } = state.map;
  const side = num(state.seed, day, 'side') % 4;
  const len = side % 2 === 0 ? w : h;
  const base = num(state.seed, day, 'at') % len;
  for (let i = 0; i < len; i++) {
    const along = (base + ((n % 5) - 2) + i + len * 2) % len;
    const c = side === 0 ? { x: along, y: 0 } : side === 2 ? { x: along, y: h - 1 } : side === 1 ? { x: w - 1, y: along } : { x: 0, y: along };
    if (!blocked.has(cellKey(c.x, c.y))) return { ...c, side };
  }
  return { x: 0, y: 0, side };
}

/** Called at dusk of `day`: if a raid is scheduled, it becomes a wave (zombies spawn over the next ticks), and the gate closes. */
export function waveStart(ctx, day) {
  const { state, defs } = ctx;
  const raid = raidForDay(defs, state.seed, day);
  const boss = bossForDay(defs, day); // Z7f: a boss day is a wave even when no random raid is scheduled; the boss is NOT part of the random budget
  if ((!raid && !boss) || state.threats.wave) return;
  const composition = { ...(raid?.composition ?? {}) };
  if (boss) for (const [id, n] of Object.entries(boss.escorts)) composition[id] = (composition[id] ?? 0) + n;
  const queue = [];
  // Z7a: vanguard types (the runner) spawn first, so they reach the wall well before the pack; the rest keep the id order; the boss comes LAST.
  const vanguard = (id) => defs.zombies[id].behaviour?.vanguard === true;
  const order = Object.keys(composition).sort((a, b) => Number(vanguard(b)) - Number(vanguard(a)) || (a < b ? -1 : 1));
  for (const id of order) for (let i = 0; i < composition[id]; i++) queue.push(id);
  if (boss) { queue.push(boss.boss); composition[boss.boss] = 1; }
  state.threats.wave = {
    day, strength: raid?.strength ?? 0, defense: defenseOf(state, defs).value, composition: { ...composition }, queue,
    spawned: 0, reinforced: 0, summoned: 0, startTick: state.tick, gateClosed: defs.waveRules.gateClosesDuringWave, breached: false, wallDamage: 0,
    ...(boss ? { boss: boss.boss } : {}),
  };
  state.threats.zombies = {};
  ctx.emit('wave.started', { day, strength: state.threats.wave.strength, composition: { ...composition }, gateClosed: state.threats.wave.gateClosed, ...(boss ? { boss: boss.boss } : {}) });
}

function spawn(ctx, wave, blocked) {
  const { state, defs } = ctx;
  const type = wave.queue.shift();
  const at = spawnCell(state, wave.day, wave.spawned, blocked);
  wave.spawned += 1;
  state.threats.counter += 1;
  const id = `zombie_${state.threats.counter}`;
  state.threats.zombies[id] = { id, type, x: at.x, y: at.y, direction: 'DOWN', state: 'walk', health: statsOf(defs, type).health, move: 0, hit: 0, goal: null, route: null, reached: null };
  ctx.emit('zombie.spawned', { id, type, x: at.x, y: at.y, side: SIDES[at.side] });
}

const nearest = (from, list) => list.reduce((best, c) => (best === null || chebyshev(from, c) < chebyshev(from, best) ? c : best), null);

/** Damage a wall building (fence or gate): wave bookkeeping, condition change, breach. Returns the damage really dealt. */
function damageWall(ctx, wave, b, dmg) {
  if (b.health <= 0 || dmg <= 0) return 0;
  const before = b.health;
  const c = applyHealth(ctx.defs, b, -dmg);
  const dealt = before - b.health;
  wave.wallDamage += dealt;
  if (c.from !== c.to) ctx.emit('building.condition_changed', { buildingId: b.id, from: c.from, to: c.to });
  if (b.health <= 0) { wave.breached = true; ctx.emit('wall.breached', { buildingId: b.id, type: b.type, day: wave.day }); }
  return dealt;
}

function hitWall(ctx, wave, z, cell) {
  const { defs } = ctx;
  const def = statsOf(defs, z.type);
  const bh = behaviourFor(defs, z);
  const raw = def.damage * (bh?.type === 'siege' ? bh.wallMultiplier : 1);
  damageWall(ctx, wave, cell.building, Math.max(0, raw - defs.waveRules.wallArmorPerLevel * cell.building.level));
}

/** The wave is cleared when nothing is left to spawn and nothing walks: the gate opens at once (sortie window). */
function clearIfDone(ctx) {
  const { state } = ctx;
  const wave = state.threats.wave;
  if (wave && !wave.cleared && wave.queue.length === 0 && Object.keys(state.threats.zombies).length === 0) {
    wave.cleared = true;
    wave.gateClosed = false;
    ctx.emit('wave.cleared', { day: wave.day, gateClosed: false });
  }
}

/** Z7f: a boss enters its next phase when its health falls to `belowPercent` % or less (once each, in order): `boss.phase`, then its `summons` walkers join the spawn queue. */
function bossPhase(ctx, wave, z, def) {
  const next = def.phases[z.phase ?? 0];
  if (!next || z.health * 100 > next.belowPercent * def.health) return;
  z.phase = (z.phase ?? 0) + 1;
  const add = next.summons ?? 0;
  for (let i = 0; i < add; i++) wave.queue.push('walker');
  ctx.emit('boss.phase', { id: z.id, boss: z.type, phase: z.phase, name: next.name, health: z.health, summoned: add });
}

/**
 * Z7d: a screamer counts ticks since it appeared (`z.scream`); every `cooldownTicks` it SCREAMS: `summons` walkers join the END of the spawn queue,
 * but the wave never takes more than `waveCap` summoned walkers in total (shared by all screamers, counted in `wave.summoned`). A screamer that is
 * killed (or stands in a cleared wave) before its first scream summons nothing; at the cap it still screams but adds 0.
 */
function screamTick(ctx, wave, z) {
  const b = statsOf(ctx.defs, z.type).behaviour;
  z.scream = (z.scream ?? 0) + 1;
  if (z.scream < b.cooldownTicks) return;
  z.scream = 0;
  addNoise(ctx, ctx.defs.noise.scream);
  const room = Math.max(0, b.waveCap - (wave.summoned ?? 0));
  const add = Math.min(b.summons, room);
  for (let i = 0; i < add; i++) wave.queue.push('walker');
  wave.summoned = (wave.summoned ?? 0) + add;
  ctx.emit('zombie.screamed', { id: z.id, zombieType: z.type, summoned: add, total: wave.summoned, cap: b.waveCap });
}

/**
 * Z7c: a thrower stands at `range` and throws every `everyTicks`: at the nearest survivor it chases (survivor damage), else at the nearest wall cell
 * (flat `damage`, armor does not apply). A wall throw leaves `rubble` units of stone on the ground just OUTSIDE that wall cell (toward the thrower);
 * survivors collect it in a sortie after the wave. Nothing is thrown while the thrower is out of range (it walks first).
 */
function throwAt(ctx, wave, z, goal, victim) {
  const { state, defs } = ctx;
  const b = statsOf(defs, z.type).behaviour;
  if (victim) {
    const s = state.survivors[victim.id];
    if (s?.status === 'active') {
      s.needs.health = Math.max(0, s.needs.health - b.damage);
      ctx.emit('survivor.damaged', { survivorId: s.id, cause: 'thrown', zombieId: z.id, zombieType: z.type, damage: b.damage, health: s.needs.health });
      if (s.needs.health <= 0) { s.status = 'downed'; ctx.emit('survivor.downed', { survivorId: s.id, cause: 'thrown', zombieId: z.id }); }
    }
    ctx.emit('zombie.threw', { id: z.id, zombieType: z.type, target: victim.id, damage: b.damage });
    return;
  }
  const dealt = damageWall(ctx, wave, goal.building, b.damage);
  ctx.emit('zombie.threw', { id: z.id, zombieType: z.type, target: goal.building.id, damage: dealt });
  if (b.rubble >= 1) {
    const rx = goal.x + Math.sign(z.x - goal.x), ry = goal.y + Math.sign(z.y - goal.y);
    const free = (x, y) => x >= 0 && y >= 0 && x < state.map.width && y < state.map.height && !blockedTiles(state).has(cellKey(x, y));
    const spot = free(rx, ry) && (rx !== goal.x || ry !== goal.y) ? { x: rx, y: ry } : { x: z.x, y: z.y };
    addPile(ctx, 'stone', b.rubble, spot.x, spot.y, z);
  }
}

/**
 * Z7b: a boomer that reaches a wall or a survivor EXPLODES: every wall building with a wall cell within `radius` (Chebyshev) takes `fenceDamage` (flat,
 * armor does not apply), every active survivor within `radius` takes `survivorDamage` (inside or outside the wall), and the boomer is gone with
 * `exploded: true`, so it drops no gland. Not a kill: no killer, no combat XP.
 */
function explodeZombie(ctx, wave, z) {
  const { state, defs } = ctx;
  const b = statsOf(defs, z.type).behaviour;
  z.exploded = true; z.state = 'dead';
  let wallDamage = 0;
  const hitBuildings = new Set();
  for (const cell of wallCells(state)) {
    if (chebyshev(z, cell) > b.radius || hitBuildings.has(cell.building.id)) continue;
    hitBuildings.add(cell.building.id);
    wallDamage += damageWall(ctx, wave, cell.building, b.fenceDamage);
  }
  const hit = [];
  for (const s of Object.values(state.survivors).sort((p, q) => (p.id < q.id ? -1 : 1))) {
    if (s.status !== 'active' || chebyshev(z, s.position) > b.radius) continue;
    s.needs.health = Math.max(0, s.needs.health - b.survivorDamage);
    hit.push(s.id);
    ctx.emit('survivor.damaged', { survivorId: s.id, cause: 'explosion', zombieId: z.id, zombieType: z.type, damage: b.survivorDamage, health: s.needs.health });
    if (s.needs.health <= 0) { s.status = 'downed'; ctx.emit('survivor.downed', { survivorId: s.id, cause: 'explosion', zombieId: z.id }); }
  }
  addNoise(ctx, defs.noise.explosion);
  ctx.emit('zombie.exploded', { id: z.id, zombieType: z.type, x: z.x, y: z.y, radius: b.radius, wallDamage, survivorsHit: hit });
  delete state.threats.zombies[z.id];
  clearIfDone(ctx);
}

/** One tick of the wave: spawn the next zombie, then every zombie picks its target, walks, and hits. */
export function tickWave(ctx) {
  const { state, defs } = ctx;
  const wave = state.threats.wave;
  if (!wave || wave.cleared) return;
  const rules = defs.waveRules;
  const blocked = zombieBlocked(state);
  if (wave.queue.length > 0 && (state.tick - wave.startTick) % rules.spawnEveryTicks === 0) spawn(ctx, wave, blocked);
  const fence = fenceOf(state);
  const survivors = Object.values(state.survivors).sort((a, b) => (a.id < b.id ? -1 : 1));
  const prey = survivors.filter((s) => wave.breached || !isInside(fence, s.position)).map((s) => ({ id: s.id, x: s.position.x, y: s.position.y }));
  const walls = wallCells(state);
  const lure = loudestTower(state); // Z6c: with nobody outside to chase, zombies go for the wall nearest the loudest tower
  for (const id of Object.keys(state.threats.zombies).sort()) {
    const z = state.threats.zombies[id];
    const def = statsOf(defs, z.type);
    if (def.behaviour?.type === 'scream') screamTick(ctx, wave, z);
    if (def.phases) bossPhase(ctx, wave, z, def);
    const bh = behaviourFor(defs, z);
    const hitEvery = bh?.type === 'rush' || bh?.type === 'siege' ? bh.attackEveryTicks : rules.attackEveryTicks;
    const victim = nearest(z, prey);
    const wall = victim ? null : nearest(defs.noise.driftToLoudest && lure ? lure : z, walls);
    const goal = victim ?? wall;
    if (!goal) { z.state = 'idle'; continue; }
    const thrower = def.behaviour?.type === 'throw';
    if (chebyshev(z, goal) <= (thrower ? def.behaviour.range : 1)) { // in reach: stand and hit (a survivor is only reached in Z2; a wall is hit)
      if (def.behaviour?.type === 'explode') { explodeZombie(ctx, wave, z); continue; }
      z.state = 'attack'; z.route = null; z.goal = null;
      const dx = goal.x - z.x, dy = goal.y - z.y;
      z.direction = directionFromDelta(dx, dy) ?? z.direction;
      if (thrower) {
        z.reached = victim ? victim.id : 'wall';
        z.hit += 1;
        if (z.hit >= def.behaviour.everyTicks) { z.hit = 0; throwAt(ctx, wave, z, goal, victim); }
        continue;
      }
      if (victim) {
        if (z.reached !== victim.id) { z.reached = victim.id; ctx.emit('zombie.reached_survivor', { id: z.id, survivorId: victim.id }); }
        z.hit += 1;
        if (z.hit >= hitEvery) {
          z.hit = 0;
          const survivor = state.survivors[victim.id];
          if (survivor?.status === 'active') {
            const damage = Math.max(0, def.damage);
            survivor.needs.health = Math.max(0, survivor.needs.health - damage);
            ctx.emit('survivor.damaged', { survivorId: survivor.id, cause: 'zombie', zombieId: z.id, zombieType: z.type, damage, health: survivor.needs.health });
            if (survivor.needs.health <= 0) {
              survivor.status = 'downed';
              ctx.emit('survivor.downed', { survivorId: survivor.id, cause: 'zombie', zombieId: z.id });
            }
          }
        }
      } else {
        if (z.reached !== 'wall') { z.reached = 'wall'; ctx.emit('zombie.reached_wall', { id: z.id, buildingId: goal.building.id }); }
        z.hit += 1;
        if (z.hit >= hitEvery) { z.hit = 0; hitWall(ctx, wave, z, goal); }
      }
      continue;
    }
    z.state = 'walk'; z.hit = 0;
    z.move += 1;
    if (z.move < (bh?.type === 'siege' ? bh.stepTicks : Math.max(1, Math.floor(rules.zombieStepTicks / def.speed)))) continue;
    z.move = 0;
    const gk = cellKey(goal.x, goal.y);
    const next = z.route?.[0];
    const usable = next && z.goal === gk && chebyshev(z, next) === 1 && (!blocked.has(cellKey(next.x, next.y)) || (next.x === goal.x && next.y === goal.y));
    if (!usable) { z.route = findPath(state, z, goal, blocked); z.goal = gk; }
    if (!z.route || z.route.length === 0) { z.route = null; z.state = 'idle'; continue; }
    const n = z.route.shift();
    z.direction = directionFromDelta(n.x - z.x, n.y - z.y) ?? z.direction;
    z.x = n.x; z.y = n.y;
  }
}

// ---- Loot (Z4, docs/game/20 section 4). A zombie killed outside leaves loot on the ground where it died; survivors collect it by SORTIE (`collect`). ----
// What drops is a PURE function of (seed, day, zombie id): no randomness is stored, so replays cannot diverge. A pile is { id, item, qty, x, y, day, expiresDay }.
// `expiresDay` is null while the wave that dropped it is still on; at the dawn that ends the wave every such pile gets `expiresDay = dawn day + lootLingerDays`,
// and a pile still lying there at the dawn of its `expiresDay` is gone (`loot.expired`).

const lootNum = (seed, day, zid, i, what) => parseInt(hashString(`${seed}:${day}:loot:${zid}:${i}:${what}`).slice(-8), 16);

/** What a zombie (or boss) leaves: [{ item, qty }], from its loot table. Pure. A boomer that EXPLODED (`z.exploded`) drops nothing that `requires: 'not_exploded'`. */
export function lootFor(defs, seed, day, z) {
  const out = [];
  (defs.lootTables[z.type] ?? []).forEach((row, i) => {
    if (row.requires === 'not_exploded' && z.exploded) return;
    if (lootNum(seed, day, z.id, i, 'chance') % 100 >= row.chancePercent) return;
    const qty = row.min + (row.max > row.min ? lootNum(seed, day, z.id, i, 'qty') % (row.max - row.min + 1) : 0);
    if (qty >= 1) out.push({ item: row.item, qty });
  });
  return out;
}

/** Put `qty` of `item` on the ground at (x, y) (same item on the same cell and still in its wave = one pile). */
function addPile(ctx, item, qty, x, y, z) {
  const { state } = ctx;
  const day = state.threats.wave?.day ?? 0;
  let pile = Object.values(state.threats.loot).find((p) => p.item === item && p.x === x && p.y === y && p.expiresDay === null);
  if (pile) pile.qty += qty;
  else {
    state.threats.lootCounter += 1;
    const id = `loot_${state.threats.lootCounter}`;
    pile = { id, item, qty, x, y, day, expiresDay: null };
    state.threats.loot[id] = pile;
  }
  ctx.emit('loot.dropped', { pileId: pile.id, item, amount: qty, x, y, zombieId: z.id, zombieType: z.type });
}

/** Put loot on the ground where `z` died. */
function dropLoot(ctx, z) {
  const { state, defs } = ctx;
  const day = state.threats.wave?.day ?? 0;
  for (const { item, qty } of lootFor(defs, state.seed, day, z)) addPile(ctx, item, qty, z.x, z.y, z);
}

/**
 * A zombie dies (Z3 combat calls this, never edits the table itself): its loot drops, it leaves the map, and when it was the last of the wave the wave is
 * CLEARED - the gate opens at once, which is what starts the sortie window (collect is allowed after the clear; dawn only ends the wave record).
 */
export function killZombie(ctx, z, byId, weaponId) {
  const { state, defs } = ctx;
  z.state = 'dead';
  ctx.emit('zombie.killed', { zombieId: z.id, survivorId: byId, weapon: weaponId, type: z.type, zombieType: z.type }); // (`type` collides with the log entry's own `type`, so `zombieType` is the field to read)
  dropLoot(ctx, z);
  if (defs.bosses[z.type]) ctx.emit('boss.defeated', { id: z.id, boss: z.type, survivorId: byId, day: state.threats.wave?.day ?? null });
  delete state.threats.zombies[z.id];
  clearIfDone(ctx);
}

/** A sortie is allowed when no wave is on, or the wave has been cleared. */
export const sortieOpen = (state) => !state.threats.wave || state.threats.wave.cleared === true;

/** Called at dawn, AFTER the wave was resolved: piles of the wave that just ended start their countdown, and piles whose countdown is over are gone. */
export function lootDawn(ctx, day) {
  const { state, defs } = ctx;
  if (state.threats.wave) return; // (cannot happen after waveDawn, kept so a pile is never stamped while its wave is still on)
  for (const id of Object.keys(state.threats.loot).sort()) {
    const p = state.threats.loot[id];
    if (p.expiresDay === null) p.expiresDay = day + defs.waveRules.lootLingerDays;
    if (p.expiresDay <= day) {
      ctx.emit('loot.expired', { pileId: p.id, item: p.item, amount: p.qty, x: p.x, y: p.y });
      delete state.threats.loot[id];
    }
  }
}

/** The loot on the ground, sorted by id: [{ id, item, qty, x, y, day, expiresDay }] (a copy). */
export function lootPiles(state) {
  return Object.values(state.threats.loot).sort((a, b) => (a.id < b.id ? -1 : 1)).map((p) => ({ ...p }));
}

/** Called at dawn: resolve the wave. Z3 may clear it early; otherwise the remaining zombies retreat at dawn. */
export function waveDawn(ctx) {
  const { state, defs } = ctx;
  const wave = state.threats.wave;
  if (!wave) return;
  const sc = defs.raidSchedule;
  const lost = {};
  if (wave.breached) {
    for (const item of sc.breached.loot) {
      const have = available(state, stockKey(item));
      const n = Math.min(have, Math.ceil((have * sc.breached.lootPercent) / 100));
      if (n < 1) continue;
      discard(state, stockKey(item), n);
      syncStock(state, defs, item);
      lost[item] = n;
    }
  }
  const outcome = wave.breached ? 'breached' : (wave.cleared ? 'cleared' : 'repelled');
  const rec = { day: wave.day, strength: wave.strength, defense: wave.defense, outcome, composition: { ...wave.composition }, fenceDamage: wave.wallDamage, lost, cleared: !!wave.cleared, remaining: Object.keys(state.threats.zombies).length };
  ctx.emit('raid.resolved', { ...rec, composition: { ...rec.composition }, lost: { ...lost } });
  state.threats.history.push(rec);
  while (state.threats.history.length > sc.historyLimit) state.threats.history.shift();
  ctx.emit('wave.ended', { day: wave.day, outcome, zombies: Object.keys(state.threats.zombies).length });
  state.threats.wave = null;
  state.threats.zombies = {};
}

/** What the renderer draws: one entry per zombie on the map. */
export function zombieProjection(state, defs) {
  return Object.values(state.threats.zombies).map((z) => ({
    id: z.id, type: z.type, x: z.x, y: z.y, direction: z.direction, health: z.health, maxHealth: statsOf(defs, z.type).health, animation: z.state === 'attack' ? 'ATTACK' : z.state === 'dead' ? 'DEAD' : z.state === 'hurt' ? 'HURT' : z.state === 'idle' ? 'IDLE' : 'WALK',
  }));
}

/** The boss of the wave now: { id, type, name, health, maxHealth, phase } or null. */
function bossView(state, defs) {
  const z = Object.values(state.threats.zombies).find((q) => defs.bosses[q.type]);
  return z ? { id: z.id, type: z.type, name: defs.bosses[z.type].name, health: z.health, maxHealth: defs.bosses[z.type].health, phase: z.phase ?? 0 } : null;
}

/** The wave now: { active: false } or { active, day, gateClosed, breached, wallDamage, remaining (not yet spawned), zombies: [{ id, type, x, y, state }] }. */
function waveView(state, defs) {
  const w = state.threats.wave;
  if (!w) return { active: false };
  return { active: true, day: w.day, cleared: w.cleared === true, gateClosed: w.gateClosed, breached: w.breached, wallDamage: w.wallDamage, remaining: w.queue.length, boss: bossView(state, defs),
    zombies: Object.values(state.threats.zombies).sort((a, b) => (a.id < b.id ? -1 : 1)).map((z) => ({ id: z.id, type: z.type, x: z.x, y: z.y, state: z.state, health: z.health, maxHealth: statsOf(defs, z.type).health })) };
}

/** Loot on the ground for the learner: [{ id, item, qty, x, y, daysLeft }] (daysLeft = dawns until it is gone, null while its wave is still on) + whether a sortie may go out now. */
function lootView(state, defs) {
  const today = dayOf(defs, state.tick);
  return { sortieOpen: sortieOpen(state), piles: lootPiles(state).map((p) => ({ id: p.id, item: p.item, qty: p.qty, x: p.x, y: p.y, daysLeft: p.expiresDay === null ? null : Math.max(0, p.expiresDay - today) })) };
}

/** The learner's `threats` read. */
export function threatsView(state, defs) {
  const zrow = (z) => ({ name: z.name, role: z.role, threat: z.threat, health: z.health, damage: z.damage, speed: z.speed, armor: z.armor ?? 0, firstDay: z.firstDay ?? 1, ...(z.behaviour ? { behaviour: { ...z.behaviour } } : {}) });
  return {
    zombies: Object.fromEntries(Object.entries(defs.zombies).map(([id, z]) => [id, zrow(z)])),
    defense: defenseOf(state, defs),
    upcoming: upcomingRaids(defs, state.seed, state.tick),
    bosses: upcomingBosses(defs, state.tick),
    weapons: Object.fromEntries(Object.entries(defs.weapons).map(([id, w]) => [id, { ...w, ...(w.craft ? { craft: { ...w.craft, materials: { ...w.craft.materials } } } : {}) }])),
    towers: Object.fromEntries(Object.entries(defs.towers).map(([lv, t]) => [lv, { ...t, mounts: [...t.mounts] }])),
    noise: { ...defs.noise, attention: state.threats.attention, loudest: loudestTower(state)?.id ?? null, reinforced: state.threats.wave?.reinforced ?? 0 },
    waveRules: { ...defs.waveRules },
    wave: waveView(state, defs),
    loot: lootView(state, defs),
    history: state.threats.history.map((h) => ({ ...h, composition: { ...h.composition }, lost: { ...h.lost } })),
  };
}
