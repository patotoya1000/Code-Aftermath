# CODE: AFTERMATH — Strict Implementation Guidelines
## Revision: 2026-11-13

> This document is the enforcement guide for future implementation work.
> If another document conflicts with this guide, the latest approved real-time simulation specification wins.

---

# 1. Source-of-truth hierarchy

Use this order:

1. `docs/game/15-realtime-simulation-and-tasks.md`
2. `docs/IMPLEMENTATION_PLAN_2026-11-13.md`
3. current validated architecture and tests
4. `docs/game/` architecture/design rules
5. historical correction documents

Historical turn-based documents must never be used to reintroduce the turn model.

---

# 2. Non-negotiable architecture

The application must preserve:

```text
Learner
  ↓
Sandbox
  ↓
Game API
  ↓
Command
  ↓
Simulation
  ↓
GameState
  ↓
Projection
  ↓
UI / Renderer
```

No UI layer may become an alternate simulation engine.

---

# 3. Simulation authority

Only the simulation may mutate authoritative gameplay state.

Learner code may not directly set:

- health
- hunger
- thirst
- energy
- morale
- attributes
- skills
- XP
- inventory
- carry capacity
- task status
- building health
- resource quantities
- event results

Learner code expresses intent.

---

# 4. Game API authority

All learner actions must enter through the versioned Game API.

Do not create:

```text
UI-specific command parsers
lesson-specific command parsers
regex command execution
duplicate argument validation
direct simulation mutation from UI
```

Correct:

```text
JavaScript → Sandbox → API → Command Builder → Simulation
```

---

# 5. Real-time rule

The active simulation has **no turns**.

Never add:

- `startTurn`
- `executeTurn`
- `getTurnInfo`
- `NEXT TURN`
- 3-command-per-turn limits

The simulation advances through:

```text
clock.update()
    ↓
sim.step(n)
```

The clock controls presentation timing.

The simulation controls game rules.

---

# 6. Strategy points

Strategy points are not a turn budget.

They are a command-resource system:

```text
initial = 10
maximum = 10
command cost = 1
regeneration = data-driven
```

Do not recharge them by starting a turn.

---

# 7. Standing actions

Standing actions must follow:

```text
QUEUED
→ VALIDATING
→ RESERVED
→ EXECUTING
→ COMPLETED
```

or:

```text
FAILED
CANCELLED
```

A standing action may execute multiple work batches.

Every standing action must define:

- start condition
- work unit
- resource reservation
- progress
- stop reasons
- cancellation behavior
- completion behavior
- event output

---

# 8. Gather rule

For gather:

```text
resource node
    ↓
select target
    ↓
reserve resource
    ↓
reserve destination storage
    ↓
walk
    ↓
work
    ↓
commit
    ↓
repeat
```

Never allow:

```text
resource duplication
negative stock
storage overfill
double reservation
partial-batch accounting errors
```

---

# 9. Replace/queue rule

For each survivor:

```text
first command → replace current task
later commands → queue
survivor.queue() → append after existing queue
```

This rule must be documented and tested.

---

# 10. Projection rule

The renderer may consume only a projection.

Correct:

```text
GameState → Render Projection → Renderer
```

Incorrect:

```text
Renderer → GameState
Renderer → Simulation
Renderer → mutation
```

The renderer may calculate:

- animation frame
- interpolation
- selection
- presentation effects

It may not decide:

- whether a task completes
- whether a resource is consumed
- whether damage occurs
- whether a survivor dies
- whether a building upgrades

---

# 11. Asset rule

Assets must be semantic.

Examples:

```text
npc_survivor_gather_down
building_fence_lv1_damaged
node_tree_available
```

Do not bind gameplay directly to:

```text
image001.png
red-circle.png
sprite7.png
```

Gameplay state selects a semantic asset state.

The resolver selects the actual frame.

---

# 12. Placeholder art rule

Placeholder art is allowed only when:

- the semantic asset contract already exists;
- the placeholder can be replaced without gameplay changes;
- the placeholder does not create a fake gameplay mechanic.

Do not treat generated placeholder sprites as final art.

---

# 13. UI honesty rule

Every visible control must be truthful.

If a system does not exist:

### Preferred

Do not show the control.

### Acceptable

Show it disabled and clearly marked:

```text
Coming in Phase R3
Coming in Phase I7
```

