> **HISTORICAL — DO NOT USE AS ACTIVE IMPLEMENTATION REQUIREMENT**
> Written for the turn-based / correction phase. It may describe removed mechanics (turns, NEXT TURN, per-turn command caps).
> Active sources of truth: [`docs/game/15-realtime-simulation-and-tasks.md`](../game/15-realtime-simulation-and-tasks.md) and [`docs/active/`](../active/).

# CODE: AFTERMATH --- Implementation & UI Audit

## Audit basis

This audit compares:

1.  The uploaded CODE: AFTERMATH codebase.
2.  `CODE_AFTERmath_GAME_LOGIC_ARCHITECTURE_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx`.
3.  `CODE_AFTERmath_ASSET_SPRITE_OBJECT_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx`.
4.  `docs/PHASES.md`.
5.  The supplied runtime screenshot.

The conclusion is not that the project is fundamentally broken. The core
simulation architecture is actually a strong foundation. The main
problem is **phase drift and contract drift**: the UI and renderer were
built ahead of the documented roadmap, but they were not completed
according to the same rules. This produced a convincing-looking game
shell whose visible controls and visuals imply systems that are not
actually implemented.

------------------------------------------------------------------------

## 1. Overall verdict

### Architecture: GOOD FOUNDATION, PARTIALLY ALIGNED

The underlying engine follows the important rule:

`Learner intent → API → Action Queue → Preconditions → Reservation → Simulation Tick → State Mutation → Event Log → Projection`

The simulation is the authoritative writer, projections are read-only,
and resource reservations are tested.

This is the correct direction.

### Current implementation: PARTIAL / PHASE-MISALIGNED

The repository says Phase 1 is complete and Phase 2 is next, but the
current `mainscreen.js` and `renderer.js` already attempt to implement
parts of Phase 2 and Phase 3.

The result is a hybrid:

-   old `debugview` still exists;
-   new `render/renderer.js` exists;
-   no real `assets` module exists;
-   no real atlas resolver exists;
-   no production sprite system exists;
-   the new main screen contains controls that do not actually control
    the simulation;
-   the new code editor does not execute learner JavaScript through the
    sandbox;
-   turn-budget rules are bypassed by the new code panel.

This should be corrected before adding more gameplay systems.

------------------------------------------------------------------------

# 2. Screenshot accuracy against the documents

## What is accurate

The screenshot correctly reflects several approved ideas:

### A. Observer / god-eyes world view

The center canvas is a top-down simulation map.

This matches the game rules.

### B. Survivor inspection

The right-side inspector contains:

-   health
-   hunger
-   thirst
-   energy
-   morale
-   attributes
-   equipment
-   current task area

This matches the Survivor Card / Inspector concept.

### C. Simple NPC visual language

The NPC is visually simple and low-detail.

That is consistent with the approved simple rounded / low-cognitive-load
NPC direction.

### D. Building / resource separation

The world distinguishes buildings, resource nodes and survivors.

That is directionally correct.

### E. Dark command-center presentation

The dark UI, compact panels and programming-laboratory presentation are
compatible with the intended post-apocalyptic command-center concept.

------------------------------------------------------------------------

# 3. Screenshot inaccuracies / important gaps

## A. The fence is not represented as the documented square perimeter

The Stage 1 data contains a fence with bounds:

`x1: 6, y1: 3, x2: 16, y2: 12`

The old debug renderer understands `bounds` and can draw the perimeter.

The new `render/renderer.js` does not. It only draws the fence as one
building tile.

Therefore the screenshot shows a single fence marker instead of the
intended protected settlement boundary.

### Correction

The render projection must preserve fence bounds and the renderer must
have a semantic perimeter/fence visual.

------------------------------------------------------------------------

## B. The screenshot is still a debug visualization, not the approved production visual architecture

The new renderer uses canvas primitives:

-   circles for NPCs
-   rectangles for buildings
-   text labels
-   colored dots
-   text letters for actions

The asset rules explicitly require:

`GameState → Render Projection → Asset Resolver → Sprite / Animation / UI`

