# Asset Specification — Architecture, Naming, Fallback, Resolver

> Source: `CODE_AFTERmath_ASSET_SPRITE_OBJECT_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx` (converted from the original .docx; content unchanged, only regrouped).
> Part of the CODE: AFTERMATH design set — see [README](README.md).

# 1. Purpose

This document defines visual asset rules separately from the game logic and campaign plan. It establishes how NPCs and other world objects should be represented without making visual assets the source of gameplay truth. The document intentionally leaves Enemy, Resources, Materials, Consumables, Weapons and advanced Building rules open for later discussion where the design is not yet mature.

# 2. Core Visual Architecture Rule

World assets are presentation outputs of authoritative simulation state. A sprite, animation frame, portrait or card must never become the authoritative source of health, position, inventory, task progress, resource count, or other gameplay state.

Canonical relationship:

GameState → Render Projection → Asset Resolver → Sprite/Animation/UI

# 11. Asset Naming Convention

Recommended pattern:

entity_action_direction_variant

Examples:

- npc_survivor_idle_down

- npc_survivor_walk_down_right

- npc_survivor_run_left

- npc_survivor_gather_down

- npc_survivor_repair_up

- npc_survivor_guard_right

- npc_survivor_attack_down_right

- npc_survivor_injured_left

# 12. Fallback Rules

1.  Requested exact animation/direction asset.

2.  Same action in nearest supported direction.

3.  Compatible generic action animation.

4.  IDLE in the current direction.

5.  Default safe idle frame.

Fallback affects only presentation. It must never alter task success, movement, combat resolution or other gameplay state.

# 19. Production Asset Separation

| **Asset class**      | **Production rule**                                                            |
|----------------------|--------------------------------------------------------------------------------|
| World sprite atlas   | Transparent, fixed frame size, standardized pivot, no UI text.                 |
| Portrait             | Separate from world atlas; optimized for card/Inspector presentation.          |
| Equipment icon       | Separate UI asset; may be reused across inventory, cards and equipment panels. |
| Building sprite      | State/level-specific world asset with stable naming.                           |
| Design concept sheet | Reference only; not assumed to be directly sliceable for runtime.              |

# 20. Asset Resolver Rule

Gameplay code should reference semantic asset IDs or entity states rather than hard-coded image paths. A resolver maps those IDs to bundled assets.

Example:

simulation state → npc_survivor.walk + DOWN_RIGHT → asset resolver → sprite atlas/frame

# 21. Open Discussion Checklist

| **Category**   | **Status**          | **Next decision**                                                       |
|----------------|---------------------|-------------------------------------------------------------------------|
| NPC / Survivor | APPROVED BASE RULES | Refine exact frame counts, modular layers and final art dimensions.     |
| Enemy          | OPEN                | Define taxonomy, animation and special variants.                        |
| Resources      | OPEN                | Define world nodes, depletion, icons and gathering visuals.             |
| Materials      | OPEN                | Define material taxonomy and visual relationship to resources/crafting. |
| Consumables    | OPEN                | Define use, icons, stacking and world representation.                   |
| Weapons        | OPEN                | Define taxonomy, combat visuals and inventory/card presentation.        |
| Buildings      | BASE RULES APPROVED | Define final level/state taxonomy and individual building assets.       |

# 22. Final Visual Architecture Rule

The game should prefer a small, reusable and data-driven asset vocabulary over a large number of bespoke sprites. World assets communicate simulation state and immediate action; cards and Inspector views communicate identity, detailed appearance and item information. This separation keeps the world readable, limits sprite combinatorial complexity, and allows the simulation and visual presentation to evolve independently.

Status note: NPC rules and building base rules in this document are approved working rules based on the current discussion. Enemy, Resources, Materials, Consumables and Weapons are intentionally left open for future design discussion and should not be treated as finalized specifications.

NPC / EVENT / BUILDING VISUAL UPDATE SPECIFICATION

This addendum identifies visual rules that must be updated to support the expanded NPC, building and event systems. Gameplay truth remains in GameState; assets remain presentation outputs.

# E. ASSET COMBINATORICS CONTROL — REQUIRED

Do not multiply sprites for every combination of occupation × skill × level × trait × equipment. Use a small modular vocabulary: base survivor body, optional controlled appearance layers, action/tool overlay, optional status/damage overlay, and separate card assets.

# F. VISUAL RESOLUTION PIPELINE — UPDATE

Simulation State → Render Projection → Event/Building/NPC Asset Resolver → Sprite/Animation/UI.

The asset resolver should consume semantic states such as npc.gather, npc.attack, building.workshop.level3, event.raid.active, rather than hard-coded image paths.

# G. VISUAL ITEMS STILL OPEN

- Exact NPC frame counts.

- Final NPC modular layer dimensions.

- Exact building level visual taxonomy.

- Event marker/icon style.

- Zombie nest visual taxonomy.

- Scavenge site visual taxonomy.

- Resource node depletion and recovery visuals.

- Equipment icon standards and final weapon/tool visual rules.
