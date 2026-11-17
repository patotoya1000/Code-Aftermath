> **Status (integrated 2026-11-17): SPEC — UI-0 kept, UI-1 IMPLEMENTED (2026-11-17), UI-2 IMPLEMENTED (2026-11-17), UI-3 IMPLEMENTED (2026-11-17), UI-4 IMPLEMENTED (2026-11-17), UI-5 IMPLEMENTED (2026-11-17), UI-6 IMPLEMENTED (2026-11-17).**
> Extends `09-rendering-boundary-and-ui.md`. Implementation notes: `AI_MEMORY/systems/CODEBOOK_UI_INDEX.md`.
>
> **What UI-1 delivered:** the Codebook is generated from the authoritative API (`src/modules/api/v1.js` `COMMANDS` + `READ_SURFACE`) plus curated metadata in `src/modules/api/codebook-data.js`; drift tests fail when a command or a read line has no Codebook entry, when an example does not pass the real sandbox + API validation, or when an outcome code is not a real stop/failure reason. UI: `📖 BOOK` button, searchable two-column panel, compact searchable API list in the code panel, "insert example" into the editor, rejected-command chips link to their entry.
>
> **What UI-2 delivered:** the live inspector now surfaces current task state, route target, stop reason, carry/storage, and per-building resource/power/water status from the read-only projections. The tutor and task panel explain why the last action stopped without inventing simulation rules.
>
> **What UI-3 delivered:** the tutor now suggests relevant read-only commands for the current selected survivor/building/node and links those entries directly into the Codebook; invalid or rejected calls keep the same entry links so a learner can jump from failure to the right command reference without adding gameplay rules.
>
> **What UI-4 delivered:** lesson instructions now extract the actual command calls from the starter snippet and turn them into direct `open-book` links, so the tutorial and the command reference stay in sync without duplicating the API documentation.
>
> **Current status:** the mobile tab flow and the final accessibility/motion polish are implemented; the UI remains read-only and API-driven on all screen sizes.

# CODE: AFTERMATH --- Codebook & UI Display/Design Integration Specification

**Status:** Proposed implementation specification\
**Date:** 2026-11-16\
**Basis:** Current `code-aftermath` codebase, `AI_MEMORY/`,
`docs/game/09-rendering-boundary-and-ui.md`,
`docs/game/15-realtime-simulation-and-tasks.md`,
`AI_MEMORY/systems/API_INDEX.md`, `AI_MEMORY/systems/LESSON_INDEX.md`,
`AI_MEMORY/IMPLEMENTATION_STATUS.md`, and the UI structure currently
implemented in `index.html` / `src/app/mainscreen.js` /
`src/app/mainscreen.css`.

------------------------------------------------------------------------

## 1. Purpose

This document integrates the UI and Codebook direction discussed for
CODE: AFTERMATH.

The goal is **not** to replace the current game UI or redesign
everything immediately.

The goal is to evolve the existing UI into a player-facing programming
laboratory where:

``` text
WORLD
  ↓
INSPECT
  ↓
UNDERSTAND STATE
  ↓
LOOK UP COMMAND / VARIABLE
  ↓
WRITE CODE
  ↓
RUN
  ↓
OBSERVE SIMULATION
  ↓
UNDERSTAND RESULT
```

The UI must therefore serve two purposes at the same time:

1.  **Game interface** --- the player observes and manages the survival
    simulation.
2.  **Learning interface** --- the player discovers the Game API,
    variables, state, commands, conditions, tasks, and results.

The UI remains a read-only projection of authoritative simulation state.
It must not become a second gameplay engine.

------------------------------------------------------------------------

# 2. Current Codebase Baseline

The current codebase already contains most of the architectural
foundations required for this design.

## 2.1 Current UI structure

The current main screen contains:

