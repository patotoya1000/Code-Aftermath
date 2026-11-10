// Lesson checks: pure predicates over an attempt result. They never change gameplay state.
// A check returns { passed, detail }. Add new checks here; lessons reference them by name from data.
const CONSTRUCTS = {
  if: /\bif\s*\(/,
  loop: /\b(for|while)\s*\(/,
  for: /\bfor\s*\(/,
  while: /\bwhile\s*\(/,
  function: /\bfunction\b|=>/,
};

const survivor = (a) => a.finalView.survivor;
const building = (a, idOrType) => a.finalView.buildings.find((b) => b.id === idOrType || b.type === idOrType);

export const CHECKS = {
  stockAtLeast: (a, { resource, amount }) => {
    const have = a.finalView.base[resource] ?? 0;
    return { passed: have >= amount, detail: `${resource}: ${have} / ${amount}` };
  },
  buildingConditionIs: (a, { building: id, condition }) => {
    const b = building(a, id);
    return { passed: b?.condition === condition, detail: `${id} is ${b?.condition ?? 'missing'}` };
  },
  buildingHealthAtLeast: (a, { building: id, health }) => {
    const b = building(a, id);
    return { passed: (b?.health ?? 0) >= health, detail: `${id} health ${b?.health ?? 0} / ${health}` };
  },
  needAtLeast: (a, { need, value }) => {
    const v = survivor(a)?.needs[need] ?? 0;
    return { passed: v >= value, detail: `${need}: ${v} / ${value}` };
  },
  survivorActive: (a) => ({ passed: survivor(a)?.status === 'active', detail: `status ${survivor(a)?.status}` }),
  noActionFailures: (a) => {
    const failed = a.events.filter((e) => e.type === 'action.failed' || e.type === 'command.rejected');
    return { passed: failed.length === 0, detail: failed.map((e) => e.reason ?? e.code).join(', ') };
  },
  eventCountAtLeast: (a, { type, count }) => {
    const n = a.events.filter((e) => e.type === type).length;
    return { passed: n >= count, detail: `${type}: ${n} / ${count}` };
  },
  needNeverBelow: (a, { need, value }) => {
    const low = Math.min(...a.checkpoints.map((c) => c.view.survivor?.needs[need] ?? Infinity));
    return { passed: low >= value, detail: `lowest ${need}: ${low}` };
  },
  usesConstruct: (a, { construct }) => ({ passed: (CONSTRUCTS[construct] ?? /$^/).test(a.code), detail: construct }),
  commandCountAtMost: (a, { max }) => ({ passed: a.commands.length <= max, detail: `${a.commands.length} / ${max}` }),
  finishedWithinTicks: (a) => ({ passed: !a.timedOut, detail: `${a.ticks} ticks` }),
};
