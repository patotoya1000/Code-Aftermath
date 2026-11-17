> **Status (integrated 2026-11-17): SPEC — art phases PLANNED, nothing here is implemented as final art.**
> This document is the *visual integration* spec. It extends `10-assets-specification.md` and `12-buildings-visual-spec.md`; it never overrides the logic docs (`01`, `15`). Rules 1–4 of `AI_MEMORY/RULES.md` win on any conflict.
>
> **What the code already has (verified):** grid world 24×16 (`definitions/data/world.js` `map`), one canvas renderer that only reads projections (`src/modules/render/index.js`), asset resolver with fallback chain + in-code placeholder atlas (`src/modules/assets/index.js`), A* pathing on the grid with building/fence blocking and the gate as the opening (`src/modules/buildings/pathing.js`), 8-direction vocabulary (`src/kernel/grid.js`).
>
> **PA-1 DONE (2026-11-17):** `src/modules/viewport/index.js` is the one grid↔screen conversion with a camera (spec §12–14, §26); the renderer uses nothing else. Camera controls are not wired to the UI yet.
>
> **Gaps against this spec (honest list):** no `assets/` folder of real PNGs (`*.png` is git-ignored); buildings are single-tile with no declared multi-cell footprint/entrance (spec §7, §20); fence and road tiles are not auto-chosen from neighbours (spec §6); asset ids are underscore keys, not dotted (see `IMPLEMENTATION_STATUS.md` conflict 3).
>
> **Phase map.** The spec's phases 1–8 are tracked as **PA-1 … PA-8** in `docs/PHASES.md`. Per spec §29 only ONE of logic / grid / NPC / asset / UI / save changes per step; PA-x phases change the renderer and asset layer only and must leave every simulation test untouched.

# CODE_AFTERmath --- Grid-Based Pixel-Art Asset Integration Specification

## 1. Purpose

This document defines how to integrate a **2D top-down, tile-based
pixel-art visual style** into the existing CODE_AFTERmath game without
replacing the game's core simulation architecture.

The target visual direction is:

-   Top-down 2D presentation
-   Pixel-art environment and objects
-   Grid/cell-based world placement
-   Modular terrain and wall/fence tiles
-   Small readable NPC sprites
-   Multi-cell buildings
-   Layered rendering
-   Lightweight assets suitable for JavaScript + HTML/CSS + Canvas
-   Simulation logic separated from visual rendering

The visual assets must remain a presentation layer over the existing
game-world/grid logic.

------------------------------------------------------------------------

## 2. Core Rule

### Grid = World Logic

The grid determines:

-   Position
-   Occupancy
-   Walkability
-   Collision
-   Movement
-   Pathfinding
-   Resource placement
-   Building placement
-   NPC placement
-   Zombie placement
-   Interaction locations
-   Task destinations

### Sprite = Visual Representation

Sprites determine:

-   Appearance
-   Animation
-   Direction
-   Visual state
-   Building appearance
-   Terrain appearance
-   Resource appearance

A sprite must NOT become the authoritative source of gameplay state.

Example:

``` text
Grid Cell
    |
    +-- terrain = grass
    +-- walkable = true
    +-- object = tree_001
    +-- occupiedBy = null
    |
    +--> Renderer
            |
            +-- grass tile
            +-- tree sprite
```

------------------------------------------------------------------------

# 3. Target Visual Architecture

Use a layered 2D rendering model.

``` text
WORLD CANVAS
│
├── Layer 0 — Base Terrain
│   ├── grass
│   ├── dirt
│   ├── soil
│   └── damaged ground
│
├── Layer 1 — Terrain Details
│   ├── grass variation
│   ├── stones
│   ├── small plants
│   └── ground decoration
│
├── Layer 2 — Paths / Roads
│   ├── straight
│   ├── corner
│   ├── T-junction
│   └── intersection
│
├── Layer 3 — Static World Objects
│   ├── trees
│   ├── rocks
│   ├── ruins
│   ├── fences
│   └── resource nodes
│
├── Layer 4 — Buildings
│   ├── HQ
│   ├── tents
│   ├── storage
│   └── production buildings
│
├── Layer 5 — Characters
│   ├── survivors
│   └── zombies
│
├── Layer 6 — Effects
│   ├── selection marker
│   ├── task marker
│   ├── hit effects
│   └── interaction indicators
│
└── Layer 7 — UI
    ├── survivor cards
    ├── commands
    ├── variables
    └── status panels
```

