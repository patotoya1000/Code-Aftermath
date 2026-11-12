# Game Design Flow — Runtime, Clocks, Phases, Acceptance

> Source: `CODE_AFTERmath_GAME_LOGIC_ARCHITECTURE_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx` (converted from the original .docx; content unchanged, only regrouped).
> Part of the CODE: AFTERMATH design set — see [README](README.md).

# 14. Determinism, Replay and Validation

- Hidden scenarios should be seeded and reproducible.

- Replay records should include the scenario seed, initial state, student code, API version, simulation version and lesson version.

- Validation should consider API usage, commands, events, intermediate state, final state and structural requirements where appropriate.

- Educational failure should be separated from permanent survival progression loss; retries should not corrupt persistent progression.

- Execution and command budgets prevent infinite loops and unbounded command generation.

# 15. Data-Driven Definitions

Survivors, buildings, items, actions, lessons and visual assets should use definitions/configuration rather than hard-coded branching wherever practical. This allows new attributes, buildings and visual variants to be added without rewriting the core entity schema.

# 17. Phase and Implementation Gates

1.  Phase 0: prove Sandbox → API → Command → Queue → Tick → State Change → Event → Validator → Feedback, with deterministic replay and execution limits.

2.  Phase 1: establish the canonical survivor state model, basic resources, buildings/fences, Stage 1 world, runtime/API, Inspector and offline foundation.

3.  Phase 2: add bounded loops, survivor collections, task queues, resource reservations, inventory/carry rules and extensible attributes.

4.  Phase 3: add production/environment systems and reusable planning routines.

5.  Phase 4: add defense, zombie waves and capstone automation.

6.  Phase 5+: add weapons/infrastructure, tutor/instructor tooling, polish and expansion only after the core simulation remains stable.

# 18. Acceptance Rules

- Authoritative state cannot be directly mutated through the learner-facing API.

- Every exposed command has a documented versioned contract.

- Every action has a deterministic lifecycle and failure reason.

- Resource-consuming actions cannot double-spend.

- A replay reproduces the same simulation outcome from the same seed, code and versions.

- Rendering can be changed without changing gameplay rules.

- UI/card appearance can evolve without changing authoritative survivor state.

- Building visual upgrades resolve from building state rather than from arbitrary UI commands.

# 19. Open Design Items Carried Forward

- The names and skills of the two reward survivors remain open in the source plan.

- Module 7/8 balance between testing practice and fixing provided scripts remains open.

- First-release language strategy remains open.

- Instructor view remains a later-phase item.

- Detailed asset rules are maintained separately in the Asset, Sprite & Object Visual Rules document.

# K. WHAT SHOULD NOT CHANGE

- Authoritative GameState remains owned by the simulation.

- Student/player code still expresses intent through the versioned Game API.

- Student/player code must not directly mutate health, hunger, thirst, energy, attributes, inventory weight, carry capacity or other authoritative state.

- Resource reservation/commit/release rules remain in force.

- Rendering remains downstream from simulation state.

- The Survivor Card/Inspector remains a presentation/read-only projection of the same underlying survivor data.

- The two-clock rule remains unchanged.

# L. IMPLEMENTATION ORDER — RECOMMENDED

- 1\. Finalize Survivor state schema.

- 2\. Finalize attribute list and definitions.

- 3\. Finalize skill list and attribute-to-skill relationships.

- 4\. Define needs/condition effects.

- 5\. Define equipment effect model.

- 6\. Define capability checks.

- 7\. Define task-resolution framework.

- 8\. Define building capability/level effects.

- 9\. Implement ordinary work tasks.

- 10\. Implement event framework.

- 11\. Add zombie-nest raids and scavenging events.

- 12\. Add progression, training and specialization.

- 13\. Add UI/Inspector projections and balancing.

# M. DESIGN STATUS

The following are now proposed upgrades, not yet final numeric balance values: exact attribute list, exact skill list, formula coefficients, building level bonuses, event difficulty curves, XP requirements, trait catalog and specialization thresholds. These should remain data-driven so they can be balanced without changing the core simulation architecture.
