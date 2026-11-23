import { deepFreeze, API_VERSION, own } from '../../kernel/index.js';
import { available, stockKey, nodeKey, total, summary } from '../resources/index.js';
import { deriveConditions, carriedLoad, carryCapacity, skillProgress } from '../survivors/index.js';
import { environmentView } from '../environment/index.js';
import { maxHealthOf, assetKey, storageCapacity, isOperational, nextUpgrade, stationsFor, hqLevelOf, hqLock, armorOf, miningInfoFor } from '../buildings/index.js';
import { waterInfoFor } from '../water/index.js';
import { perishableView, coldInfoFor } from '../spoilage/index.js';
import { farmInfoFor, cropBook } from '../farming/index.js';
import { eventsView } from '../events/index.js';
import { townView } from '../town/index.js';
import { scavengeView, boardView } from '../scavenge/index.js';
import { threatsView, zombieProjection, lootPiles, towerInfoFor, mountTarget } from '../threats/index.js';
import { powerInfoFor, gridView } from '../power/index.js';

// Read-only projections of GameState. Everything returned is deep-frozen plain data: the student API,
// the Inspector/Survivor Card and the renderer all consume these and can never mutate the simulation.

function currentAction(state, survivorId) {
  const mine = state.activeActions.map((id) => state.actions[id]).filter((a) => a.actorId === survivorId);
  return mine.find((a) => a.status === 'EXECUTING') ?? mine[0] ?? null;
}

function survivorView(state, defs, s) {
  const a = currentAction(state, s.id);
  const queued = state.activeActions.filter((id) => state.actions[id].actorId === s.id).length;
  return {
    id: s.id, name: s.identity.name, x: s.position.x, y: s.position.y, direction: s.direction, status: s.status,
    needs: { ...s.needs }, conditions: deriveConditions(s, defs),
    attributes: { ...s.attributes }, skills: { ...s.skills }, skillProgress: skillProgress(defs, s), traits: [...s.traits],
    hooks: Object.values(state.hooks ?? {}).filter((h) => h.actorId === s.id).map((h) => h.event),
    policies: Object.fromEntries(Object.entries(s.policies ?? {}).map(([k, p]) => [k, { below: p.below, ...(p.until !== undefined ? { until: p.until } : {}), ...(p.prefer !== undefined ? { prefer: p.prefer } : {}), blocked: p.blocked ?? null }])),
    inventory: { items: { ...s.inventory.items } }, equipment: { ...s.equipment },
    // Weights come from item definitions (never from UI constants). `carry` is derived on the fly: load = sum of quantity x unitWeight.
    carry: { load: carriedLoad(s, defs), capacity: carryCapacity(s, defs) },
    inventoryDetail: Object.entries(s.inventory.items).map(([id, quantity]) => ({
      id, name: defs.items[id]?.name ?? id, quantity, unitWeight: defs.items[id]?.unitWeight ?? 0, weight: quantity * (defs.items[id]?.unitWeight ?? 0),
    })),
    task: a ? {
      actionId: a.actionId, type: a.actionType, status: a.status, targetId: a.targetId, progress: a.progress,
      fraction: a.fraction ?? 0, // 0..1 of the current batch (standing actions); presentation only
      ...(a.stats ? { stats: a.stats.crafted !== undefined ? { crafted: a.stats.crafted } : { gathered: a.stats.gathered, trips: a.stats.trips } } : {}),
      ...(a.capabilityDetail ? { capabilityDetail: { ...a.capabilityDetail } } : {}),
    } : null,
    lastTask: s.lastTask ? { ...s.lastTask } : null,
    queued,
  };
}

/**
 * Storage a building contributes, and where the pooled stock stands. `capacity` is THIS building's table; `current`/`remaining`
 * are the pooled stock and room across every working storage building. `working` is false while the building is ruined
 * (it then contributes nothing). Undefined for buildings without a storage table.
 */
function storageInfoFor(state, defs, b) {
  const cap = defs.buildings[b.type]?.storage;
  if (!cap) return undefined;
  const current = Object.fromEntries(Object.keys(cap).map((k) => [k, total(state, stockKey(k))]));
  const pooled = Object.fromEntries(Object.keys(cap).map((k) => [k, storageCapacity(state, k)]));
  const remaining = Object.fromEntries(Object.keys(cap).map((k) => [k, Math.max(0, pooled[k] - current[k])]));
  return { capacity: { ...cap }, pooledCapacity: pooled, current, remaining, working: isOperational(b) };
}