``` text
TOP BAR
├── Game title
├── Resource counters
├── Clock / strategy points
├── Day / season / weather
└── Play / speed / calendar / save / load / restart / lessons

MAIN AREA
├── World Simulation
│   └── Canvas renderer
│
├── Inspector
│   └── Survivor / building / resource information
│
├── Command Region
│   ├── CODE
│   ├── future command controls
│   └── event feed
│
└── AI Tutor

CODE PANEL
├── Lesson information
├── JavaScript editor
├── Available API
└── Execution result

LESSON PLAYER
├── Lesson list
├── Instructions
├── Goals
├── Starter code
├── Results
└── Progress
```

This structure is considered a valid foundation.

**Do not throw it away and rebuild the interface from scratch.**

------------------------------------------------------------------------

## 2.2 Current API foundation

The current Game API is already data-driven through:

`src/modules/api/v1.js`

The API currently exposes commands including:

-   `survivor.moveTo(...)`
-   `survivor.gather(...)`
-   `survivor.deposit()`
-   `survivor.rest(...)`
-   `survivor.eat(...)`
-   `survivor.drink()`
-   `survivor.repair(...)`
-   `survivor.upgrade(...)`
-   `survivor.policy(...)`
-   `survivor.clearPolicy(...)`
-   `survivor.on(...)`
-   `survivor.off(...)`
-   `survivor.queue()`
-   `survivor.stop()`

The API also exposes a learner-readable read surface containing survivor
state, base resources, buildings, resource nodes, recipes, foods, world
information, weather, calendar information, and related data.

The current `describeApi()` already returns:

``` text
version
commands[]
reads[]
```

This is the foundation for the Codebook.

------------------------------------------------------------------------

# 3. Core Design Decision

## 3.1 The Codebook is not a separate programming system

The Codebook must **not** contain a manually duplicated list of commands
that can drift away from the actual API.

Instead:

``` text
AUTHORITATIVE API
src/modules/api/v1.js
        │
        ├── Sandbox validation
        ├── Command builder
        ├── Existing API panel
        └── NEW CODEBOOK
```

The same authoritative API metadata should drive the player-facing
reference.

This means a new command should not require independently maintaining:

``` text
Game API
Code editor help
Codebook
Tutorial command list
```

Instead, the API definition should provide the source information from
which these views are generated.

------------------------------------------------------------------------

# 4. Codebook Goals

The Codebook should answer five questions.

### 1. What can I control?

Example:

``` text
NPC / Survivor
Movement
Gathering
Rest
Food
Water
Buildings
Policies
Events
Queues
```

### 2. What can I read?

Example:

``` text
survivor.needs.energy
survivor.attributes.strength
survivor.inventory
base.wood
base.water
world.time
world.weather
```

### 3. How do I use it?

Example:

``` javascript
survivor.gather("wood", 20);
```

### 4. What does it require?

Example:

``` text
Requires:
- reachable resource
- available carrying capacity
- sufficient energy
```

### 5. What will happen?

Example:

``` text
The survivor travels to the resource,
gathers it into carried inventory,
then deposits it when required.
```

------------------------------------------------------------------------

# 5. Codebook Information Architecture

The Codebook should use a **book/manual metaphor**, but it should still
feel like part of the command center.

Recommended sections:

``` text
📖 CODEBOOK

├── Getting Started
│
├── Survivors
│   ├── Survivor objects
│   ├── Needs
│   ├── Attributes
│   ├── Skills
│   ├── Inventory
│   └── Tasks
│
├── Commands
│   ├── Movement
│   ├── Gathering
│   ├── Carry / Deposit
│   ├── Rest
│   ├── Food / Water
│   ├── Buildings
│   ├── Policies
│   ├── Events / Hooks
│   └── Queue / Stop
│
├── Variables & State
│   ├── Resources
│   ├── Survivor state
│   ├── Buildings
│   ├── Nodes
│   ├── Recipes
│   └── World
│
├── Conditions
│   ├── Comparisons
│   ├── if / else
│   └── State checks
│
├── Loops
│   ├── for
│   ├── while
│   └── Repeated work
│
├── Functions
│   ├── Defining functions
│   └── Reusable survivor behavior
│
├── Policies & Events
│
└── Glossary
```

