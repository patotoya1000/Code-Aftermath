// Risk events (O18). Each calendar day MAY bring one event, decided by a pure function of (seed, day): no stored randomness, so a replay or a
// save can never disagree with the original run, and the schedule is PUBLIC for `warnDays` days ahead (learners can read `events.upcoming`
// and prepare: eat the bread before the rats, repair the generator, empty a storage). Effects happen at dawn of the event's day.
//
//   kind  'lose_stock'      `percent` of every listed item in AVAILABLE base stock is lost (reserved units are safe)
//         'damage_building' one working building of the listed `types` drops to `healthPercent` % of its max health (it must be repaired again)
//         'gain_stock'      `items` arrive in base stock, as much as storage has room for
//   weight  relative chance among the events (whole number >= 1)
//   harm    true = a bad event (the UI and learners can treat it as a warning)
export const events = {
  rat_infestation: { name: 'Rat infestation', kind: 'lose_stock', weight: 3, harm: true, items: ['wheat', 'bread', 'potato', 'carrot'], percent: 30 },
  equipment_fault: { name: 'Equipment fault', kind: 'damage_building', weight: 2, harm: true, types: ['generator', 'solar_panel', 'battery', 'workshop', 'kitchen'], healthPercent: 50 },
  supply_cache: { name: 'Supply cache found', kind: 'gain_stock', weight: 2, harm: false, items: { wood: 12, stone: 8 } },
};

// startDay: no event before this calendar day (a calm start). chancePercent: chance that a day has an event. warnDays: how far ahead the schedule is public.
export const eventSchedule = { startDay: 3, chancePercent: 35, warnDays: 2, historyLimit: 10 };
