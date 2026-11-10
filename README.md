# CODE: AFTERMATH — engine (Phases 0–1)

A **modular monolith**: one deployable app (static files, offline-first, no build step), split into modules with
enforced boundaries. Vanilla ES modules; Node ≥ 22 for tests.

```
npm test          # 51 tests incl. architecture-boundary checks and the Phase 0 gate
npm run serve     # http://localhost:8080  (ES modules need http://, not file://)
npm run smoke     # real-browser check (needs Playwright + Chromium)
```

## Architecture

```
Learner code → Sandbox (Worker, Clock A) → Game API v1 → Command → Action Queue
   → Preconditions → Reservation → Simulation tick (Clock B) → State → Event Log
   → Lesson Validator → Feedback        ·  State → Projection → Renderer / Inspector (read-only)
```

| Module | Owns | Depends on |
|---|---|---|
| `kernel` (shared) | seeded RNG, hashing, event log, errors, 8-direction vocabulary, versions | — |
| `definitions` | validated, frozen data: items, actions, buildings, scenarios, lessons | — |
| `resources` | ledger: reserve → commit / release (no double-spend) | — |
| `survivors` | survivor schema, needs decay, derived conditions | — |
| `buildings` | building level/health/condition, asset keys | — |
| `world` | builds the initial GameState from a scenario + seed | resources, survivors, buildings |
| `projection` | read-only views: student view, render projection, Inspector card | resources, survivors, buildings |
| `actions` | action queue, lifecycle state machine, handlers | resources, buildings |
| `simulation` | **the only writer of GameState**; tick loop | survivors, actions, projection |
| `api` | versioned Game API contract + command builder | — |
| `sandbox` | static safety check + isolated Worker runner + budgets | api |
| `session` | one attempt end to end | world, simulation, api |
| `lessons` | goal checks, feedback | session |
| `replay` | replay record + verification | session |
| `persistence` | save store (memory / IndexedDB), campaign progress | — |
| `debugview` | Phase 1 canvas view (replaced by `render` in Phase 2) | — |
| `app/` | composition root: the one place modules are wired together | all |

**Rules (enforced by `tests/architecture.test.js`, declared in `src/architecture.js`)**
1. A module imports only its own files, `kernel/index.js`, and the **`index.js`** of modules it declares.
2. No cycles. The kernel imports nothing.
3. Adding a module = a folder + a line in the manifest. Adding a dependency = a line in the manifest (visible in review).

**Game rules carried from the docs**
- Learner code only *expresses intent*; the simulation is the only writer of GameState. Learner reads are frozen.
- Rendering is downstream: the renderer reads a projection and never changes gameplay. Animation never decides completion.
- Every action: `QUEUED → VALIDATING → RESERVED → EXECUTING → COMPLETED` (or `FAILED`/`CANCELLED`) with a failure reason.
- Same seed + code + versions ⇒ identical event log and state (hash-checked replay).
- Every attempt starts from a fresh scenario; failed attempts can't reduce saved progress.
- All numbers/definitions are data (`modules/definitions/data/`), not code.

## Command Console Mode (free play)

In free-play mode, instead of writing a script that runs all at once, you issue commands turn by turn:

- **Command budget**: 3 commands per turn (`survivor.gather(...)`, `survivor.moveTo(...)`, `survivor.rest(...)`, etc.)
- **Strategy points**: 10 per turn; each command costs 1 strategy point; 2 points recharge each turn
- **Turn flow**: Type `survivor.commandName(args)` → click **Next Turn** → simulation runs until idle → see results
- **Commands available**: `moveTo`, `gather`, `rest`, `eat`, `drink`, `repair`, `stop`

The command console replaces the old Play/scrubber animation. Use **Free Play** to run a script all at once, or **Next Turn** for turn-by-turn command control.

## Security note
The static check gives friendly errors; real containment is the **Worker** (no DOM/storage, runs under the page CSP
with `connect-src 'none'`), prototype hardening, and a termination timeout. The Node worker used in tests is for CI
only — it is not a security boundary.

## Adding things
- **New command**: add to `api/v1.js` (`COMMANDS`), add an action def in `definitions/data/actions.js`, add a handler in `actions/handlers/`.
- **New building / node / item / lesson**: edit the data files; `validateDefinitions` tells you what's inconsistent.
- **New lesson check**: add a function to `lessons/checks.js`, reference it by name in lesson data.

See `docs/PHASES.md` for the roadmap and acceptance gates.