function buildingView(state, defs, b) {
  const def = defs.buildings[b.type];
  const storageInfo = storageInfoFor(state, defs, b);
  const water = waterInfoFor(state, defs, b); // wells: reservoir, recharge, siphon
  const recipesHere = recipesAt(state, defs, b);
  const cold = coldInfoFor(state, defs, b); // cold cellar: { capacity, factor, working }
  const farm = farmInfoFor(state, defs, b); // farms: plots, shelter, growth/yield %
  const power = powerInfoFor(state, defs, b); // generators, panels, freezers: output / use, status, fuel
  const tower = towerInfoFor(state, defs, b); // watchtowers: level, slots, range bonus, who is posted
  const mining = miningInfoFor(state, defs, b, hqLevelOf(state)); // mining station: open, yield, cave-in risk, per-ore numbers (R4)
  return {
    id: b.id, type: b.type, name: def.levels[b.level]?.name ?? def.name, level: b.level, x: b.x, y: b.y,
    health: b.health, maxHealth: maxHealthOf(defs, b), condition: b.condition, ...(b.bounds ? { bounds: { ...b.bounds } } : {}),
    upgrade: nextUpgrade(defs, b), // { level, cost, ticks, minHq? } or null
    ...(nextUpgrade(defs, b)?.minHq ? { upgradeLocked: hqLock(state, nextUpgrade(defs, b)) } : {}), // P0: { need, have } while the HQ is too low, else null
    maxLevel: Math.max(...Object.keys(def.levels).map(Number)),
    ...(def.levels[b.level]?.armor !== undefined ? { armor: armorOf(defs, b) } : {}), // P3: what a zombie's wall hit is reduced by (fence, gate)
    ...(nextUpgrade(defs, b) ? { nextLevel: { name: def.levels[b.level + 1].name ?? def.name, maxHealth: def.levels[b.level + 1].maxHealth, ...(def.levels[b.level + 1].armor !== undefined ? { armor: def.levels[b.level + 1].armor } : {}) } } : {}),
    ...(storageInfo ? { storageInfo } : {}), ...(water ? { water } : {}), ...(def.note ? { note: def.note } : {}),
    ...(cold ? { cold } : {}), ...(farm ? { farm } : {}), ...(power ? { power } : {}), ...(tower ? { tower } : {}), ...(mining ? { mining } : {}),
    ...(recipesHere.length ? { recipes: recipesHere } : {}), // station buildings: which recipes are cooked here (and from which level)
  };
}

/** Recipes a station building type makes: [{ id, stationLevel, working }] - `working` = this very building can cook it right now. */
function recipesAt(state, defs, b) {
  return Object.entries(defs.recipes ?? {}).filter(([, r]) => r.station === b.type)
    .map(([id, r]) => ({ id, action: r.action, stationLevel: r.stationLevel, ...(r.minHq ? { minHq: r.minHq } : {}), working: b.condition === 'repaired' && b.level >= r.stationLevel && (!r.minHq || hqLevelOf(state) >= r.minHq) }));
}

/** The learner's recipe book: what each recipe needs and makes, whether a working station exists, and whether base stock can pay for a batch. */
function recipeBook(state, defs) {
  return Object.fromEntries(Object.entries(defs.recipes ?? {}).map(([id, r]) => [id, {
    id, name: r.name, action: r.action, station: r.station, stationLevel: r.stationLevel, ...(r.minHq ? { minHq: r.minHq } : {}), power: r.power ?? 0, inputs: { ...r.inputs }, outputs: { ...r.outputs }, ticks: r.ticks, skill: r.skill,
    stationWorking: stationsFor(state, defs, r).working.length > 0 && (!r.minHq || hqLevelOf(state) >= r.minHq),
    canAfford: Object.entries(r.inputs).every(([item, qty]) => available(state, stockKey(item)) >= qty),
  }]));
}

