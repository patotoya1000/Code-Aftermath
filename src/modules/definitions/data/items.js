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
  // Farm crops (docs/game/16). A crop item is also its own seed: planting spends `crop.seeds` units of it. Raw crops go off sooner than bread.
  potato: { name: 'Potato', unitWeight: 1, shelfLife: 5 },
  carrot: { name: 'Carrot', unitWeight: 1, shelfLife: 3 },
  // O12: a hot meal (kitchen level 2) is the best fresh food but spoils fastest; the MRE (kitchen level 3) is sealed and never spoils.
  hot_meal: { name: 'Hot meal', unitWeight: 1, shelfLife: 3 },
  mre: { name: 'MRE', unitWeight: 1 },
  // O12 workshop goods: packaging seals MREs; glass is for the hydroponic level (next phase).
  packaging: { name: 'Packaging', unitWeight: 1 },
  glass: { name: 'Glass', unitWeight: 2 },
  // O15 workshop goods: fertilizer boosts the harvest of a growing plot; charcoal is a better generator fuel than raw wood. Neither spoils.
  fertilizer: { name: 'Fertilizer', unitWeight: 1 },
  charcoal: { name: 'Charcoal', unitWeight: 1 },
  // O17: nutrient solution for hydroponic plots (workshop). One unit feeds a plot for `farming.nutrients.ticksPerUnit` ticks of growth.
  nutrients: { name: 'Nutrients', unitWeight: 1 },
  // Zombie loot (doc 20 section 4): dropped on the ground outside the wall, collected by sortie. Bones feed bone meal (later recipe), hide and rags go into
  // crafting, scrap into blades/bolts/fence work, a volatile gland into gunpowder and traps. None of it spoils yet.
  bones: { name: 'Bones', unitWeight: 1 },
  hide: { name: 'Hide', unitWeight: 1 },
  rags: { name: 'Rags', unitWeight: 1 },
  scrap: { name: 'Scrap metal', unitWeight: 2 },
  gland: { name: 'Volatile gland', unitWeight: 1 },
  noise_lure: { name: 'Noise lure', unitWeight: 1 },
  boss_core: { name: 'Boss core', unitWeight: 2 },
  // Z5: bone meal is a better fertilizer (bones from the sortie); crafted personal weapons are items in base stock until a survivor equips one (survivor.equip).
  bone_meal: { name: 'Bone meal', unitWeight: 1 },
  advanced_spear: { name: 'Advanced spear', unitWeight: 3 },
  iron_spear: { name: 'Iron spear', unitWeight: 4 }, // R6: forged from iron bars
  iron_vest: { name: 'Iron vest', unitWeight: 6 }, // R6 body armor (equipment.armor)
  steel_vest: { name: 'Steel vest', unitWeight: 8 },
  bow: { name: 'Bow', unitWeight: 2 },
  crossbow: { name: 'Crossbow', unitWeight: 4 },
  rifle: { name: 'Rifle', unitWeight: 5 }, // Z6c: LOUD (noise 8)
  suppressor: { name: 'Suppressor', unitWeight: 1 }, // Z8: fitted for good to a survivor (survivor.equip("suppressor")): her personal weapon makes less noise
  // Z6b: mounted weapons are items in base stock until a survivor installs one on a tower (survivor.mount); they are hauled, not carried (no weight rule).
  ballista: { name: 'Ballista', unitWeight: 10 },
  machine_gun: { name: 'Machine gun', unitWeight: 10 },
  minigun: { name: 'Minigun', unitWeight: 12 },
  dual_minigun: { name: 'Dual minigun', unitWeight: 20 },
  // Ammo (doc 20 section 9): carried by the survivor, spent per shot; mounted weapons are stocked into a hopper from it.
  arrows: { name: 'Arrows', unitWeight: 1 },
  bolts: { name: 'Bolts', unitWeight: 1 },
  bullets: { name: 'Bullets', unitWeight: 1 },
  // P1 (docs/game/23 section 5): fortress materials. Sand and cement come from scavenge sites and zombie loot; the smelter turns scrap + charcoal into steel ingots, the
  // workshop into steel plate, hinge sets, concrete blocks and sandbags. All heavy, none of it spoils.
  sand: { name: 'Sand', unitWeight: 3 },
  cement: { name: 'Cement', unitWeight: 3 },
  // R3 (docs/game/24): the sawmill turns wood (logs) into planks and planks into beams. Wooden, so heavy but they never spoil.
  plank: { name: 'Plank', unitWeight: 2 },
  beam: { name: 'Beam', unitWeight: 4 },
  steel_ingot: { name: 'Steel ingot', unitWeight: 3 },
  steel_plate: { name: 'Steel plate', unitWeight: 4 },
  concrete_block: { name: 'Concrete block', unitWeight: 5 },
  hinge_set: { name: 'Hinge set', unitWeight: 2 },
  sandbag: { name: 'Sandbag', unitWeight: 2 },
  // R4 (docs/game/24): ore dug at the mining station. The smelter turns iron ore (+ coal) into iron bars and lead ore (+ coal) into lead bars. Heavy, never spoils.
  iron_ore: { name: 'Iron ore', unitWeight: 4 },
  lead_ore: { name: 'Lead ore', unitWeight: 4 },
  coal: { name: 'Coal', unitWeight: 2 },
  // Smelter bars kept for LATER use (no recipe consumes them yet): lead bars will cast bullets, iron bars will upgrade weapons and craft body armor.
  lead_bar: { name: 'Lead bar', unitWeight: 3 },
  iron_bar: { name: 'Iron bar', unitWeight: 3 },
};

// Carry capacity (R3), in weight units: (base + perStrength x strength) x every matching trait multiplier, rounded down.
// A rookie (strength 5) carries 20 + 8x5 = 60 weight = 30 wood or 15 stone. Equipment effects arrive with equipment.
export const carry = {
  base: 20,
  perStrength: 8,
  traits: { strong: 1.25 },
};
