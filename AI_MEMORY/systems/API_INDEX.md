<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Game API v1 and Command Builder

# Purpose

The ONLY bridge from learner code to the simulation. Learner code calls `survivor.xxx()`; each call is validated, normalised to plain JSON and later turned into a versioned Command. Nothing here changes state.

# Responsibilities

- `COMMANDS` table: one entry per learner command (type, signature, doc, `params(args)` validator).
- `normalizeCall(name, args)`: entities (objects with a string `id`) become their id; option objects are cleaned to primitives (`cleanOptions`, forbids `__proto__`/`constructor`/`prototype`).
- `buildCommand(actorId, call)` → `{ apiVersion, type, actorId, params }`. Markers (`queue`) are not commands.
- `READ_SURFACE` and `describeApi()` — the documented read surface shown in the UI API panel (kept next to the commands so docs cannot drift).

# Does NOT Own

- Whether a command is *possible* (simulation/actions validate against the world).
- Strategy points (simulation `submitCommand`).
- Replace-vs-queue ordering (session `submitCalls`).

# Core Data

- `moveTo(x,y | entity)`→`move` · `gather(resource, load 1–20 = 5, total 1–500)`→`gather` · `rest(ticks 1–200 = 20)`→`rest` · `eat(item?)`→`eat` · `cook(recipe, count 1–100?)`→`cook` · `drink()`→`drink` · `repair(building)`→`repair`
- `policy(name, {below, until, prefer})`→`policy` (instant) · `clearPolicy(name?)`→`policy_clear` (instant) · `on(event, fn)`→`hook_register` (instant, hook) · `off(event?)`→`hook_clear` (instant, hook)
- `queue()` marker (no command) · `stop()`→`stop`
- Versions: `API_VERSION` 1, `SUPPORTED_API_VERSIONS` [1] in `src/kernel/versions.js`.

# State

None. Pure functions and a constant table.

# Commands / API

This file is the index. Authoritative contract: `COMMANDS` in `src/modules/api/v1.js`. Errors: `INVALID_ARGUMENT`, `UNKNOWN_COMMAND`, `NOT_A_COMMAND`.

# Events

None (rejections are logged by the session as `command.rejected`).

# Dependencies

kernel only (`src/architecture.js`: `api: []`).

# Dependents

`sandbox` (inside the Worker), `session` (command builder).

# Source Files

- `src/modules/api/v1.js`
- `src/modules/api/index.js`

# UI Files

`src/app/mainscreen.js` (`renderCodeAPI`, `renderHints` from `app.apiDocs`)

# Asset Files

None.

# Tests

- `tests/sandbox-api.test.js`
- `tests/policies.test.js` (options through the sandbox)
- `tests/invariants.test.js` (every command maps to a validated type)
- `tests/gate-phase0.test.js` (learner cannot mutate state)

# Current Status

IMPLEMENTED (13 learner commands, `deposit` added in R3). PLANNED: build commands with their phase.

# Known Problems

- Docs in `docs/game/*` list commands (e.g. `moveTo`) that are API-valid but have no UI affordance.
- Adding a command means: `COMMANDS`, `READ_SURFACE` if it reads, an action definition + handler (or instant type in `simulation/index.js` `submit`), a lesson/test, and this file.

# Planned Changes

New commands only together with their domain phase (build).

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not add a command that writes state directly (e.g. `setHealth`, `addWood`).
- Do not accept functions, objects with prototypes or non-primitive options from learner code.
- Do not bypass `normalizeCall` when building commands.

# Related Documentation

- `docs/game/04-actions-tasks-capability.md`
- `docs/game/15-realtime-simulation-and-tasks.md`
- `AI_MEMORY/systems/SANDBOX_INDEX.md`