/** What survivor.eat() can eat: item -> { restore, rank, available }. */
function foodTable(state, defs) {
  return Object.fromEntries(Object.entries(defs.actions.eat.items).map(([id, f]) => [id, { restore: f.restore, rank: f.rank, available: available(state, stockKey(id)) }]));
}

/** What learner code may read. `base.<item>` is the AVAILABLE amount (total minus reserved). */
export function studentView(state, defs) {
  const survivors = Object.values(state.survivors).map((s) => survivorView(state, defs, s));
  const base = {};
  const reserved = {};
  for (const item of Object.keys(defs.items)) {
    base[item] = available(state, stockKey(item));
    reserved[item] = total(state, stockKey(item)) - base[item];
  }
  base.reserved = reserved;
  base.perishables = perishableView(state, defs); // [{ item, qty, daysLeft, cold }], oldest first
  base.capacity = Object.fromEntries(Object.keys(defs.items).map((item) => [item, storageCapacity(state, item)]));
  const buildings = Object.values(state.buildings).map((b) => buildingView(state, defs, b));
  const nodes = Object.values(state.nodes).map((n) => ({
    id: n.id, type: n.type, resource: n.resource, x: n.x, y: n.y, amount: available(state, nodeKey(n.id)),
  }));
  return deepFreeze({
    apiVersion: API_VERSION, tick: state.tick, world: { ...state.map, ...environmentView(defs, state.tick) },
    survivor: survivors[0] ?? null, survivors, base,
    buildings, fence: buildings.find((b) => b.type === 'fence') ?? null, hq: buildings.find((b) => b.type === 'hq') ?? null,
    power: gridView(state, defs), recipes: recipeBook(state, defs), foods: foodTable(state, defs), crops: cropBook(state, defs, (id) => available(state, stockKey(id))),
    events: eventsView(state, defs), town: townView(state, defs), scavenge: scavengeView(state, defs), board: boardView(state, defs), threats: threatsView(state, defs),
    nodes,
  });
}

// Semantic animation request. The (Phase 2) asset resolver maps this to real frames; it never feeds back.
function animationFor(s, a) {
  if (s.status === 'downed') return 'DOWNED';
  if (!a || a.status !== 'EXECUTING') return 'IDLE';
  if (a.actionType === 'move' || a.phase === 'travel') return 'WALK';
  if (a.phase === 'wait') return 'IDLE'; // standing at an empty well, waiting for it to refill
  return { gather: 'GATHER', deposit: 'GATHER', repair: 'REPAIR', upgrade: 'REPAIR', cook: 'REPAIR', craft: 'REPAIR', farm: 'GATHER', /* placeholder: no cooking pose in the sprite sheet yet - a working pose stands in */ rest: 'REST', eat: 'EAT', drink: 'DRINK' }[a.actionType] ?? 'IDLE';
}

/** Static presentation ground for the scenario (forest zone, outside path). Never affects gameplay. */
function terrainOf(state, defs) {
  const t = defs.scenarios[state.scenarioId]?.terrain ?? {};
  return {
    zones: (t.zones ?? []).map((z) => ({ id: z.id, label: z.label, x1: z.x1, y1: z.y1, x2: z.x2, y2: z.y2 })),
    paths: (t.paths ?? []).map((p) => ({ id: p.id, cells: p.cells.map(([x, y]) => [x, y]) })),
    // A painted backdrop replaces the tiled ground (assets/backdrops); `roadY` = the road's centre line in cell units, where the screen-edge arrows sit.
    backdrop: t.backdrop ?? null,
    roadY: Number.isFinite(t.roadY) ? t.roadY : null,
  };
}

