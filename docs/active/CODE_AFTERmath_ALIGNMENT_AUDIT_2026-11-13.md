# CODE: AFTERMATH — Codebase Alignment Audit
## Revision: 2026-11-13

## 1. Executive verdict

The codebase is **substantially aligned with the latest game architecture**, especially after the 2026-11-12 real-time pivot and 2026-11-13 stabilization pass.

The important architectural chain is now present:

```text
Learner JavaScript
    ↓
Safety Validator
    ↓
Worker Sandbox
    ↓
Game API v1
    ↓
Command Builder
    ↓
Action Queue / Lifecycle
    ↓
Simulation Tick
    ↓
Authoritative GameState
    ↓
Event Log + Read-only Projection
    ↓
Renderer / Inspector / Lesson Feedback
```

The major finding is no longer the old "UI bypasses the sandbox" problem. That issue is fixed in the current source.

However, the repository still contains **documentation and test-suite drift** from the former turn-based design. The live implementation follows the real-time design, while several historical correction documents and `tests/turns.test.js` still expect the removed turn system.

### Overall status

| Area | Status | Finding |
|---|---|---|
| Authoritative simulation | ✅ | Correct architectural owner of GameState |
| Sandbox boundary | ✅ | Free-play code and lessons use the Worker path |
| Game API | ✅ | Versioned command boundary is present |
| Real-time clock | ✅ | Play/pause/speed is implemented |
| Standing gather | ✅ | R2 model is implemented |
| Replace/queue semantics | ✅ | Implemented in session layer |
| Resource reservation | ✅ | Ledger and in-flight gather protection exist |
| Projection/render boundary | ✅ | Renderer consumes projection |
| Asset resolver | 🟡 | Correct contract, placeholder atlas only |
| Stage 1 world | ✅ | Fence, HQ, tent, storage, gate, forest/path exist |
| Learner shell | 🟡 | Strong foundation; step/inspect still missing |
| Curriculum | 🟡 | 7 starter lessons pass, but pedagogy needs strengthening |
| Capability system | 🟡 | Core factors exist; equipment/building modifiers remain incomplete |
| Carry/deposit | ❌ | Not implemented yet; correctly deferred to R3 |
| Skill progression | ❌ | Not implemented yet |
| Advanced survival automation | ❌ | R4 planned |
| Production/events/combat | ❌ | Correctly deferred |
| Test suite health | ❌ | 8 obsolete turn tests still fail |
| Documentation consistency | ❌ | Several old turn-model docs are still presented as active |

---

# 2. Critical correction: the old audit is now historical

`docs/correction/CODE_AFTERmath_AUDIT.md` contains findings that were valid before R1/R2 but are no longer valid against the current code.

For example, the old audit states that:

- the code editor bypasses the sandbox;
- the UI uses a turn budget;
- PLAY/PAUSE are fake;
- the renderer cannot draw the fence perimeter.

Those findings were subsequently corrected.

Therefore:

> Do not use the old audit as the current implementation truth.

Use these documents as the active source of truth:

1. `docs/game/15-realtime-simulation-and-tasks.md`
2. `docs/IMPLEMENTATION_PLAN_2026-11-13.md`
3. this alignment audit
4. the revised strict implementation guidelines
5. the revised curriculum document

The older correction documents should be labelled **HISTORICAL** rather than silently treated as current requirements.

---

# 3. Current code alignment

## 3.1 Sandbox and learner boundary — ALIGNED

Current free-play execution is:

```text
mainscreen
  → app.runCode()
  → runLiveCode()
  → sandbox.run()
  → Worker
  → Game API
  → submitCalls()
  → sim.submitCommand()
```

This correctly prevents the UI from becoming a second command parser.

### Required rule

No future UI may parse learner JavaScript into commands itself.

Bad:

```text
textarea → regex → command
```

Correct:

```text
textarea → sandbox → Game API → command
```

---

# 4. Real-time simulation — ALIGNED

The current implementation correctly follows the latest real-time design.

The old turn model is removed from the live simulation.

The active model is:

```text
Clock Driver
    ↓
sim.step(n)
```

The clock owns:

- play
- pause
- speed
- frame pacing

