// Capability system: determines whether a survivor can perform an action, and how well.
// Factors come from attributes, skills, traits, equipment, and current needs conditions.
// Nothing here mutates GameState; it is pure factor calculation.
//
// checkCapability(survivor, actionDef, defs, ctx) -> { ok, reason?, durationModifier, outputModifier }
//   ok: false means the action cannot be attempted at all (fails before reservation)
//   durationModifier: multiplier applied to action tick duration (1.0 = baseline, lower = faster)
//   outputModifier: multiplier applied to action output quantity (1.0 = baseline, higher = more)

export function checkCapability(survivor, actionDef, defs, ctx) {
  const cap = actionDef.capability;
  if (!cap) return { ok: true, durationModifier: 1, outputModifier: 1 };

  const { attributes, skills, traits, needs } = survivor;
  const failures = [];

  // --- Attribute minimums ---
  if (cap.attributes) {
    for (const [attrId, minLevel] of Object.entries(cap.attributes)) {
      const actual = attributes[attrId] ?? 0;
      if (actual < minLevel) {
        failures.push({
          kind: 'attribute',
          id: attrId,
          required: minLevel,
          actual,
          message: `${attrId} ${actual} is below required ${minLevel}`,
        });
      }
    }
  }

  // --- Skill minimums ---
  if (cap.skills) {
    for (const [skillId, minLevel] of Object.entries(cap.skills)) {
      const actual = skills[skillId] ?? 0;
      if (actual < minLevel) {
        failures.push({
          kind: 'skill',
          id: skillId,
          required: minLevel,
          actual,
          message: `${skillId} skill ${actual} is below required ${minLevel}`,
        });
      }
    }
  }

  if (failures.length) {
    const primary = failures[0];
    return {
      ok: false,
      reason: 'CAPABILITY_INSUFFICIENT',
      detail: primary,
      failures,
      message: `Cannot perform ${actionDef.handler}: ${primary.message}`,
    };
  }

  // --- Compute modifiers (only when capable) ---
  const durationModifier = computeDurationModifier(survivor, actionDef, defs);
  const outputModifier = computeOutputModifier(survivor, actionDef, defs);

  return { ok: true, durationModifier, outputModifier };
}

/** Multiplier on action tick duration. 1.0 = baseline; <1 = faster; >1 = slower. */
function computeDurationModifier(survivor, actionDef, defs) {
  let mod = 1.0;

  // Skill reduces time: each skill level shaves a small percentage
  const skillId = actionSkillOf(actionDef.handler);
  if (skillId) {
    const level = survivor.skills[skillId] ?? 0;
    mod *= Math.max(0.5, 1.0 - level * 0.05); // -5% per level, floor at 50%
  }

  // Relevant attribute helps (agility for movement/gather/repair, strength for gather/repair)
  const attrMod = attributeDurationModifier(survivor.attributes, actionDef.handler);
  mod *= attrMod;

  // Tired survivors work slower
  if (survivor.needs.energy < defs.needs.thresholds.tired) {
    mod *= 1.3; // 30% slower when tired
  }
  if (survivor.needs.hunger < defs.needs.thresholds.hungry) {
    mod *= 1.15; // 15% slower when hungry
  }
  if (survivor.needs.thirst < defs.needs.thresholds.thirsty) {
    mod *= 1.15; // 15% slower when thirsty
  }

  // Traits
  if (survivor.traits.includes('tireless') && actionDef.handler !== 'rest') {
    mod *= 0.9; // tireless: work costs less time (except resting)
  }
  if (survivor.traits.includes('fast') && actionDef.handler === 'move') {
    mod *= 0.8; // fast: move 20% quicker
  }
  if (survivor.traits.includes('strong') && actionDef.handler === 'gather') {
    mod *= 0.9; // strong: gather 10% quicker
  }

  return Math.max(0.4, Math.min(3.0, mod)); // clamp
}

/** Multiplier on action output quantity. 1.0 = baseline; >1 = more output. */
function computeOutputModifier(survivor, actionDef, defs) {
  let mod = 1.0;

  // Skill increases output for gathering
  const skillId = actionSkillOf(actionDef.handler);
  if (skillId) {
    const level = survivor.skills[skillId] ?? 0;
    mod *= 1.0 + level * 0.03; // +3% per level
  }

  // Traits
  if (survivor.traits.includes('strong') && actionDef.handler === 'gather') {
    mod *= 1.1; // strong: +10% gather output
  }

  return Math.max(0.5, Math.min(2.0, mod)); // clamp
}

function actionSkillOf(handler) {
  const map = {
    move: 'move',
    gather: 'gathering',
    rest: 'rest',
    consume: 'consume',
    repair: 'repair',
  };
  return map[handler] ?? null;
}

function attributeDurationModifier(attributes, handler) {
  let mod = 1.0;
  if (handler === 'move' || handler === 'gather') {
    const agi = attributes.agility ?? 5;
    mod *= Math.max(0.7, 1.0 - (agi - 5) * 0.02); // -2% per agility point above 5
  }
  if (handler === 'gather' || handler === 'repair') {
    const str = attributes.strength ?? 5;
    mod *= Math.max(0.7, 1.0 - (str - 5) * 0.02); // -2% per strength point above 5
  }
  if (handler === 'rest' || handler === 'consume') {
    const end = attributes.endurance ?? 5;
    mod *= Math.max(0.7, 1.0 - (end - 5) * 0.02); // -2% per endurance point above 5
  }
  return mod;
}