/** What the renderer may read: positions, directions, semantic animation states, building asset keys. */
/** Short present-tense line for what a survivor is doing now, or null when idle. Read from the action record only. */
function doingFor(state, s) {
  const a = currentAction(state, s.id); if (!a) return null;
  const r = a.params?.resource ?? a.params?.ore;
  const t = { gather: r ? `gathering ${r}` : 'gathering', deposit: 'depositing', repair: 'repairing', upgrade: 'upgrading', rest: 'resting', eat: 'eating', drink: 'drinking', move: 'walking', moveTo: 'walking', farm: 'farming', cook: 'cooking', craft: 'crafting', mine: r ? `mining ${r}` : 'mining', scavenge: 'scavenging', stash: 'heading out to stash', retrieve: 'heading out to retrieve a stash' }[a.actionType];
  return t ?? String(a.actionType ?? '').toLowerCase() ?? null;
}
/** node id -> names of the survivors whose running gather job has reserved from it (the ledger records the account the job draws on). */
function workersByNode(state) {
  const by = new Map();
  for (const r of Object.values(state.reservations ?? {})) {
    if (!r.account?.startsWith('node.')) continue;
    const act = state.actions[r.owner] ?? Object.values(state.actions).find((q) => q.reservationIds?.includes(r.id));
    const surv = state.survivors[act?.actorId] ?? state.survivors[r.owner]; if (!surv) continue;
    const id = r.account.slice(5); const list = by.get(id) ?? []; if (!list.includes(surv.identity.name)) list.push(surv.identity.name); by.set(id, list);
  }
  return by;
}
export function renderProjection(state, defs) {
  const workers = workersByNode(state);
  return deepFreeze({
    tick: state.tick, map: { ...state.map },
    environment: (({ time, weather }) => ({ isNight: time.isNight, hour: time.hour, weather }))(environmentView(defs, state.tick)),
    npcs: Object.values(state.survivors).filter((s) => s.status !== 'away').map((s) => ({
      id: s.id, name: s.identity.name, x: s.position.x, y: s.position.y, direction: s.direction,
      animation: animationFor(s, currentAction(state, s.id)), status: s.status,
      resource: currentAction(state, s.id)?.params?.resource ?? null, // what a gather job is after ('wood', 'stone'): picks the axe or the pickaxe picture; presentation only
      doing: doingFor(state, s), // one short line for the map tag ("gathering wood", "resting", ...); presentation only
    })),
    buildings: Object.values(state.buildings).map((b) => {
      const w = waterInfoFor(state, defs, b);
      return {
        id: b.id, type: b.type, name: defs.buildings[b.type].name, level: b.level, condition: b.condition, assetKey: assetKey(b), x: b.x, y: b.y,
        ...(b.bounds ? { bounds: { ...b.bounds } } : {}),
        ...(b.footprint ? { footprint: { ...b.footprint } } : {}),
        storageInfo: storageInfoFor(state, defs, b.type),
        ...(w ? { water: { amount: w.amount, capacity: w.capacity, working: w.working } } : {}), // the renderer draws a reservoir gauge from this
        ...(b.type === 'tower' ? { mounts: (b.mounts ?? []).map((m) => { const z = mountTarget(state, defs, b, m.weapon); return { weapon: m.weapon, status: m.status, aim: z ? { x: z.x, y: z.y } : null }; }) } : {}), // the mounted weapons on this tower and where each is aimed (null = nothing in range): the renderer turns the picture to face it
      };
    }),
    terrain: terrainOf(state, defs),
    nodes: Object.values(state.nodes).map((n) => {
      const left = total(state, nodeKey(n.id));
      return { id: n.id, type: n.type, workers: workers.get(n.id) ?? [], name: defs.nodeTypes?.[n.type]?.name ?? n.type, resource: n.resource ?? defs.nodeTypes?.[n.type]?.yields ?? null, x: n.x, y: n.y, visual: left > 0 ? 'available' : 'depleted', amount: left, capacity: defs.nodeTypes?.[n.type]?.amount ?? 0 }; // capacity = the type's typical amount; the renderer shows a worn look from it
    }),
    stock: Object.fromEntries(Object.keys(defs.items).map((i) => [i, total(state, stockKey(i))])),
    zombies: zombieProjection(state, defs),
    loot: lootPiles(state).map((p) => ({ id: p.id, item: p.item, qty: p.qty, x: p.x, y: p.y })), // Z4: loot lying on the ground
  });
}

/** Survivor Card / Inspector: the same underlying record, presented read-only. */
export function inspectorCard(state, defs, survivorId) {
  const s = own(state.survivors, survivorId);
  if (!s) return null;
  const v = survivorView(state, defs, s);
  return deepFreeze({ identity: { ...s.identity }, ...v, equipment: { ...s.equipment }, occupation: s.occupation, progression: structuredClone(s.progression) });
}

export const ledgerSummary = (state) => deepFreeze(summary(state));