The project currently has no real `assets` module and no production
atlas resolver.

### Correction

Do not keep expanding the primitive renderer as if it were the final
asset architecture.

Build the asset resolver contract first, then make the renderer consume
it.

------------------------------------------------------------------------

## C. NPC animation is only represented by a letter / marker

The screenshot's NPC visual uses a circle and an action marker.

The document requires semantic states such as:

-   IDLE
-   WALK
-   GATHER
-   REPAIR
-   CRAFT
-   EAT
-   DRINK
-   REST
-   GUARD
-   ATTACK
-   HIT / INJURED
-   DOWNED
-   DEAD

The current renderer calculates the semantic animation state, which is
good, but does not actually play an animation atlas.

### Correction

Keep the semantic animation state in the projection. Add a renderer-side
animation player and asset resolver.

------------------------------------------------------------------------

## D. The screenshot's simulation controls are misleading

The screenshot shows:

-   PAUSE
-   PLAY
-   `1×`

But the current `mainscreen.js` only changes UI variables/classes:

-   `simPaused`
-   `simSpeed`

They do not control simulation progression.

The actual simulation advances when `executeTurn()` or `step()` is
called.

Therefore:

**PAUSE is not actually pausing simulation.**

**PLAY is not actually playing simulation.**

**1× / 2× / 4× does not actually change simulation speed.**

### Correction

Remove these controls temporarily or replace them with the documented
command-console controls:

-   current turn
-   commands remaining
-   strategy points
-   `NEXT TURN`

If real-time simulation is introduced later, it needs an explicit
simulation-clock controller.

------------------------------------------------------------------------

# 4. Critical logic problem: the code editor bypasses the sandbox

This is the most important implementation problem.

The main screen's `runCode()` does this conceptually:

`textarea/contenteditable → regex → JSON.parse(args) → buildCommand() → freeSim.submit() → executeTurn()`

It does **not** run:

`Student JavaScript → Safety Validator → Worker Sandbox → Game API → Command Builder`

The repository already has the correct sandbox architecture in
`modules/sandbox`.

Therefore the new code editor is not actually a JavaScript learner
environment. It is a one-command text parser.

### Consequences

A learner can currently type only a pattern resembling:

`survivor.commandName(args)`

The editor cannot behave like the documented JavaScript learning
environment.

More importantly, the UI path bypasses the security/execution boundary
that the architecture was specifically designed to teach and enforce.

### Correction

The main code panel must call the same application-level execution path
used by lessons:

`app.runSandbox(...)` for script execution,

or a dedicated free-play sandbox execution API built on the same worker
boundary.

Do not duplicate parsing logic inside `mainscreen.js`.

------------------------------------------------------------------------

# 5. Critical logic problem: turn rules are bypassed

The simulation provides:

-   `submitCommand()`
-   command budget
-   strategy points
-   `startTurn()`
-   `executeTurn()`

The correct turn-based API is already implemented in `session/index.js`.

However, `runCode()` calls:

`freeSim.submit(command)`

instead of:

`freeSim.submitCommand(command)`

and then directly calls:

`freeSim.executeTurn()`

without starting a turn.

This means the new code panel can bypass the intended:

-   3 commands per turn
-   strategy-point cost
-   turn reset
-   turn progression

The existing `app.advanceTurn()` path already handles this correctly.

### Correction

Make the main screen use `app.advanceTurn()` or a dedicated wrapper
around it.

------------------------------------------------------------------------

# 6. Critical UI problem: dead buttons

The screenshot contains:

-   ASSIGN TASK
-   TASK
-   BUILD
-   SURVIVORS
-   RESEARCH
-   MENU
-   SETTINGS

The current `bindEvents()` does not attach meaningful behavior to these
controls.

They are visual affordances without corresponding application behavior.

### Correction

Either:

1.  implement each button according to a defined scope, or
2.  remove/hide it until the corresponding system exists.

Do not use decorative buttons that imply gameplay features that are not
available.

------------------------------------------------------------------------

# 7. Critical UI problem: hardcoded carry logic

`renderCarrySection()` currently uses:

