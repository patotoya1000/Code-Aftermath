<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Persistence, free-play save/load, campaign progress

# Purpose

Store sessions and progress safely. A free-play save is the session RECORD, not a state dump.

# Responsibilities

- Adapters: memory (tests) and IndexedDB (browser); the UI falls back to memory when IndexedDB is unavailable.
- Save envelope: `{ format SAVE_FORMAT 1, simVersion, savedAt, stateHash, state, progress }`; `load` checks format and the integrity hash (`SAVE_CORRUPT`, `SAVE_FORMAT_UNSUPPORTED`).
- Free play: `app.saveFreePlay(sim)` stores `{ scenarioId, seed, tick, timeline, stateHash }`; `loadFreePlay` replays the timeline (`replayTimeline`), refuses a different `SIM_VERSION` (`SAVE_VERSION_MISMATCH`) or a different resulting hash (`SAVE_CORRUPT`).
- Campaign progress: `recordLessonResult` only ever adds passes; failed attempts bump `attempts` and never remove progress.

# Does NOT Own

- Replay verification logic (REPLAY).
- Game rules.

# Core Data

`progress = { attempts, completed: { lessonId: { passes, bestCommandCount } } }`.

# State

App-level `progress` and `lastAttempt` live in `src/app/index.js`; save slots `freeplay`, `autosave`.

# Commands / API

`app.save/load` (last lesson/sandbox attempt state), `app.saveFreePlay/loadFreePlay/hasFreePlaySave`.

# Events

None.

# Dependencies

kernel only (`persistence: []`); app composes it with session.

# Dependents

`src/app/index.js`, UI SAVE/LOAD buttons.

# Source Files

- `src/modules/persistence/index.js`
- `src/app/index.js`
- `src/modules/session/index.js` (`replayTimeline`)

# UI Files

`src/app/mainscreen.js` (`saveSession`, `loadSession`), `index.html` (SAVE/LOAD)

# Asset Files

None.

# Tests

- `tests/persistence.test.js`
- `tests/stabilization.test.js` (free-play save/load, tampered/old-version saves)
- `tests/hooks.test.js` (hooks survive via timeline)

# Current Status

IMPLEMENTED.

# Known Problems

- Any change to simulation behaviour requires bumping `SIM_VERSION` or old saves will replay to a different world (they are then refused with a clear code — no migration exists).
- O1: saves grow with the command timeline.

# Planned Changes

Migration hook point exists (`SAVE_FORMAT_UNSUPPORTED`); no migrations written.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not save raw GameState for free play (it would bypass the replay/hash proof).
- Do not silently load a save from another version or with a hash mismatch.
- Do not let a failed attempt reduce saved progress.

# Related Documentation

- `AI_MEMORY/systems/REPLAY_INDEX.md`