The player should be able to browse this like a dictionary/manual.

------------------------------------------------------------------------

# 6. Command Entry Design

Every command should have a standardized Codebook entry.

Example:

## `survivor.gather()`

**Category:** Resource / Task

**Signature**

``` javascript
survivor.gather(resource, load [, total])
```

**Purpose**

Gather a resource from a reachable resource node.

**Parameters**

  Parameter    Meaning
  ------------ ---------------------------------
  `resource`   Resource name such as `"wood"`
  `load`       Amount carried per trip
  `total`      Optional total amount to gather

**Example**

``` javascript
survivor.gather("wood", 20);
```

**Read before using**

``` text
survivor.carry
nodes
base.wood
```

**Possible outcomes**

``` text
TARGET_REACHED
STORAGE_FULL
NO_TARGET
EXHAUSTED
NO_PATH
```

**Important rule**

The learner requests the action. The simulation decides whether it can
actually happen.

------------------------------------------------------------------------

# 7. Resource / Variable Entry Design

Resources such as wood and water should be presented as **state that the
learner can inspect**, not as direct state that learner code can mutate.

Example:

## WOOD

``` text
Type: Resource
Current base stock: 42
```

**Read through**

``` javascript
base.wood
```

**Used for**

``` text
Repair
Upgrade
Construction/production when implemented
```

**Gather through**

``` javascript
survivor.gather("wood", 20);
```

**Do not expose**

``` javascript
base.wood = 100;
```

Direct mutation must remain forbidden.

The Codebook should explicitly teach:

> You can READ game state, but you control the world through commands.

This is an important programming concept and matches the existing
sandbox/API architecture.

------------------------------------------------------------------------

# 8. Water Example

Water should demonstrate that not every resource behaves exactly like
wood.

## WATER

``` text
Type: Renewable resource
Source: Deep well
```

Read:

``` javascript
base.water
well.water
```

Gather:

``` javascript
survivor.gather("water", 10);
```

The Codebook should explain:

``` text
Wood → resource node
Water → well/source system
```

This teaches the learner that commands can share a common interface
while the simulation contains different underlying rules.

------------------------------------------------------------------------

# 9. Survivor Inspector

The current Survivor Inspector should remain the primary place for
**live state**.

It should progressively evolve toward:

``` text
SURVIVOR
────────────────────────
Mara
Active · A trainee survivor

NEEDS
Health      ██████████ 100
Hunger      ███████░░░ 79
Thirst      ████████░░ 79
Energy      ████████░░ 80
Morale      ███████░░░ 70

ATTRIBUTES
Strength  5
Agility   5
Endurance 5
Intelligence 5
Perception 5

SKILLS
Gathering
Repair
Rest
Cooking
...

CARRY
12 / 20 wt

CURRENT TASK
Gather Wood
FOREST → STORAGE

TASK STATUS
EXECUTING

QUEUE
1. Deposit
2. Rest

POLICIES
eat < 30
rest < 20

HOOKS
on hungry
```

The Inspector should show **what is happening now**.

The Codebook explains **what the learner can do with that information**.

------------------------------------------------------------------------

# 10. Task and Action Visualization

The existing task panel should become more explicit as task/action
systems expand.

Recommended:

``` text
TASK
Gather Wood

STATUS
EXECUTING

TARGET
Tree #1

PROGRESS
████████░░ 80%

CARRY
18 / 20 wt

ROUTE
Forest → Gate → Storage

STOP CONDITION
Target reached / storage full / exhausted
```

For debugging and learning, the player should be able to see the
relationship:

``` text
CODE
   ↓
COMMAND
   ↓
TASK
   ↓
ACTION
   ↓
SIMULATION
   ↓
RESULT
```

This is especially useful because the project teaches programming
through simulation rather than through abstract console exercises.

------------------------------------------------------------------------

# 11. Code Editor Relationship

The Codebook should never replace the editor.

The player has:

### Codebook

> "What does this command mean?"

### Editor

> "What code do I want to execute?"

### Simulation

> "What did my code actually cause?"

