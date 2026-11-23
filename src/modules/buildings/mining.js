import { available, stockKey } from '../resources/index.js';
import { storageRoom } from './index.js';

// R4 (docs/game/24): the pure rules of the MINING STATION, shared by the mine handler (the work) and the projection (what the learner reads).
// Numbers live in data/mining.js and in `buildings.mining_station.levels[n].mine`; nothing here keeps state.

const levelMine = (defs, station) => defs.buildings[station.type]?.levels?.[station.level]?.mine ?? null;

/** Chance (percent) that a round at a station of this level ends in a cave-in for a survivor with this Mining level. Pure. */
export function caveInPercent(mining, stationLevel, skill = 0) {
  const c = mining.caveIn;
  return Math.max(c.floorPercent, (c.percent[stationLevel] ?? 0) - skill * c.skillPercent);
}

/** Ore one round brings at this station before storage limits: ore yield x the level's yieldPercent x her output modifier, at least 1. */
export function roundYield(defs, ore, station, outputModifier = 1) {
  return Math.max(1, Math.floor((ore.yield * (levelMine(defs, station)?.yieldPercent ?? 100) * outputModifier) / 100));
}

/** The learner's view of a mining station: is it working and open, what it yields, the risk, and each ore's numbers. null for any other building. */
export function miningInfoFor(state, defs, b, hqLevel) {
  if (b.type !== defs.mining.station) return null;
  const lv = levelMine(defs, b);
  const working = b.condition === 'repaired';
  const open = hqLevel >= defs.mining.minHq;
  const power = lv?.power ?? 0;
  return {
    working, open, minHq: defs.mining.minHq, level: b.level, yieldPercent: lv?.yieldPercent ?? 100,
    caveInPercent: caveInPercent(defs.mining, b.level, 0), caveInDamage: defs.mining.caveIn.damage,
    power, powered: power ? state.activeActions.some((id) => state.actions[id]?.targetId === b.id && state.actions[id].actionType === 'mine' && state.actions[id].powered) : null, // a digging round on a powered drill is being served this tick
    ores: Object.entries(defs.mining.ores).map(([id, o]) => {
      const room = storageRoom(state, o.item);
      return { id, name: o.name, item: o.item, ticks: o.ticks, yield: roundYield(defs, o, b), inStock: available(state, stockKey(o.item)), room, canMine: working && open && room >= 1 };
    }),
  };
}
