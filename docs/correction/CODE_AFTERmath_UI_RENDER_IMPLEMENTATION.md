# CODE: AFTERMATH --- UI & Render Implementation Specification

## Purpose

This document translates the correction work into a concrete UI/render
implementation order.

The UI must never invent gameplay state.

------------------------------------------------------------------------

# 1. Target screen architecture

``` text
┌─────────────────────────────────────────────────────────────┐
│ BRAND │ RESOURCES │ DAY / TIME │ TURN │ COMMANDS │ SETTINGS │
├───────────────────────────────────────┬─────────────────────┤
│                                       │                     │
│                                       │ Survivor Card       │
│             WORLD MAP                 │                     │
│                                       │ Needs               │
│        2D GOD-EYES VIEW               │ Attributes          │
│                                       │ Skills              │
│        NPC / BUILDINGS / NODES        │ Equipment            │
│                                       │ Inventory            │
│                                       │ Current Task         │
│                                       │                     │
├───────────────────────────────────────┴─────────────────────┤
│ CODE │ ASSIGN │ TASK │ BUILD │ SURVIVORS │ RESEARCH │ ... │
├─────────────────────────────────────────────────────────────┤
│ Command hints / current turn / command result               │
└─────────────────────────────────────────────────────────────┘
```

The exact layout may change.

The ownership boundaries must not.

------------------------------------------------------------------------

# 2. Top bar

The top bar should display only authoritative/projection data.

Recommended:

-   wood
-   stone
-   metal when defined
-   food
-   water
-   survivor count
-   base condition
-   day
-   time
-   turn
-   commands left
-   strategy points

Do not show a control whose backend behavior does not exist.

------------------------------------------------------------------------

# 3. Simulation control

For the current turn-based model:

### Required

`NEXT TURN`

### Optional

`RESET`

`RESTART SCENARIO`

`SAVE`

### Remove until a real-time clock exists

`PLAY`

`PAUSE`

`1×`

`2×`

`4×`

------------------------------------------------------------------------

# 4. World map

The world renderer consumes only:

`renderProjection()`

It must not access GameState directly.

### Render layers

1.  terrain
2.  fence / settlement boundary
3.  buildings
4.  resource nodes
5.  NPCs
6.  event markers
7.  selection
8.  optional debug overlays

------------------------------------------------------------------------

# 5. NPC render pipeline

``` text
NPC projection
    ↓
semantic action
    ↓
direction
    ↓
asset key
    ↓
asset resolver
    ↓
atlas/frame
    ↓
animation player
    ↓
canvas
```

Example:

``` text
animation = WALK
direction = DOWN_RIGHT

→ npc_survivor_walk_down_right
→ atlas lookup
→ frame sequence
→ render
```

The animation player must never update:

-   position
-   health
-   task progress
-   XP
-   inventory

------------------------------------------------------------------------

# 6. NPC world appearance

The world sprite should answer:

-   Who is here?
-   Where are they?
-   What are they broadly doing?
-   Are they downed/injured?
-   Is something important happening?

The world sprite should not try to show:

-   exact skill level
-   exact attributes
-   full inventory
-   gender details
-   full equipment
-   XP
-   occupation-specific permanent costumes

Those belong to the Survivor Card/Inspector.

------------------------------------------------------------------------

# 7. Survivor Card

The card should read from the projection.

### Sections

#### Identity

-   name
-   portrait
-   gender presentation
-   age
-   background/summary

#### Needs

-   health
-   hunger
-   thirst
-   energy
-   morale

#### Attributes

-   strength
-   intelligence
-   agility
-   endurance
-   perception

#### Skills

Future Phase 4/6:

-   farming
-   scavenging
-   combat
-   construction
-   medicine
-   crafting

#### Equipment

-   primary
-   clothing
-   backpack
-   other approved slots

#### Inventory

Only when inventory/carry is authoritative.

#### Task

-   current action
-   target
-   status
-   progress
-   queue

------------------------------------------------------------------------

# 8. Carry UI

Do not display fake values.

Before Phase 5:

``` text
Inventory: not yet active
```

or show raw inventory only.

After Phase 5:

``` text
Current Load: 8 kg
Capacity: 22 kg
Encumbrance: Light
```

where both values come from authoritative simulation/projection data.

------------------------------------------------------------------------

# 9. Code panel

The code panel must not implement a second API parser.

### Correct flow

``` text
Editor
 ↓
app.runSandbox(...)
 ↓
Safety validation
 ↓
Worker
 ↓
Game API
 ↓
Simulation
 ↓
Event log
 ↓
Projection
 ↓
Feedback
```

The UI should display:

-   source code
-   API reference
-   lesson instructions
-   execution errors
-   command results
-   state changes
-   relevant events

------------------------------------------------------------------------

# 10. AI Tutor

The AI Tutor should be contextual, not authoritative.

It can explain:

-   why a command failed
-   what a need means
-   what a command does
-   what the learner should inspect
-   why a survivor cannot perform an action

It must not directly mutate GameState.

------------------------------------------------------------------------

# 11. Disabled/future UI rule

If a button is visible but the system is not implemented:

``` text
BUILD
Coming in Phase 7
```

is acceptable.

A button that appears active but does nothing is not.

------------------------------------------------------------------------

# 12. Renderer acceptance tests

### Test 1 --- Projection-only

Renderer works using a render projection without GameState access.

### Test 2 --- Asset swap

Replace an atlas and gameplay continues unchanged.

### Test 3 --- Missing frame

Delete an animation frame.

Renderer falls back.

Gameplay remains identical.

### Test 4 --- Building state

Change building health through simulation.

Renderer changes the building visual state.

UI never changes the building sprite directly.

### Test 5 --- NPC task

Start gather.

NPC projection changes:

`IDLE → WALK → GATHER → IDLE`

according to simulation state.

Animation never determines completion.

------------------------------------------------------------------------

# 13. UI implementation order

1.  Correct top bar.
2.  Correct turn control.
3.  Correct world geometry.
4.  Correct selection.
5.  Correct Survivor Card.
6.  Correct task display.
7.  Correct code execution path.
8.  Correct command feedback.
9.  Asset resolver.
10. NPC animation.
11. Building visuals.
12. Event markers.
13. Future gameplay panels.

------------------------------------------------------------------------

# 14. Final UI principle

The UI should not be designed as a collection of game-looking panels.

It should be designed as:

``` text
Authoritative Simulation
        ↓
Read-only Projection
        ↓
World Renderer
        ↓
Inspector
        ↓
Learner Feedback
```

This prevents the current problem where the UI looks more complete than
the underlying systems.
