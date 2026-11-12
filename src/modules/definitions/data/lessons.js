// Lessons are data. Goals reference check names implemented by the lessons module.
// Design contract: every lesson is self-contained (scenario + seed + maxTicks).
// Extensibility: add new modules by appending to this object.
// Each lesson: { id, version, title, scenario, seed, maxTicks, brief, starter, goals[] }
//   goals[].check must match a key in lessons/checks.js
export const lessons = {
  m1_first_wood: {
    id: 'm1_first_wood', version: 1, title: 'Module 1 · First Wood', scenario: 'stage1', seed: 1001, maxTicks: 400,
    brief: 'The settlement needs wood. Tell your survivor to gather at least 10 wood.',
    starter: '// Gather wood for the base.\nsurvivor.gather("wood", 10, 10);\n',
    goals: [
      { id: 'wood10', check: 'stockAtLeast', args: { resource: 'wood', amount: 10 }, message: 'Base has at least 10 wood.', hint: 'Use survivor.gather("wood", 10, 10).' },
      { id: 'clean', check: 'noActionFailures', args: {}, message: 'No action failed.' },
    ],
  },
  m1_rest_first: {
    id: 'm1_rest_first', version: 1, title: 'Module 1 · Rest First', scenario: 'stage1_tired', seed: 1002, maxTicks: 500,
    brief: 'Your survivor is exhausted. Check survivor.needs.energy and rest before gathering 10 wood.',
    starter: '// Look before you work.\nif (survivor.needs.energy < 30) {\n  survivor.rest();\n}\nsurvivor.gather("wood", 10, 10);\n',
    goals: [
      { id: 'wood10', check: 'stockAtLeast', args: { resource: 'wood', amount: 10 }, message: 'Base has at least 10 wood.' },
      { id: 'clean', check: 'noActionFailures', args: {}, message: 'No action failed.' },
      { id: 'if', check: 'usesConstruct', args: { construct: 'if' }, message: 'Use an if statement to decide.', hint: 'if (survivor.needs.energy < 30) { ... }' },
    ],
  },
  m1_repair_fence: {
    id: 'm1_repair_fence', version: 1, title: 'Module 1 · Mend the Fence', scenario: 'stage1', seed: 1003, maxTicks: 600,
    brief: 'The perimeter fence is ruined. Gather wood, then repair it until it is no longer damaged (state "repaired").',
    starter: 'survivor.gather("wood", 10, 10);\nsurvivor.repair(fence);\nsurvivor.repair(fence);\n',
    goals: [
      { id: 'fence', check: 'buildingConditionIs', args: { building: 'fence', condition: 'repaired' }, message: 'The fence is repaired.', hint: 'Each repair adds health and costs wood.' },
      { id: 'clean', check: 'noActionFailures', args: {}, message: 'No action failed.' },
    ],
  },
  m2_loop_wood: {
    id: 'm2_loop_wood', version: 1, title: 'Module 2 · Loop It', scenario: 'stage1', seed: 1004, maxTicks: 800,
    brief: 'Gather 30 wood in batches of 5. Use a loop instead of copying the same line.',
    starter: 'for (let i = 0; i < 6; i++) {\n  survivor.gather("wood", 5, 5);\n}\n',
    goals: [
      { id: 'wood30', check: 'stockAtLeast', args: { resource: 'wood', amount: 30 }, message: 'Base has at least 30 wood.' },
      { id: 'clean', check: 'noActionFailures', args: {}, message: 'No action failed.' },
      { id: 'loop', check: 'usesConstruct', args: { construct: 'loop' }, message: 'Use a loop (for/while).', hint: 'for (let i = 0; i < 6; i++) { ... }' },
    ],
  },
  m2_a_variable: {
    id: 'm2_a_variable', version: 1, title: 'Module 2 · Let There Be Wood', scenario: 'stage1', seed: 1005, maxTicks: 500,
    brief: 'Create a variable, then use it. Code can remember values between commands.',
    starter: '// Store the amount in a variable.\nconst amount = 10;\nsurvivor.gather("wood", amount, amount);\n',
    goals: [
      { id: 'wood10', check: 'stockAtLeast', args: { resource: 'wood', amount: 10 }, message: 'Base has at least 10 wood.' },
      { id: 'const', check: 'usesConstruct', args: { construct: 'const' }, message: 'Declare a variable with const.' },
    ],
  },
  m3_c_condition: {
    id: 'm3_c_condition', version: 1, title: 'Module 3 · When to Gather', scenario: 'stage1_tired', seed: 1006, maxTicks: 800,
    brief: 'If you are tired, rest. If you are not tired, gather wood. Make decisions with if and else.',
    starter: 'if (survivor.needs.energy < 30) {\n  survivor.rest();\n} else {\n  survivor.gather("wood", 10, 10);\n}\n',
    goals: [
      { id: 'rested', check: 'needAtLeast', args: { need: 'energy', value: 70 }, message: 'Energy is at least 70.' },
      { id: 'clean', check: 'noActionFailures', args: {}, message: 'No action failed.' },
      { id: 'if', check: 'usesConstruct', args: { construct: 'if' }, message: 'Use an if statement.' },
    ],
  },
  m3_d_function: {
    id: 'm3_d_function', version: 1, title: 'Module 3 · A Task Explained', scenario: 'stage1', seed: 1007, maxTicks: 1200,
    brief: 'Define your own function to gather wood. Functions let you reuse code without copying.',
    starter: 'function getWood() {\n  survivor.gather("wood", 5, 5);\n  survivor.gather("wood", 5, 5);\n}\ngetWood();\ngetWood();\n',
    goals: [
      { id: 'wood10', check: 'stockAtLeast', args: { resource: 'wood', amount: 10 }, message: 'Base has at least 10 wood.' },
      { id: 'clean', check: 'noActionFailures', args: {}, message: 'No action failed.' },
      { id: 'function', check: 'usesConstruct', args: { construct: 'function' }, message: 'Define a function.' },
    ],
  },
};
