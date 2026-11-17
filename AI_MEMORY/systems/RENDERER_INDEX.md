<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Renderer, projection, Inspector and UI shell

# Purpose

Show the world. The renderer consumes the RENDER PROJECTION only and never changes gameplay. The UI shell reads frozen projections and sends learner code through the app.

# Responsibilities

- `projection` module: `studentView` (what learner code may read), `renderProjection` (positions, directions, semantic animation, building `assetKey`, node visuals, terrain, stock), `inspectorCard` (survivor card). All deep-frozen plain data.
- `render` module: `mountRenderer(canvas, opts)` → `{ draw(frame), pick, screenToTile, select, clearSelection, getSelected, setDebug, lastDrawList, resolver }`. Pipeline: projection → semantic state → asset resolver → atlas frame → animation player → canvas. Optional presentation-only smoothing; debug overlay (`?debug`).
- `viewport` module (PA-1, `src/modules/viewport/index.js`): the ONLY grid↔pixel conversion (`gridToScreen`, `cellRect`, `cellCenter`, `cellFoot`, `screenToGrid`, `screenToCell`, `visibleCells`) and the camera (`panBy`, `zoomAt`, `setZoom`, `centerOn`, `resetCamera`, optional `integer` scale). Pure, frozen values. The renderer keeps one viewport as camera state and exposes `viewport`, `pan`, `panPixels`, `zoomAt`, `setZoom`, `centerOn`, `resetCamera`; no on-screen controls yet.
- Terrain (PA-2, `src/modules/assets/terrain.js`): `groundGrid(frame)` → ground kind per cell, `tileKeyAt` → `terrain_<ground>_NN` (variant from a coordinate hash, never the sim RNG). The renderer draws visible cells only, using `cellRectCovering` (viewport) so tiles overlap by <1px and never leave seams; `renderer.lastTerrain` lists tiles drawn (separate from `lastDrawList`, which stays entities only).
- Paths (PA-3, same file): `pathCells(frame)` → `{ x, y, mask, key }` (N=1 E=2 S=4 W=8; neighbouring road cells and gates connect), `resolvePath`; drawn after the ground tiles, before entities; `renderer.lastPaths`.
- Objects + fence (PA-4, `src/modules/assets/objects.js`): `fenceCells(frame)` → `{ x, y, mask, level, condition, key }`, `resolveFence`; `objectSpec(type)` → `{ footprint, spriteSize }` (logical footprint is what interaction may rely on, never the sprite size); survivors and nodes are drawn together sorted by row.
- Multi-cell buildings (PA-5): `buildingRect/buildingCells/buildingPlacement` (assets/objects.js); a building with a projection `footprint` is drawn across it (sprite as wide as the footprint, frame bottom on its bottom edge); pick/selection/debug/damaged ground use every cell; 1×1 buildings unchanged.
- UI shell (`src/app/mainscreen.js`): frame loop → `clock.update(dt)` → projections → renderer/inspector/event feed; CODE editor → `app.runCode`; lesson panel; save/load; selection.

# Does NOT Own

- Private coordinate math: do not write `x * tileSize + offset` anywhere; use `src/modules/viewport/index.js` (`tests/viewport.test.js` greps the renderer).
- Gameplay state, completion of actions (animation never decides completion).
- Asset files/art (ASSETS).
- Any import of `simulation` or `actions` (enforced by `tests/architecture.test.js`).

# Core Data

Render projection shape in `renderProjection` (`src/modules/projection/index.js`). Animation request values: `IDLE, WALK, GATHER, REPAIR, REST, EAT, DRINK, DOWNED`.

# State

Renderer-local only: selection, debug flag, animation offsets, smoothing. None of it feeds back.

# Commands / API

UI→simulation only through `app.runCode`, `app.runLesson`, `clock.play/pause/cycleSpeed`, `app.saveFreePlay/loadFreePlay`. The UI does not call `sim.submit`.

# Events

Reads events via `log.since(cursor)` for the feed.

# Dependencies

render → assets (manifest); projection → resources, survivors, buildings.

# Dependents

`src/app`.

# Source Files

- `src/modules/render/index.js`
- `src/modules/projection/index.js`
- `src/app/mainscreen.js`
- `src/app/index.js`

# UI Files

- `index.html`
- `src/app/mainscreen.css`
- `src/app/mainscreen.js`

# Asset Files

`AI_MEMORY/assets/ASSET_INDEX.md`

# Tests

- `tests/assets-render.test.js`
- `tests/ui-wiring.test.js`
- `tests/invariants.test.js` (projection purity/frozen)
- `tests/architecture.test.js` (render must not depend on simulation/actions)
- `scripts/smoke.mjs` (real browser, `npm run smoke`)

# Current Status

IMPLEMENTED with placeholder art. Seven bottom-bar buttons (ASSIGN TASK, TASK, BUILD, SURVIVORS, RESEARCH, MENU, SETTINGS) are intentionally disabled "coming soon" controls (smoke test asserts 7).

# Known Problems

- Browser smoke (`npm run smoke`) needs Playwright + Chromium (the installed Playwright build must match the browser build). It passed 20/20 on 2026-11-15 after R4a/R4b.
- Lesson mode runs in an isolated simulation, so the map does not show lesson runs (O2).
- Step/inspect mode: state variables reserved in `mainscreen.js`, no UI.

# Planned Changes

R5: lessons shown on the map; final art swaps the atlas through the manifest.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- The renderer must not import `simulation`, `actions`, `session` or read GameState.
- The UI must not parse learner commands itself or invent gameplay numbers.
- Do not store gameplay-relevant data in renderer state.

# Related Documentation

- `docs/game/09-rendering-boundary-and-ui.md`
- `docs/game/10-assets-specification.md`
- `docs/game/11-npc-visual-spec.md`
