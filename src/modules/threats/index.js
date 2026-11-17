import { hashString, chebyshev, directionFromDelta } from '../../kernel/index.js';
import { stockKey, available, discard } from '../resources/index.js';
import { applyHealth, blockedTiles, findPath } from '../buildings/index.js';
import { syncStock } from '../spoilage/index.js';
import { dayOf, timeOf } from '../environment/index.js';

// Threats (O19 groundwork, data/threats.js). A RAID is a night attack by a number of zombies. Whether a day has a raid, its strength and its zombies are
// a pure function of (seed, day): nothing random is saved, replays cannot diverge, and the schedule (strength + composition) is public `warnDays` ahead.
// It is resolved abstractly at DUSK against the base's defence (the fence). No zombie moves on the map yet: that is the later combat phase.

const num = (seed, day, salt) => parseInt(hashString(`${seed}:${day}:raid:${salt}`).slice(-8), 16);

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
  if (!raid || state.threats.wave) return;
  const queue = [];
  for (const id of Object.keys(raid.composition).sort()) for (let i = 0; i < raid.composition[id]; i++) queue.push(id);
  state.threats.wave = {
    day, strength: raid.strength, defense: defenseOf(state, defs).value, composition: { ...raid.composition }, queue,
    spawned: 0, startTick: state.tick, gateClosed: defs.waveRules.gateClosesDuringWave, breached: false, wallDamage: 0,
  };
  state.threats.zombies = {};
  ctx.emit('wave.started', { day, strength: raid.strength, composition: { ...raid.composition }, gateClosed: state.threats.wave.gateClosed });
}

function spawn(ctx, wave, blocked) {
  const { state, defs } = ctx;
  const type = wave.queue.shift();
  const at = spawnCell(state, wave.day, wave.spawned, blocked);
  wave.spawned += 1;
  state.threats.counter += 1;
  const id = `zombie_${state.threats.counter}`;
  state.threats.zombies[id] = { id, type, x: at.x, y: at.y, direction: 'DOWN', state: 'walk', health: defs.zombies[type].health, move: 0, hit: 0, goal: null, route: null, reached: null };
  ctx.emit('zombie.spawned', { id, type, x: at.x, y: at.y, side: SIDES[at.side] });
}

const nearest = (from, list) => list.reduce((best, c) => (best === null || chebyshev(from, c) < chebyshev(from, best) ? c : best), null);

function hitWall(ctx, wave, z, cell) {
  const { defs } = ctx;
  const b = cell.building;
  if (b.health <= 0) return;
  const dmg = Math.max(0, defs.zombies[z.type].damage - defs.waveRules.wallArmorPerLevel * b.level);
  if (dmg === 0) return;
  const before = b.health;
  const c = applyHealth(defs, b, -dmg);
  wave.wallDamage += before - b.health;
  if (c.from !== c.to) ctx.emit('building.condition_changed', { buildingId: b.id, from: c.from, to: c.to });
  if (b.health <= 0) { wave.breached = true; ctx.emit('wall.breached', { buildingId: b.id, type: b.type, day: wave.day }); }
}

/** One tick of the wave: spawn the next zombie, then every zombie picks its target, walks, and hits. */
export function tickWave(ctx) {
  const { state, defs } = ctx;
  const wave = state.threats.wave;
  if (!wave) return;
  const rules = defs.waveRules;
  const blocked = zombieBlocked(state);
  if (wave.queue.length > 0 && (state.tick - wave.startTick) % rules.spawnEveryTicks === 0) spawn(ctx, wave, blocked);
  const fence = fenceOf(state);
  const survivors = Object.values(state.survivors).sort((a, b) => (a.id < b.id ? -1 : 1));
  const prey = survivors.filter((s) => wave.breached || !isInside(fence, s.position)).map((s) => ({ id: s.id, x: s.position.x, y: s.position.y }));
  const walls = wallCells(state);
  for (const id of Object.keys(state.threats.zombies).sort()) {
    const z = state.threats.zombies[id];
    const def = defs.zombies[z.type];
    const victim = nearest(z, prey);
    const wall = victim ? null : nearest(z, walls);
    const goal = victim ?? wall;
    if (!goal) { z.state = 'idle'; continue; }
    if (chebyshev(z, goal) <= 1) { // in reach: stand and hit (a survivor is only reached in Z2; a wall is hit)
      z.state = 'attack'; z.route = null; z.goal = null;
      const dx = goal.x - z.x, dy = goal.y - z.y;
      z.direction = directionFromDelta(dx, dy) ?? z.direction;
      if (victim) {
        if (z.reached !== victim.id) { z.reached = victim.id; ctx.emit('zombie.reached_survivor', { id: z.id, survivorId: victim.id }); }
      } else {
        if (z.reached !== 'wall') { z.reached = 'wall'; ctx.emit('zombie.reached_wall', { id: z.id, buildingId: goal.building.id }); }
        z.hit += 1;
        if (z.hit >= rules.attackEveryTicks) { z.hit = 0; hitWall(ctx, wave, z, goal); }
      }
      continue;
    }
    z.state = 'walk'; z.hit = 0;
    z.move += 1;
    if (z.move < Math.max(1, Math.floor(rules.zombieStepTicks / def.speed))) continue;
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

/** Called at dawn: the wave retreats (nobody can kill a zombie before Z3) and is resolved. Breached = a wall was destroyed: part of the food is looted. */
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
  const outcome = wave.breached ? 'breached' : 'repelled';
  const rec = { day: wave.day, strength: wave.strength, defense: wave.defense, outcome, composition: { ...wave.composition }, fenceDamage: wave.wallDamage, lost };
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
    id: z.id, type: z.type, x: z.x, y: z.y, direction: z.direction, animation: z.state === 'attack' ? 'ATTACK' : z.state === 'idle' ? 'IDLE' : 'WALK',
  }));
}

/** The wave now: { active: false } or { active, day, gateClosed, breached, wallDamage, remaining (not yet spawned), zombies: [{ id, type, x, y, state }] }. */
function waveView(state) {
  const w = state.threats.wave;
  if (!w) return { active: false };
  return { active: true, day: w.day, gateClosed: w.gateClosed, breached: w.breached, wallDamage: w.wallDamage, remaining: w.queue.length,
    zombies: Object.values(state.threats.zombies).sort((a, b) => (a.id < b.id ? -1 : 1)).map((z) => ({ id: z.id, type: z.type, x: z.x, y: z.y, state: z.state })) };
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
    noise: { ...defs.noise },
    waveRules: { ...defs.waveRules },
    wave: waveView(state),
    history: state.threats.history.map((h) => ({ ...h, composition: { ...h.composition }, lost: { ...h.lost } })),
  };
}
