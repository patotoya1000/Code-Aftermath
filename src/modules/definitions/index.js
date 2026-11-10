import { AftermathError, deepFreeze } from '../../kernel/index.js';
import { items } from './data/items.js';
import { actions, needs } from './data/actions.js';
import { survivorTemplates } from './data/survivors.js';
import { nodeTypes, buildings, scenarios } from './data/world.js';
import { lessons } from './data/lessons.js';

const KNOWN_HANDLERS = ['move', 'gather', 'rest', 'consume', 'repair'];

export function validateDefinitions(d) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  for (const [id, it] of Object.entries(d.items)) need(it.unitWeight > 0, `item ${id}: unitWeight must be > 0`);
  for (const [id, n] of Object.entries(d.nodeTypes)) {
    need(d.items[n.yields], `nodeType ${id}: unknown item "${n.yields}"`);
    need(n.amount > 0, `nodeType ${id}: amount must be > 0`);
  }
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
  }
  for (const [id, s] of Object.entries(d.scenarios)) {
    for (const b of s.buildings) need(d.buildings[b.type], `scenario ${id}: unknown building type "${b.type}"`);
    for (const n of s.nodes) need(d.nodeTypes[n.type], `scenario ${id}: unknown node type "${n.type}"`);
    for (const sv of s.survivors) need(d.survivorTemplates[sv.template], `scenario ${id}: unknown template "${sv.template}"`);
    for (const k of Object.keys(s.stock)) need(d.items[k], `scenario ${id}: stock uses unknown item "${k}"`);
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
  const defs = structuredClone({ items, actions, needs, survivorTemplates, nodeTypes, buildings, scenarios, lessons, ...overrides });
  validateDefinitions(defs);
  return deepFreeze(defs);
}