Example:

``` text
CODEBOOK
survivor.gather("wood", 20)

        ↓

EDITOR
survivor.gather("wood", 20);

        ↓

RUN

        ↓

SIMULATION
Mara walks to forest
        ↓
gathers wood
        ↓
carries wood
        ↓
returns to storage
        ↓
deposits wood
```

------------------------------------------------------------------------

# 12. Codebook and Existing API Panel

The current Code panel already has:

``` text
Lesson | JavaScript Editor | Available API
```

Do not remove this structure immediately.

Instead, evolve the **Available API** pane.

### Current role

Compact API list.

### Target role

Compact Codebook browser.

For example:

``` text
AVAILABLE API

🔎 Search...

NPC
  ├── moveTo()
  ├── gather()
  ├── deposit()
  ├── rest()
  └── stop()

NEEDS
  ├── eat()
  ├── drink()
  └── policy()

BUILDINGS
  ├── repair()
  └── upgrade()

EVENTS
  ├── on()
  └── off()
```

Clicking an item opens its detailed entry.

------------------------------------------------------------------------

# 13. Suggested Codebook UI

Desktop:

``` text
┌────────────────────────────────────────────────────────────┐
│ CODEBOOK                                      🔍 Search    │
├───────────────┬────────────────────────────────────────────┤
│ CATEGORIES    │ survivor.gather()                          │
│               │                                            │
│ Survivors     │ Gather a resource from a reachable node.  │
│ Commands      │                                            │
│ Resources     │ Signature                                  │
│ Buildings     │ survivor.gather(resource, load [, total]) │
│ Conditions    │                                            │
│ Loops         │ Parameters                                 │
│ Functions     │ resource → "wood", "water", etc.          │
│ Events        │ load → amount carried per trip             │
│               │ total → optional total amount              │
│               │                                            │
│               │ Example                                    │
│               │ survivor.gather("wood", 20);               │
│               │                                            │
│               │ Reads                                       │
│               │ survivor.carry / nodes / base.wood         │
│               │                                            │
│               │ Outcomes                                    │
│               │ TARGET_REACHED / EXHAUSTED / NO_PATH ...   │
└───────────────┴────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# 14. Mobile UI

The current CSS already contains responsive behavior, but the final
mobile design should not simply shrink the desktop interface.

On mobile, use tabs/drawers:

``` text
┌──────────────────────────┐
│ CODE: AFTERMATH          │
├──────────────────────────┤
│ WORLD                    │
│                          │
│        MAP               │
│                          │
├──────────────────────────┤
│ MARA                     │
│ Energy ████████          │
│ Task: Gather Wood        │
├──────────────────────────┤
│ WORLD | CODE | BOOK      │
├──────────────────────────┤
│                          │
│ selected panel           │
│                          │
└──────────────────────────┘
```

Recommended mobile primary navigation:

``` text
WORLD
CODE
BOOK
INSPECT
LESSONS
```

The Codebook should open as a drawer/full-screen panel.

The learner should never have to squeeze three desktop columns into a
phone screen.

------------------------------------------------------------------------

# 15. UI Development Rule

Do **not** postpone all UI work until the game is finished.

Use this development cycle:

``` text
GAME LOGIC PHASE
      ↓
FUNCTIONAL UI DISPLAY
      ↓
DEBUG / VERIFY
      ↓
NEXT GAME LOGIC PHASE
      ↓
FUNCTIONAL UI DISPLAY
      ↓
...
      ↓
CORE SYSTEMS STABLE
      ↓