Do not merge the world-rendering layer with the UI layer.

------------------------------------------------------------------------

# 4. Grid and Pixel-Art Relationship

Every world object must have a logical grid footprint.

Example:

``` text
1x1 object

┌─────┐
│ 🪨  │
└─────┘


2x2 building

┌─────┬─────┐
│     │     │
│     │     │
├─────┼─────┤
│     │     │
│     │     │
└─────┴─────┘
```

The sprite may visually extend beyond its logical footprint, but its
gameplay footprint must remain explicit.

Example:

``` text
Tree sprite:
visual size = 48x64 px

logical footprint:
1x1 grid cell

collision:
bottom portion of sprite only
```

This allows large-looking pixel-art objects without breaking pathfinding
or collision.

------------------------------------------------------------------------

# 5. Asset Categories

## 5.1 Terrain Tiles

Terrain should be constructed from reusable tiles.

Required starting categories:

``` text
terrain/
├── grass/
├── dirt/
├── soil/
├── damaged/
└── transition/
```

Terrain assets should support seamless repetition.

Avoid creating one large image for an entire map.

------------------------------------------------------------------------

## 5.2 Path / Road Tiles

Roads should use modular pieces.

``` text
paths/
├── straight_horizontal
├── straight_vertical
├── corner
├── t_junction
├── cross
├── end
└── transition
```

The renderer should choose the correct road tile based on neighboring
grid cells.

Example:

``` text
      road
       |
road --+-- road
       |
      road
```

This prevents manually drawing every possible road layout.

------------------------------------------------------------------------

# 6. Walls and Fences

Walls/fences must be modular.

Recommended pieces:

``` text
fence/
├── horizontal
├── vertical
├── corner
├── end
├── gate
└── damaged
```

The logical grid determines whether a fence exists.

The renderer determines which sprite variant is needed based on
neighboring fence cells.

Example:

``` text
Grid:

F F F F
F . . F
F . . F
F F G F

F = fence
G = gate
```

The visual system then generates the correct connected fence appearance.

------------------------------------------------------------------------

# 7. Buildings

Buildings may occupy multiple grid cells.

Each building definition should contain:

``` text
id
type
width
height
footprint
walkableCells
entrance
sprite
upgradeLevel
```

Example:

``` text
HQ

width: 3
height: 3

footprint:

X X X
X X X
X X X

entrance:

X X X
X X X
X E X
```

The building's gameplay footprint must be independent from its sprite
dimensions.

------------------------------------------------------------------------

# 8. NPC Sprite Design

NPCs should use a simple, readable pixel-art style.

The world sprite should communicate:

-   direction
-   movement
-   current animation
-   basic identity/readability

Detailed information belongs in the Survivor Card.

Example:

``` text
WORLD
  ↓
small NPC sprite

SURVIVOR CARD
  ↓
Name
Gender
Health
Hunger
Thirst
Energy
Strength
Intelligence
Agility
Equipment
Current task
Inventory
```

Do not put every NPC statistic directly onto the world sprite.

------------------------------------------------------------------------

# 9. NPC Animation

Use sprite-sheet animation where appropriate.

Suggested animation states:

``` text
idle
walk
work
attack
hurt
downed
```

Direction can be represented by:

``` text
down
up
left
right
```

If the first implementation is too large, begin with:

``` text
idle
walk
```

and add other states later.

------------------------------------------------------------------------

# 10. Zombies

Use the same rendering architecture as survivors.

``` text
Zombie Entity
     |
     +-- logical position
     +-- movement state
     +-- behavior state
     +-- health
     +-- current task/behavior
     |
     +--> Sprite Renderer
```

