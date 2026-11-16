<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Lessons, validators, curriculum roadmap

# Purpose

Starter curriculum as DATA (`definitions/data/lessons.js`) evaluated by pure checks (`lessons/checks.js`) over an attempt result. Lessons never change gameplay state.

# Responsibilities

- `runLesson`: fresh scenario + the lesson seed → sandbox runs the code once → `session.runAttempt` submits all calls with `sim.submit` (queue order, no strategy points) → steps until idle or `maxTicks` → `evaluateLesson` (pure) → `recordLessonResult` (progress only grows).
- `FAILURE_HINTS` map engine failure reasons to learner-friendly text; feedback combines goal hints, failure hints and a timeout note.
- Hooks (`survivor.on`) are rejected inside lessons with `HOOKS_FREE_PLAY_ONLY` (and a `command.rejected` event, so `noActionFailures` fails).
- Checks available: `stockAtLeast`, `buildingConditionIs`, `buildingHealthAtLeast`, `needAtLeast`, `survivorActive`, `noActionFailures`, `eventCountAtLeast`, `needNeverBelow` (reads checkpoints every 25 ticks), `usesConstruct` (regex over the source), `commandCountAtMost`, `finishedWithinTicks`.

# Does NOT Own

- Sandboxing (SANDBOX), simulation rules, progress storage (SAVELOAD).

# Core Data

Eight lessons exist in code (the master prompt lists seven; the eighth, `m3_e_policy`, was added with R4a). Lesson shape: `{ id, version, title, scenario, seed, maxTicks, brief, starter, goals[] }`.

| # | id · title (as in data) | Scenario · seed · maxTicks | Objective / required behaviour | API used | Validation (goals → check) | Expected outcome |
|---|---|---|---|---|---|---|
| 1 | `m1_first_wood` · Module 1 · First Wood | `stage1` · 1001 · 400 | Base has ≥10 wood; no failed action | `gather` | `stockAtLeast wood 10`, `noActionFailures` | Starter `gather("wood",10,10)` passes |
| 2 | `m1_rest_first` · Module 1 · Rest First | `stage1_tired` (energy 3) · 1002 · 500 | Check energy, rest, then gather 10 wood | `needs.energy`, `rest`, `gather` | `stockAtLeast wood 10`, `noActionFailures`, `usesConstruct if` | Passes only if the survivor rests before gathering (tired start) and code contains an `if` |
| 3 | `m1_repair_fence` · Module 1 · Mend the Fence | `stage1` · 1003 · 600 | Gather wood, repair the fence until `repaired` | `gather`, `repair(fence)` | `buildingConditionIs fence repaired`, `noActionFailures` | Fence 20/100 + 2 repairs ⇒ 70 ≥ 60% ⇒ repaired |
| 4 | `m2_loop_wood` · Module 2 · Loop It | `stage1` · 1004 · 800 | ≥30 wood in batches of 5 using a loop | `gather` in `for`/`while` | `stockAtLeast wood 30`, `noActionFailures`, `usesConstruct loop` | Six `gather("wood",5,5)` calls |
| 5 | `m2_a_variable` · Module 2 · Let There Be Wood | `stage1` · 1005 · 500 | Declare a variable and use it | `gather` | `stockAtLeast wood 10`, `usesConstruct const` | `const amount = 10` |
| 6 | `m3_c_condition` · Module 3 · When to Gather | `stage1_tired` · 1006 · 800 | If tired rest, else gather (if/else) | `rest(40)`, `gather` | `needAtLeast energy 70`, `noActionFailures`, `usesConstruct if` | 3 + 40×2 = 83 energy |
| 7 | `m3_d_function` · Module 3 · A Task Explained | `stage1` · 1007 · 1200 | Define and call a function that gathers | `gather` in a function | `stockAtLeast wood 10`, `noActionFailures`, `usesConstruct function` | `getWood()` twice |
| 8 | `m3_e_policy` · Module 3 · Look After Yourself | `stage1_weary` (energy 30) · 1008 · 900 | ≥60 wood without energy dropping below 20 (own rests or `survivor.policy`) | `policy("rest",…)`, `gather` | `stockAtLeast wood 60`, `noActionFailures`, `needNeverBelow energy 20` | Policy interrupts, rests to 60, resumes |

