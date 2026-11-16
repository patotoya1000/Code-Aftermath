import test from 'node:test';
import assert from 'node:assert/strict';
import { defs, newSim, types, sandbox } from './helpers.js';
import { timeOf, dayOf, weatherForDay, weatherAt, forecast, nextWeatherChange, seasonCalendar, seasonOfDay } from '../src/modules/environment/index.js';
import { createDefinitions } from '../src/modules/definitions/index.js';

const E = defs.environment;

test('the clock: tick 0 is 06:00 on day 1; a day is ticksPerDay ticks; night is outside dawn..dusk', () => {
  const t0 = timeOf(defs, 0);
  assert.deepEqual([t0.day, t0.hour, t0.minute, t0.isNight, t0.season, t0.seasonDay, t0.year], [1, 6, 0, false, 'spring', 1, 1]);
  assert.equal(timeOf(defs, E.ticksPerDay).day, 2);
  const duskTick = (E.duskHour - E.startHour) * (E.ticksPerDay / 24);
  assert.equal(timeOf(defs, duskTick - 1).isNight, false);
  assert.equal(timeOf(defs, duskTick).isNight, true);
  assert.equal(timeOf(defs, duskTick + (E.ticksPerDay / 24) * 12 - 1).isNight, true);
  assert.equal(timeOf(defs, duskTick + (E.ticksPerDay / 24) * 12).isNight, false, 'dawn');
});

test('the calendar is deterministic and covers every day: same day, same weather, forever', () => {
  const year = E.seasons.reduce((n, s) => n + s.days, 0);
  for (let d = 1; d <= year * 3; d++) {
    assert.ok(E.weather[weatherForDay(defs, d)], `day ${d}`);
    assert.equal(weatherForDay(defs, d), weatherForDay(defs, d + year), 'the year repeats');
  }
  assert.equal(seasonOfDay(defs, year + 1).year, 2);
  assert.equal(seasonOfDay(defs, 9).season, 'summer');
});

test('forecast: today first, and it equals the weather the simulation then lives through', () => {
  const sim = newSim();
  const f = sim.studentView().world.forecast;
  assert.equal(f.length, 7);
  assert.equal(f[0].day, 1);
  assert.equal(f[0].weather, weatherAt(defs, 0));
  const seen = [];
  for (let i = 0; i < 7; i++) { seen.push(sim.studentView().world.weather); sim.step(E.ticksPerDay); }
  assert.deepEqual(seen, f.map((e) => e.weather), 'what was predicted on day 1 is what happened, day by day');
  // and the forecast read later, mid-day, still starts with that day
  assert.equal(forecast(defs, E.ticksPerDay + 50, 3)[0].day, 2);
});

test('nextWeatherChange points at the first day whose weather differs, with a correct tick count', () => {
  const n = nextWeatherChange(defs, 0);
  assert.equal(n.weather, 'rain'); // spring: 3 clear days, then rain
  assert.equal(n.day, 4);
  assert.equal(weatherAt(defs, 0 + n.inTicks), 'rain');
  assert.notEqual(weatherAt(defs, n.inTicks - 1), 'rain');
});

test('seasonCalendar lists the whole season and marks today', () => {
  const c = seasonCalendar(defs, 0);
  assert.equal(c.days.length, 8);
  assert.deepEqual(c.days.filter((d) => d.today).map((d) => d.seasonDay), [1]);
  const later = seasonCalendar(defs, 3 * E.ticksPerDay); // day 4 of spring
  assert.deepEqual(later.days.filter((d) => d.today).map((d) => d.seasonDay), [4]);
  assert.deepEqual(later.days.map((d) => d.weather), c.days.map((d) => d.weather), 'same season, same listing');
  assert.equal(seasonCalendar(defs, 8 * E.ticksPerDay).season, 'summer');
});

test('learner view and render projection carry the environment, frozen', () => {
  const sim = newSim();
  const w = sim.studentView().world;
  assert.equal(w.weather, 'clear');
  assert.equal(w.time.hour, 6);
  assert.equal(w.forecast.length, 7);
  assert.equal(w.width, 24);
  assert.throws(() => { w.forecast[0].weather = 'storm'; });
  const env = sim.renderProjection().environment;
  assert.deepEqual([env.isNight, env.weather], [false, 'clear']);
});

test('the simulation logs dusk, dawn, weather changes and season changes at the right moments', () => {
  const sim = newSim();
  sim.step(E.ticksPerDay * 9); // past the first weather change (day 4) and into summer (day 9)
  const log = sim.log.all();
  const of = (t) => log.filter((e) => e.type === t);
  assert.ok(of('time.dusk').length >= 9 && of('time.dawn').length >= 8);
  assert.equal(of('weather.changed')[0] && JSON.stringify(of('weather.changed')[0]).includes('rain'), true);
  assert.ok(JSON.stringify(of('season.changed')).includes('summer'));
});

test('weather has no hidden state: replaying gives identical hashes, and state never stores the calendar', () => {
  const run = () => { const s = newSim('stage1', 2); s.step(E.ticksPerDay * 5); return s.stateHash(); };
  assert.equal(run(), run());
  assert.equal(JSON.stringify(newSim().snapshot()).includes('forecast'), false);
});

test('learner code can read the forecast and act on it', async () => {
  const sim = newSim();
  const r = await sandbox.run({ code: 'if (world.nextChange.weather === "rain") survivor.rest(5); console.log(world.forecast[3].weather, world.time.season)', view: sim.studentView(), seed: 1 });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.logs, ['rain spring']);
  assert.equal(r.calls[0].name, 'rest');
});

test('definitions: season phases must add up, weather ids must exist', () => {
  const bad = structuredClone(defs.environment);
  bad.seasons[0].phases[0].days = 9;
  assert.throws(() => createDefinitions({ environment: bad }), /phase lengths/);
  const bad2 = structuredClone(defs.environment);
  bad2.seasons[0].phases[0].weather = 'meteor';
  assert.throws(() => createDefinitions({ environment: bad2 }), /unknown weather/);
  assert.throws(() => createDefinitions({ environment: { ...defs.environment, ticksPerDay: 100 } }), /multiple of 24/);
});