The simulation owns:

- ticks
- action execution
- state changes
- event generation

This separation is correct.

### Important

Do not reintroduce:

- `startTurn()`
- `executeTurn()`
- `getTurnInfo()`
- `NEXT TURN`
- 3-command-per-turn limits

Those belong to the historical model.

---

# 5. Standing actions — ALIGNED

`gather()` correctly follows the new standing-action concept.

The learner can write:

```js
survivor.gather("wood", 10, 30);
```

The simulation can continue the job across multiple ticks/trips.

The action ends because of simulation-defined stop reasons such as:

- `TARGET_REACHED`
- `STORAGE_FULL`
- `NO_TARGET`
- `EXHAUSTED`

This is an important educational improvement because the learner now writes intent instead of manually simulating every tick.

---

# 6. Replace and queue semantics — ALIGNED

The current session layer implements:

```text
first command for survivor → replace current task
subsequent commands → queue
survivor.queue() → append instead of replace
```

This should remain the standard learner mental model.

Example:

```js
survivor.gather("wood", 20);
survivor.rest();
survivor.eat();
```

means:

```text
gather
  ↓
rest
  ↓
eat
```

The simulation decides when each task actually starts.

---

# 7. Renderer and asset architecture — ALIGNED, but incomplete

The renderer now correctly consumes the render projection.

The architecture is:

```text
GameState
   ↓
Render Projection
   ↓
Semantic Animation / Object State
   ↓
Asset Resolver
   ↓
Atlas Frame
   ↓
Canvas
```

The fence perimeter is now rendered from authoritative bounds.

The remaining limitation is that the atlas is still a generated placeholder atlas.

### Current status

Correct architecture:

- semantic asset IDs
- fallback resolver
- fixed frame dimensions
- stable pivot
- 8 directions
- animation timing
- building condition states
- projection-only renderer

Not yet complete:

- production NPC art
- production building art
- full action atlas states
- final resource visuals

This is acceptable for the current phase.

---

# 8. Stage 1 world — ALIGNED

The current Stage 1 scenario now contains the intended starter settlement structure:

- central HQ
- square perimeter fence
- tent
- ruined storehouse
- damaged gate
- outside path
- forest zone
- trees
- rock
- survivor

The correct rule is:

> Stage 1 is a controlled teaching environment, not the final apocalypse map.

Do not add raids, zombie waves, combat or complex production just because those objects are planned in the larger game.

---

# 9. UI alignment

The current UI is much closer to the intended architecture.

Correct:

- map view
- survivor inspection
- needs
- attributes
- skills/read surface
- equipment/inventory presentation
- current task
- event feed
- learner code editor
- lesson drawer
- progress
- save/load
- play/pause/speed

Still incomplete:

- step/inspect execution mode
- advanced task assignment UI
- capability explanation UI
- progression UI
- production UI
- event UI
- combat UI

### Strict UI rule

A visible control is allowed only if:

1. the underlying simulation system exists, and
2. the control calls the authoritative application path.

Otherwise it must be:

- hidden, or
- visibly disabled and labelled as future functionality.

---

# 10. Curriculum implementation audit

## Current result

The current curriculum contains 7 lessons:

### Module 1 — Basic survival commands

1. First Wood
2. Rest First
3. Mend the Fence

### Module 2 — Programming structure

4. Loop It
5. Let There Be Wood

### Module 3 — Decision and reuse

6. When to Gather
7. A Task Explained

All 7 starter solutions currently pass the lesson validator.

That means the curriculum is **technically executable**.

However, "technically passable" is not the same as "pedagogically complete."

---

# 11. Curriculum weaknesses

## Weakness A — API knowledge is implicit

The learner is given starter code and API hints, but there is no dedicated lesson that teaches:

```text
What is an object?
What is survivor?
What does survivor.needs.energy mean?
What is read-only information?
What is a command?
What is the difference between reading and changing?
```

### Required improvement

Add a short orientation lesson before Module 1.

---

## Weakness B — Module 1 jumps from action to control structure

The sequence is currently:

```text
gather
→ if
→ repair
```

This works, but the learner should first understand:

```text
observe
→ choose
→ command
→ simulation executes
→ inspect result
```

