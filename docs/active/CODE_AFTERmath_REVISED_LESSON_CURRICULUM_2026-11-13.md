# CODE: AFTERMATH — Revised Lesson Curriculum
## Revision: 2026-11-13

## 1. Curriculum purpose

CODE: AFTERMATH is not simply a game with a code editor.

The simulation is the teaching environment.

The learner should progressively move from:

```text
observe
→ issue one command
→ inspect state
→ sequence commands
→ use variables
→ repeat work
→ make decisions
→ abstract behavior
→ reason about resources
→ automate survival
→ react to events
```

The game becomes more complex only when the programming concept requires it.

---

# 2. Core lesson loop

Every lesson should follow:

```text
CONCEPT
  ↓
GAME PROBLEM
  ↓
OBSERVE STATE
  ↓
WRITE CODE
  ↓
RUN SIMULATION
  ↓
OBSERVE CONSEQUENCE
  ↓
DEBUG
  ↓
REFLECT
```

This is more important than simply checking whether a keyword appears in the source code.

---

# 3. Revised curriculum stages

## M0 — Orientation

### Lesson 0.1 — Meet the Survivor

Teach:

- what the game world is
- what a survivor is
- what `survivor` represents
- what a command is
- difference between reading and changing state

Example observation:

```js
console.log(survivor.needs.energy);
console.log(survivor.x, survivor.y);
```

The learner should understand that these are read operations.

### Lesson 0.2 — Command vs State

Teach:

```text
read state
→ choose action
→ issue command
→ simulation changes state
```

Do not allow direct mutation.

---

# 4. M1 — Basic commands and sequencing

## Lesson 1.1 — First Wood

Concept:

```text
command + resource
```

Goal:

```text
gather wood
```

Current implementation is appropriate.

---

## Lesson 1.2 — Rest First

Concept:

```text
read a need
→ decide
→ act
```

Current implementation is directionally correct.

Improve the lesson feedback so it explicitly explains:

```text
survivor.needs.energy
```

is information the learner reads, not a variable they modify.

---

## Lesson 1.3 — Mend the Fence

Concept:

```text
sequence multiple tasks
```

Required reasoning:

```text
wood is required
→ gather wood
→ repair fence
```

This is the first resource dependency lesson.

---

# 5. M2 — Variables and repetition

## Lesson 2.1 — Let There Be Wood

Concept:

```text
variable stores a value
```

Required learner understanding:

```js
const amount = 10;
```

means the program can reuse a value.

Do not only check for `const`.

Also verify that the value influences a meaningful command.

---

## Lesson 2.2 — Loop It

Concept:

```text
repetition
```

Recommended learning progression:

```text
copy the same command
→ notice repetition
→ replace repetition with loop
```

The validator should verify the result and use of repetition.

---

# 6. M3 — Decisions

## Lesson 3.1 — When to Gather

Concept:

```text
if / else
```

The learner must:

```text
inspect energy
→ if tired: rest
→ otherwise: gather
```

### Validator requirement

Do not only check:

```regex
/if/
```

The final design should include hidden scenarios that test both branches.

---

## Lesson 3.2 — Protect the Survivor

Introduce multiple needs:

```text
energy
hunger
thirst
```

The learner must decide which survival action is required.

This becomes the bridge from simple syntax to survival reasoning.

---

# 7. M4 — Functions

## Lesson 4.1 — A Task Explained

Concept:

```text
function = reusable behavior
```

Current lesson is a good introduction but should evolve.

Required future proof:

```js
function gatherAmount(amount) {
    survivor.gather("wood", amount, amount);
}
```

Then call it with different values.

The validator should prove:

- function exists
- function is called
- parameter influences behavior
- resulting simulation state is correct

---

# 8. M5 — State and resource planning

Introduce:

- base stock
- resource nodes
- task result
- stop reason
- `lastTask`

Example reasoning:

```text
gather until target
→ inspect why it stopped
→ react
```

This teaches the learner that simulation results are data.

---

# 9. M6 — Capability and task resolution

Only introduce this module after capability systems are authoritative.

Teach:

```text
attribute
+
skill
+
equipment
+
condition
+
task difficulty
```

The learner should not calculate the final capability manually.

Instead:

```js
survivor.gather("wood");
```

lets the simulation resolve capability.

The lesson teaches the learner to inspect why an action succeeded or failed.

---

# 10. M7 — Policies and event-driven thinking

This module depends on R4.

Teach:

```text
standing task
→ condition changes
→ interrupt
→ survival action
→ resume
```

Example concept:

