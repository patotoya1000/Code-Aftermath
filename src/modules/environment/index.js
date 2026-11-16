// Environment (O6): pure functions of (definitions, tick). Same tick => same answer, so it never needs saving and a replay
// can never disagree with the original run. Nothing here mutates anything.

const ticksPerHour = (d) => d.ticksPerDay / 24;
const seasonLen = (e) => e.seasons.reduce((n, s) => n + s.days, 0);

/** Calendar day (1-based) the tick falls in. */
export const dayOf = (defs, tick) => Math.floor((tick + defs.environment.startHour * ticksPerHour(defs.environment)) / defs.environment.ticksPerDay) + 1;

/** { day, hour, minute, isNight, season, seasonDay, year, dayOfYear } at a tick. */
export function timeOf(defs, tick) {
  const e = defs.environment;
  const abs = tick + e.startHour * ticksPerHour(e);
  const inDay = abs % e.ticksPerDay;
  const hourF = inDay / ticksPerHour(e);
  const hour = Math.floor(hourF);
  const day = dayOf(defs, tick);
  const s = seasonOfDay(defs, day);
  return { day, hour, minute: Math.floor((hourF - hour) * 60), isNight: hour < e.dawnHour || hour >= e.duskHour, ...s };
}

/** Which season/day-in-season/year an absolute day (1-based) belongs to. */
export function seasonOfDay(defs, day) {
  const e = defs.environment;
  const year = Math.floor((day - 1) / seasonLen(e)) + 1;
  let dayOfYear = (day - 1) % seasonLen(e);
  const dayOfYearOneBased = dayOfYear + 1;
  for (const s of e.seasons) {
    if (dayOfYear < s.days) return { season: s.id, seasonDay: dayOfYear + 1, year, dayOfYear: dayOfYearOneBased };
    dayOfYear -= s.days;
  }
  throw new Error('calendar: unreachable');
}

/** The weather written in the calendar for an absolute day. */
export function weatherForDay(defs, day) {
  const e = defs.environment;
  const { season, seasonDay } = seasonOfDay(defs, day);
  let left = seasonDay;
  for (const p of e.seasons.find((s) => s.id === season).phases) {
    if (left <= p.days) return p.weather;
    left -= p.days;
  }
  throw new Error('calendar: phases do not cover the season');
}

export const weatherAt = (defs, tick) => weatherForDay(defs, dayOf(defs, tick));

/** The next `days` days from today (inclusive): [{ day, inDays, season, weather }]. */
export function forecast(defs, tick, days = defs.environment.forecastDays) {
  const today = dayOf(defs, tick);
  return Array.from({ length: days }, (_, i) => ({ day: today + i, inDays: i, season: seasonOfDay(defs, today + i).season, weather: weatherForDay(defs, today + i) }));
}

/** When the weather next becomes different from today's: { weather, day, inDays, inTicks } (searched a year ahead). */
export function nextWeatherChange(defs, tick) {
  const e = defs.environment;
  const today = dayOf(defs, tick);
  const now = weatherForDay(defs, today);
  for (let i = 1; i <= seasonLen(e); i++) {
    const w = weatherForDay(defs, today + i);
    if (w !== now) {
      const startTick = (today + i - 1) * e.ticksPerDay - e.startHour * ticksPerHour(e);
      return { weather: w, day: today + i, inDays: i, inTicks: Math.max(0, startTick - tick) };
    }
  }
  return null;
}

/** The whole current season, for the calendar screen: [{ day, seasonDay, weather, today }]. */
export function seasonCalendar(defs, tick) {
  const today = dayOf(defs, tick);
  const { season, seasonDay } = seasonOfDay(defs, today);
  const first = today - (seasonDay - 1);
  const s = defs.environment.seasons.find((x) => x.id === season);
  return { season, name: s.name, days: Array.from({ length: s.days }, (_, i) => ({ day: first + i, seasonDay: i + 1, weather: weatherForDay(defs, first + i), today: first + i === today })) };
}

/** Everything learner code and the HUD may read about the environment at a tick. */
export function environmentView(defs, tick) {
  const t = timeOf(defs, tick);
  const weather = weatherForDay(defs, t.day);
  return { time: t, weather, weatherInfo: { ...defs.environment.weather[weather], id: weather }, forecast: forecast(defs, tick), nextChange: nextWeatherChange(defs, tick), calendar: seasonCalendar(defs, tick) };
}
