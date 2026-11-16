# Asset index (central registry)

Authoritative for: how assets are named, resolved and where they live. Sprite rules → `AI_MEMORY/assets/SPRITE_INDEX.md`. Per-domain lists → `NPC_ASSETS.md`, `BUILDING_ASSETS.md`, `RESOURCE_ASSETS.md`, `UI_ASSETS.md` (same folder).

**Status:** there are NO image files for the game. Every frame comes from the in-code placeholder atlas (`buildPlaceholderManifest` + `paintPlaceholderAtlas` in `src/modules/assets/index.js`). `.gitignore` excludes `*.png`. Real art is PLANNED (phase I1) and swaps in by supplying a different manifest + image; nothing in gameplay changes.

## How an asset is chosen

`renderProjection` (semantic state: animation name, direction, building `assetKey`, node `visual`) → `createAssetResolver(manifest)` (`resolveNpc`, `resolveBuilding`, `resolveNode`) → atlas frame(s) → `frameIndexAt` (animation player, presentation only) → canvas.

Fallback chains (the step is reported to the debug overlay):
- NPC: 1 exact action+direction → 2 same action, nearest direction → 3 compatible generic action (`gather|repair→work`, `eat|drink→consume`, …) → 4 idle in the current direction → 5 safe default idle (DOWN) → 6 nothing (renderer draws a procedural marker).
- Building: exact → same condition, lower level → same condition, higher level → nothing.
- Node: exact → the `available` look of that type → nothing.

## Registry (current semantic ids)

| Semantic id (pattern) | Type | Domain | Actual file path | Used by | Visual purpose | State/upgrade variants | Status |
|---|---|---|---|---|---|---|---|
| `npc_survivor_<action>_<direction>` (frames suffixed `_0`, `_1`) | animated NPC | NPC | none (generated in code) | `renderProjection.npcs[].animation` + `direction` | survivor body | actions idle, walk(2), gather(2), repair(2), rest, eat, drink, downed × 8 directions | IMPLEMENTED (placeholder) |
| `building_<type>_lv<level>_<condition>` | static building | BUILDING | none (generated) | `buildings[].assetKey` from `src/modules/buildings/index.js` `assetKey` | building look by state | conditions ruined, damaged, repaired; levels from definitions (hq 1–2, fence 1–2, tent 1, storage 1, gate 1) | IMPLEMENTED (placeholder) |
| `node_<type>_<visual>` | static node | RESOURCE | none (generated) | `nodes[].visual` | resource node | `available`, `depleted` for `tree`, `rock` | IMPLEMENTED (placeholder) |
| terrain zones/paths | procedural | WORLD | none | `renderProjection.terrain` | forest zone, path | — | IMPLEMENTED (drawn by `src/modules/render/index.js`) |

Directions (kernel vocabulary `DIRECTIONS`): `UP, UP_RIGHT, RIGHT, DOWN_RIGHT, DOWN, DOWN_LEFT, LEFT, UP_LEFT` (lower-cased inside keys).

## Dotted semantic ids (planned)

The master prompt prefers `npc.survivor.default`, `building.hq.level1`, `resource.wood.node`, `item.axe.basic`. **PLANNED, not implemented.** Do not rename keys until the resolver, manifest loader and tests move together (`tests/assets-render.test.js` pins the current naming).

## Visual reference only

`docs/game/media/npc-reference-style.jpeg` (style reference for the NPC sprite sheet; not loaded by the game).
