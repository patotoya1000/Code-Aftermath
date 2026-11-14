> **HISTORICAL — DO NOT USE AS ACTIVE IMPLEMENTATION REQUIREMENT**
> Written for the turn-based / correction phase. It may describe removed mechanics (turns, NEXT TURN, per-turn command caps).
> Active sources of truth: [`docs/game/15-realtime-simulation-and-tasks.md`](../game/15-realtime-simulation-and-tasks.md) and [`docs/active/`](../active/).

# CODE: AFTERMATH --- Correction Phases

## Purpose

These phases repair the current implementation before expanding
gameplay.

The goal is not to rewrite the engine. The goal is to restore alignment
between:

-   game logic document
-   asset/sprite rules
-   `docs/PHASES.md`
-   simulation architecture
-   learner API
-   UI
-   renderer

------------------------------------------------------------------------

# C0 --- Freeze the Current Baseline

> **Status (2026-11-11):** ✅ done — see [C0_BASELINE.md](C0_BASELINE.md).

### Goal

Stop feature expansion while the architecture is reconciled.

### Tasks

-   [x] Freeze new gameplay additions.
-   [x] Treat `CODE_AFTERmath_GAME_LOGIC...docx` as the logic authority.
-   [x] Treat `CODE_AFTERmath_ASSET...docx` as the visual authority.
-   [x] Treat the simulation and API as the gameplay authority.
-   [x] Mark the current screenshot UI as a prototype shell, not final
    UI.
-   [x] Record all currently misleading controls and placeholders.

### Gate

A written baseline exists and no new gameplay feature is added until
C1--C5 are complete.

------------------------------------------------------------------------

# C1 --- Restore the Correct Learner Execution Boundary

> **Status (2026-11-11):** ✅ done — editor → `app.runTurnCode()` → Safety Validator → Worker → Game API → turn budget. Verified in Node (worker_threads); real-browser Worker not run this session.

### Goal

Make the main code interface use the same sandbox architecture as the
documented system.

### Current problem

`mainscreen.js` parses one command with regex and calls `buildCommand()`
directly.

### Required architecture

`Editor`

→ `app.runSandbox()` / dedicated free-play sandbox API

→ `Safety Validator`

→ `Worker`

→ `Game API`

→ `Command Builder`

→ `Simulation`

### Tasks

-   [x] Remove duplicated command parsing from `runCode()`.
-   [x] Reuse the sandbox module.
-   [x] Reuse API validation.
-   [x] Preserve execution timeout and command budget.
-   [x] Return structured execution errors.
-   [x] Show learner-friendly error messages in the code panel.
-   [x] Keep learner code unable to mutate GameState directly.

### Gate

A learner can execute a small JavaScript script from the main UI and the
execution goes through the Worker sandbox.

------------------------------------------------------------------------

# C2 --- Restore Turn-Based Free Play

> **Status (2026-11-11):** ✅ done — TURN / COMMANDS / STRATEGY / NEXT TURN; PLAY/PAUSE/speed removed.

### Goal

Make the visible UI follow the implemented turn model.

### Tasks

-   [x] Remove or disable fake PAUSE / PLAY / SPEED controls.
-   [x] Add `TURN`.
-   [x] Add `COMMANDS LEFT`.
-   [x] Add `STRATEGY POINTS`.
-   [x] Add `NEXT TURN`.
-   [x] Route command execution through `app.advanceTurn()`.
-   [x] Enforce 3 commands per turn.
-   [x] Enforce strategy-point cost.
-   [x] Recharge strategy points only when a turn starts.
-   [x] Display submitted/failed commands.
-   [x] Display the simulation result after the turn.

### Gate

Attempting a fourth command in one turn is rejected.

Starting a new turn resets the command budget according to the rules.

------------------------------------------------------------------------

# C3 --- Remove UI That Pretends Future Systems Exist

> **Status (2026-11-11):** ✅ done — 7 controls disabled with “Coming in Phase …” labels.

### Goal

Prevent visual controls from becoming false gameplay promises.

### Tasks

Temporarily remove or mark unavailable:

-   [x] ASSIGN TASK
-   [x] TASK
-   [x] BUILD
-   [x] SURVIVORS
-   [x] RESEARCH
-   [x] MENU
-   [x] SETTINGS

unless each receives a defined behavior.

### Recommended approach

Use disabled states with a small `Coming in Phase X` indicator rather
than clickable dead controls.

### Gate

Every visible button either:

1.  performs a real operation, or
2.  is explicitly disabled/future.

------------------------------------------------------------------------

# C4 --- Consolidate Renderer Architecture

