# Buildings / Structures Visual Spec

> Source: `CODE_AFTERmath_ASSET_SPRITE_OBJECT_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx` (converted from the original .docx; content unchanged, only regrouped).
> Part of the CODE: AFTERMATH design set — see [README](README.md).

# 13. Buildings / Structures — BASE RULES APPROVED

- Buildings are world objects and therefore need world-readable visual states.

- Meaningful level changes should use distinct visual assets.

- Ruined, repaired and major damage states may use distinct assets where they materially improve readability.

- Do not create a separate sprite for every health percentage.

- The renderer resolves the building asset from building type, level and major visual state.

- The Upgrade screen and Building Tree must use the same data definitions as the world renderer.

Recommended asset pattern:

building\_\<type\>\_lv\<level\>\_\<state\>

Examples: building_townhall_lv1_ruined; building_townhall_lv1_repaired; building_storage_lv2_repaired.

# C. BUILDING LEVEL VISUAL RULE — UPDATE

Building level is both a gameplay state and a visual state when the level represents a meaningful physical upgrade. The renderer should resolve the building asset from building type, level and major state.

Do not create an asset for every numerical health percentage. Use meaningful visual thresholds.

- building\_\<type\>\_lv\<level\>\_\<state\>

- Example: building_workshop_lv1_repaired

- Example: building_workshop_lv3_repaired

- Example: building_defense_lv4_damaged