FINAL UI POLISH
```

This means:

### During implementation

Build:

-   data display
-   task state
-   action state
-   resource values
-   building state
-   command availability
-   Codebook entries
-   error messages
-   simulation feedback

### Later

Polish:

-   typography
-   final icons
-   animations
-   artwork
-   transitions
-   responsive refinements
-   final visual hierarchy

------------------------------------------------------------------------

# 16. UI Integration by Game Phase

## Phase A --- NPC / Survivor

Add:

``` text
Survivor Inspector
Needs
Attributes
Skills
Inventory
Carry
Task
```

Codebook:

``` text
survivor
survivor.needs
survivor.attributes
survivor.skills
survivor.inventory
survivor.carry
```

------------------------------------------------------------------------

## Phase B --- Task / Action

Add:

``` text
Current action
Task lifecycle
Queue
Stop reason
Failure reason
Progress
```

Codebook:

``` text
moveTo()
gather()
rest()
stop()
queue()
```

------------------------------------------------------------------------

## Phase C --- Carry / Logistics

Add:

``` text
Carried load
Storage
Deposit
Route
Capacity
```

Codebook:

``` text
survivor.carry
survivor.deposit()
base.capacity.*
```

------------------------------------------------------------------------

## Phase D --- Buildings

Add:

``` text
Building inspector
Health
Condition
Level
Upgrade
Storage
Station
```

Codebook:

``` text
repair()
upgrade()
buildings
fence
hq
storage_1
```

Do not add direct state mutation commands.

------------------------------------------------------------------------

## Phase E --- Environment / Water / Food

Add:

``` text
Weather
Calendar
Well
Water
Recipes
Foods
Spoilage
```

Codebook:

``` text
world.time
world.weather
world.forecast
world.calendar
well.water
recipes
foods
base.perishables
```

------------------------------------------------------------------------

## Phase F --- Policies / Events

Add:

``` text
Policies
Hooks
Event feed
Interrupt → action → resume
```

Codebook:

``` text
survivor.policy()
survivor.on()
survivor.off()
```

------------------------------------------------------------------------

## Phase G --- Farming / Production / Power

Add:

``` text
Production status
Stations
Power status
Crop state
Production queues
```

The Codebook expands automatically with the corresponding API/read
surface.

------------------------------------------------------------------------

## Phase H --- Zombies / Combat

Add:

``` text
Enemy inspector
Threat status
Combat task
Target
Damage/result feedback
```

The UI must continue to display authoritative simulation results rather
than allowing the renderer to determine combat outcomes.

------------------------------------------------------------------------

# 17. Lesson Integration

The lesson system must eventually use the same concepts shown in the
Codebook.

The current lesson system already uses data-driven lessons and the real
simulation timeline.

The intended relationship is:

``` text
LESSON
  ↓
TEACHES CONCEPT
  ↓
CODEBOOK EXPLAINS API
  ↓
EDITOR ACCEPTS CODE
  ↓
REAL SIMULATION EXECUTES
  ↓
UI SHOWS RESULT
  ↓
LESSON VALIDATOR CHECKS RESULT
```

Example:

### Lesson: Variables

The Codebook introduces:

``` javascript
const amount = 10;
survivor.gather("wood", amount);
```

The Inspector shows:

``` text
Wood: 0 → 10
```

The world shows:

``` text
Survivor → Forest → Tree → Storage
```

The event feed shows:

``` text
Mara started gathering wood.
Mara gathered 10 wood.
Mara deposited 10 wood.
```

The lesson validator checks the actual outcome.

This is preferable to creating a completely separate educational
simulation.

------------------------------------------------------------------------

# 18. Behavioral Learning Rule

The UI should not teach only syntax.

Avoid making the Codebook merely:

``` text
if
for
const
function
```

Instead connect syntax to simulation behavior.

For example:

``` text
IF
↓
Check survivor energy
↓
Choose rest or work
↓
Observe resulting behavior
```

``` text
LOOP
↓
Repeat gathering
↓
Observe multiple trips
↓
Observe storage/carry limits
```

``` text
FUNCTION
↓
Package a reusable task
↓
Run it
↓
Observe repeated behavior
```

This keeps programming concepts tied to actual gameplay.

------------------------------------------------------------------------

# 19. AI Tutor Relationship

The existing AI Tutor should complement the Codebook.

### Codebook

Static, authoritative reference.

> "What does `survivor.gather()` mean?"

### AI Tutor

Contextual explanation.

> "Mara is tired. Why did the gather action stop?"

### Event Feed

Actual simulation evidence.

> `Mara stopped gathering: EXHAUSTED`

### Inspector

Current state.

> `Energy: 12`

Together:

``` text
CODEBOOK
"What does this command do?"

