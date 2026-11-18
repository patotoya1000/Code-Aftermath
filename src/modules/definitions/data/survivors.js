// Survivor templates. Attributes/skills/traits are present in the schema now; they gain effects in Phase 4.
// Skill names: gathering, repair, rest, consume, move. Trait names: strong, fast, tireless, observant, hardy.
export const SKILLS = {
  gathering: { name: 'Gathering', description: 'Gather resources faster.' },
  repair: { name: 'Repair', description: 'Repair buildings faster and with less material.' },
  rest: { name: 'Rest', description: 'Recover energy faster when resting.' },
  consume: { name: 'Consume', description: 'Extract more benefit from food and water.' },
  move: { name: 'Movement', description: 'Walk between tiles faster.' },
  cooking: { name: 'Cooking', description: 'Cook faster at a kitchen.' },
  farming: { name: 'Farming', description: 'Plant, water and harvest faster.' },
  crafting: { name: 'Crafting', description: 'Craft faster at a workshop.' },
  combat: { name: 'Combat', description: 'Fight zombies faster and more effectively.' },
};

// Skill progression (O4). Skills improve ONLY through simulation-awarded XP from real work (docs/game/07 §NPC skill learning).
// `thresholds[n]` = total XP needed to REACH level n (index 0 = level 0), so the highest level is thresholds.length - 1.
// Each award says which skill a piece of work teaches, how much XP, and how fast it stops being useful: full XP while the skill
// is below `fullUntil`, falling linearly to `floor` x XP at `teachesUpTo`, and `floor` x XP beyond - easy repetition
// teaches less, it never teaches nothing and it can never push a skill past the top level. Failure grants no XP (yet).
// What a level DOES (shorter work, more output) lives in the capability module.
export const progression = {
  thresholds: [0, 20, 50, 100, 170, 260, 380, 530, 720, 950, 1250],
  floor: 0.1,
  awards: {
    gather: { skill: 'gathering', xp: 1,    fullUntil: 3, teachesUpTo: 8 }, // per unit picked up from a node
    repair: { skill: 'repair',    xp: 6,    fullUntil: 2, teachesUpTo: 6 }, // per completed repair action
    upgrade: { skill: 'repair',   xp: 12,   fullUntil: 3, teachesUpTo: 8 }, // per completed upgrade
    move:   { skill: 'move',      xp: 0.2,  fullUntil: 2, teachesUpTo: 4 }, // per tile walked
    rest:   { skill: 'rest',      xp: 0.1,  fullUntil: 2, teachesUpTo: 5 }, // per tick rested
    eat:    { skill: 'consume',   xp: 1,    fullUntil: 1, teachesUpTo: 4 }, // per meal
    drink:  { skill: 'consume',   xp: 1,    fullUntil: 1, teachesUpTo: 4 }, // per drink
    cook:   { skill: 'cooking',   xp: 4,    fullUntil: 2, teachesUpTo: 6 }, // per finished batch
    craft:  { skill: 'crafting',   xp: 4,    fullUntil: 2, teachesUpTo: 6 }, // per finished workshop batch
    farm:   { skill: 'farming',   xp: 2,    fullUntil: 2, teachesUpTo: 6 }, // per finished chore (plant, water, harvest)
    combat: { skill: 'combat',    xp: 2,    fullUntil: 2, teachesUpTo: 8 }, // per successful combat hit
  },
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
    skills: { gathering: 0, repair: 0, rest: 0, consume: 0, move: 0, cooking: 0, farming: 0, crafting: 0, combat: 0 },
    traits: [],
  },
};