```text
gather
↓
energy low
↓
rest
↓
resume gathering
```

This is where the game begins teaching event-driven reasoning.

---

# 11. M8 — Carry and logistics

This depends on R3.

Teach:

```text
gather
→ carry
→ return
→ deposit
```

Programming concepts:

- capacity
- quantities
- resource conservation
- planning
- conditional return
- multi-step task sequences

---

# 12. M9 — Events and risk

This depends on the event framework.

Teach:

```text
preparation
→ travel
→ execution
→ risk
→ recovery
→ result
```

Programming concepts:

- state machines
- decision trees
- resource planning
- risk evaluation
- recovery logic

---

# 13. M10 — Advanced automation

Introduce:

- arrays
- objects
- iteration
- reusable planning functions
- helper functions
- event hooks
- automation policies
- debugging
- optimization

The learner should now be able to write meaningful survival programs rather than isolated syntax demonstrations.

---

# 14. Lesson validator architecture

Every lesson should classify goals into:

### A. Behavioral goals

Example:

```text
base contains at least 30 wood
```

### B. Structural goals

Example:

```text
program uses a loop
```

### C. Decision goals

Example:

```text
when energy < threshold → rest
when energy >= threshold → gather
```

### D. Safety goals

Example:

```text
no direct state mutation
no unsafe API use
```

### E. Efficiency goals

Later modules may evaluate:

```text
avoid unnecessary commands
avoid wasted resources
avoid unsafe repeated work
```

---

# 15. Behavioral validation rule

Preferred:

```text
"Did the learner solve the problem?"
```

over:

```text
"Did the learner type the keyword?"
```

Use syntax checks only when the lesson explicitly requires a programming construct.

---

# 16. Hidden validation

Important lessons should have more than one scenario.

For example:

```text
Visible:
energy = 20

Hidden A:
energy = 80

Hidden B:
energy = 10
```

The same learner program should make the correct decision in each case.

This prevents memorization.

---

# 17. Feedback design

Feedback should answer:

```text
What happened?
Why did it happen?
What state caused it?
What could the learner inspect?
What should they try next?
```

Bad:

```text
Wrong answer.
```

Better:

```text
Gathering stopped because energy reached the work minimum.
Inspect survivor.needs.energy before starting another work action.
```

---

# 18. Starter-code rule

Starter code should be a scaffold, not the solution disguised as a template.

Use progression:

### Early

```js
survivor.gather("wood", 10, 10);
```

### Intermediate

```js
const amount = 10;
survivor.gather("wood", amount, amount);
```

### Later

```js
function gatherWood(amount) {
    survivor.gather("wood", amount, amount);
}
```

### Advanced

Require the learner to construct the solution with minimal scaffolding.

---

# 19. Curriculum-to-game dependency matrix

| Module | Programming | Game dependency |
|---|---|---|
| M0 | observation/API | Stage 1 |
| M1 | commands/sequencing | Stage 1 |
| M2 | variables/loops | standing gather |
| M3 | conditions | needs |
| M4 | functions | task API |
| M5 | state/resource reasoning | stop reasons |
| M6 | capability reasoning | capability system |
| M7 | event-driven logic | R4 |
| M8 | logistics | R3 |
| M9 | state/risk reasoning | event framework |
| M10 | advanced automation | R4/R5/events |

---

# 20. Current seven lessons — disposition

| Existing lesson | Decision |
|---|---|
| First Wood | KEEP |
| Rest First | KEEP + improve explanation |
| Mend the Fence | KEEP |
| Loop It | KEEP + improve behavioral validation |
| Let There Be Wood | KEEP + validate variable usage |
| When to Gather | KEEP + add true/false branch validation |
| A Task Explained | KEEP + later add parameterized reuse |

Do not discard the existing seven lessons.

They are a valid first curriculum slice.

The required change is to strengthen their educational validation and place them inside the larger dependency-aware curriculum.

---

# 21. Current curriculum completion gate

The first curriculum release is complete only when:

- all seven starter lessons pass;
- failed attempts do not affect saved progress;
- lesson scenarios are deterministic;
- behavioral goals are tested;
- required syntax checks are secondary;
- feedback explains simulation causes;
- learner cannot mutate authoritative state;
- hidden scenarios exist for decision-based lessons;
- replay reproduces the attempt.

---

# 22. Final educational principle

The game should teach this mental model:

```text
I do not tell the game what the survivor's state is.

I inspect the state.

I express an intention.

The simulation resolves that intention.

I observe the result.

I use the result to make my next decision.
```

That principle is the bridge between the survival game and the programming curriculum.
