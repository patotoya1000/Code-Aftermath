// The five MAP SCREENS (docs/game/21 sections 3 and 10, rebuilt 2026-11-20; docs/game/24 added FOREST and QUARRY): MAP 1 TOWN · MAP 2 OUTPOST · MAP 3 FRONT · MAP 4 FOREST · MAP 5 QUARRY.
//   TOWN     a static map slid in from the west: recruit hall (the store), train station, housing; click an object to open it
//   OUTPOST  the live simulation grid (the 40x16 line-wall map): the canvas you always had
//   FRONT    a static map slid in from the east: the scavenge sites and the raid road; click a site to read it and get its Scavenge code. Two road signs lead on:
//   FOREST   the NORTH (upper) road: far away and slow, the wood sites (scavenge `region: 'forest'`)
//   QUARRY   the SOUTH (lower) road: heavy stone and sand loads (scavenge `region: 'quarry'`)
// PRESENTATION ONLY: pure functions over the learner view. The simulation never sees which screen is open, and no click here changes the world:
// every action button inserts code into the editor, exactly like the nav-bar panels.

export const SCREENS = Object.freeze([
  Object.freeze({ id: 'town', no: 1, label: 'TOWN', hint: 'Recruit hall, train station, housing' }),
  Object.freeze({ id: 'outpost', no: 2, label: 'OUTPOST', hint: 'Your base behind the wall' }),
  Object.freeze({ id: 'front', no: 3, label: 'FRONT', hint: 'Expeditions and the raid road' }),
  Object.freeze({ id: 'forest', no: 4, label: 'FOREST', hint: 'North road: wood, far and slow' }),
  Object.freeze({ id: 'quarry', no: 5, label: 'QUARRY', hint: 'South road: stone and sand, heavy loads' }),
]);
export const SCREEN_IDS = Object.freeze(SCREENS.map((s) => s.id));
export const screenOf = (id) => SCREENS.find((s) => s.id === id) ?? SCREENS[1];

/** The screen one step west (-1) or east (+1) of `id`; stays put at the ends. */
export function neighbourScreen(id, dir) {
  const i = SCREEN_IDS.indexOf(id);
  return SCREENS[Math.max(0, Math.min(SCREENS.length - 1, (i < 0 ? 1 : i) + dir))];
}

/** What each edge arrow does from `id`: { west, east } = { to, label, disabled }. A disabled arrow is at the end of the line. */
export function arrowState(id) {
  const one = (dir) => { const to = neighbourScreen(id, dir); return { to: to.id, label: to.label, disabled: to.id === id }; };
  return { west: one(-1), east: one(1) };
}

/** 'raid' (a wave is on), 'soon' (a raid or boss is due tonight and dusk is close), else 'none'. Drives the red pulse on the east arrow and the badge dot. */
export const SOON_TICKS = 60;
export function alertLevel(view) {
  if (view?.threats?.wave?.active) return 'raid';
  const b = view?.board; if (!b) return 'none';
  const tonight = (b.raids ?? []).some((r) => r.inDays === 0) || (b.bosses ?? []).some((r) => r.inDays === 0);
  return tonight && b.duskInTicks > 0 && b.duskInTicks <= SOON_TICKS ? 'soon' : 'none';
}

/** Clickable objects of the static maps. `id` = data-spot. */
export const TOWN_SPOTS = Object.freeze([
  Object.freeze({ id: 'hall', label: 'RECRUIT HALL', title: 'Recruit hall (the store)' }),
  Object.freeze({ id: 'station', label: 'TRAIN STATION', title: 'Train station' }),
  Object.freeze({ id: 'housing', label: 'HOUSING', title: 'Housing and beds' }),
]);

/** Which scavenge sites a map lists: the FRONT shows `region: 'front'` sites, the FOREST and QUARRY maps their own. */
export const SITE_MAPS = Object.freeze(['front', 'forest', 'quarry']);
export const sitesOf = (view, map) => (view?.scavenge?.sites ?? []).filter((s) => (s.region ?? 'front') === map);
/** The two road signs on the FRONT map: a click jumps to that map (no code, nothing happens in the world). */
export const ROAD_SPOTS = Object.freeze([
  Object.freeze({ id: 'road_forest', to: 'forest', label: 'NORTH ROAD → FOREST' }),
  Object.freeze({ id: 'road_quarry', to: 'quarry', label: 'SOUTH ROAD → QUARRY' }),
]);

/** Short status line under a spot's label, from the real view. */
export function spotStatus(view, id) {
  const t = view?.town; const sv = view?.scavenge;
  if (id === 'hall') return !t?.open ? `opens day ${t?.opensOnDay ?? '?'}` : `${t.offers.filter((o) => !o.hired).length} for hire`;
  if (id === 'station') return !t?.open ? 'closed' : t.train?.present ? 'TRAIN IN' : `train in ${t.train?.arrivesInDays ?? '?'}d`;
  if (id === 'housing') return !t?.open ? `opens day ${t?.opensOnDay ?? '?'}` : `${t.freeBeds} free bed${t.freeBeds === 1 ? '' : 's'}`;
  if (id === 'raid') { const r = view?.board?.raids?.[0]; return view?.threats?.wave?.active ? 'WAVE ACTIVE' : r ? `raid day ${r.day}` : 'quiet'; }
  if (id === 'road_forest' || id === 'road_quarry') { const list = sitesOf(view, id === 'road_forest' ? 'forest' : 'quarry'); return list.length ? `${Math.min(...list.map((q) => q.ticks))}-${Math.max(...list.map((q) => q.ticks))} ticks` : ''; }
  const s = (sv?.sites ?? []).find((q) => q.id === id);
  return s ? `${s.ticks}t · ${s.dangerToday}% danger` : '';
}

/** Direct road buttons on the live OUTPOST map (UI-7D): top road -> FOREST, bottom road -> QUARRY. */
export const OUTPOST_ROADS = Object.freeze([
  Object.freeze({ id: 'north', to: 'forest', label: 'FOREST', spotId: 'road_forest', aria: 'Go to the forest map (north road)' }),
  Object.freeze({ id: 'south', to: 'quarry', label: 'QUARRY', spotId: 'road_quarry', aria: 'Go to the quarry map (south road)' }),
]);

/** Pure presentation state for the OUTPOST north/south road buttons from the student view. */
export function outpostRoadState(view) {
  const away = view?.scavenge?.away ?? [];
  const one = (r) => {
    const regionSites = new Set(sitesOf(view, r.to).map((s) => s.id));
    const awayCount = away.filter((a) => regionSites.has(a.siteId)).length;
    const base = spotStatus(view, r.spotId);
    const status = awayCount > 0 ? `${base} · ${awayCount} away` : base;
    return { id: r.id, to: r.to, label: r.label, status, awayCount };
  };
  return { north: one(OUTPOST_ROADS[0]), south: one(OUTPOST_ROADS[1]) };
}