Zombie gameplay logic must not depend on sprite animation.

The sprite only visualizes the zombie's current state.

------------------------------------------------------------------------

# 11. Resources

Resources should be world entities connected to grid positions.

Example:

``` text
Tree
├── resourceType: wood
├── amount
├── maxAmount
├── respawn/recovery rules
├── occupiedCell
└── sprite
```

The tree sprite should change when the resource state changes.

Example:

``` text
Healthy Tree
     ↓
Partially harvested
     ↓
Depleted
     ↓
Removed / regrowth
```

The exact resource rules remain controlled by the existing
resource/game-logic specification.

------------------------------------------------------------------------

# 12. Rendering Coordinate System

Use a single conversion between logical grid coordinates and canvas
coordinates.

Conceptually:

``` text
screenX = gridX * cellWidth
screenY = gridY * cellHeight
```

If camera movement is supported:

``` text
screenX = gridX * cellWidth - cameraX
screenY = gridY * cellHeight - cameraY
```

Do not allow individual gameplay systems to invent their own coordinate
calculations.

Create one shared grid/world coordinate utility.

------------------------------------------------------------------------

# 13. Camera

The camera should operate independently from the simulation.

``` text
WORLD COORDINATES
       ↓
Camera
       ↓
SCREEN COORDINATES
       ↓
Canvas
```

The simulation should continue using grid coordinates even when the
camera moves.

This prevents camera movement from affecting NPC logic, pathfinding,
tasks, or resource positions.

------------------------------------------------------------------------

# 14. Sprite Scaling

Pixel art should remain crisp.

Avoid smoothing when scaling pixel-art assets.

Conceptually:

``` text
imageSmoothingEnabled = false
```

Use integer or controlled scaling whenever possible.

Do not resize sprites differently for individual objects unless the
asset specification explicitly requires it.

------------------------------------------------------------------------

# 15. Asset Naming Convention

Use predictable names.

Recommended:

``` text
grass_01.png
grass_02.png

road_horizontal.png
road_vertical.png
road_corner_ne.png

fence_horizontal.png
fence_vertical.png
fence_corner_ne.png
fence_gate.png

tree_01.png
tree_02.png

rock_01.png

building_hq_lv1.png
building_hq_lv2.png

npc_idle_down.png
npc_walk_down_01.png
npc_walk_down_02.png
```

Use semantic names instead of random names.

------------------------------------------------------------------------

# 16. Asset Registry

Do not scatter asset paths throughout gameplay code.

Create a centralized asset registry.

Conceptual structure:

``` text
assets/
├── terrain/
├── paths/
├── objects/
├── resources/
├── buildings/
├── npc/
├── zombies/
├── effects/
└── ui/
```

Then maintain a registry such as:

``` text
assetRegistry
├── terrain
├── paths
├── objects
├── buildings
├── npc
├── zombies
└── effects
```

Gameplay systems should request an asset by logical ID rather than
hard-coding file paths.

------------------------------------------------------------------------

# 17. World Object Definition

Every world object should have a data definition separate from its
rendering code.

Example:

``` text
Tree
{
    id
    type
    gridX
    gridY
    footprint
    walkable
    resourceType
    resourceAmount
    spriteId
}
```

The renderer reads this definition.

The simulation system modifies the definition.

The UI reads the definition.

This maintains separation of concerns.

------------------------------------------------------------------------

# 18. Interaction

Grid interaction should follow this flow:

``` text
User taps/clicks world
        ↓
Convert screen coordinate
        ↓
Convert to grid coordinate
        ↓
Find entity/object at cell
        ↓
Open interaction
        ↓
Update selected object/NPC
        ↓
UI displays information
```

Do not use raw pixel positions as the primary identity of an object.

------------------------------------------------------------------------

# 19. NPC Movement

NPC movement should remain grid-aware.

``` text
NPC
 ↓
Current Grid Cell
 ↓
Target Grid Cell
 ↓
Pathfinding
 ↓
Next Walkable Cell
 ↓
Movement Animation
 ↓
Arrive
```

