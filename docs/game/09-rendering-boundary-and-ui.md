# Rendering Boundary, Observer View and Cognitive Load

> Source: `CODE_AFTERmath_GAME_LOGIC_ARCHITECTURE_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx` (converted from the original .docx; content unchanged, only regrouped).
> Part of the CODE: AFTERMATH design set — see [README](README.md).

# 12. Rendering Boundary

The renderer consumes a read-only render projection derived from GameState. It may select an asset, direction, animation and frame, but it must never modify the authoritative simulation to make a visual effect happen.

- Simulation position determines where an NPC is rendered.

- Simulation task determines the action animation.

- Simulation direction determines the directional animation.

- Simulation state determines whether a building is ruined, repaired, damaged or upgraded.

- Animation timing must not determine task completion; simulation progress determines completion.

# SIMPLE NPC VISUALS & PLAYER COGNITIVE LOAD — APPROVED DESIGN UPDATE

The supplied simple rounded humanoid reference is adopted as the baseline visual direction for survivor/NPC world sprites. The purpose is to keep the game readable, approachable and technically manageable for learners using beginner-level coding commands.

## 1. Why the Simple NPC Style Fits the Game

- Use a simple rounded, low-detail survivor body as the default world representation.

- Avoid requiring learners to understand complex visual states just to control an NPC.

- The world sprite communicates only immediate simulation information: presence, location, broad action and important status.

- Detailed identity, gender presentation, portrait, equipment, attributes, skills and progression remain primarily in the Survivor Card/Inspector.

- The visual system supports the programming lesson instead of becoming another programming problem.

## 2. Player Cognitive-Load Rule

A beginner should understand an NPC's current situation from the world view without decoding a large collection of sprite variants.

- Do not create separate world sprites for every gender, job, skill level, trait, attribute, inventory item or XP level.

- Do not require learners to select a sprite variant as part of ordinary commands.

- Use semantic commands such as assign, move, gather, farm, build, guard, rest and train.

- The simulation determines the NPC's real state; the renderer selects the appropriate simple visual state.

- If a visual distinction does not help the player understand or control the simulation, keep it in the card/UI.

## 3. NPC World-Sprite Rule

- Default body: standardized, gender-neutral, simple rounded survivor silhouette based on the approved reference.

- Use the agreed 8-direction vocabulary when directional movement is required.

- Use a small set of recognizable action animations instead of occupation-specific character models.

- Limited variation may be added later as a controlled visual layer, but must not multiply the core asset count.

- Gender and detailed appearance are primarily shown in the Survivor Card/Inspector.

- Show active tools/weapons only when needed to explain the current action; complete equipment remains card-first.

## 4. World Map View — Observer / God-Eyes Presentation

The player views the settlement and surrounding environment from a 2D top-down simulation perspective. The player is an observer/controller rather than a character walking through the map.

- Square perimeter fence defines the protected settlement.

- HQ remains the central anchor of the base.

- Housing/tent structures and ruined storage are simple, readable world objects.

- A gate connects the base to the forest/outside path.

- The forest contains trees, stones, huntable animals and scavenging locations.

- NPC movement, work, rest, combat and travel are visible directly in the world.

- Core lessons should not require complex manual camera controls.

## 5. Buildings as Readable World Objects

- Buildings are an intentional exception to the minimal-NPC rule: meaningful upgrades should visibly change the building asset.

- Use a small number of meaningful visual levels rather than an asset for every numeric value.

- HQ, housing, storage, workshop, farm, medical and defense structures should have clear silhouettes.

- Building level, major damage and repair state come from authoritative GameState.

- Learner commands request build, repair or upgrade; they do not directly replace building sprites.

## 6. Other World Objects

- Resources should be recognizable at a glance, while final taxonomy remains data-driven and open for balancing.

- Materials, consumables and weapons primarily use compact world objects plus inventory/card icons.

- Resource nodes may use simple available, depleted and recovering states.

- Event locations use clear markers or simple visual states instead of complex character variants.

- Special enemies and mutations remain under separate enemy design rules.

## 7. Visual State vs. Gameplay State

- Simulation state remains authoritative.

- Renderer receives a read-only render projection.

- Animation communicates state but never determines task completion, XP, health, inventory, combat result or resource mutation.

- Missing animation assets use a fallback chain and do not change gameplay behavior.

## 8. Recommended Learner-Facing Command Complexity

- Keep early commands short and intent-based: assign, move, perform a task, inspect state and make bounded decisions.

- Do not expose internal state mutation commands for health, hunger, thirst, energy, skill XP, inventory weight or carry capacity.

- Complex simulation logic is handled by the engine so learners focus on variables, conditions, loops, functions and decision-making.

- Advanced lessons can add planning depth without adding sprite complexity.

## 9. Design Status

APPROVED WORKING RULE: the simple rounded survivor reference is the baseline NPC visual direction. It reduces visual and implementation complexity while preserving the educational purpose of the game. Detailed identity and progression remain in the Survivor Card/Inspector, while buildings and major world objects carry more visual readability.
