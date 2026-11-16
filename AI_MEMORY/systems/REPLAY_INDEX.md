<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Replay and determinism

# Purpose

Prove that same inputs give the same world.

# Responsibilities

- Lesson replay: `verifyReplay(record)` re-runs `record.code` through the sandbox on `scenarioId + seed` and compares `initialStateHash`, `eventLogHash`, `stateHash`; version mismatch (`format`, `simVersion`, `apiVersion`) is reported as `VERSION_MISMATCH`, not as a hash difference.
- Free-play replay: `replayTimeline({ scenarioId, seed, timeline, untilTick })` re-applies `(tick, command)` pairs through `submitCommand`.
- Determinism inputs: seeded RNG (`src/kernel/rng.js`), stable hashing (`src/kernel/hash.js`, undefined-valued keys skipped like JSON), learner `Math.random` seeded, `Date` unavailable.

# Does NOT Own

- Saving (SAVELOAD).
- Hook handler code: replay uses the COMMANDS hooks produced, never the handlers.

# Core Data

`REPLAY_FORMAT` 1; replay record `{ format, simVersion, apiVersion, lessonId, lessonVersion, scenarioId, seed, maxTicks, code, initialStateHash, eventLogHash, stateHash }`.

# State

None.

# Commands / API

`app.verifyReplay(record)`, `app.replayTimeline(record)`.

# Events

Event-log hash covers every event.

# Dependencies

`session` (manifest `replay: [session]`).

# Dependents

`src/app/index.js`, persistence flow.

# Source Files

- `src/modules/replay/index.js`
- `src/modules/session/index.js`
- `src/kernel/hash.js`
- `src/kernel/rng.js`
- `src/kernel/eventlog.js`

# UI Files

None directly (progress screen uses saved results).

# Asset Files

None.

# Tests

- `tests/gate-phase0.test.js` (replay identical)
- `tests/realtime.test.js` (pacing independence)
- `tests/hooks.test.js`
- `tests/policies.test.js`
- `tests/soak.test.js` (bit-for-bit reproducible)

# Current Status

IMPLEMENTED for lesson attempts and free-play timelines.

# Known Problems

The hash is a fast non-cryptographic checksum (`hashString`), appropriate for integrity, not tamper-proofing.

# Planned Changes

R5: lesson replay on the timeline model, shown on the map.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not introduce nondeterminism (wall-clock, `Math.random`, object-key-order dependence) into simulation or definitions.
- Do not change behaviour without bumping `SIM_VERSION`.

# Related Documentation

- `docs/game/02-game-design-flow.md`
- `AI_MEMORY/systems/SAVELOAD_INDEX.md`
