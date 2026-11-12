# Buildings and Upgrades (logic)

> Source: `CODE_AFTERmath_GAME_LOGIC_ARCHITECTURE_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx` (converted from the original .docx; content unchanged, only regrouped).
> Part of the CODE: AFTERMATH design set — see [README](README.md).

# 11. Building and Upgrade Rules

- Buildings and fences are data-driven entities with stable IDs, type, state, level, health and repair/upgrade requirements.

- Repair and upgrade are actions processed over simulation time.

- The Building Tree, Upgrade screen and world building state must read the same authoritative building definitions/state.

- A meaningful building level change must produce a corresponding world visual state.

- Minor numerical damage does not require a unique sprite for every percentage; visual states should represent meaningful thresholds.

- The UI must not directly replace a building sprite as a gameplay mutation. It requests or displays state; the renderer resolves the visual asset.

# F. BUILDING LEVEL — REQUIRED CONCEPT UPGRADE

Building level must become a functional simulation input, not merely an upgrade number or visual change. Each building definition should declare its supported tasks and level-dependent effects.

A building should not directly rewrite survivor attributes. Instead, the building contributes facility capability to the task-resolution system.

- Supported task types

- Worker capacity

- Production or work efficiency

- Storage/carry support where appropriate

- Safety/risk modifiers where appropriate

- Available recipes/actions

- Training capability

- Event preparation/support capability

- Level-specific unlocks

- Meaningful world visual state
