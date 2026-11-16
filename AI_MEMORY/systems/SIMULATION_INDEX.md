<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Real-time simulation, clock driver, strategy points

# Purpose

The simulation is the ONLY writer of GameState. It counts ticks, advances the action engine and policies, and emits events. Time is continuous; there are no turns.

# Responsibilities

- `createSimulation({ defs, state })`: the state object lives in a closure; callers get `submit`, `submitCommand`, `step`, `runUntil`, projections and read-only helpers.
- Tick order (`tickOnce`): `tick++` → `applyNeedsDecay` (downed survivors cancel work with `ACTOR_DOWNED`) → strategy points +1 every `regenEvery` (20) up to max 10 → `applyPolicies` → `engine.step` (every live action advances one tick in submission order).
- `submit(command)`: validates version/actor/mode, routes `stop`, `policy`, `policy_clear`, `hook_register`, `hook_clear`, or an action (mode `replace` cancels first with `REPLACED`). Throws before mutating if invalid.
- `submitCommand(command)`: the free-play path; needs ≥1 strategy point, calls `submit`, then charges 1 and appends `{ tick, command }` to the command timeline. A refused command costs nothing.
- Clock driver (`createClockDriver`): turns frame milliseconds into `sim.step(n)`; owns play/pause (starts PAUSED), speeds 1×/2×/4×, 3 ticks/s, cap 30 ticks/frame, `maxFrameMs` 250; drops backlog instead of spiralling. It owns no rules.
- Hooks storage (`hooks.js`): `setHook`/`clearHook` only STORE hook source text as commands; the simulation never runs learner code.
- Determinism: same seed + same commands at the same ticks ⇒ same state hash, at any speed.

# Does NOT Own

- Action/lifecycle details (TASK / `actions`).
- Rendering, animation timing, UI (`render`, `src/app`).
- Running hook handlers (session hook runner).
- Parsing learner code (sandbox/API).

# Core Data

`defs.clock`: `ticksPerSecond 3`, `speeds [1,2,4]`, `maxTicksPerFrame 30`, `strategy { start 10, max 10, regenEvery 20 }` in `src/modules/definitions/data/actions.js`. `SIM_VERSION` 0.5.0 (R3 carry trips).

# State

The whole GameState (see `AI_MEMORY/domains/WORLD_INDEX.md`). Not exported: only projections and snapshots (`structuredClone`) leave the closure.

# Commands / API

`sim.submit`, `submitCommand`, `step(n)`, `runUntil(pred, maxTicks)`, `isIdle`, `hooks()`, `commandTimeline()`, `stateHash()`, `snapshot()`, `studentView()`, `renderProjection()`, `inspector(id)`, `getClockInfo()`, `log`.

# Events

Emits through `ctx.emit` → `log.append(tick, type, data)`. See `AI_MEMORY/domains/EVENT_INDEX.md`.

# Dependencies

`survivors`, `actions`, `projection`, `capability` (manifest).

# Dependents

`session`; app composition root; tests.

# Source Files

- `src/modules/simulation/index.js`
- `src/modules/simulation/clock.js`
- `src/modules/simulation/hooks.js`
- `src/architecture.js`

# UI Files

`src/app/mainscreen.js` (`loop`: frame → `clock.update` → projections)

# Asset Files

None.

# Tests

- `tests/realtime.test.js`
- `tests/simulation.test.js`
- `tests/stabilization.test.js`
- `tests/invariants.test.js`
- `tests/soak.test.js` (`SOAK_SEEDS=300` for deep run)

# Current Status

IMPLEMENTED (R1 continuous clock, R2 standing actions, R4a policies, R4b hook storage).

# Known Problems

- O1: unbounded `state.actions`.
- `submit` (used directly by lessons) does not charge strategy points; only `submitCommand` does — intended: lessons run to completion in an isolated sim.
- Free-play event log is not persisted; saves are command timelines.

# Planned Changes

R5 timeline lessons and pruning; pathing/collision; environment ticks.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not export the state object or a mutable reference to it.
- Do not put wall-clock time (`Date`, `performance`) or `Math.random` inside the simulation; use ticks and the seeded RNG.
- Do not move play/pause/speed into the simulation, or tick counting into the clock driver.
- Do not re-add `executeTurn`-style "run until idle then stop" as the main loop; `runUntil`/`isIdle` are for tests and finite lesson runs only.

# Related Documentation

- `docs/game/15-realtime-simulation-and-tasks.md`
- `docs/game/01-game-architecture.md`
- `AI_MEMORY/domains/TASK_INDEX.md`
