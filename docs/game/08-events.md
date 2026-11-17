# Events (logic)

> Source: `CODE_AFTERmath_GAME_LOGIC_ARCHITECTURE_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx` (converted from the original .docx; content unchanged, only regrouped).
> Part of the CODE: AFTERMATH design set — see [README](README.md).

# G. EVENTS — NEW SYSTEM

Events are simulation activities with participants, requirements, duration, difficulty, outcomes and consequences. They should use the same authoritative action and resource transaction architecture as ordinary tasks.

| Event               | Primary NPC factors                                                       | Possible building influence      | Possible outcomes                                           |
|---------------------|---------------------------------------------------------------------------|----------------------------------|-------------------------------------------------------------|
| Zombie Nest Raid    | Combat, Strength, Agility, Endurance, equipment, health, team composition | Defense/medical/training support | Nest cleared, injuries, equipment damage, loot, XP, failure |
| Supply Scavenge     | Perception, Scavenging, Agility, Strength, carry capacity                 | Scavenging/storage/outpost level | Food, medicine, tools, injuries, lost time                  |
| Resource Expedition | Relevant gathering skill, Strength, Endurance, equipment                  | Resource facility level          | Resources, tool wear, fatigue, unexpected threat            |
| Defense Event       | Combat, perception, equipment, morale                                     | Fence/HQ/defense building level  | Damage, casualties, threat reduction, rewards               |

# H. EVENT RESOLUTION — NEW RULE

Events must not be resolved as a single arbitrary success percentage. They should progress through stages where appropriate: preparation, travel, execution, risk checks, recovery and result application.

The event engine should produce explicit event records and consequences so the learner can inspect what happened and why.

## Built so far (O18 / O19)

- **Risk events (O18):** public seed+day schedule, dawn effects (rats, equipment fault, supply cache). See `docs/game/16`.
- **Raids (O19, groundwork):** a night raid may come at dusk (pure function of seed + day, strength and zombie composition public 2 days ahead). It is resolved abstractly against the fence defence: defence >= strength repels it (small fence wear), otherwise the fence is damaged and 25 % of available food and water is looted. Learner read: `threats`; log: `raid.warning`, `raid.resolved`. Zombies do not exist on the map yet.
