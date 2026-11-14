> **HISTORICAL — DO NOT USE AS ACTIVE IMPLEMENTATION REQUIREMENT**
> Written for the turn-based / correction phase. It may describe removed mechanics (turns, NEXT TURN, per-turn command caps).
> Active sources of truth: [`docs/game/15-realtime-simulation-and-tasks.md`](../game/15-realtime-simulation-and-tasks.md) and [`docs/active/`](../active/).

# CODE: AFTERMATH --- Implementation Phases After Correction

## Principle

These phases implement the game in dependency order.

Do not implement advanced gameplay before the systems that those
mechanics depend on.

------------------------------------------------------------------------

# I0 --- Stable Foundation

> **Status (2026-11-12):** ✅ done. C9 browser smoke passes (run on Chromium 1243; re-run `npm run smoke` locally to confirm). Review fixes: prototype-key lookups hardened, budget only spent on accepted commands, gather prefers a node that fills the request. Same seed + code + version ⇒ same hashes is covered by `tests/gate-phase0.test.js`.

### Deliverable

A corrected Stage 1 game shell.

### Required

-   sandboxed learner code
-   Game API v1
-   action queue
-   simulation tick
-   resource reservation
-   deterministic event log
-   projection layer
-   working Next Turn
-   working Survivor Card
-   working renderer
-   semantic asset resolver

### Acceptance

Same seed + same code + same version produces the same state/event
hashes.

------------------------------------------------------------------------

# I1 --- Production Render and NPC Asset System

> **Status (2026-11-11):** 🟡 partial — in-code **placeholder** atlas covers every state the simulation can emit (IDLE, WALK, GATHER, REPAIR, REST, EAT, DRINK, DOWNED), 8 directions, fixed frame, foot pivot, fallback resolver and animation timing. Production art, and CRAFT/GUARD/ATTACK/HIT/DEAD (no simulation behind them yet) are not done.

### Deliverable

Real simple NPC sprites.

### Tasks

-   [ ] Production NPC atlas.
-   [x] Transparent background.
-   [x] Fixed frame dimensions.
-   [x] Stable foot pivot.
-   [x] 8 directions.
-   [x] IDLE.
-   [x] WALK.
-   [x] GATHER.
-   [x] REPAIR.
-   [x] REST.
-   [x] EAT.
-   [x] DRINK.
-   [ ] CRAFT.
-   [ ] GUARD.
-   [ ] ATTACK.
-   [ ] HIT / INJURED.
-   [x] DOWNED.
-   [ ] DEAD.
-   [x] Fallback resolver.
-   [x] Animation timing.

### Rule

Animation never changes gameplay state.

------------------------------------------------------------------------

# I2 --- Stage 1 World Completion

> **Status (2026-11-12):** ✅ done. Ruined storehouse (repairable placeholder, no capacity until I5), damaged gate on the fence line (fence leaves the cell open), outside path, forest zone, world labels. Scenario layout is validated at load time.

### Deliverable

A readable starter settlement.

### Tasks

-   [x] Square fence.
-   [x] Central HQ.
-   [x] Tent/housing.
-   [x] Ruined storage placeholder.
-   [x] Gate.
-   [x] Forest/outside path.
-   [x] Trees.
-   [x] Rocks.
-   [x] Basic resource nodes.
-   [x] Simple world labels/markers where useful.
-   [x] Selection and inspection.

### Rule

Do not add advanced events yet.

------------------------------------------------------------------------

# I3 --- Learner Shell and Curriculum

> **Status (2026-11-12):** 🟡 in progress. Lesson player UI implemented (lesson list, instructions, results, progress screen). Curriculum expanded to 7 lessons across Modules 1–3 with per-lesson seeds. Step/inspect mode state reserved but UI pending.

### Deliverable

The programming-learning interface.

### Tasks

-   [x] Real JavaScript editor (free-play + lesson mode)
-   [x] Safety feedback (sandbox violations → structured learner messages)
-   [x] API reference (auto-generated from `api/v1.js`)
-   [ ] Step/inspect mode (state reserved in mainscreen.js; UI pending)
-   [x] Lesson instructions (guided brief + goals + starter code)
-   [x] Starter code (per-lesson starter snippets)
-   [x] Error explanations (FAILURE_HINTS + friendlyError formatting)
-   [x] Progress tracking (lesson list with passed/attempted/not-started status)
-   [x] Replay (deterministic replayTimeline + verifyReplay)
-   [x] Save/load (IndexedDB + memory adapter)
-   [x] Hidden seeded lesson scenarios (unique seed per lesson)