> **Status (2026-11-11):** ✅ done — `modules/render` is the only renderer; `debugview` and the old `app/browser.js` entry removed after parity tests; debug overlay is `?debug` / Alt+D.

### Goal

Stop maintaining two competing visual pipelines.

### Current state

-   `modules/debugview`
-   `src/render/renderer.js`

both exist.

### Tasks

-   [x] Define `render/renderer.js` as the production renderer.
-   [x] Preserve the same render projection contract.
-   [x] Move useful debug overlays into an optional debug mode.
-   [x] Stop adding features to `debugview`.
-   [x] Remove `debugview` only after parity tests pass.
-   [x] Update architecture manifest and tests if a formal `render`
    module is introduced.

### Gate

The application has one production renderer and one render-projection
contract.

------------------------------------------------------------------------

# C5 --- Correct the Render Projection and World Geometry

> **Status (2026-11-11):** ✅ done — fence perimeter from `bounds`, tent, nodes, depletion, condition-driven frames.

### Goal

Make the visible Stage 1 map reflect authoritative world data.

### Tasks

-   [x] Render fence `bounds`, not only the fence origin tile.
-   [x] Render HQ at the correct tile.
-   [x] Render tent.
-   [x] Render tree nodes.
-   [x] Render rock node.
-   [x] Preserve 8-direction NPC direction.
-   [x] Render node depletion state.
-   [x] Render building condition.
-   [x] Render selection consistently.
-   [x] Keep the renderer read-only.

### Gate

Changing building health changes its condition and visual state without
UI code directly changing the sprite.

------------------------------------------------------------------------

# C6 --- Remove Hardcoded Future Mechanics From UI

> **Status (2026-11-11):** ✅ done — no 22 / `qty*2`; weights from definitions; encumbrance hidden; fake clock and fake “metal” stock removed too.

### Goal

Make UI data-driven.

### Tasks

-   [x] Remove hardcoded `22 kg` carry capacity.
-   [x] Remove hardcoded `qty * 2`.
-   [x] Read item weights from definitions when inventory exists.
-   [x] Hide encumbrance until the carry system is authoritative.
-   [x] Separate attributes from skills.
-   [x] Remove hardcoded equipment assumptions.
-   [x] Use projection data for all displayed values.

### Gate

Changing item definitions changes displayed item weight without
modifying UI logic.

------------------------------------------------------------------------

# C7 --- Build the Real Asset Resolver

> **Status (2026-11-11):** ✅ done — `modules/assets` (semantic keys, 5-step fallback, in-code placeholder atlas).

### Goal

Replace primitive canvas drawings with semantic asset resolution.

### Tasks

Create:

`semantic state → asset resolver → atlas frame`

Examples:

-   `npc_survivor_idle_down`
-   `npc_survivor_walk_down_right`
-   `npc_survivor_gather_down`
-   `building_fence_lv1_ruined`
-   `building_hq_lv1_repaired`

### Required fallback order

1.  Exact action + direction + variant
2.  Same action + nearest supported direction
3.  Compatible generic action
4.  IDLE in current direction
5.  Safe default idle

### Gate

Deleting one animation frame does not break gameplay; the renderer falls
back safely.

------------------------------------------------------------------------

# C8 --- Survivor Card Correction

> **Status (2026-11-11):** ✅ done — Survivor Card reads `inspector()` only.

### Goal

Make the Inspector genuinely reflect the same survivor record.

### Tasks

-   [x] Read identity from projection.
-   [x] Read needs from projection.
-   [x] Read attributes from projection.
-   [x] Read skills from projection when available.
-   [x] Read traits.
-   [x] Read equipment.
-   [x] Read inventory.
-   [x] Read current task.
-   [x] Show derived conditions.
-   [x] Do not create a second character record in the UI.

### Gate

Changing the authoritative simulation state changes the card
automatically.

------------------------------------------------------------------------

# C9 --- Correction Completion Gate

> **Status (2026-11-12):** ✅ 11 of 11. Browser smoke passes (13 checks, Chromium 1243). Please re-run `npm run smoke` locally once.

The correction stage is complete only when:

-   [x] Main code editor uses sandbox.
-   [x] Turn budget is enforced.
-   [x] Next Turn works.
-   [x] Fake simulation controls are removed.
-   [x] One renderer path is selected.
-   [x] Fence bounds render correctly.
-   [x] Hardcoded carry values are removed.
-   [x] Asset resolver exists.
-   [x] Survivor Card is projection-driven.
-   [x] Existing simulation tests still pass.
-   [x] Browser smoke test passes.

Only after C9 should major gameplay implementation resume.
