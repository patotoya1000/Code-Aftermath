<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Building domain

# Purpose

Buildings as data with level, health and a meaningful condition (`ruined | damaged | repaired`).

# Responsibilities

- Create buildings from definitions; compute `condition` from health ratio (ruinedBelow 0.25, damagedBelow 0.6).
- Repair (`repair` action) adds `healthPerAction` for wood, via `applyHealth`.
- Scenario layout validation (gate must sit on the fence line, no shared tiles, inside the map).

# Does NOT Own

- Repair action lifecycle (TASK).
- Construction, upgrades, occupancy, functional effects — not implemented.
- Asset choice: only emits `assetKey`; the asset resolver chooses frames.

# Core Data

<<<<<<< HEAD
Types in `src/modules/definitions/data/world.js`: `hq` (levels 1–2), `fence` (1–2, with `bounds`), `tent`, `storage` (storehouse), `gate` (`perimeter: true`). Stage 1 starts them damaged/ruined: fence 20/100, storehouse 15/120, gate 30/80. Storage tables: HQ, tent, storehouse; a ruined building contributes no capacity and cannot be unloaded at (R3).
=======
Types in `src/modules/definitions/data/world.js`: `hq` (levels 1–2), `fence` (1–2, with `bounds`), `tent`, `storage` (storehouse), `gate` (`perimeter: true`). Stage 1 starts them damaged/ruined: fence 20/100, storehouse 15/120, gate 30/80.
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e

# State

`state.buildings[id] = { id, type, level, x, y, health, condition, storage?, bounds? }`.

# Commands / API

`survivor.repair(building)`; reads `buildings`, `fence`, `hq`, and every building by id (`gate`, `tent_1`, `storage_1`).

# Events

`building.repaired`, `building.condition_changed`.

# Dependencies

kernel; `definitions` data at load.

# Dependents

`world`, `actions` (repair, gather via HQ), `projection`.

# Source Files

- `src/modules/buildings/index.js`
- `src/modules/actions/handlers/repair.js`
- `src/modules/definitions/data/world.js`
- `src/modules/definitions/index.js` (`validateWorldLayout`)

# UI Files

`src/app/mainscreen.js` (`buildingSections`); BUILD button is disabled ("coming soon").

# Asset Files

`AI_MEMORY/assets/BUILDING_ASSETS.md`

# Tests

- `tests/world-i2.test.js`
- `tests/simulation.test.js` (repair)
- `tests/gate-phase0.test.js` (fence lesson)
- `tests/assets-render.test.js`

# Current Status

PARTIALLY IMPLEMENTED: repairable objects with health/condition. PLANNED: construction, level upgrades (level 2 data exists but nothing upgrades), occupancy, effects, defence role of fence/gate.

# Known Problems

<<<<<<< HEAD
Level-2 entries for `hq` and `fence` are data only; no code path produces level 2. The storehouse's `storage` table (wood/stone 100) is live since R3: it counts once the building is no longer ruined.
=======
Level-2 entries for `hq` and `fence` are data only; no code path produces level 2. The storehouse carries a note that its capacity arrives with carry.
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e

# Planned Changes

BUILD and upgrades after R3; building effects with M5+.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not create one asset per health percent; only the three conditions.
- Do not let buildings own survivor or resource state.

# Related Documentation

- `docs/game/06-buildings-and-upgrades.md`
- `docs/game/12-buildings-visual-spec.md`