The sprite visually interpolates between cells if smooth movement is
desired.

The underlying logical position remains grid-based.

------------------------------------------------------------------------

# 20. Building Occupancy

Buildings must reserve their grid footprint.

Example:

``` text
Building:

X X X
X X X
X X X

Occupied cells:
(5,5)
(6,5)
(7,5)
(5,6)
(6,6)
(7,6)
(5,7)
(6,7)
(7,7)
```

NPC pathfinding should treat occupied cells according to the building's
rules.

Entrances should be explicitly defined.

------------------------------------------------------------------------

# 21. Visual State vs Gameplay State

Keep these separate.

### Gameplay state

``` text
health
hunger
energy
task
inventory
position
target
resourceAmount
buildingLevel
```

### Visual state

``` text
sprite
animation
frame
direction
effect
highlight
```

Gameplay state determines visual state.

Visual state must not silently modify gameplay state.

------------------------------------------------------------------------

# 22. Recommended Integration Order

Do not replace the entire renderer at once.

## Phase 1 --- Grid Rendering Foundation

Implement/verify:

-   grid coordinate system
-   cell size
-   world-to-screen conversion
-   screen-to-world conversion
-   camera conversion
-   canvas rendering

Acceptance:

-   Every grid cell has a stable world position.
-   Camera movement does not change logical positions.

------------------------------------------------------------------------

## Phase 2 --- Terrain

Replace placeholder terrain with modular pixel-art tiles.

Implement:

-   grass
-   dirt
-   soil
-   terrain variation

Acceptance:

-   Terrain aligns perfectly to the grid.
-   No visible gaps between tiles.

------------------------------------------------------------------------

## Phase 3 --- Paths

Implement modular road/path tiles.

Acceptance:

-   Roads connect correctly.
-   Road appearance responds to neighboring cells.

------------------------------------------------------------------------

## Phase 4 --- Static Objects

Integrate:

-   trees
-   rocks
-   fences
-   ruins
-   resource nodes

Acceptance:

-   Objects have logical grid positions.
-   Collision/occupancy remains independent from sprite dimensions.

------------------------------------------------------------------------

## Phase 5 --- Buildings

Implement:

-   multi-cell footprints
-   entrances
-   building sprites
-   upgrade sprite variants

Acceptance:

-   Buildings occupy the correct cells.
-   Upgrading changes the appropriate visual asset without changing
    unrelated logic.

------------------------------------------------------------------------

## Phase 6 --- NPC Rendering

Integrate:

-   idle
-   walking
-   direction
-   sprite-sheet animation

Acceptance:

-   NPC logical position remains grid-based.
-   Animation does not control NPC state.

------------------------------------------------------------------------

## Phase 7 --- Zombie Rendering

Apply the same architecture to zombie entities.

Acceptance:

-   Zombie behavior remains independent from sprite implementation.

------------------------------------------------------------------------

## Phase 8 --- Interaction and UI

Connect world objects to:

-   selection
-   object information
-   survivor cards
-   task commands
-   variables
-   equipment
-   contextual actions

Acceptance:

-   Selecting an entity reads its logical data.
-   UI does not need to inspect sprite pixels to determine state.

------------------------------------------------------------------------

# 23. Existing Game Logic Must Be Preserved

This visual integration must NOT rewrite the core simulation merely to
accommodate the new art style.

Preserve existing systems for:

-   NPC state
-   needs
-   tasks
-   inventory
-   resources
-   buildings
-   zombies
-   commands
-   variables
-   pathfinding
-   game progression
-   save/load
-   APIs/backend integration where applicable

Only introduce adapters or renderer changes where necessary.

------------------------------------------------------------------------

# 24. Do Not Build the Map as One Large Image

Avoid:

``` text
map.png
```

containing the entire playable world.

Prefer:

``` text
grid data
+
tiles
+
objects
+
buildings
+
NPCs
+
effects
```

This allows:

