<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Combat domain

# Purpose

**Weapon/tower/noise DATA only (Z1).** Attack, defence, damage and equipment are PLANNED / NOT IMPLEMENTED. `data/arsenal.js` defines `weapons` (knife/spear starters, advanced spear, bow, crossbow, rifle, mounted ballista/repeating crossbow/minigun), `towers` (levels 1-3: range bonus, slots, mounts) and `noise`; pure helpers `effectiveRange`, `canMount`, `shotNoise` live in `threats/index.js`. Nothing equips, shoots or builds yet.

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

- `src/modules/definitions/data/arsenal.js`, `src/modules/threats/index.js` (helpers), `src/modules/definitions/index.js` (validation)

# UI Files

None.

# Asset Files

None.

# Tests

- `tests/threats.test.js` (Z1 section)

# Current Status

Z3 IMPLEMENTED (`SIM_VERSION` 0.26.0): starter spear, weapon reach, `survivor.attack`, `survivor.guard`, zombie health/damage/death, survivor damage/downed, `NO_AMMO`, and combat XP. Z4+ loot/crafting/towers/special types remain planned.

# Known Problems

None.

# Planned Changes

Phase 8 (events and defence); advanced systems after the core is stable.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not implement combat as a hidden side effect of an existing action.
- Melee weapons never get a tower range bonus; the suppressor never applies to mounted weapons; the minigun draws grid power only while firing.

# Related Documentation

- `docs/game/20-zombies-waves-loot-design.md` (decided design: types, waves, loot, weapons, towers — NOT implemented)
- `docs/game/14-enemies-resources-items-open.md`
- `docs/game/08-events.md`
