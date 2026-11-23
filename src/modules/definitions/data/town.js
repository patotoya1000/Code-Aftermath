// The town behind the wall (W4, docs/game/21 sections 7 and 14). The town offers SURVIVORS TO RECRUIT and nothing else; they are paid for with in-game
// resources only (never money: docs/game/21 section 8). Offers are a PURE FUNCTION of (seed, day): no stored randomness, so a replay or a save cannot
// disagree with the original run, and the learner reads them in `town.offers` and hires with `town.recruit(offerId, item?)`.
//
//   startDay      no offers before this calendar day (a calm start)
//   rotateDays    the board changes every `rotateDays` days: offers `offer_<period>_<n>`; whoever is not hired when it rotates leaves
//   offers        how many candidates stand at the gate per period (a limit on how fast the camp can grow)
//   beds          housing: each WORKING (not ruined) building of a type gives that many beds; a hire needs a free bed (survivors + 1 <= beds)
//   pricing       the WORTH of a candidate, in "trade points": base + perSkillLevel x (sum of skill levels) + perAttributePoint x (attribute points above
//                 the average of 5, never below 0) + perTrait x traits, never below minWorth
//   payWith       what the town accepts and what one unit is worth in trade points; the price is shown for every item (ceil(worth / value) units). Food,
//                 raw food and other supplies; nothing the learner cannot hold in base stock
//   candidates    how a candidate is rolled from a hash: attribute range, how many skills start above 0 and how high, the chance of a trait
// Every number is a PLACEHOLDER to tune in a playtest.
export const town = {
  startDay: 2,
  rotateDays: 2,
  offers: 3,
  beds: { hq: 2, tent: 2 },
  pricing: { base: 24, perSkillLevel: 6, perAttributePoint: 3, perTrait: 10, minWorth: 20 },
  payWith: { bread: 10, hot_meal: 14, mre: 30, wheat: 4, potato: 3, carrot: 3, wood: 2, stone: 2 },
  payOrder: ['wheat', 'potato', 'carrot', 'bread', 'wood', 'stone', 'hot_meal', 'mre'], // what recruit() pays with when the learner names no item: the first one in stock that covers the price
  candidates: {
    template: 'rookie',
    attribute: { min: 3, max: 8 },
    skills: { count: 2, maxLevel: 3, pool: ['gathering', 'repair', 'rest', 'consume', 'move', 'cooking', 'farming', 'crafting', 'combat', 'mining'] },
    traitPercent: 30,
    names: ['Ash', 'Bram', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus', 'Hana', 'Ivo', 'June', 'Kade', 'Lena', 'Milo', 'Nell', 'Otto', 'Pia', 'Quinn', 'Rhea', 'Sol', 'Tess', 'Uma', 'Vik', 'Wren', 'Yara'],
  },
  historyLimit: 10,
  // W5 the train (docs/game/21 section 7). A train from the town arrives now and then, a PURE function of (seed, visit number): the first one on
  // `firstDay`, then every `gapDays.min`..`gapDays.max` days. It is announced `warnDays` ahead and stays `stayDays` days; what it carries is
  // limited and different each visit, and whatever is not bought when it leaves is gone. It brings `recruits` extra candidates (each with
  // `bonusSkills` more skills than the gate board) and `goodsPerVisit` goods picked from `goods`, each in a quantity range, priced per unit
  // in trade points and paid with the same `payWith` supplies as recruits.
  train: {
    firstDay: 4, gapDays: { min: 5, max: 7 }, stayDays: 1, warnDays: 1, recruits: 2, bonusSkills: 1, goodsPerVisit: 3,
    goods: {
      advanced_spear: { worth: 36, qty: [1, 1] },
      bow: { worth: 44, qty: [1, 1] },
      crossbow: { worth: 80, qty: [1, 1] },
      arrows: { worth: 2, qty: [10, 20] },
      bolts: { worth: 3, qty: [10, 20] },
      bone_meal: { worth: 6, qty: [3, 6] },
    },
  },
};
