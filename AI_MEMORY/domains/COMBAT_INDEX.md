<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Combat domain

# Purpose

**PLANNED / NOT IMPLEMENTED.** Attack, defence, damage to survivors from enemies, weapons. No source file exists for it; do not assume one.

# Responsibilities

None in code.

# Does NOT Own

Everything. Note: `survivor.damaged` exists only for starvation damage (NEEDS).

# Core Data

None.

# State

None.

# Commands / API

None. There is no attack command.

# Events

None.

# Dependencies

ZOMBIE, ITEM (weapons), SKILLS, pathing.

# Dependents

None.

# Source Files

None.

# UI Files

None.

# Asset Files

None.

# Tests

None.

# Current Status

PLANNED / NOT IMPLEMENTED.

# Known Problems

None.

# Planned Changes

Phase 8 (events and defence); advanced systems after the core is stable.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not implement combat as a hidden side effect of an existing action.

# Related Documentation

- `docs/game/14-enemies-resources-items-open.md`
- `docs/game/08-events.md`
