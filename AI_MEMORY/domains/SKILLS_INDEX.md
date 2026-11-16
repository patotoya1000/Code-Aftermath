<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Skills, attributes, traits and capability

# Purpose

Capability gating and efficiency modifiers. Skill *learning* (XP, training, specialization) is not implemented.

# Responsibilities

- `checkCapability`: attribute/skill minimums per action (fails with `CAPABILITY_INSUFFICIENT` before any reservation).
- Duration modifier (skill −5%/level floor 0.5; agility/strength/endurance ±2%/point; tired ×1.3 except rest; hungry/thirsty ×1.15; traits tireless/fast/strong), clamped 0.4–3.0.
- Output modifier (skill +3%/level; strong +10% on gather), clamped 0.5–2.0.

# Does NOT Own

- XP and progression (PLANNED).
- The survivor record (NPC).

# Core Data

`SKILLS` (gathering, repair, rest, consume, move) and `TRAITS` (strong, fast, tireless, observant, hardy) in `src/modules/definitions/data/survivors.js`; capability blocks inside each action definition.

# State

`survivor.skills`, `.attributes`, `.traits`, `.progression{xp,specialization}` (empty). Modifiers are recomputed per action/batch, never stored.

# Commands / API

Reads: `survivor.skills`, `.attributes`, `.traits`.

# Events

None. Failure appears as `action.failed` with reason `CAPABILITY_INSUFFICIENT` and `capabilityDetail`.

# Dependencies

`definitions`.

# Dependents

`actions` (engine, gather).

# Source Files

- `src/modules/capability/index.js`
- `src/modules/definitions/data/survivors.js`
- `src/modules/actions/engine.js`

# UI Files

`src/app/mainscreen.js` (attribute grid)

# Asset Files

None.

# Tests

- `tests/stabilization.test.js` (skill/trait modifiers, node loss = base gain)
- `tests/soak.test.js` (strong, skilled survivor)

# Current Status

PARTIALLY IMPLEMENTED: read-only effects of skills/traits/attributes. PLANNED: XP, training, specialization (M5/M6), equipment effects.

# Known Problems

`observant` and `hardy` traits are defined but have no effect; `tireless` text says energy decays slower but the code only shortens work duration. Modifier constants are in code, not data.

# Planned Changes

Move modifier constants to data; skill XP with diminishing returns.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Capability code must stay pure (no state writes).
- Do not let a modifier change the node-loss/base-gain balance.

# Related Documentation

- `docs/game/07-progression-and-skills.md`
- `docs/game/04-actions-tasks-capability.md`
