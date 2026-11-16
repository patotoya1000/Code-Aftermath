// Environment (O6): a day/night clock and a PUBLIC weather calendar. Nothing here is random: the weather of every day is
// written down in this table, so learner code can read the forecast and plan (store wood before the storm, harvest before the
// cold snap). Time and weather are pure functions of the tick - no state to save, nothing that can drift out of replay.
//
// A day has `ticksPerDay` ticks = 24 hours (tick 0 is `startHour`). Daylight is [dawnHour, duskHour).
// A year is the seasons in order; each season lasts `days` days and walks through its `phases` (weather, days) in order -
// the phase lengths of a season must add up to its `days`.
export const environment = {
  ticksPerDay: 240,
  startHour: 6,
  dawnHour: 6,
  duskHour: 18,
  // `rainfall`: water falls from the sky (will water open-air crops). `hazard`: what weather harms exposed things with
  // (null = none). Greenhouses block hazards, hydroponics ignore weather entirely (farming phase).
  // `recharge`: how fast aquifers refill, in percent of normal (O7 wells): rain and storms top them up, a heat wave dries them, cold slows them.
  weather: {
    clear:    { name: 'Clear',     icon: '☀',  rainfall: false, hazard: null, recharge: 100 },
    rain:     { name: 'Rain',      icon: '🌧', rainfall: true,  hazard: null, recharge: 160 },
    storm:    { name: 'Storm',     icon: '⛈', rainfall: true,  hazard: 'storm', recharge: 200 },
    heatwave: { name: 'Heat wave', icon: '🔥', rainfall: false, hazard: 'heat', recharge: 50 },
    cold:     { name: 'Cold snap', icon: '❄',  rainfall: false, hazard: 'cold', recharge: 80 },
  },
  seasons: [
    { id: 'spring', name: 'Spring', days: 8, phases: [{ weather: 'clear', days: 3 }, { weather: 'rain', days: 2 }, { weather: 'clear', days: 2 }, { weather: 'storm', days: 1 }] },
    { id: 'summer', name: 'Summer', days: 8, phases: [{ weather: 'clear', days: 3 }, { weather: 'heatwave', days: 2 }, { weather: 'clear', days: 2 }, { weather: 'storm', days: 1 }] },
    { id: 'autumn', name: 'Autumn', days: 8, phases: [{ weather: 'rain', days: 2 }, { weather: 'clear', days: 2 }, { weather: 'rain', days: 3 }, { weather: 'storm', days: 1 }] },
    { id: 'winter', name: 'Winter', days: 8, phases: [{ weather: 'clear', days: 2 }, { weather: 'cold', days: 3 }, { weather: 'clear', days: 2 }, { weather: 'storm', days: 1 }] },
  ],
  forecastDays: 7,
};
