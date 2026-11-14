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
    status: 'active', // 'active' | 'downed'
    progression: { xp: {}, specialization: null },
    policies: {}, // R4a: { [name]: { below, retryAt } } — standing reactions to needs, set through the Game API only
    hooks: {}, // R4b: { [event]: [{ id, event, handlerSource }] } — learner event hooks, set through the Game API only
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
