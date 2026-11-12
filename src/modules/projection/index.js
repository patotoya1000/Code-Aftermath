import { deepFreeze, API_VERSION, own } from '../../kernel/index.js';
import { available, stockKey, nodeKey, total, summary } from '../resources/index.js';
import { deriveConditions } from '../survivors/index.js';
import { maxHealthOf, assetKey } from '../buildings/index.js';

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
    attributes: { ...s.attributes }, skills: { ...s.skills }, traits: [...s.traits],
    inventory: { items: { ...s.inventory.items } },
    // Weights come from item definitions (never from UI constants). Capacity/encumbrance are NOT projected until the carry system exists.
    inventoryDetail: Object.entries(s.inventory.items).map(([id, quantity]) => ({
      id, name: defs.items[id]?.name ?? id, quantity, unitWeight: defs.items[id]?.unitWeight ?? 0, weight: quantity * (defs.items[id]?.unitWeight ?? 0),
    })),
    task: a ? {
      actionId: a.actionId, type: a.actionType, status: a.status, targetId: a.targetId, progress: a.progress,
      fraction: a.fraction ?? 0, // 0..1 of the current batch (standing actions); presentation only
      ...(a.stats ? { stats: { gathered: a.stats.gathered, trips: a.stats.trips } } : {}),
      ...(a.capabilityDetail ? { capabilityDetail: { ...a.capabilityDetail } } : {}),
    } : null,
    lastTask: s.lastTask ? { ...s.lastTask } : null,
    queued,
  };
}

/** Capacity / current / remaining for a building type that has a storage table (undefined otherwise). */
function storageInfoFor(state, defs, type) {
  const cap = defs.buildings[type]?.storage;
  if (!cap) return undefined;
  const current = Object.fromEntries(Object.keys(cap).map((k) => [k, total(state, stockKey(k))]));
  const remaining = Object.fromEntries(Object.entries(cap).map(([k, c]) => [k, Math.max(0, c - current[k])]));
  return { capacity: { ...cap }, current, remaining };
}

function buildingView(state, defs, b) {
  const def = defs.buildings[b.type];
  const storageInfo = storageInfoFor(state, defs, b.type);
  return {
    id: b.id, type: b.type, name: def.name, level: b.level, x: b.x, y: b.y,
    health: b.health, maxHealth: maxHealthOf(defs, b), condition: b.condition, ...(b.bounds ? { bounds: { ...b.bounds } } : {}),
    ...(storageInfo ? { storageInfo } : {}), ...(def.note ? { note: def.note } : {}),
  };
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
  const buildings = Object.values(state.buildings).map((b) => buildingView(state, defs, b));
  const nodes = Object.values(state.nodes).map((n) => ({
    id: n.id, type: n.type, resource: n.resource, x: n.x, y: n.y, amount: available(state, nodeKey(n.id)),
  }));
  return deepFreeze({
    apiVersion: API_VERSION, tick: state.tick, world: { ...state.map },
    survivor: survivors[0] ?? null, survivors, base,
    buildings, fence: buildings.find((b) => b.type === 'fence') ?? null, hq: buildings.find((b) => b.type === 'hq') ?? null,
    nodes,
  });
}

// Semantic animation request. The (Phase 2) asset resolver maps this to real frames; it never feeds back.
function animationFor(s, a) {
  if (s.status === 'downed') return 'DOWNED';
  if (!a || a.status !== 'EXECUTING') return 'IDLE';
  if (a.actionType === 'move' || a.phase === 'travel') return 'WALK';
  return { gather: 'GATHER', repair: 'REPAIR', rest: 'REST', eat: 'EAT', drink: 'DRINK' }[a.actionType] ?? 'IDLE';
}

/** Static presentation ground for the scenario (forest zone, outside path). Never affects gameplay. */
function terrainOf(state, defs) {
  const t = defs.scenarios[state.scenarioId]?.terrain ?? {};
  return {
    zones: (t.zones ?? []).map((z) => ({ id: z.id, label: z.label, x1: z.x1, y1: z.y1, x2: z.x2, y2: z.y2 })),
    paths: (t.paths ?? []).map((p) => ({ id: p.id, cells: p.cells.map(([x, y]) => [x, y]) })),
  };
}

/** What the renderer may read: positions, directions, semantic animation states, building asset keys. */
export function renderProjection(state, defs) {
  return deepFreeze({
    tick: state.tick, map: { ...state.map },
    npcs: Object.values(state.survivors).map((s) => ({
      id: s.id, name: s.identity.name, x: s.position.x, y: s.position.y, direction: s.direction,
      animation: animationFor(s, currentAction(state, s.id)), status: s.status,
    })),
    buildings: Object.values(state.buildings).map((b) => ({
      id: b.id, type: b.type, name: defs.buildings[b.type].name, level: b.level, condition: b.condition, assetKey: assetKey(b), x: b.x, y: b.y,
      ...(b.bounds ? { bounds: { ...b.bounds } } : {}),
      storageInfo: storageInfoFor(state, defs, b.type),
    })),
    terrain: terrainOf(state, defs),
    nodes: Object.values(state.nodes).map((n) => {
      const left = total(state, nodeKey(n.id));
      return { id: n.id, type: n.type, x: n.x, y: n.y, visual: left > 0 ? 'available' : 'depleted', amount: left };
    }),
    stock: Object.fromEntries(Object.keys(defs.items).map((i) => [i, total(state, stockKey(i))])),
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