That should become the foundational loop of the curriculum.

---

## Weakness C — Module 2 teaches syntax before resource planning

Loops and variables are introduced correctly, but the learner should understand why repetition is useful.

The intended learning progression should be:

```text
manual repetition
→ identify repetition
→ variable controls repetition
→ loop automates repetition
```

The current lessons partially achieve this, but the variable and loop lessons should explicitly connect their programming concept to survival automation.

---

## Weakness D — Condition lesson does not strongly test both branches

`m3_c_condition` requires an `if`, but its goal primarily checks final energy.

That can verify that the learner used a condition, but it does not strongly prove that the learner understands:

```js
if (...) {
    // one decision
} else {
    // alternate decision
}
```

### Required improvement

Future condition lessons should include hidden scenarios where:

- condition is true
- condition is false

and the correct behavior differs.

The validator should verify the resulting behavior, not merely the presence of the word `if`.

---

## Weakness E — Function lesson tests syntax more than reuse reasoning

The current function lesson checks for:

```js
function
```

and checks the final wood amount.

A learner could technically satisfy the syntax requirement without demonstrating meaningful abstraction.

### Required improvement

Future function lessons should require:

- a reusable function
- a parameter
- different calls using the parameter
- a meaningful resulting state

---

# 12. Revised curriculum architecture

The curriculum should follow this dependency:

```text
M0 — Orientation
    ↓
M1 — Observe and Command
    ↓
M2 — Variables and Repetition
    ↓
M3 — Decisions
    ↓
M4 — Functions
    ↓
M5 — State and Resource Planning
    ↓
M6 — Capability and Task Resolution
    ↓
M7 — Automation / Policies
    ↓
M8 — Carry and Logistics
    ↓
M9 — Events and Risk
    ↓
M10 — Advanced Automation
```

The first 3 modules remain intentionally small.

---

# 13. Revised lesson design rule

Every lesson must contain five layers:

```text
1. Concept
2. Game problem
3. Learner code
4. Simulation consequence
5. Reflection / feedback
```

Example:

```text
Concept:
    if/else

Game problem:
    survivor is tired

Code:
    inspect energy
    decide whether to rest

Simulation:
    energy changes over time

Feedback:
    explain why the decision succeeded or failed
```

Do not make lessons merely "write this syntax."

---

# 14. Validator rules

The lesson validator must prefer behavioral validation.

Weak:

```text
code contains "if"
```

Strong:

```text
the learner used a decision
AND
the correct action occurred in the true scenario
AND
the alternate action occurred in the false scenario
```

Syntax checks may remain as supporting checks when a lesson explicitly teaches a construct, but they must not be the primary proof of learning.

---

# 15. Current test-suite problem

Running the current repository test suite produced:

```text
132 tests
124 passed
8 failed
```

The 8 failures come from `tests/turns.test.js`.

Those tests expect the removed system:

- `runTurnCode`
- `getTurnInfo`
- `executeTurn`
- turn command budgets
- `NEXT TURN`

This is **test/documentation drift**, not evidence that the current real-time implementation is failing.

### Required correction

The obsolete turn tests must be removed or replaced with R1/R2 tests.

The repository must not report a green phase while `npm test` is red.

---

# 16. Required acceptance gate

Before declaring the current real-time phase complete:

```text
npm test
    ↓
0 failures
    ↓
real-browser smoke
    ↓
0 console errors
    ↓
lesson starters pass
    ↓
deterministic replay passes
    ↓
save/load replay hash passes
    ↓
deep soak passes
```

Only then may the next gameplay phase begin.

---

# 17. Final verdict

The implementation is **not fundamentally off-plan**.

It has moved substantially closer to the intended design.

The biggest remaining problems are:

1. obsolete turn-model tests
2. stale historical documentation
3. curriculum validation that is sometimes syntax-oriented instead of behavior-oriented
4. incomplete production assets
5. incomplete step/inspect learning UI
6. future systems not yet implemented, but correctly deferred

The correct strategy is **not to rewrite the engine**.

The correct strategy is to clean the source of truth, repair the test/documentation drift, strengthen the curriculum validator, and then continue from R4/R3 in the dependency order.
