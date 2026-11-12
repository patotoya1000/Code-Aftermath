# Game Architecture

> Source: `CODE_AFTERmath_GAME_LOGIC_ARCHITECTURE_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx` (converted from the original .docx; content unchanged, only regrouped).
> Part of the CODE: AFTERMATH design set — see [README](README.md).

# 1. Purpose and Scope

This document refines the existing Survivor Training Campaign Revision 4 into a developer-facing game logic and architecture ruleset. It preserves the educational purpose, eight-module campaign, ruined-settlement progression, offline-first direction, sandboxed JavaScript, versioned Game API, deterministic simulation, event logging, validation, and data-driven lesson model.

The primary refinement is to make ownership boundaries explicit: authoritative simulation state, player/student commands, rendering state, and presentation/UI state are separate concerns.

# 2. Source-Derived Design Baseline

- The existing plan establishes two clocks: code-execution time and simulation time.

- Student code may inspect permitted state and submit commands, but must not directly mutate authoritative GameState.

- The authoritative command path is: Student JavaScript → Parser/Safety Validator → Versioned Game API → Command Builder → Action Queue → Preconditions → Resource Reservation → Simulation Tick → State Mutation → Event Log → Lesson Validator → Feedback/Mastery.

- Queued actions use explicit lifecycle states and failure reasons.

- Resource-consuming actions use reservation, commit, and release rules to prevent double-spending.

- Survivor needs, attributes, inventory, equipment effects and state mutation belong to the simulation engine.

- The Inspector exposes safe read-only projections.

- Buildings are data-driven and shared by the Building Tree and upgrade systems.

- Offline-first execution, local saves, bundled assets, deterministic hidden scenarios and replayability are part of the intended implementation direction.

# 3. Refined Ownership Model

| **Layer**               | **Owns**                                                                                                                | **Must not own**                                |
|-------------------------|-------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------|
| Authoritative GameState | Entity state, resources, tasks, attributes, needs, inventory, equipment effects, building levels, positions, conditions | UI-only formatting or animation-frame selection |
| Simulation Engine       | Time progression, action validation, state mutation, resource transactions, task execution, derived conditions          | Direct DOM/UI rendering                         |
| Game API                | Safe command contracts exposed to student/player code                                                                   | Direct state mutation or engine internals       |
| Renderer                | Converts current game state into world visuals, sprite selection and animation playback                                 | Changing authoritative gameplay state           |
| Inspector/Card UI       | Detailed identity, appearance, stats, traits, equipment and inventory presentation                                      | Authoritative gameplay mutation                 |
| Lesson Validator        | Checks events, intermediate state, final state and structural requirements                                              | Changing gameplay state                         |

# 4. Canonical Runtime Pipeline

Every meaningful gameplay action should follow one deterministic path:

Student/Player Intent → API Contract → Command Validation → Queue → Preconditions → Reservation → Simulation Tick → State Mutation → Event → Derived State → Render Projection → UI/Inspector.

Rendering is downstream of simulation state. A sprite animation never becomes the source of truth for movement, health, inventory, task completion, or combat results.

# 5. Two-Clock Rule

| **Clock**                 | **Purpose**                                                                       | **Rule**                                                                                               |
|---------------------------|-----------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| Clock A — Code Execution  | Parse, safety-check and execute bounded student JavaScript                        | No synchronous waiting for future simulation state; commands are generated within an execution budget. |
| Clock B — Simulation Time | Advance movement, work, combat, needs, resources and other time-dependent effects | Only the simulation changes authoritative state over ticks.                                            |

Loops teach repetition by generating bounded commands. They must not be used as a synchronous wait-until-future-state mechanism.

# 16. Recommended API/State Separation

| **Student-facing read**      | **Student-facing command** | **Simulation-owned result**                    |
|------------------------------|----------------------------|------------------------------------------------|
| survivor.needs.energy        | survivor.rest()            | Energy changes over simulation ticks           |
| fence.health                 | survivor.repair(fence)     | Repair progress, resource use and final health |
| base.wood                    | survivor.gather("wood")    | Worker progress and wood increase              |
| survivor.attributes.strength | survivor.gather(...)       | Task outcome may use configured attributes     |
| survivor.inventory           | survivor.pickup(item)      | Validated inventory/carry change               |

# 20. Final Architecture Verdict

The refined architecture is implementation-ready in principle, subject to the Phase 0 and Phase 1 acceptance gates. The most important rule is the ownership boundary: learner/player code expresses intent; the Game API validates and queues that intent; the simulation owns time and state mutation; events record what happened; validators evaluate behavior; and the renderer/UI presents the resulting state. This prevents visual code, lesson code and gameplay logic from becoming tightly coupled.

Source basis: Code_Aftermath_Survivor_Training_Campaign_Revision4.docx. Refinements marked here are architectural synthesis/recommendations based on the source plan, not claims that the source already specified every visual rule.

CHANGE / UPDATE / UPGRADE SPECIFICATION — NPC, TASK, BUILDING & EVENT SYSTEM

This addendum records the changes that should be made to the current game concept and architecture. It does not replace the existing ownership boundaries; it extends them with a more complete Survivor/NPC capability model, task-resolution model, building-efficiency model, and event framework.
