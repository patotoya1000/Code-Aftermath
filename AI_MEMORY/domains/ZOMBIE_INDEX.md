<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Zombie / enemy domain

# Purpose

**Data + wave entities (O19 + Z1 + Z2).** `src/modules/threats/` holds the zombie taxonomy DATA and the WAVE: at dusk a raid spawns zombie entities that walk (A*), chase survivors outside the wall first, hit the fence/gate, and retreat at dawn (resolved: repelled / breached + looting). NO combat yet (zombies cannot die or hurt survivors), special behaviours (explode/throw/scream), loot on the ground and final sprites are PLANNED. Design: `docs/game/20-zombies-waves-loot-design.md`.

# Responsibilities

Raid schedule, wave lifecycle, zombie spawn/targeting/movement/wall hits, dawn resolution, learner `threats` read, render projection of zombies. When built (Z3+): combat, special behaviours, loot.

# Does NOT Own

Everything — nothing exists.

# Core Data

`data/threats.js`: `zombies` (walker=common, runner, boomer, thrower, screamer, brute=tank: `role`, `threat`, `weight`, `firstDay`, `health`, `damage`, `speed`, `armor`, `behaviour`), `bosses` + `bossSchedule` (fixed milestone, never in the random budget), `waveRules`, `lootTables`, `raidSchedule`. `data/arsenal.js`: `weapons`, `towers`, `noise` (see COMBAT_INDEX). Pure helpers in `threats/index.js`: `zombiesAvailable`, `bossForDay`, `upcomingBosses`.

# State

`state.threats = { history, wave, zombies, counter }`: `wave` (day, strength, composition, queue, spawned, gateClosed, breached, wallDamage) while a wave is on, `zombies` id -> { type, x, y, direction, state walk|attack|idle, health, route... }.

# Commands / API

Read only: `threats.wave`, `threats.zombies`, `threats.upcoming`, `threats.bosses`, `threats.weapons`, `threats.towers`, `threats.noise`. No attack command yet.

# Events

`raid.warning`, `wave.started`, `zombie.spawned`, `zombie.reached_wall`, `zombie.reached_survivor`, `wall.breached`, `building.condition_changed` (hits), `raid.resolved`, `wave.ended`.

# Dependencies

Would need pathing (I6), combat, events (M9).

# Dependents

None.

# Source Files

- `src/modules/threats/index.js`, `src/modules/definitions/data/threats.js`, `src/modules/definitions/data/arsenal.js`, `src/modules/definitions/index.js` (validation)

# UI Files

None.

# Asset Files

None.

# Tests

- `tests/threats.test.js` (Z1 section: taxonomy, day gates, boss, loot, validation)

# Current Status

DATA (Z1) + wave entities (Z2) IMPLEMENTED (`SIM_VERSION` 0.25.0). Combat PLANNED / NOT IMPLEMENTED.

# Known Problems

- A survivor outside at dusk is stranded (closed gate) until dawn; by design (learner must bring everyone in).
- Boomer/thrower/screamer have damage 0 and only walk to the wall until Z7.
- All zombies of a wave enter from one edge; a fence segment is not a separate health pool.

# Planned Changes

Z3: survivor damage, equipment + reach, `attack`/`guard`, the wave ends when its zombies are dead (docs/game/20 section 15). Special behaviours after.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not auto-recall survivors (`waveRules.recall` is `learner`); do not pick bosses from the random raid budget.
- Do not pretend this domain exists in the UI.

# Related Documentation

- `docs/game/20-zombies-waves-loot-design.md` (decided design: types, waves, loot, weapons, towers — NOT implemented)
- `docs/game/14-enemies-resources-items-open.md`
- `docs/game/08-events.md`

# Current Status

DATA (Z1) + wave entities (Z2) IMPLEMENTED (`SIM_VERSION` 0.25.0). Combat is IMPLEMENTED (`SIM_VERSION` 0.26.0). Survivors can attack and guard, equipped weapons use reach/armor/pierce, ranged weapons spend carried ammo, zombies can damage and down survivors, and waves clear when zombies are dead or end at dawn. Z4 adds loot/sorties; Z5+ crafting/towers/special behaviours.

Z4 IMPLEMENTED (`SIM_VERSION` 0.27.0): kills drop loot piles (`state.threats.loot`, id -> { id, item, qty, x, y, day, expiresDay }), the last kill clears the wave and opens the gate, `survivor.collect` runs sorties, `survivor.take` carries ammo, piles expire `lootLingerDays` dawns after the wave ended. Read it in `threats.loot`. Events: `loot.dropped`, `loot.picked`, `loot.expired`, `resource.taken`, `wave.cleared`. Z5+ crafting/towers/special behaviours.

Z6b IMPLEMENTED (`SIM_VERSION` 0.30.0): towers hold `mounts` (`survivor.mount`), hoppers are filled by `survivor.reload`, and `tickMounts` (threats module, called by the simulation between the survivors and `tickWave`) fires crewed mounts at the nearest zombie in range. Mount power requests go to the grid through `mountDemands` -> `tickPower(ctx, extras)`; do not read grid state from the threats module. Kills must still go through `killZombie`. Next: Z6c noise.

Z6c IMPLEMENTED (`SIM_VERSION` 0.31.0): every shot must call `makeNoise` (combat handlers and `tickMounts` do); `tickNoise` runs before `tickWave` each tick. Next: Z7 special types.

- Z7a (0.32.0): runner `rush` behaviour - vanguard spawn order, own hit rhythm (`tests/runner.test.js`, doc 20 section 22).
- Z7b (0.33.0): boomer explosion - `explodeZombie`, event `zombie.exploded`, no gland when exploded (`tests/boomer.test.js`, doc 20 section 23).
- Z7c (0.34.0): thrower - `throwAt`, event `zombie.threw`, rubble = stone piles outside the wall (`tests/thrower.test.js`, doc 20 section 24).
- Z7d (0.35.0): screamer - `screamTick`, event `zombie.screamed`, capped summons (`tests/screamer.test.js`, doc 20 section 25).
- Z7e (0.36.0): tank - `siege` behaviour: slow step, slow heavy wall hit (`tests/tank.test.js`, doc 20 section 26).
- Z7f (0.37.0): boss - boss-day waves, `statsOf`/`behaviourFor`/`bossPhase`, events `boss.phase`/`boss.defeated`, learner `threats.wave.boss` (`tests/boss.test.js`, doc 20 section 27). Z7 complete.
<<<<<<< HEAD
<<<<<<< HEAD
=======
- Z8 (0.38.0): suppressor (`equip("suppressor")`), noise lure (`survivor.lure`, `handlers/lure.js`), scream and blast noise via `addNoise` (`tests/lure-suppressor.test.js`, doc 20 section 28).
>>>>>>> 0306432 (Add tests for new zombie behaviors and mechanics)
=======
- Z8 (0.38.0): suppressor (`equip("suppressor")`), noise lure (`survivor.lure`, `handlers/lure.js`), scream and blast noise via `addNoise` (`tests/lure-suppressor.test.js`, doc 20 section 28).
>>>>>>> 0306432b2caa4efeea75ba52e4fee51861b8f2a4
