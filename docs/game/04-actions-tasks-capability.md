# Actions, Tasks and Capability

> Source: `CODE_AFTERmath_GAME_LOGIC_ARCHITECTURE_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx` (converted from the original .docx; content unchanged, only regrouped).
> Part of the CODE: AFTERMATH design set — see [README](README.md).

# 8. Action State Machine

Standard lifecycle:

QUEUED → VALIDATING → RESERVED → EXECUTING → COMPLETED

Failure may occur from QUEUED, VALIDATING, RESERVED or EXECUTING. Explicit cancellation is permitted where the engine or lesson requires it.

Every action should retain actionId, actorId, actionType, targetId when applicable, requestedAtTick, status and failureReason.

> **Update 2026-11-12:** some actions are *standing*: one action that keeps working in repeated batches until a stop
> reason (`TARGET_REACHED`, `STORAGE_FULL`, `NO_TARGET`, `EXHAUSTED`) ends it. The lifecycle above is unchanged; a
> standing action finishes `COMPLETED` with a `stopReason` if it did work, or `FAILED` with the same reason if it did none.
> See [15-realtime-simulation-and-tasks.md](15-realtime-simulation-and-tasks.md).

# E. TASK EFFICIENCY MODEL — NEW

Task efficiency must be calculated by a dedicated task-resolution system. The system should not hard-code one universal formula for every task; instead, each task definition declares which factors it uses and how strongly they matter.

Recommended conceptual inputs are: relevant attributes + relevant skill + equipment effects + building effects + traits + current condition + task difficulty + environmental/event modifiers.

| Input             | Example effect                                                                  |
|-------------------|---------------------------------------------------------------------------------|
| Attribute         | Strength improves heavy physical work                                           |
| Skill             | Woodcutting improves wood gathering proficiency                                 |
| Equipment         | Axe improves woodcutting efficiency                                             |
| Building          | Higher-level work facility improves supported task efficiency/capability        |
| Trait             | Scavenger improves search results                                               |
| Condition         | Low energy reduces work performance                                             |
| Difficulty        | Hard resource node or dangerous event reduces effective performance             |
| Environment/Event | Night, distance, threat level, weather or special conditions may modify results |

# J. CAPABILITY CHECK — NEW ARCHITECTURAL COMPONENT

Before an action is accepted, the engine should evaluate whether the survivor can perform it and at what effective capability. This is separate from the learner-facing command API.

- Capability available?

- Required skill/attribute met?

- Required equipment available?

- Required building/facility available?

- Required resources available?

- Condition permits the action?

- Capacity/encumbrance permits the action?

- Target is reachable and valid?

- Event/task restrictions satisfied?

# 13. Player/Student Control Boundary

- Student/player code can inspect permitted state and submit documented commands.

- Student/player code cannot directly edit health, hunger, thirst, energy, attributes, inventory weight, carry capacity, condition or authoritative entity state.

- The Game API is versioned and is the only supported bridge between learner code and simulation.

- Different valid coding styles should pass unless a lesson explicitly tests a required construct.
