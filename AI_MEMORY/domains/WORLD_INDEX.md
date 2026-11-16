<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> World domain: scenarios, map, terrain, initial state

# Purpose

Builds the authoritative initial GameState from `defs + scenarioId + seed` (same inputs ⇒ identical state).

# Responsibilities

- Scenarios `stage1`, `stage1_tired`, `stage1_weary` (24×16 map).
- Open ledger accounts, create buildings, nodes (RNG-rolled amounts), survivors.
- Terrain zones/paths are presentation-only ground (forest zone, forest path) carried to the renderer through the render projection.

# Does NOT Own

- Gameplay rules (simulation/actions).
- Collision, pathing, environment (day/night/weather) — not implemented.

# Core Data

`scenarios` in `src/modules/definitions/data/world.js`; `STATE_SCHEMA` 1 in `src/kernel/versions.js`.

# State

`state = { schema, scenarioId, seed, tick, rngState, map, counters, strategyPoints, ledger, reservations, nodes, buildings, survivors, actions, activeActions, hooks }`.

# Commands / API

Reads: `world.width`, `world.height`, `tick`.

# Events

None.

# Dependencies

`resources`, `survivors`, `buildings`.

# Dependents

`session`.

# Source Files

- `src/modules/world/index.js`
- `src/modules/definitions/data/world.js`
- `src/modules/definitions/index.js`

# UI Files

`src/modules/render/index.js` draws terrain from the projection.

# Asset Files

`AI_MEMORY/assets/ASSET_INDEX.md`

# Tests

- `tests/world-i2.test.js`
- `tests/simulation.test.js` (determinism)
- `tests/persistence.test.js` (fresh state per attempt)

# Current Status

IMPLEMENTED for one map. PLANNED: collision/pathing (O3, I6), more scenarios, environment.

# Known Problems

Survivors walk through buildings. Terrain is cosmetic.

# Planned Changes

Pathing with the gate (I6); environment later.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not use `Math.random` or `Date` in world creation; use the seeded RNG.
- Do not make terrain affect gameplay without moving it into authoritative state first.

# Related Documentation

- `docs/game/02-game-design-flow.md`
- `docs/game/01-game-architecture.md`