**Feedback** for every lesson: each failed goal's `message` + optional `hint`, then `FAILURE_HINTS` for any failed-action reason, and "ran out of time" if the simulation did not go idle.

**Current weaknesses (verified in code):**
- `usesConstruct` is a regex over source text: `if (false) {}`, an unused `const x = 1;`, an uncalled function or a one-iteration loop satisfy it. Lessons 2, 4, 5, 6, 7 depend on it.
- Each lesson has ONE scenario and seed, so a hard-coded answer passes (lesson 6 never exercises its `else` branch; the survivor is always tired).
- `needNeverBelow` samples checkpoints every 25 ticks (`checkpointEvery` in `runAttempt`), so a dip between samples is missed (lesson 8).
- Lessons run in an isolated simulation; the map does not show them (O2).

**Planned improvement (not implemented):** behavioural validation — run the learner code against several seeded scenarios/branches (tired and rested survivor, different node layouts) and check outcomes, keeping `usesConstruct` only as an optional hint. Do this through new check names in `checks.js` and extra scenarios in data.

# State

None (pure evaluation). Progress is app state (`src/app/index.js`).

# Commands / API

`listLessons(defs)`, `evaluateLesson(lesson, attempt)`, `runLesson({ defs, sandbox, lessonId, code })`, `app.runLesson(id, code)`.

# Events

Reads `action.failed`, `command.rejected`, and any event type via `eventCountAtLeast`.

# Dependencies

`session` (manifest `lessons: [session]`).

# Dependents

`src/app`.

# Source Files

- `src/modules/lessons/index.js`
- `src/modules/lessons/checks.js`
- `src/modules/definitions/data/lessons.js`
- `src/modules/session/index.js` (`runAttempt`)

# UI Files

`src/app/mainscreen.js` (`renderLessonList`, `startLesson`, `runLessonAttempt`, `renderLessonResult`, `renderProgressScreen`)

# Asset Files

None.

# Tests

- `tests/gate-phase0.test.js` (lesson pipeline, styles, feedback)
- `tests/stabilization.test.js` (every lesson passable from its starter)
- `tests/policies.test.js` (policy lesson)
- `tests/persistence.test.js` (progress only grows)

# Current Status

IMPLEMENTED: 8 lessons, all passable from their starters. **Curriculum roadmap** (from the master prompt; status = what exists in code):

| Module | Topic | Status |
|---|---|---|
| M0 | Orientation | PLANNED (no lesson; free-play screen only) |
| M1 | Observe / Command | IMPLEMENTED as "Module 1" lessons 1–3 |
| M2 | Variables / Repetition | IMPLEMENTED as "Module 2" lessons 4–5 |
| M3 | Decisions | IMPLEMENTED as "Module 3" lesson 6 |
| M4 | Functions | Lesson 7 exists but is labelled "Module 3" in data |
| M5 | State / Resource Planning | PLANNED |
| M6 | Capability / Task Resolution | PLANNED |
| M7 | Policies / Events | Policy lesson 8 exists but is labelled "Module 3"; hooks have no lesson (free play only) |
| M8 | Carry / Logistics | PLANNED (R3 mechanics exist; no lesson yet) |
| M9 | Events / Risk | PLANNED |
| M10 | Advanced Automation | PLANNED |

**Conflict recorded, not reconciled:** lesson titles use a 3-module numbering (functions under Module 3, policies under Module 3) while the roadmap above has 11 modules. Decide the renumbering before adding lessons.

# Known Problems

See weaknesses above. Lesson titles/ids vs roadmap numbering conflict.

# Planned Changes

R5 timeline lessons; behavioural validators; hook lesson (M7); logistics lessons (R3 mechanics exist).

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not let a check mutate state or call the simulation.
- Do not turn lessons into turn-based scripts (no per-turn command limits).
- Do not add a lesson that cannot be passed from its own starter (tested).
- Do not make syntax/keyword matching the only validator for a new lesson.

# Related Documentation

- `docs/game/02-game-design-flow.md`
- `AI_MEMORY/IMPLEMENTATION_STATUS.md`
