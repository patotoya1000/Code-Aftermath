import { AftermathError, deepFreeze } from '../../kernel/index.js';
import { items } from './data/items.js';
import { actions, needs, clock } from './data/actions.js';
import { survivorTemplates, SKILLS, TRAITS } from './data/survivors.js';
import { nodeTypes, buildings, scenarios } from './data/world.js';
import { lessons } from './data/lessons.js';

const KNOWN_HANDLERS = ['move', 'gather', 'rest', 'consume', 'repair'];

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
  const taken = new Map();
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

  for (const [id, it] of Object.entries(d.items)) need(it.unitWeight > 0, `item ${id}: unitWeight must be > 0`);
  for (const [id, n] of Object.entries(d.nodeTypes)) {
    need(d.items[n.yields], `nodeType ${id}: unknown item "${n.yields}"`);
    need(n.amount > 0, `nodeType ${id}: amount must be > 0`);
  }
  const c = d.clock;
  need(c && c.ticksPerSecond > 0, 'clock: ticksPerSecond must be > 0');
  need(Array.isArray(c?.speeds) && c.speeds.length > 0 && c.speeds.every((v) => v > 0), 'clock: speeds must be a non-empty list of positive numbers');
  need(c?.maxTicksPerFrame >= 1, 'clock: maxTicksPerFrame must be >= 1');
  need(c?.strategy?.max >= 1 && c.strategy.start >= 0 && c.strategy.start <= c.strategy.max && c.strategy.regenEvery >= 1, 'clock: strategy needs start <= max, max >= 1 and regenEvery >= 1');
  for (const [id, a] of Object.entries(d.actions)) {
    need(KNOWN_HANDLERS.includes(a.handler), `action ${id}: unknown handler "${a.handler}"`);
    if (a.item) need(d.items[a.item], `action ${id}: unknown item "${a.item}"`);
  }
  for (const [id, b] of Object.entries(d.buildings)) {
    need(b.levels?.[1]?.maxHealth > 0, `building ${id}: level 1 needs maxHealth`);
    need(b.visual?.ruinedBelow < b.visual?.damagedBelow, `building ${id}: visual thresholds must be ruinedBelow < damagedBelow`);
    if (b.storage) {
      for (const [res, cap] of Object.entries(b.storage)) {
        need(d.items[res], `building ${id}: storage uses unknown item "${res}"`);
        need(cap > 0, `building ${id}: storage for ${res} must be > 0`);
      }
    }
    for (const res of Object.keys(b.repair?.cost ?? {})) need(d.items[res], `building ${id}: repair cost uses unknown item "${res}"`);
    if (b.note !== undefined) need(typeof b.note === 'string' && b.note, `building ${id}: note must be non-empty text`);
  }
  for (const [id, s] of Object.entries(d.scenarios)) {
    for (const b of s.buildings) need(d.buildings[b.type], `scenario ${id}: unknown building type "${b.type}"`);
    for (const n of s.nodes) need(d.nodeTypes[n.type], `scenario ${id}: unknown node type "${n.type}"`);
    for (const sv of s.survivors) need(d.survivorTemplates[sv.template], `scenario ${id}: unknown template "${sv.template}"`);
    for (const k of Object.keys(s.stock)) need(d.items[k], `scenario ${id}: stock uses unknown item "${k}"`);
    validateWorldLayout(id, s, d, need);
  }
  for (const [skillId, skill] of Object.entries(d.skills)) {
    need(typeof skill.name === 'string' && skill.name, `skill ${skillId}: name must be non-empty text`);
    need(typeof skill.description === 'string', `skill ${skillId}: description must be text`);
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
  const defs = structuredClone({ items, actions, needs, clock, survivorTemplates, nodeTypes, buildings, scenarios, lessons, skills: SKILLS, traits: TRAITS, ...overrides });
  validateDefinitions(defs);
  return deepFreeze(defs);
}
