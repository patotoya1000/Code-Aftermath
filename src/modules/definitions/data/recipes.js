// Recipes (docs/game/16). One engine for cooking now and crafting later: a recipe names the STATION building type that makes it, the
// level that station must have, what a batch consumes (`inputs`, taken from base stock), what it makes (`outputs`, added to base
// stock), how long one batch takes and which skill it practises (`minSkill` is the lowest level that may attempt it).
// Ingredients include the fuel (wood). `action` says which learner command makes it: 'cook' (survivor.cook, kitchen) or 'craft'
// (survivor.craft, workshop); the skill must be the one that action's XP award teaches. `power` (optional) = power the station draws
// WHILE a batch is being worked: the grid must serve it or the work waits (a sealing machine, a glass furnace).
export const recipes = {
  bread: { name: 'Bread', station: 'kitchen', stationLevel: 1, inputs: { wheat: 2, water: 1, wood: 1 }, outputs: { bread: 1 }, ticks: 12, skill: 'cooking', minSkill: 0, action: 'cook' },
  // Kitchen level 2: stew from the farm's vegetables. Needs a little practised Cooking (bread teaches it).
  hot_meal: { name: 'Hot meal', station: 'kitchen', stationLevel: 2, inputs: { potato: 1, carrot: 1, water: 1, wood: 1 }, outputs: { hot_meal: 1 }, ticks: 16, skill: 'cooking', minSkill: 1, action: 'cook' },
  // Kitchen level 3: two hot meals sealed in packaging (workshop) by a powered sealer. Never spoils.
  mre: { name: 'MRE', station: 'kitchen', stationLevel: 3, inputs: { hot_meal: 2, packaging: 1 }, outputs: { mre: 1 }, ticks: 20, skill: 'cooking', minSkill: 2, action: 'cook', power: 4 },
  // Workshop recipes (crafting skill).
  packaging: { name: 'Packaging', station: 'workshop', stationLevel: 1, inputs: { wood: 2, stone: 1 }, outputs: { packaging: 2 }, ticks: 10, skill: 'crafting', minSkill: 0, action: 'craft' },
  glass: { name: 'Glass', station: 'workshop', stationLevel: 2, inputs: { stone: 4, wood: 2 }, outputs: { glass: 1 }, ticks: 24, skill: 'crafting', minSkill: 1, action: 'craft', power: 8 },
};
