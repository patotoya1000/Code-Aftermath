// Recipes (docs/game/16). One engine for cooking now and crafting later: a recipe names the STATION building type that makes it, the
// level that station must have, what a batch consumes (`inputs`, taken from base stock), what it makes (`outputs`, added to base
// stock), how long one batch takes and which skill it practises (`minSkill` is the lowest level that may attempt it).
// Ingredients include the fuel (wood). Hot meals, rations and the MRE arrive with kitchen levels 2-3; see the design doc.
export const recipes = {
  bread: { name: 'Bread', station: 'kitchen', stationLevel: 1, inputs: { wheat: 2, water: 1, wood: 1 }, outputs: { bread: 1 }, ticks: 12, skill: 'cooking', minSkill: 0 },
};
