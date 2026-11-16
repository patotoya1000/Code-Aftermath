<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Zombie / enemy domain

# Purpose

**PLANNED / NOT IMPLEMENTED.** Zombies, nests, waves and variants are design topics only. No source file exists for it; do not assume one.

# Responsibilities

None in code. When built: enemy definitions, behaviour, variants and combat interaction.

# Does NOT Own

Everything — nothing exists.

# Core Data

None. Open design in `docs/game/14-enemies-resources-items-open.md`.

# State

None.

# Commands / API

None.

# Events

None.

# Dependencies

Would need pathing (I6), combat, events (M9).

# Dependents

None.

# Source Files

None (grep of `src/` for zombie/enemy finds nothing).

# UI Files

None.

# Asset Files

None.

# Tests

None.

# Current Status

PLANNED / NOT IMPLEMENTED.

# Known Problems

None (nothing to break).

# Planned Changes

After pathing, events and combat foundations (Phase 8). Do not start before core simulation/API/state are stable.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not add enemies or combat before pathing and the event framework exist.
- Do not pretend this domain exists in the UI.

# Related Documentation

- `docs/game/14-enemies-resources-items-open.md`
- `docs/game/08-events.md`
