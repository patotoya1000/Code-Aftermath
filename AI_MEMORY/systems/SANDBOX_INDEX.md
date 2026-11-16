<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Learner code sandbox (Clock A)

# Purpose

Run untrusted learner JavaScript once, synchronously, in an isolated Worker, and return a bounded list of commands as plain data. It never waits for future game state.

# Responsibilities

- Static safety check (`validateSource`): forbidden identifiers (eval, Function, constructor, prototype, import, require, process, globalThis, window, self, document, fetch, setTimeout, setInterval, Date, performance, async, await, Reflect, Proxy, WebAssembly, storage APIs…), escape sequences, max 10000 chars. Friendly messages with line numbers.
- Fresh Worker per run (browser Worker or Node `worker_threads`), terminated on timeout (`timeoutMs` 1500).
- In-worker hardening (`runtime.js`): `Function.prototype.constructor` removed, dangerous globals shadowed to `undefined`, seeded `Math.random`, frozen deep copies of the view, `maxCommands` 500, `maxLogs` 200.
- Environment: `survivor`, `survivors`, `base`, `fence`, `hq`, `buildings`, `nodes`, `world`, `tick`, `console.log`, `Math`, plus every building/node by id when it is a valid identifier and not already taken.
- `survivor.on(event, fn)`: functions cannot cross the Worker boundary, so the function SOURCE TEXT is registered; not allowed inside a hook (`HOOK_NOT_ALLOWED`).

# Does NOT Own

- Applying commands (session/simulation).
- Game rules or numbers.
- The security boundary alone: the static check is a friendly first gate; the Worker is the real containment.

# Core Data

`DEFAULT_BUDGET { maxCommands 500, maxLogs 200, timeoutMs 1500 }`; error codes `SAFETY_VIOLATION`, `EXECUTION_TIMEOUT`, `WORKER_ERROR`, `SYNTAX_ERROR`, `RUNTIME_ERROR`, `COMMAND_BUDGET_EXCEEDED`.

# State

None persistent; every run is isolated (tested).

# Commands / API

`createSandbox(options).run({ code, view, seed, actorId, maxCommands, allowHooks })` → `{ ok, calls, logs, error, violations }`.

# Events

None.

# Dependencies

`api` (manifest `sandbox: [api]`), kernel.

# Dependents

`session` (live code, lessons, hooks), app.

# Source Files

- `src/modules/sandbox/runner.js`
- `src/modules/sandbox/runtime.js`
- `src/modules/sandbox/safety.js`
- `src/modules/sandbox/worker-entry.js`
- `src/modules/sandbox/index.js`

# UI Files

`src/app/mainscreen.js` (`runCode`, `friendlyError`)

# Asset Files

None.

# Tests

- `tests/sandbox-api.test.js`
- `tests/gate-phase0.test.js`
- `tests/hooks.test.js`
- `tests/realtime.test.js` (code cannot mutate state)

# Current Status

IMPLEMENTED.

# Known Problems

O6: the static check also flags forbidden words inside strings and comments (cosmetic). `async`/`await` are blocked by design (learner code cannot wait for the future).

# Planned Changes

Step/inspect mode UI is reserved but not built (Phase 3 item).

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not give learner code live GameState, the simulation, the clock or any non-frozen object.
- Do not remove the Worker/timeout or the command budget.
- Do not allow learner code to `await` simulation results (two-clock rule).

# Related Documentation

- `docs/game/01-game-architecture.md` (two-clock rule)
- `AI_MEMORY/systems/API_INDEX.md`