-   dynamic resource changes
-   NPC movement
-   building upgrades
-   destruction
-   farming
-   zombie attacks
-   procedural/event changes
-   camera movement
-   future map expansion

------------------------------------------------------------------------

# 25. Performance Rules

Use lightweight assets.

Prefer:

-   small PNG/WebP assets where appropriate
-   sprite sheets for animation
-   asset caching
-   centralized loading
-   reuse of identical tiles
-   limited animation frame counts
-   redraw only when appropriate

Avoid creating thousands of unique full-size images for individual grid
cells.

------------------------------------------------------------------------

# 26. Responsive Canvas

The logical world resolution should not change simply because the device
screen changes.

Use:

``` text
Logical World
      ↓
Canvas / Viewport
      ↓
Device Screen
```

The camera and viewport determine what portion of the world is visible.

The grid remains stable.

------------------------------------------------------------------------

# 27. Mobile Considerations

Because the project targets mobile/Capacitor environments:

-   keep touch targets sufficiently large
-   avoid excessive canvas redraws
-   avoid extremely large textures
-   use object pooling where needed
-   keep UI separate from world rendering
-   support pinch/zoom only if required
-   avoid relying on hover states

World selection should support tap interaction.

------------------------------------------------------------------------

# 28. Compatibility With Existing Grid Canvas

The pixel-art system should be treated as a renderer on top of the
existing grid canvas.

``` text
Existing Game
      |
      v
Grid / World Model
      |
      v
Renderer Adapter
      |
      +---- Terrain Tiles
      +---- Objects
      +---- Buildings
      +---- NPCs
      +---- Zombies
      +---- Effects
      |
      v
Canvas
```

This means the project does NOT need to abandon the existing grid
architecture.

------------------------------------------------------------------------

# 29. Migration Rule

Do not simultaneously change:

-   game logic
-   grid architecture
-   NPC architecture
-   asset architecture
-   UI architecture
-   save system

during one implementation step.

Instead:

``` text
Logic stable
    ↓
Renderer integration
    ↓
Visual verification
    ↓
Next asset category
```

This makes regressions easier to identify.

------------------------------------------------------------------------

# 30. Definition of Done

The visual integration is considered successful when:

-   [ ] Grid remains the authoritative world coordinate system.
-   [ ] Terrain is tile-based.
-   [ ] Roads are modular.
-   [ ] Walls/fences are modular.
-   [ ] Objects have explicit grid footprints.
-   [ ] Buildings support multi-cell footprints.
-   [ ] NPCs render as lightweight pixel-art sprites.
-   [ ] NPC animation is independent of gameplay state.
-   [ ] Zombies use the same rendering architecture.
-   [ ] Resources are represented as logical entities.
-   [ ] Camera movement does not alter world logic.
-   [ ] Screen coordinates are converted through one shared system.
-   [ ] Assets are centrally registered.
-   [ ] Gameplay code does not contain scattered asset paths.
-   [ ] UI remains separate from world rendering.
-   [ ] Pixel-art scaling remains crisp.
-   [ ] Existing simulation logic remains functional.
-   [ ] Mobile/Capacitor performance remains acceptable.

------------------------------------------------------------------------

# 31. Final Architecture

The intended relationship is:

``` text
                 GAME SYSTEMS
                      |
        ┌─────────────┼─────────────┐
        |             |             |
      NPC           Building      Resource
      Logic           Logic         Logic
        |             |             |
        └─────────────┼─────────────┘
                      |
                  WORLD MODEL
                      |
                   GRID MAP
                      |
                 RENDER SYSTEM
                      |
        ┌─────────────┼─────────────┐
        |             |             |
      Tiles         Objects        Actors
        |             |             |
        └─────────────┼─────────────┘
                      |
                    Canvas
                      |
                    Camera
                      |
                  Device Screen
```

## Core Principle

**The game should think in grid cells and entities. The renderer should
think in sprites and pixels.**

This allows CODE_AFTERmath to adopt the visual style of a lightweight
top-down pixel-art simulation game without making the art system
responsible for the game's business/simulation logic.
