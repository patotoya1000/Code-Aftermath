<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Task / action domain: definitions, lifecycle, validation, reservation, execution

# Purpose

Everything a survivor can be asked to do is an *action* with one lifecycle, executed over simulation ticks. `gather` and `cook` are standing actions.

# Responsibilities

- Action queue per survivor, FIFO, one active (VALIDATING/RESERVED/EXECUTING) action per survivor (`busy()` in the engine).
- Lifecycle `QUEUED → VALIDATING → RESERVED → EXECUTING → COMPLETED`, with `FAILED`/`CANCELLED` from any live state; illegal transitions throw `ILLEGAL_TRANSITION`.
- Validation order: handler `validate` → capability check → reservations (so a failed check spends nothing).
- Reserve → commit on success / release on failure or cancel (`terminate`).
- Standing gather: batches until a stop reason (`TARGET_REACHED`, `STORAGE_FULL`, `NO_TARGET`, `EXHAUSTED`). Completes with `stopReason` if it did work, FAILS with the same code if it did none.
- Replace vs queue: the first command a program gives a survivor uses mode `replace` (cancels current + queued work with reason `REPLACED`); later ones queue; `survivor.queue()` forces append (`submitCalls` in the session).
- Writes `survivor.lastTask = { actionId, type, status, reason, gathered, tick }` on every terminal transition.

# Does NOT Own

- Resource quantities (RESOURCE ledger).
- Need decay (NEEDS), capability maths (`capability`), learner argument validation (API).
- Animation/progress presentation: `fraction` is presentation only; completion is decided by ticks.

# Core Data

- Action definitions in `src/modules/definitions/data/actions.js`: move, gather, rest, eat, drink, repair (handler, ticks, capability block).
- Action record: `actionId, actorId, actionType, targetId, params, status, failureReason, reservationIds, progress, workTotal, phase, startedAtTick, endedAtTick, stopReason, stats, origin?, resumeOf?`.

# State

`state.actions` (all actions, never pruned — O1), `state.activeActions` (ordered live ids), `state.reservations`, `state.counters.action`.

# Commands / API

Learner: `moveTo, gather, rest, eat, drink, repair, stop, queue` (`AI_MEMORY/systems/API_INDEX.md`). Simulation: `submit(command)` (mode `queue`|`replace`), `submitCommand` (charges 1 strategy point only after `submit` succeeded).

# Events

`action.queued|validating|reserved|executing|completed|failed|cancelled`, `task.started`, `task.stopped`, `task.resumed`, `command.stop`, `command.rejected` (session).

# Dependencies

`resources` (ledger), `buildings`, `capability`, kernel.

# Dependents

`simulation` (the only caller), `lessons` (via session), `projection` (current task).

# Source Files

- `src/modules/actions/engine.js`
- `src/modules/actions/lifecycle.js`
- `src/modules/actions/policies.js`
- `src/modules/actions/handlers/index.js`
- `src/modules/actions/handlers/gather.js`
- `src/modules/actions/handlers/move.js`
- `src/modules/actions/handlers/rest.js`
- `src/modules/actions/handlers/consume.js`
- `src/modules/actions/handlers/repair.js`
- `src/modules/actions/handlers/shared.js`
- `src/modules/capability/index.js`

# UI Files

`src/app/mainscreen.js` (`taskSection`, queue list)

# Asset Files

None (animation is derived from the task by projection: `animationFor`).

# Tests

- `tests/simulation.test.js`
- `tests/realtime.test.js`
- `tests/policies.test.js`
- `tests/hardening.test.js`
- `tests/stabilization.test.js`
- `tests/invariants.test.js` (finality, event agreement)
- `tests/soak.test.js`

# Current Status

IMPLEMENTED (move, gather standing with carry trips, deposit, rest, eat, drink, repair, stop, policy interrupt/resume). NOT IMPLEMENTED: build, craft, attack.

# Known Problems

- O1: terminal actions are kept forever; long sessions grow state, hashes and saves.
- Capability check passes for every current action on the only template; the failure path is covered by tests using modified survivors only.
- Pathing (O3): `walkStep` follows an A* route (`buildings/pathing.js`), cached in `a.route`/`a.routeGoal`; no way → `NO_PATH`. No unit-vs-unit collision.

# Planned Changes

R5 prune finished actions. Pathing in I6.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not execute an action without passing validate → capability → reserve.
- Do not let a terminal action execute again or keep reservations.
- Do not make gather a one-shot turn action; it is standing.
- Do not add action-specific branches to `engine.js`; add a handler + a definition entry.

# Related Documentation

- `docs/game/04-actions-tasks-capability.md`
- `docs/game/15-realtime-simulation-and-tasks.md`
- `AI_MEMORY/systems/SIMULATION_INDEX.md`
