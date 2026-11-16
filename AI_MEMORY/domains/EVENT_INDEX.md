<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Events and payloads

# Purpose

The append-only event log (`kernel/eventlog.js`) is how the simulation reports authoritative outcomes. Events are frozen; reserved keys `seq`, `tick`, `type` always win over payload keys.

# Responsibilities

Each event states something that already happened in authoritative state. Consumers: lesson checks, learner hooks, the UI feed, replay hashing.

# Does NOT Own

- Environmental/risk events (M9) — a different, planned "event system".
- Any state change; the log is output only.

# Core Data

- `action.queued|validating|reserved|executing|completed|failed|cancelled { actionId, actorId, actionType, targetId, reason?, ...stats }`
- `task.started { actionId, actorId, taskType, resource }`, `task.stopped { …, reason, gathered, trips }`, `task.resumed { …, resumedFrom }`
- `resource.gathered { actorId, resource, amount, nodeId }` (picked up at a node), `resource.deposited { actorId, depotId, resource, amount }` (unloaded into base stock), `node.depleted { nodeId }`
- `survivor.moved`, `survivor.rested`, `survivor.consumed { survivorId, item, need, value }`, `survivor.conditions_changed { survivorId, conditions[] }`, `survivor.damaged { survivorId, cause, health }`, `survivor.downed`
- `building.repaired { actorId, buildingId, health, condition }`, `building.condition_changed { buildingId, from, to }`
- `policy.set|cleared|triggered|blocked`, `hook.set|cleared` (simulation); `hook.ran|hook.failed`, `command.rejected` (session); `command.stop` (simulation)

# State

Event log lives in the simulation (`sim.log`); the free-play log is not part of the save.

# Commands / API

`log.append`, `all`, `since(cursor)`, `ofType`, `length`, `hash`.

# Events

This file is the index.

# Dependencies

kernel.

# Dependents

`lessons/checks.js`, `session` hook runner, `src/app/mainscreen.js` feed, `replay` (event-log hash).

# Source Files

- `src/kernel/eventlog.js`
- `src/modules/actions/engine.js` (`transition`)
- `src/modules/simulation/index.js`
- `src/modules/session/index.js`

# UI Files

`src/app/mainscreen.js` (`collectEvents`, `renderFeed`)

# Asset Files

None.

# Tests

- `tests/kernel.test.js`
- `tests/invariants.test.js` (events agree with state)
- `tests/hooks.test.js`

# Current Status

IMPLEMENTED (log + the events above). Risk/environment events PLANNED.

# Known Problems

Event payloads are not schema-validated; hooks and lesson checks read them by name. Change a payload ⇒ update this file, `lessons/checks.js` and `session` hook triggers.

# Planned Changes

Event framework for M9 (preparation → travel → execution → risk → recovery → result).

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not emit an event for something that did not happen in state.
- Do not mutate or delete past events.

# Related Documentation

- `docs/game/08-events.md`
- `docs/game/13-events-visual-spec.md`
