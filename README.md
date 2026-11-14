# CODE: AFTERMATH — engine (Phases 0–1, correction C0–C8, real-time R1–R2, stabilization S0–S5, needs policies R4a)

A **modular monolith**: one deployable app (static files, offline-first, no build step), split into modules with
enforced boundaries. Vanilla ES modules; Node ≥ 22 for tests.

```
<<<<<<< HEAD
npm test          # 122 tests incl. architecture boundaries, Phase 0 gate, sandbox, real-time clock, standing actions, asset resolver, renderer, regressions, soak
=======
npm test          # 154 tests incl. needs policies, curriculum/hidden scenarios, architecture boundaries, Phase 0 gate, sandbox, real-time clock, standing actions, asset resolver, renderer, regressions, soak
>>>>>>> 29b1943 (docs: document real-time policies, save/load, and phase tracker)
SOAK_SEEDS=300 npm test   # deep randomized soak (invariants after every 50 ticks)
npm run serve     # http://localhost:8080  (ES modules need http://, not file://)
npm run smoke     # real-browser check (needs Playwright + Chromium) — (C9 gate: passing)
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
| `simulation` | **the only writer of GameState**; tick loop; clock driver (play/pause/speed → `sim.step`) | survivors, actions, projection |
| `api` | versioned Game API contract + command builder | — |
| `sandbox` | static safety check + isolated Worker runner + budgets | api |
| `session` | one attempt end to end | world, simulation, api |
| `lessons` | goal checks, feedback | session |
| `replay` | replay record + verification | session |
| `persistence` | save store (memory / IndexedDB), campaign progress | — |
| `assets` | semantic asset keys → atlas frames, 5-step fallback, in-code placeholder atlas, animation timing | — |
| `render` | the one production canvas renderer; reads the render projection only; optional debug overlay (`?debug`, Alt+D) | assets |
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

## Free play: a world that keeps running (real-time)

- The simulation ticks continuously; there are **no turns**. A clock driver turns frame time into ticks (3 ticks/s at 1x; speeds 1×/2×/4×). It starts **paused**; **PLAY**/**PAUSE** (or Space) and the speed button control it.
- **CODE** opens the editor. **Run Code** sends your JavaScript through `Safety Validator → Worker → Game API → Command Builder` straight into the live world. Commands start working at once and the clock resumes if it was paused.
- **Standing commands:** `survivor.gather("wood", 20)` keeps gathering in trips of 20 until storage is full, nothing is left, or the survivor is too tired. Add a total to stop earlier: `gather("wood", 20, 60)`. `survivor.lastTask` says why a survivor stopped (`TARGET_REACHED`, `STORAGE_FULL`, `NO_TARGET`, `EXHAUSTED`).
- **Replace vs queue:** the first command a program gives a survivor replaces what it was doing; the rest queue behind it in order. `survivor.queue()` appends instead.
- **Save / load:** SAVE stores the session *record* (scenario + seed + commands with the ticks they were issued); LOAD replays it and refuses to continue if the world does not come out identical (hash check).
- **Strategy points:** each command costs 1; start 10, max 10, +1 every 20 ticks.
- Commands: `moveTo`, `gather`, `rest`, `eat`, `drink`, `repair`, `stop` (+ the free `queue` marker) and, new in R4a, `policy(name, { below })` / `clearPolicy(name)`. Survival is manual unless you set a policy: `survivor.policy("eat", { below: 30 })` pauses the current job when hunger drops below 30, eats, then resumes it (see `docs/game/15-realtime-simulation-and-tasks.md`). Buttons for systems that do not exist yet are disabled and labelled with their phase.
- Run the screen with `npm run serve`; `?debug` (or Alt+D) shows the debug overlay. Details: `docs/game/15-realtime-simulation-and-tasks.md`.

## Documentation
Start at `docs/README.md`. Active tracker and rules: `docs/active/`. Everything in `docs/correction/` is HISTORICAL.

## Design docs
`docs/game/` holds the former .docx files as chunked Markdown (architecture, design flow, NPC, buildings, assets, …). `docs/correction/` holds the audit, correction phases (C0–C9), implementation phases (I0–I15) and the C0 baseline, with completed items ticked.

## Security note
The static check gives friendly errors; real containment is the **Worker** (no DOM/storage, runs under the page CSP
with `connect-src 'none'`), prototype hardening, and a termination timeout. The Node worker used in tests is for CI
only — it is not a security boundary.

## Adding things
- **New command**: add to `api/v1.js` (`COMMANDS`), add an action def in `definitions/data/actions.js`, add a handler in `actions/handlers/`. A handler may be *standing* (see `handlers/gather.js`): keep returning `RUNNING` across batches and finish with `{ status: 'done', stopReason }`.
- **New building / node / item / lesson**: edit the data files; `validateDefinitions` tells you what's inconsistent.
- **New lesson check**: add a function to `lessons/checks.js`, reference it by name in lesson data.

See `docs/PHASES.md` for the roadmap and acceptance gates, and `docs/IMPLEMENTATION_PLAN_2026-11-13.md` for the latest analysis, bug list and revised plan.
