// Survivor templates. Attributes/skills are present in the schema now; they gain effects in Phase 4.
export const survivorTemplates = {
  rookie: {
    name: 'Rookie',
    age: 28,
    gender: 'unspecified',
    background: 'A trainee survivor.',
    needs: { health: 100, hunger: 80, thirst: 80, energy: 90, morale: 70 },
    attributes: { strength: 5, agility: 5, endurance: 5, intelligence: 5, perception: 5 },
    skills: {},
    traits: [],
  },
};