INSPECTOR
"What is happening now?"

EVENT FEED
"What happened?"

AI TUTOR
"Why did it happen?"
```

This is a strong educational UI loop.

------------------------------------------------------------------------

# 20. Error Display

Errors should be educational rather than merely technical.

Current errors such as:

``` text
INVALID_ARGUMENT
UNKNOWN_COMMAND
SAFETY_VIOLATION
EXECUTION_TIMEOUT
RUNTIME_ERROR
```

should be presented as:

``` text
❌ Command rejected

survivor.gather("wood");

Reason:
The command requires a load amount.

Try:
survivor.gather("wood", 20);

Open Codebook → Gathering → gather()
```

The UI may link the error to the relevant Codebook entry.

------------------------------------------------------------------------

# 21. Command Discovery

The player should be able to discover commands through three paths.

### Path 1 --- Codebook

``` text
BOOK → Commands → Gathering → gather()
```

### Path 2 --- Inspector

``` text
NPC → Current Task → Related command
```

### Path 3 --- AI Tutor

``` text
Tutor explanation → "See gather() in Codebook"
```

All three should eventually point to the same API definition.

------------------------------------------------------------------------

# 22. Do Not Expose Internal Simulation Complexity Too Early

The game engine is becoming sophisticated.

The learner does not need to manually control:

``` text
needs decay
reservation lifecycle
pathfinding
carry transfer
storage accounting
action lifecycle
skill XP calculation
weather calculation
spoilage calculation
ledger mutation
```

These remain engine responsibilities.

The learner controls intent:

``` javascript
survivor.gather("wood", 20);
```

not:

``` javascript
survivor.energy -= 10;
storage.wood += 20;
survivor.x = 15;
```

This distinction is essential to the educational architecture.

------------------------------------------------------------------------

# 23. Renderer Boundary

The existing rendering rule remains unchanged.

``` text
AUTHORITATIVE GAME STATE
        ↓
READ-ONLY PROJECTION
        ↓
RENDERER
        ↓
CANVAS / UI
```

The UI must not:

-   mutate GameState
-   calculate gameplay outcomes
-   invent resource values
-   parse learner code
-   decide task completion
-   decide combat results
-   determine animation-driven completion

The renderer/UI displays what the simulation says happened.

------------------------------------------------------------------------

# 24. Suggested New UI Components

The following components should be introduced incrementally.

``` text
CodebookPanel
CodebookCategoryList
CodebookSearch
CodebookEntry
CodebookExample
CodebookParameterList
CodebookReadSurface
CodebookOutcomeList

ResourceInspector
BuildingInspector
TaskInspector
ActionTimeline
CommandResultPanel
```

These should consume existing projections/API documentation rather than
create their own gameplay model.

------------------------------------------------------------------------

# 25. Suggested Data Flow

``` text
src/modules/api/v1.js
        │
        │ describeApi()
        ↓
    API metadata
        │
        ├───────────────┐
        ↓               ↓
 Existing API       Codebook
 Panel              UI
        │               │
        └───────┬───────┘
                ↓
            Code Editor
                ↓
          app.runCode()
                ↓
             Sandbox
                ↓
          Game API v1
                ↓
         Command Builder
                ↓
           Simulation
                ↓
         Read-only Projection
          /             \
         ↓               ↓
      Renderer       Inspector/UI
         │               │
         └───────┬───────┘
                 ↓
             Learner
```

------------------------------------------------------------------------

# 26. Recommended File Organization

Do not create one giant UI file if the Codebook grows substantially.

Recommended future structure:

``` text
src/app/
├── index.js
├── mainscreen.js
├── mainscreen.css
└── ui/
    ├── codebook.js
    ├── codebook.css
    ├── inspector.js
    ├── task-panel.js
    ├── resource-panel.js
    ├── building-panel.js
    └── tutor-panel.js
