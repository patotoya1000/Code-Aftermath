# Progression, Skills and Leveling

> Source: `CODE_AFTERmath_GAME_LOGIC_ARCHITECTURE_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx` (converted from the original .docx; content unchanged, only regrouped).
> Part of the CODE: AFTERMATH design set — see [README](README.md).

# I. PROGRESSION & LEVELING — UPGRADE

- Prefer skill and capability progression over making a generic level the sole source of power.

- A survivor level may exist as a summary/progression indicator, but actual capability should come from attributes, skills, traits, equipment and experience.

- Training should produce experience or progression through simulation time rather than instantly setting stats.

- Buildings such as training facilities may improve training efficiency or unlock training actions, but should not arbitrarily overwrite survivor stats.

- Specializations may unlock after meaningful skill progression and/or trait requirements.

# NPC SKILL LEARNING & REPETITIVE TASK PROGRESSION — APPROVED UPDATE

This update establishes that survivors can improve specialized skills through meaningful repeated work and training. Skill progression is simulation-owned and occurs through experience rather than direct learner/player mutation of NPC statistics.

## 1. Core Progression Rule

When an NPC repeatedly performs a task that meaningfully uses a skill, the simulation may award experience to that skill. When the accumulated experience reaches the next threshold, the skill level increases.

- Farming actions can award Farming XP.

- Scavenging actions can award Scavenging XP.

- Combat actions can award Combat XP.

- Construction actions can award Construction XP.

- Medical actions can award Medicine XP.

- Crafting actions can award Crafting XP.

- A task may award more than one skill when multiple competencies are genuinely involved.

## 2. Skill XP Is Not the Same as a Generic Survivor Level

The game should treat specialized skills as the primary source of learned proficiency. A generic Survivor Level may exist as a summary/progression indicator, but it must not replace individual skills.

- Attributes represent underlying capacity or aptitude.

- Skills represent learned proficiency.

- Skill XP represents learning progress toward the next skill level.

- Specializations represent meaningful mastery or role development.

- Equipment, traits, condition and buildings modify current performance without overwriting the base skill.

## 3. Example — Farming Progression

A survivor who repeatedly performs legitimate farming work can gradually become a better farmer.

- Planting → Farming XP.

- Watering → Farming XP.

- Soil preparation → Farming XP.

- Harvesting → Farming XP.

- Managing a difficult crop or advanced farming task → potentially higher Farming XP.

- Completing the same trivial action repeatedly should not produce unlimited high-rate progression.

Conceptual progression: Farming Level 10 → 25 → 50 → 75 → 90+, with increasing XP requirements and increasingly difficult mastery thresholds.

## 4. XP Award and Diminishing Returns

Skill XP should be calculated by the simulation from task difficulty, relevance to the skill, quality of execution, learning opportunity, and repetition. Easy or excessively repetitive actions should provide reduced learning value after appropriate limits.

- Beginner-relevant tasks may provide strong learning value.

- Tasks that are far below the NPC's current proficiency may provide reduced XP.

- Advanced tasks can provide more meaningful XP when the NPC is capable of learning from them.

- Failure may still provide limited learning XP when the task produces a genuine learning opportunity.

- The system should prevent simple farming loops from becoming an unlimited optimal leveling exploit.

## 5. Skill Level Effects

Increasing a skill should improve task capability rather than simply increasing an abstract score. Higher skill may reduce task duration, improve output quality/quantity, reduce waste, improve safety, unlock advanced tasks, or increase consistency.

- Farming skill → better planting/harvesting efficiency and access to advanced farming tasks.

- Scavenging skill → better search efficiency and improved recovery from difficult sites.

- Combat skill → better combat execution, accuracy, defense or tactical options where supported by the combat model.

- Construction skill → faster or more reliable construction and access to advanced construction tasks.

## 6. Attributes vs. Skills

Do not automatically increase an NPC's base Strength, Agility, Intelligence, Endurance or Perception merely because the NPC repeats a job. Attributes and skills have different progression rules.

- Skills primarily improve through relevant practice and training.

- Attributes may improve through dedicated training systems, traits, progression rules or other explicitly defined mechanics.

- Equipment and temporary effects modify effective capability but do not permanently overwrite base attributes.

- This separation prevents a farmer from automatically becoming stronger in every attribute simply because they harvested crops.

## 7. Training Buildings and Skill Progression

Buildings can influence how efficiently skills are learned. A training facility, farm, workshop, medical facility or other specialized building may provide learning bonuses, unlock advanced training, increase training capacity, or improve safety. Building level must not arbitrarily set an NPC's skill value.

Example: a higher-level farm can provide better conditions for farming practice, while the survivor's actual Farming skill remains owned by the survivor progression system.

## 8. Specialization

High skill proficiency may unlock specialization paths when the required skill, experience, traits, training or other conditions are satisfied. Specialization should be a meaningful capability layer rather than a cosmetic title.

- Farmer → Advanced Farmer.

- Scavenger → Specialist Scavenger.

- Builder → Advanced Builder.

- Medic → Field Medic.

## 9. NPC State Integration

Skill progression belongs in the Progressive portion of the NPC state model. It must remain separate from dynamic needs such as hunger, thirst, energy and health.

- Progressive: skill level, skill XP, specialization and unlocks.

- Dynamic: health, hunger, thirst, energy, morale, injury and current activity.

- Derived: effective capability, efficiency, encumbrance and availability.

- The simulation is authoritative for all of these values.

## 10. Learner / Player API Boundary

Learner code should express intent such as assigning a survivor to farm, harvest or train. Learner code must not directly set Farming XP, Farming Level, health, hunger, attributes or other authoritative progression/state values.

The simulation resolves the task, awards XP when appropriate, updates the skill, and exposes the resulting state through read-only inspection/projection.

## 11. Recommended Progression Pipeline

NPC receives task → capability check → task execution → task result → learning evaluation → skill XP award → threshold check → skill level update → specialization/unlock check → state projection → learner feedback.

## 12. Design Decision Status

APPROVED WORKING RULE: Repeated meaningful work can improve the corresponding NPC skill through XP-based progression. Exact XP formulas, level thresholds, training bonuses and specialization trees remain configurable and should be defined as data rather than hard-coded into individual task functions.
