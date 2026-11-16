import { AftermathError } from '../../kernel/index.js';

/**
 * Survivor schema v1. Identity, needs, attributes, skills, traits, inventory, equipment and occupation are
 * deliberately separate fields (docs §B/§C). Presentation data (sprites, portraits) is NOT stored here.
 */
export function createSurvivor(defs, spec) {
  const t = defs.survivorTemplates[spec.template];
  if (!t) throw new AftermathError('UNKNOWN_TEMPLATE', `Unknown survivor template ${spec.template}`);
  return {
    id: spec.id,
    identity: { name: spec.name ?? t.name, age: t.age, gender: t.gender, background: t.background },
    needs: { ...t.needs, ...(spec.needs ?? {}) },
    attributes: { ...t.attributes },
    skills: { ...t.skills },
    traits: [...t.traits],
    inventory: { items: {} },
    equipment: {},
    occupation: null,
    position: { x: spec.x, y: spec.y },
    direction: 'DOWN',
    policies: {}, // R4a needs policies: { eat: { below }, rest: { below, until }, ... } (bookkeeping lives beside the rule)
    status: 'active', // 'active' | 'downed'
    progression: { xp: {}, specialization: null },
  };
}

/** Derived, read-only conditions. Never stored. */
export function deriveConditions(s, defs) {
  const th = defs.needs.thresholds;
  const c = [];
  if (s.status === 'downed') c.push('downed');
  if (s.needs.hunger === 0) c.push('starving');
  else if (s.needs.hunger < th.hungry) c.push('hungry');
  if (s.needs.thirst === 0) c.push('dehydrated');
  else if (s.needs.thirst < th.thirsty) c.push('thirsty');
  if (s.needs.energy < th.tired) c.push('tired');
  return c;
}

/**
 * Advance needs by one tick. Returns ids of survivors that went down this tick.
 * ctx = { state, defs, emit }
 */
export function applyNeedsDecay(ctx) {
  const { state, defs, emit } = ctx;
  const cfg = defs.needs;
  const downed = [];
  for (const s of Object.values(state.survivors)) {
    if (s.status !== 'active') continue;
    const before = deriveConditions(s, defs).join(',');
    for (const [need, rule] of Object.entries(cfg.decay)) {
      if (state.tick % rule.every === 0) s.needs[need] = Math.max(0, s.needs[need] - rule.amount);
    }
    if ((s.needs.hunger === 0 || s.needs.thirst === 0) && state.tick % cfg.starve.every === 0) {
      s.needs.health = Math.max(0, s.needs.health - cfg.starve.damage);
      emit('survivor.damaged', { survivorId: s.id, cause: 'deprivation', health: s.needs.health });
      if (s.needs.health === 0) {
        s.status = 'downed';
        emit('survivor.downed', { survivorId: s.id });
        downed.push(s.id);
      }
    }
    const after = deriveConditions(s, defs).join(',');
    if (before !== after) emit('survivor.conditions_changed', { survivorId: s.id, conditions: after ? after.split(',') : [] });
  }
  return downed;
}

// ---- Carrying (R3). Derived values are never stored; the items a survivor holds live in `inventory.items`. ----

/** Total weight of what the survivor carries (quantity x item unitWeight). */
export function carriedLoad(s, defs) {
  let w = 0;
  for (const [item, qty] of Object.entries(s.inventory.items)) w += qty * (defs.items[item]?.unitWeight ?? 0);
  return w;
}

/** How much weight she can carry: (base + perStrength x strength) x trait multipliers, rounded down. Data: defs.carry. */
export function carryCapacity(s, defs) {
  const c = defs.carry;
  let cap = c.base + c.perStrength * (s.attributes.strength ?? 0);
  for (const t of s.traits) if (Object.prototype.hasOwnProperty.call(c.traits, t)) cap *= c.traits[t];
  return Math.floor(cap);
}

export const carriedOf = (s, item) => (Object.prototype.hasOwnProperty.call(s.inventory.items, item) ? s.inventory.items[item] : 0);

/** Most units of `item` she can still pick up without going over her capacity. */
export const carryRoom = (s, defs, item) => Math.max(0, Math.floor((carryCapacity(s, defs) - carriedLoad(s, defs)) / defs.items[item].unitWeight));

/** Add to what she carries. Refuses to exceed capacity: the caller must size the pickup with carryRoom first. */
export function addCarried(s, defs, item, qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new AftermathError('INVALID_QUANTITY', `Quantity must be a positive integer, got ${qty}`);
  if (qty > carryRoom(s, defs, item)) throw new AftermathError('OVER_CARRY_CAPACITY', `${s.id} cannot carry ${qty} more ${item}`);
  s.inventory.items[item] = carriedOf(s, item) + qty;
}

/** Remove from what she carries (unloading). Removes the entry at zero so an empty inventory is `{}`. */
export function removeCarried(s, item, qty) {
  const have = carriedOf(s, item);
  if (!Number.isInteger(qty) || qty <= 0 || qty > have) throw new AftermathError('INVALID_QUANTITY', `${s.id} carries ${have} ${item}, cannot remove ${qty}`);
  if (have === qty) delete s.inventory.items[item]; else s.inventory.items[item] = have - qty;
}
