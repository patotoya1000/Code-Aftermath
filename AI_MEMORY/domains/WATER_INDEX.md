<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Water domain (O7)

# Purpose

Renewable water: a deep well whose reservoir the aquifer refills with ticks, hand drawing via `gather("water")`, and the siphon that auto-stores it.

# Responsibilities

- Aquifer recharge per tick (percent accumulator, weather-scaled), reservoir cap.
- Siphon connection status and transfer into base stock.
- Learner/UI view of a well (`waterInfoFor`).

# Does NOT Own

- Trips, carry, waiting (gather handler, TASK).
- Pooled storage capacity (`buildings`).
- Weather calendar (`environment`).
- Power/pump tier — planned.

# Core Data

`defs.buildings.well` (`levels[n].source`, `levels[n].siphon`), `defs.buildings.water_tank`, `defs.environment.weather[*].recharge`, `defs.actions.gather.waitTicks`.

# State

`state.buildings.well.water = { progress, siphon: { status, progress } }`; reservoir = ledger account `source.<id>`.

# Commands / API

`survivor.gather("water", load, total)`, `survivor.repair(well)`, `survivor.upgrade(well)`; reads `well.water`.

# Events

`siphon.status` (on change), `source.dry`, `building.upgraded`.

# Dependencies

`resources`, `buildings`, `environment`.

# Dependents

`simulation` (tickWater), `actions` (gather draw points), `projection`.

# Source Files

- `src/modules/water/index.js`
- `src/modules/actions/handlers/gather.js`
- `src/modules/buildings/index.js` (`storageRoom`)
- `src/modules/definitions/data/world.js`

# UI Files

`src/app/mainscreen.js` (`waterSection`).

# Asset Files

`src/modules/assets/index.js` (placeholder well and tank frames).

# Tests

- `tests/water.test.js`

# Current Status

IMPLEMENTED: well, aquifer, weather scaling, waiting, siphon, tank. PLANNED: pump tier.

# Known Problems

`renderProjection` passes `b.type` to `storageInfoFor` (should be `b`), so its `storageInfo` is always undefined; the renderer does not use it. `siphon.status` lags one tick behind an upgrade.

# Planned Changes

Pump tier with power; farming and recipes draw water.

# Forbidden Changes

- Do not credit base stock from a timer or add randomness to recharge; keep the integer accumulator.
- Do not let a siphon ignore the building structure or overfill storage (`storageRoom`).
- Do not reintroduce turns.

# Related Documentation

- `docs/game/17-water-wells.md`
