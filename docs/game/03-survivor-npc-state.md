# Survivor / NPC State

> Source: `CODE_AFTERmath_GAME_LOGIC_ARCHITECTURE_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx` (converted from the original .docx; content unchanged, only regrouped).
> Part of the CODE: AFTERMATH design set — see [README](README.md).

# 6. Entity State Rules

- Every persistent entity has a stable ID.

- Entity type determines its supported state schema and command capabilities.

- Derived conditions are computed from authoritative state and are read-only to student code.

- Presentation properties such as sprite ID, animation frame, portrait selection and UI layout are not authoritative gameplay values.

- State changes occur through validated simulation actions, not arbitrary property assignment.

# 7. Survivor / NPC State Rules

| **State group** | **Examples**                                                                           | **Authority**                                                                  |
|-----------------|----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| Needs           | health, hunger, thirst, energy                                                         | Simulation-owned; derived conditions are read-only                             |
| Attributes      | strength, intelligence, agility, endurance, crafting and future data-driven attributes | Initialized from character data; progression occurs through simulation systems |
| Inventory       | items, quantities, unit weight, current load                                           | Simulation-owned; pickup/transfer/use validated                                |
| Equipment       | equipped item IDs and effects                                                          | Simulation-owned; effects resolved by rules/configuration                      |
| Task            | current task, target, progress, ETA                                                    | Simulation-owned                                                               |
| Position        | location, direction, movement state                                                    | Simulation-owned                                                               |
| Identity        | stable ID, name and persistent character record                                        | Data model; presentation may expose selected fields                            |
| Presentation    | sprite set, animation, portrait/card view                                              | Renderer/UI projection; never used as authoritative state                      |

# A. REQUIRED CONCEPT CHANGES

- Change the NPC concept from a simple stat/job/task unit into a data-driven Survivor capability system.

- Separate base attributes, learned skills, traits, needs/conditions, equipment, occupation, and current task. Do not merge these into one generic 'stat' field.

- Change occupation from a permanent identity label into a behavior/work profile that can be reassigned while preserving the survivor's underlying skills.

- Change task resolution so success and efficiency are calculated from multiple inputs rather than from occupation alone.

- Change building level from a mostly visual/progression value into a functional capability modifier that affects task efficiency, worker capacity, available operations, safety, production, or other explicitly defined building effects.

- Add events as first-class simulation activities, including zombie-nest raids, scavenging expeditions, resource recovery, defense events, and future special/story events.

- Treat event outcomes as simulation results with consequences rather than instant rewards triggered by UI buttons.

# B. NPC STATE MODEL — UPDATE

- Identity: stable ID, name, age, gender, background and presentation data.

- Needs/condition: health, hunger, thirst, energy, morale and future derived conditions.

- Base attributes: Strength, Agility, Endurance, Intelligence, Perception and other approved future attributes.

- Skills: learned competencies such as Gathering, Farming, Construction, Crafting, Cooking, Medicine, Scavenging, Hunting and Combat.

- Traits/perks: modifiers to behavior, learning, efficiency, risk, carrying capacity or special actions.

- Inventory: item IDs, quantities, unit weights and current load.

- Equipment: equipped item IDs and rule-driven effects.

- Occupation: current work profile, priorities and behavior preferences.

- Task state: current task, target, progress, ETA, reservation state and failure reason.

- Progression: experience, skill progression, attribute progression where approved, specialization and unlocks.

- Capabilities: actions the survivor can currently perform based on state, skills, equipment, facilities and conditions.

# C. ATTRIBUTES VS SKILLS — NEW DESIGN RULE

Attributes represent broad characteristics of the survivor. Skills represent learned competencies. An attribute should influence several related activities, while a skill should represent increasing mastery of a specific activity. This prevents the progression system from becoming a collection of unrelated numbers.

| Layer      | Examples                                                         | Purpose                                      |
|------------|------------------------------------------------------------------|----------------------------------------------|
| Attributes | Strength, Agility, Endurance, Intelligence, Perception           | Broad physical/mental capability             |
| Skills     | Woodcutting, Farming, Construction, Medicine, Scavenging, Combat | Learned task proficiency                     |
| Traits     | Fast Learner, Strong, Night Owl, Scavenger                       | Persistent modifiers and behavioral identity |
| Needs      | Health, Hunger, Thirst, Energy, Morale                           | Current condition                            |
| Equipment  | Axe, weapon, armor, tool                                         | Action-specific modifiers and capabilities   |

# D. NPC ACTION/FUNCTION MODEL — UPDATE

Eating, drinking, resting, sleeping, healing, equipping, unequipping, picking up, dropping, moving, gathering, farming, hunting, scavenging, crafting, repairing, building, guarding and combat should be simulation actions rather than direct property mutations.

A command such as survivor.eat(food) requests an action. The simulation validates access, availability, conditions and resource requirements, then executes the action over simulation time and produces the resulting state changes and events.

- eat()

- drink()

- rest()/sleep()

- heal()

- equip()/unequip()

- pickup()/drop()/transfer()

- moveTo()

- gather()/farm()/hunt()/scavenge()

- craft()/cook()

- repair()/build()

- guard()/attack()/retreat()

- joinEvent()/leaveEvent() where the event rules permit it
