import { hqLevelOf } from './index.js';

// R7 (docs/game/24 section 3g): the pure rules of the ROAD CAMP, shared by the scavenge module (trip ticks, danger, stash loss) and the projection (what the learner reads). Numbers live
// on the building levels (`camp`) and in data/roads.js; nothing here keeps state. A camp WORKS when it is repaired and the headquarters has reached `roads.minHq`.

/** Every road camp building in the world. */
export const campsOf = (state, defs) => Object.values(state.buildings).filter((b) => b.type === defs.roads.camp);

/** The best level among fully repaired camps (0 when there is none). Ignores the HQ gate: see `campLevelOf`. */
const repairedCampLevel = (state, defs) => campsOf(state, defs).reduce((best, b) => (b.condition === 'repaired' ? Math.max(best, b.level) : best), 0);

/** The level of the camp that is WORKING now: the best repaired camp, but 0 while the HQ is below `roads.minHq`. */
export const campLevelOf = (state, defs) => (hqLevelOf(state) >= defs.roads.minHq ? repairedCampLevel(state, defs) : 0);

/** Is this site on a road a camp serves (its region is in `roads.regions`)? */
export const isRoadSite = (defs, siteId) => defs.roads.regions.includes(defs.scavenge.sites[siteId]?.region ?? 'front');

/** What the working camp does for a trip to this site: { level, roadTicksPercent, dangerCutPercent, stashLossPercent }, or null (no camp working, or not a road site). */
export function campEffect(state, defs, siteId) {
  if (!isRoadSite(defs, siteId)) return null;
  const level = campLevelOf(state, defs);
  const c = level > 0 ? defs.buildings[defs.roads.camp].levels[level].camp : null;
  return c ? { level, ...c } : null;
}

/** The learner's view of a road camp: whether it works and why not, its level, the numbers it gives now and the next level would give. null for any other building. */
export function campInfoFor(state, defs, b) {
  if (b.type !== defs.roads.camp) return null;
  const r = defs.roads; const lv = defs.buildings[r.camp].levels;
  const working = b.condition === 'repaired'; const open = hqLevelOf(state) >= r.minHq;
  const on = campLevelOf(state, defs);
  const pick = (l) => (lv[l]?.camp ? { ...lv[l].camp } : null);
  return {
    working, open, minHq: r.minHq, level: b.level, active: on > 0, activeLevel: on, regions: [...r.regions], loadedRaidDayDanger: r.loadedRaidDayDanger,
    now: pick(on), thisLevel: pick(b.level), next: pick(b.level + 1),
  };
}