```

The exact split can be postponed until `mainscreen.js` becomes difficult
to maintain.

The current architecture should remain the source of truth for
dependency direction.

------------------------------------------------------------------------

# 27. AI_MEMORY Integration

Because the project already has an `AI_MEMORY/` navigation layer, add a
dedicated Codebook/UI memory entry when implementation begins.

Recommended:

``` text
AI_MEMORY/systems/CODEBOOK_UI_INDEX.md
```

It should contain:

``` text
Purpose
Responsibilities
Does NOT Own
Data Sources
UI Components
API relationship
Projection relationship
Mobile behavior
Current status
Known problems
Planned changes
Forbidden changes
Tests
```

Also update:

``` text
AI_MEMORY/systems/API_INDEX.md
AI_MEMORY/systems/RENDERER_INDEX.md
AI_MEMORY/assets/UI_ASSETS.md
AI_MEMORY/IMPLEMENTATION_STATUS.md
AI_MEMORY/FILE_MAP.md
```

The Codebook UI should be traceable without requiring an AI agent to
scan the entire project.

------------------------------------------------------------------------

# 28. Testing Requirements

Every major UI feature should have a functional test where practical.

## Codebook

Verify:

-   Codebook opens.
-   Categories render.
-   Commands come from the API definition.
-   Search works.
-   Entry details display.
-   Example code can be copied/inserted if that feature is added.
-   Unknown command documentation does not appear accidentally.

## Inspector

Verify:

-   Values match projection data.
-   No UI mutation occurs.
-   Selection works.
-   NPC/building/resource selection is correct.

## Task display

Verify:

-   current task matches simulation.
-   progress does not invent completion.
-   stop reasons display correctly.
-   queued actions display correctly.

## Code execution

Verify:

``` text
Editor
→ Sandbox
→ API
→ Simulation
→ Projection
→ UI
```

remains intact.

## Mobile

Verify:

-   no unusable horizontal overflow
-   Codebook is readable
-   editor is usable
-   inspector remains accessible
-   world remains visible
-   touch targets are usable

------------------------------------------------------------------------

# 29. Development Order

Do not attempt the entire redesign in one phase.

## UI-0 --- Preserve current shell

Keep:

-   world
-   inspector
-   command region
-   tutor
-   code panel
-   lesson panel

No major visual rewrite.

------------------------------------------------------------------------

## UI-1 --- Codebook foundation

Implement:

-   Codebook button
-   categories
-   command entries
-   search
-   API-driven data
-   read-surface entries
-   examples

Use existing `describeApi()`.

------------------------------------------------------------------------

## UI-2 --- Improve live inspection

Improve:

-   survivor inspector
-   resource inspection
-   building inspection
-   task status
-   carry/storage display
-   action/stop reasons

------------------------------------------------------------------------

## UI-3 --- Connect Codebook to the editor

Add:

-   insert example
-   insert command signature
-   contextual API help
-   error → Codebook entry
-   selected NPC → relevant commands

------------------------------------------------------------------------

## UI-4 --- Lesson integration

Connect:

``` text
Lesson
→ Codebook
→ Editor
→ Simulation
→ Result
```

Do not create a separate lesson command dictionary.

------------------------------------------------------------------------

## UI-5 --- Mobile layout

Convert the desktop multi-panel structure into:

``` text
World
Code
Book
Inspect
Lessons
```

using drawers/tabs where necessary.

------------------------------------------------------------------------

## UI-6 --- Final visual polish

Only after core game systems stabilize:

-   final iconography
-   final typography
-   sprite/art integration
-   animation polish
-   transitions
-   responsive refinement
-   accessibility
-   performance tuning

------------------------------------------------------------------------

# 30. Relationship to Remaining Game Development

The Codebook/UI work should proceed alongside game logic, but the UI
should **not block core simulation development**.

Recommended priority:

``` text
CORE GAME LOGIC
     ↓
Functional UI display
     ↓
Debug / verify
     ↓
Next game system
     ↓
