import { AftermathError } from '../../kernel/index.js';

export function createBuilding(defs, spec) {
  const def = defs.buildings[spec.type];
  if (!def) throw new AftermathError('UNKNOWN_BUILDING', `Unknown building type ${spec.type}`);
  const b = {
    id: spec.id, type: spec.type, level: spec.level ?? 1, x: spec.x, y: spec.y,
    health: spec.health ?? def.levels[spec.level ?? 1].maxHealth,
    condition: 'repaired',
    ...(def.storage ? { storage: { ...def.storage } } : {}),
  };
  if (spec.bounds) b.bounds = { ...spec.bounds };
  b.condition = conditionOf(defs, b);
  return b;
}

export const maxHealthOf = (defs, b) => defs.buildings[b.type].levels[b.level].maxHealth;

/** Meaningful visual/functional threshold: ruined | damaged | repaired. */
export function conditionOf(defs, b) {
  const v = defs.buildings[b.type].visual;
  const ratio = b.health / maxHealthOf(defs, b);
  if (ratio <= v.ruinedBelow) return 'ruined';
  if (ratio < v.damagedBelow) return 'damaged';
  return 'repaired';
}

/** Semantic asset key per docs: building_<type>_lv<level>_<state>. */
export const assetKey = (b) => `building_${b.type}_lv${b.level}_${b.condition}`;

/** Apply a health change; returns { from, to } condition so callers can emit events. */
export function applyHealth(defs, b, delta) {
  const from = b.condition;
  b.health = Math.min(maxHealthOf(defs, b), Math.max(0, b.health + delta));
  b.condition = conditionOf(defs, b);
  return { from, to: b.condition };
}
