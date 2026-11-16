<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> NPC / Survivor domain

# Purpose

Survivor data: identity, needs, attributes, skills, traits, position, direction, status and the per-survivor policy table. The learner-facing object is `survivor` (first survivor) and `survivors` (all).

# Responsibilities

- Create a survivor from a template (`createSurvivor`).
- Derive read-only conditions (`hungry`, `thirsty`, `tired`, `starving`, `dehydrated`, `downed`) from needs and thresholds — never stored.
- Hold the survivor's `policies` bookkeeping (rule + cooldown + last policy action).
- Task assignment itself belongs to TASK; the survivor only records `lastTask` (written by the action engine).

# Does NOT Own

- Task/queue lifecycle (TASK).
- Need decay numbers (data in `src/modules/definitions/data/actions.js`; rules in NEEDS).
- Sprites/portraits (ASSETS). Presentation data is deliberately not stored on the survivor.
- Capability maths (`src/modules/capability/index.js`).

# Core Data

- Schema v1: `id, identity{name,age,gender,background}, needs{health,hunger,thirst,energy,morale}, attributes{strength,agility,endurance,intelligence,perception}, skills{gathering,repair,rest,consume,move}, traits[], inventory{items{}}, equipment{}, occupation, position{x,y}, direction, policies{}, status (active|downed), progression{xp,specialization}, lastTask`.
- Only template: `rookie` in `src/modules/definitions/data/survivors.js`. Stage 1 has one survivor, `survivor_1` "Mara" at (11,9).
- Stage scenarios override needs (`stage1_tired`: energy 3, `stage1_weary`: energy 30).

# State

Authoritative: `state.survivors[id]` inside the simulation closure. Learners see a frozen copy through `studentView()`; the UI sees the same through `inspector(id)`.

# Commands / API

Learner reads: `survivor.needs.*`, `.conditions`, `.x/.y/.direction`, `.task`, `.lastTask`, `.hooks`, `.policies`, `.attributes`, `.skills`, `.traits`, `.inventory`, `survivors`. Learner requests: see `AI_MEMORY/systems/API_INDEX.md`.

# Events

`survivor.moved`, `survivor.rested`, `survivor.consumed`, `survivor.conditions_changed`, `survivor.damaged`, `survivor.downed`. Payloads: `AI_MEMORY/domains/EVENT_INDEX.md`.

# Dependencies

`definitions` (templates), kernel. Survivors module has no module dependencies (`src/architecture.js`).

# Dependents

`world` (creates survivors), `projection` (views), `simulation` (needs decay), `actions` (reads/writes survivor via handlers).

# Source Files

- `src/modules/survivors/index.js`
- `src/modules/definitions/data/survivors.js`
- `src/modules/world/index.js`
- `src/modules/projection/index.js`

# UI Files

- `src/app/mainscreen.js` (`survivorSections`, `renderInspector`)
- `index.html` (inspector region)

# Asset Files

Visual reference only: `docs/game/media/npc-reference-style.jpeg`. No production sprites exist (placeholder atlas in code). See `AI_MEMORY/assets/NPC_ASSETS.md`.

# Tests

- `tests/simulation.test.js` (needs, downed)
- `tests/realtime.test.js` (lastTask, card)
- `tests/hardening.test.js` (inspector prototype ids)

# Current Status

IMPLEMENTED for one survivor type with full schema; multi-survivor works in tests (two gatherers). PARTIALLY IMPLEMENTED: `equipment`, `occupation`, `progression` exist as empty fields with no behaviour; `morale` exists but nothing changes it.

# Known Problems

- `morale` is displayed but never changes (O5 in `docs/IMPLEMENTATION_PLAN_2026-11-13.md`).
- The learner `survivor` is simply the first survivor unless `actorId` is given (`src/modules/sandbox/runtime.js`).
- Survivors cannot walk through buildings or the fence; the gate is the opening (O3). No unit-vs-unit collision.

# Planned Changes

Equipment/occupation/progression with the Skills phase (carry capacity itself is derived since R3: `carryCapacity`). Survivor selection for multi-survivor programs.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not store sprite keys, portraits or animation state on the survivor.
- Do not store derived conditions; they are computed from needs.

# Related Documentation

- `docs/game/03-survivor-npc-state.md`
- `AI_MEMORY/domains/NEEDS_INDEX.md`
- `AI_MEMORY/domains/TASK_INDEX.md`
