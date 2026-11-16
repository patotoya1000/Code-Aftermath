// Items. `unitWeight` drives carrying: a survivor's load is the sum of quantity x unitWeight of what she carries.
export const items = {
  wood: { name: 'Wood', unitWeight: 2 },
  stone: { name: 'Stone', unitWeight: 4 },
  food: { name: 'Food', unitWeight: 1 },
  water: { name: 'Water', unitWeight: 1 },
  // Kitchen goods (docs/game/16). Wheat is a starting stock until farming exists; bread is cooked from it.
  wheat: { name: 'Wheat', unitWeight: 1 },
  // `shelfLife` (days): the item spoils when it has been in stock that long (spoilage module). Items without one never spoil.
  bread: { name: 'Bread', unitWeight: 1, shelfLife: 4 },
};

// Carry capacity (R3), in weight units: (base + perStrength x strength) x every matching trait multiplier, rounded down.
// A rookie (strength 5) carries 20 + 8x5 = 60 weight = 30 wood or 15 stone. Equipment effects arrive with equipment.
export const carry = {
  base: 20,
  perStrength: 8,
  traits: { strong: 1.25 },
};