-   `qty * 2` for item weight
-   `22` as maximum carry capacity

But the definitions already contain item weights:

-   wood = 2
-   stone = 4
-   food = 1
-   water = 1

The architecture document states that carry capacity should be derived
from survivor configuration, attributes and equipment effects.

The current Phase 5 system is not implemented.

Therefore the UI is showing a hardcoded future mechanic.

### Correction

Until Phase 5 is implemented:

-   either hide carry/encumbrance as a future feature,
-   or display only raw inventory quantities.

When Phase 5 begins, calculate:

`currentLoad = Σ(quantity × item.unitWeight)`

and derive:

`carryCapacity = baseCapacity + approved modifiers`

from authoritative simulation data.

Never hardcode `22` in the UI.

------------------------------------------------------------------------

# 8. Attribute / skill presentation needs correction

The screenshot's visible attributes are:

-   Strength
-   Intelligence
-   Agility
-   Endurance
-   Perception

This is reasonable for the current template.

However, the code contains an `order` array that also mentions
`crafting`.

`crafting` is a skill in the architecture direction, not an ordinary
base attribute.

The UI should clearly separate:

`ATTRIBUTES`

from:

`SKILLS`

when skills become active in Phase 4/6.

Do not merge skills into attributes just because both are numeric.

------------------------------------------------------------------------

# 9. Current world content is much smaller than the planned world

The current Stage 1 scenario contains:

-   HQ
-   tent
-   fence
-   3 trees
-   1 rock
-   1 survivor

The broader visual/game rules describe:

-   square settlement fence
-   central HQ
-   housing
-   ruined storage
-   gate
-   forest/outside path
-   trees
-   stones
-   huntable animals
-   scavenging locations
-   future event locations

This does not mean all of those should be implemented immediately.

It means the screenshot should be understood as a **Stage 1 prototype**,
not the final map architecture.

### Correction

Do not prematurely add every planned world object.

First make Stage 1 visually and logically correct.

Then expand the world through later phases.

------------------------------------------------------------------------

# 10. Two UI architectures currently coexist

The repository contains:

### Old path

`app/browser.js → modules/debugview`

### New path

`app/mainscreen.js → render/renderer.js`

This is a major source of drift.

The Phase tracker explicitly says the future `render` module should
replace `debugview`, but both are still present.

### Correction

Choose one production UI entry path.

Recommended:

`app/mainscreen.js → render/renderer.js → assets`

Then retire `debugview` after parity is proven.

------------------------------------------------------------------------

# 11. The underlying problem in one sentence

The codebase's main problem is not that the simulation architecture is
bad.

The main problem is:

> **The presentation layer was implemented faster than the authoritative
> gameplay and asset contracts, so the UI now advertises systems that
> are only partially implemented and bypasses existing architecture that
> already solves the correct problem.**

This creates **implementation drift**, **UI contract drift**, and
**phase drift**.

------------------------------------------------------------------------

# 12. Priority classification

  Issue                                       Severity      Priority
  ------------------------------------------- ------------- ----------
  Main code editor bypasses sandbox           Critical      P0
  Turn budget is bypassed                     Critical      P0
  Play/Pause/Speed are non-functional         High          P0
  Old and new renderer paths coexist          High          P0
  No real asset resolver / atlas              High          P1
  Fence bounds not rendered                   High          P1
  Hardcoded carry capacity/weight             High          P1
  Dead UI buttons                             Medium        P1
  Missing world expansion                     Medium        P2
  Advanced skills/progression                 Future        P3
  Enemies/resources/materials final visuals   Open design   Later

------------------------------------------------------------------------

# 13. Recommended immediate target

Do not add farming, crafting, combat, zombies, raids or weather yet.

First reach this state:

`Stage 1 scenario`

→ real sandboxed learner code

→ versioned API

→ correct turn budget

→ authoritative simulation

→ correct projection

→ real asset resolver

→ simple NPC atlas

→ correct fence/base rendering

→ functional Survivor Card

→ functional Next Turn

→ no misleading controls

That becomes the stable foundation for the later systems.