Functional UI display
     ↓
...
```

The current implementation status shows that the project has already
completed substantial foundations including real-time simulation,
task/action systems, carry/deposit, pathing, skills, building upgrades,
environment, water, recipes/kitchen, and spoilage.

The next game systems should continue to receive functional UI exposure
as they are implemented.

The final UI polish should wait until the major gameplay systems are
stable.

------------------------------------------------------------------------

# 31. Final Target Experience

The finished experience should feel like a combination of:

``` text
SURVIVAL SIMULATION
        +
PROGRAMMING LAB
        +
INTERACTIVE CODEBOOK
        +
CONTEXTUAL INSPECTOR
        +
AI TUTOR
```

The player's normal loop becomes:

``` text
1. Observe the world.

2. Click/select an NPC, resource, building, or world object.

3. Inspect its current state.

4. Open the Codebook if the player forgets a command or variable.

5. Read the command's purpose, parameters, requirements, and example.

6. Write or modify JavaScript.

7. Run the code.

8. Watch the simulation.

9. Inspect the resulting task/state.

10. Read the event/result feedback.

11. Ask the AI Tutor when the result is unclear.

12. Use the lesson system to formalize the programming concept.
```

This creates the intended relationship:

``` text
LEARN → CODE → EXECUTE → OBSERVE → DEBUG → UNDERSTAND
```

------------------------------------------------------------------------

# 32. Non-Negotiable Architecture Rules

1.  **The simulation remains authoritative.**
2.  **The renderer/UI remains read-only.**
3.  **The Codebook must derive command information from the
    authoritative API where possible.**
4.  **The Codebook must not become a second API implementation.**
5.  **Learners read state but request actions through commands.**
6.  **Do not expose direct state mutation commands.**
7.  **The Inspector displays current state; the Codebook explains
    available operations.**
8.  **The AI Tutor explains context; it does not replace authoritative
    documentation.**
9.  **Lessons should use the same game concepts and simulation rules as
    free play.**
10. **Functional UI should be added during each major game-system
    phase.**
11. **Final visual polish should wait until core systems stabilize.**
12. **Do not reintroduce obsolete turn-based UI or commands.**
13. **Do not make the UI responsible for gameplay calculations.**
14. **Do not create duplicate command definitions solely for the UI.**
15. **Keep AI_MEMORY navigation updated when the UI/API architecture
    changes.**

------------------------------------------------------------------------

# 33. Definition of Done

The Codebook/UI integration is complete when:

-   [ ] Codebook opens from the main game.
-   [ ] Codebook categories are navigable.
-   [ ] Command information comes from authoritative API metadata.
-   [ ] Readable state variables are documented.
-   [ ] Commands have signatures, descriptions, parameters, examples,
    and relevant outcomes.
-   [ ] Resource and building entries are available.
-   [ ] Inspector displays live authoritative projection data.
-   [ ] Task/action lifecycle is visible.
-   [ ] Command failures provide useful learner-facing guidance.
-   [ ] Errors can point toward relevant Codebook information.
-   [ ] Lessons can use the Codebook without duplicating API
    documentation.
-   [ ] AI Tutor can reference the same concepts.
-   [ ] Desktop layout is usable.
-   [ ] Mobile layout is usable.
-   [ ] UI tests verify critical interactions.
-   [ ] No UI component mutates authoritative state.
-   [ ] No Codebook feature bypasses the existing sandbox/API
    architecture.
-   [ ] AI_MEMORY documentation reflects the final structure.

------------------------------------------------------------------------

## Final Recommendation

The current UI should be treated as a **functional prototype shell**,
not as disposable work.

Do **not** wait until the entire game is complete before improving it.

Instead:

> **Implement each game system → expose it through the UI → verify it
> visually → continue building the next system → perform the final
> visual redesign after the core simulation is stable.**

The Codebook should be introduced early because it is not merely a
visual feature. It is part of the educational architecture connecting
the **Game API, learner code, simulation state, Inspector, Lessons, and
AI Tutor**.