### Educational rule

The learner expresses intent.

The learner does not directly mutate:

-   health
-   hunger
-   thirst
-   energy
-   XP
-   attributes
-   inventory weight
-   carry capacity
-   task completion

------------------------------------------------------------------------

# I4 --- Capability and Task Resolution

### Deliverable

Actions become dependent on survivor capability.

### Tasks

-   [x] Attribute definitions.
-   [x] Skill definitions.
-   [x] Trait definitions.
-   [x] Need effects (tired/hungry/thirsty slow work).
-   [ ] Equipment effects.
-   [x] Capability checks.
-   [x] Task factor definitions.
-   [ ] Building modifiers (per-level functional effects).
-   [x] Failure reasons (CAPABILITY_INSUFFICIENT).
-   [x] Task duration calculations (durationModifier).
-   [x] Output calculations (outputModifier).

### Example

Effective task performance can depend on:

`base task difficulty`

-   

`skill`

-   

`attribute`

-   

`equipment`

-   

`condition`

-   

`building modifier`

The exact coefficients remain data-driven.

------------------------------------------------------------------------

# I5 --- Inventory, Carry and Multi-Survivor System

### Deliverable

Survivors can actually gather, carry and deposit resources.

### Tasks

-   [ ] Multiple survivors.
-   [ ] Inventory quantities.
-   [ ] Unit weights.
-   [ ] Carry capacity.
-   [ ] Encumbrance.
-   [ ] Pickup.
-   [ ] Transfer.
-   [ ] Deposit.
-   [ ] Storage.
-   [ ] Task queues.
-   [ ] Concurrent work.

### Required flow

`Gather → Carry → Return → Deposit`

### Rule

Carry values are simulation-derived, not UI constants.

------------------------------------------------------------------------

# I6 --- Skill Progression

### Deliverable

Survivors improve through meaningful work.

### Tasks

-   [ ] Skill XP.
-   [ ] XP thresholds.
-   [ ] Diminishing returns.
-   [ ] Difficulty weighting.
-   [ ] Learning opportunity.
-   [ ] Training buildings.
-   [ ] Training bonuses.
-   [ ] Specialization unlocks.
-   [ ] Progression UI.

### Rule

Repeated work can increase a skill.

It must not automatically increase every base attribute.

------------------------------------------------------------------------

# I7 --- Production Systems

### Deliverable

The settlement becomes a functioning survival base.

### Tasks

-   [ ] Farming.
-   [ ] Planting.
-   [ ] Watering.
-   [ ] Harvesting.
-   [ ] Crafting.
-   [ ] Cooking.
-   [ ] Production queues.
-   [ ] Workstations.
-   [ ] Material inputs.
-   [ ] Product outputs.
-   [ ] Production failure reasons.

### Visual rule

Production buildings should have meaningful level/state visuals.

------------------------------------------------------------------------

# I8 --- Environment Simulation

### Deliverable

The world gains time and environmental pressure.

### Tasks

-   [ ] Day/night.
-   [ ] Weather.
-   [ ] Environmental modifiers.
-   [ ] Resource regeneration.
-   [ ] World-state events.
-   [ ] Time-based risk.

### Rule

Environmental effects modify simulation state.

Visual effects remain downstream presentation.

------------------------------------------------------------------------

# I9 --- Event Framework

### Deliverable

The game can represent expedition and defense events.

### Canonical event pipeline

`Preparation → Travel → Execution → Risk → Recovery → Result`

### First events

-   [ ] Supply scavenging.
-   [ ] Zombie nest raid.
-   [ ] Defense wave.
-   [ ] Resource expedition.

### Required event data

-   event ID
-   participants
-   target
-   preparation
-   travel
-   execution
-   risk
-   consequences
-   recovery
-   result
-   event log entries

------------------------------------------------------------------------

# I10 --- Combat and Enemies

### Deliverable

