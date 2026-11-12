// Survivor templates. Attributes/skills/traits are present in the schema now; they gain effects in Phase 4.
// Skill names: gathering, repair, rest, consume, move. Trait names: strong, fast, tireless, observant, hardy.
export const SKILLS = {
  gathering: { name: 'Gathering', description: 'Gather resources faster and carry more per trip.' },
  repair: { name: 'Repair', description: 'Repair buildings faster and with less material.' },
  rest: { name: 'Rest', description: 'Recover energy faster when resting.' },
  consume: { name: 'Consume', description: 'Extract more benefit from food and water.' },
  move: { name: 'Movement', description: 'Walk between tiles faster.' },
};

export const TRAITS = {
  strong: { name: 'Strong', description: 'Higher carry capacity and gathering speed.' },
  fast: { name: 'Fast', description: 'Move between tiles more quickly.' },
  tireless: { name: 'Tireless', description: 'Energy decays slower and work costs less energy.' },
  observant: { name: 'Observant', description: 'Spot resources and threats more easily.' },
  hardy: { name: 'Hardy', description: 'Health decays slower when needs are unmet.' },
};

// Skill names: gathering, repair, rest, consume, move. Trait names: strong, fast, tireless, observant, hardy.
export const survivorTemplates = {
  rookie: {
    name: 'Rookie',
    age: 28,
    gender: 'unspecified',
    background: 'A trainee survivor.',
    needs: { health: 100, hunger: 80, thirst: 80, energy: 90, morale: 70 },
    attributes: { strength: 5, agility: 5, endurance: 5, intelligence: 5, perception: 5 },
    skills: { gathering: 0, repair: 0, rest: 0, consume: 0, move: 0 },
    traits: [],
  },
};