### Forbidden

A clickable button that looks functional but does nothing.

---

# 14. Data-driven rule

Game values belong in definitions/data where practical.

Do not hardcode gameplay constants in:

- renderer
- HTML
- CSS
- inspector
- lesson UI
- button handlers

Bad:

```js
const capacity = 22;
```

Correct:

```text
definition → simulation → projection → UI
```

---

# 15. Inventory and carry rule

Do not display a fake carry capacity before carry capacity exists.

Current phase:

```text
inventory quantity
+
item unit weight
```

Future R3:

```text
currentLoad
carryCapacity
encumbrance
```

These must be authoritative simulation values.

---

# 16. Attribute vs skill rule

Never merge attributes and skills.

Attributes:

```text
Strength
Agility
Endurance
Intelligence
Perception
```

Skills:

```text
Farming
Scavenging
Construction
Crafting
Combat
Medicine
...
```

Skills represent learned proficiency.

Attributes represent underlying capability.

Equipment and conditions modify effective capability without overwriting base values.

---

# 17. Progression rule

Learner code must never directly award XP.

Correct:

```text
task
→ capability
→ execution
→ result
→ learning evaluation
→ XP
→ level
→ unlock
```

Do not implement:

```js
survivor.skills.farming += 10;
```

---

# 18. Building rule

Building level must affect gameplay only through explicit data-driven modifiers.

Do not make:

```text
Level 2 = arbitrary +20 Strength
```

Instead define a task/building modifier relationship.

---

# 19. Curriculum rule

A lesson is not complete merely because code contains the expected keyword.

Prefer:

```text
behavioral proof
```

over:

```text
syntax proof
```

A syntax check may supplement behavioral checks.

---

# 20. Lesson independence

Every lesson must have:

- unique seed
- isolated scenario
- max execution time/ticks
- deterministic result
- independent retry
- explicit goals
- meaningful feedback

A failed attempt must not damage campaign progress.

---

# 21. Hidden scenario rule

For important concepts, hidden validation should vary the starting state.

Example:

```text
visible scenario:
    energy = 20

hidden scenario:
    energy = 80
```

A learner should understand the concept, not memorize one answer.

---

# 22. Anti-exploit lesson rule

A learner must not pass by:

- repeating an irrelevant command
- relying on one hardcoded state
- exploiting a final-value-only check
- exploiting a syntax keyword
- exploiting a fixed seed
- causing a failure and still satisfying a weak goal

---

# 23. New feature gate

Every new mechanic requires:

1. authoritative simulation implementation
2. Game API contract if learner-controlled
3. definition data
4. projection update
5. renderer/UI update if visible
6. unit/regression test
7. invariant/soak coverage where appropriate
8. browser smoke test when UI is involved
9. documentation update
10. curriculum update if it becomes a learning concept

No phase is complete until its gate passes.

---

# 24. Forbidden implementation shortcuts

Do not:

- duplicate simulation logic in UI
- duplicate API validation in UI
- hardcode future mechanics
- add fake buttons
- make renderer decide gameplay
- let learner code mutate state
- introduce turn mechanics
- use syntax-only lesson validation as the main proof
- skip deterministic replay
- skip regression tests
- declare a phase complete with failing tests

---

# 25. Completion gate

A phase is complete only when:

```text
implementation
+
tests
+
browser behavior
+
documentation
+
curriculum alignment
```

all agree.

A green-looking UI is not evidence of implementation completeness.

---

# 26. Required review questions before merging

Ask:

1. What authoritative system owns this behavior?
2. Is the learner allowed to request it?
3. What is the Game API contract?
4. What simulation state changes?
5. What projection changes?
6. What UI changes?
7. What test proves it?
8. What invariant protects it?
9. Can replay reproduce it?
10. Can a learner exploit it?
11. Does the curriculum teach it correctly?
12. Does any existing document contradict the implementation?

If any answer is unknown, the feature is not ready.

---

# 27. Current next implementation order

Use:

```text
S0–S5 cleanup
   ↓
remove obsolete turn tests/docs from active path
   ↓
R4a Needs Policies
   ↓
R4b Learner Event Hooks
   ↓
R3 Carry + Deposit
   ↓
R5 Timeline Lessons
   ↓
I6+ Collision / Events / Production
```

Do not jump directly to combat, advanced buildings or final assets.