Combat is added only after event infrastructure exists.

### Tasks

-   [ ] Enemy state model.
-   [ ] Enemy taxonomy.
-   [ ] Enemy behavior.
-   [ ] Combat actions.
-   [ ] Damage.
-   [ ] Defense.
-   [ ] Injury.
-   [ ] Downed/death.
-   [ ] Zombie waves.
-   [ ] Special enemy variants.
-   [ ] Screamer design once enemy visual rules are finalized.

### Visual rule

Enemy visuals remain separate from survivor visual architecture.

------------------------------------------------------------------------

# I11 --- Buildings and Infrastructure

### Deliverable

Meaningful settlement progression.

### Tasks

-   [ ] Building levels.
-   [ ] Upgrade requirements.
-   [ ] Functional modifiers.
-   [ ] Construction tasks.
-   [ ] Repair.
-   [ ] Damage states.
-   [ ] Building tree.
-   [ ] Upgrade UI.
-   [ ] Matching world visuals.

### Rule

World renderer, Building Tree and Upgrade UI read the same building
definitions.

------------------------------------------------------------------------

# I12 --- Advanced Programming Lessons

### Deliverable

The survival simulation becomes the programming-learning environment.

### Lessons can introduce:

-   variables
-   conditions
-   loops
-   functions
-   arrays
-   objects
-   iteration
-   decision making
-   task planning
-   resource management
-   debugging
-   event-driven reasoning
-   automation

### Progression rule

Programming complexity increases gradually.

Game complexity should not be increased merely to make code harder.

------------------------------------------------------------------------

# I13 --- Balancing and Hidden Scenarios

### Tasks

-   [ ] Difficulty curves.
-   [ ] Lesson-specific seeds.
-   [ ] Hidden validation scenarios.
-   [ ] Anti-exploit XP rules.
-   [ ] Resource balance.
-   [ ] Action timing.
-   [ ] Survival pressure.
-   [ ] Event probability.
-   [ ] Recovery costs.

### Acceptance

A learner cannot pass a lesson by exploiting a single trivial repeated
command.

------------------------------------------------------------------------

# I14 --- Final Asset Production

### Tasks

-   [ ] Final NPC atlas.
-   [ ] Final buildings.
-   [ ] Resource visuals.
-   [ ] Materials.
-   [ ] Consumables.
-   [ ] Weapons.
-   [ ] Enemy sprites.
-   [ ] Event markers.
-   [ ] Effects.
-   [ ] UI icons.
-   [ ] Portrait assets.

### Rule

Do not create asset combinations for every:

`occupation × skill × trait × equipment × level`

Use semantic state and controlled modular layers.

------------------------------------------------------------------------

# I15 --- Offline Release

### Tasks

-   [ ] Offline-first validation.
-   [ ] Bundled assets.
-   [ ] IndexedDB save/load.
-   [ ] Mobile layout.
-   [ ] Touch interaction.
-   [ ] Performance testing.
-   [ ] Worker compatibility.
-   [ ] Asset loading tests.
-   [ ] Save integrity tests.

### Final acceptance

The application runs consistently as a web build
and packaged portable application without changing authoritative game logic.

------------------------------------------------------------------------

# Final implementation dependency chain

``` text
Correction
   ↓
Sandbox + Turn Control
   ↓
Projection + Renderer
   ↓
Asset Resolver
   ↓
NPC / Building Visuals
   ↓
Learner Shell
   ↓
Capability / Task Resolution
   ↓
Inventory / Carry
   ↓
Skill Progression
   ↓
Production
   ↓
Environment
   ↓
Events
   ↓
Combat / Enemies
   ↓
Infrastructure
   ↓
Advanced Lessons
   ↓
Balancing
   ↓
Final Assets
   ↓
Portable Release
```

------------------------------------------------------------------------

# Implementation rule

Do not skip dependency gates.

For example:

Do not implement combat UI before the combat simulation exists.

Do not implement skill-level sprites before skill progression exists.

Do not implement carry-load UI with hardcoded values before carry
capacity is authoritative.

Do not implement a real-time Play button while the current simulation is
turn-based.

Do not implement a code editor that bypasses the sandbox.

The UI should always be a projection of systems that already exist.
