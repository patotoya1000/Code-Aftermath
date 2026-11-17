# Changelog of architectural transitions

Purpose: stop future agents from following stale documentation. When an old document says OLD, the answer is CURRENT. Dates come from `docs/PHASES.md` and `docs/IMPLEMENTATION_PLAN_2026-11-13.md`.

> **WARNING — do not restore anything marked OLD.** Many files under `docs/correction/` still describe OLD behaviour; they are historical and carry a banner. Only `docs/game/15-realtime-simulation-and-tasks.md`, `README.md` and `AI_MEMORY/` describe the active model.

| When | OLD (obsolete) | CURRENT |
|---|---|---|
| 2026-11-12 (R1) | **Turn-based simulation**: `startTurn()`, `executeTurn()`, `getTurnInfo()`, NEXT TURN, 3 commands per turn (C2, 2026-11-11) | **Real-time simulation**: clock driver → `sim.step(n)`; strategy points regenerate over time; `runUntil` for open-ended tests |
| 2026-11-12 (R2) | gather = one batch per command | **Standing gather**: trips of `load` until `TARGET_REACHED` / `STORAGE_FULL` / `NO_TARGET` / `EXHAUSTED`; `survivor.lastTask` says why |
| 2026-11-12 (R2) | every command appended to the queue | **First command of a program replaces, later ones queue, `survivor.queue()` appends** |
| earlier (C1) | learner code directly controls state / the UI parsed commands with a regex | **Learner requests actions** through Sandbox → Game API → Command Builder |
| earlier (C4) | `debugview` module | **One production renderer** (`render`) over the render projection |
| earlier (C7) | rendering without an asset resolver | **Semantic asset keys + asset resolver** with a fallback chain |
| 2026-11-13 (S0–S5) | the removed turns.test.js; `app.runTurnCode`; free-play progress not saved; `node_modules` tracked | **`tests/stabilization.test.js`**; no turn code in `src/app`; free-play save = command timeline + hash; `.gitignore` |
| 2026-11-14 (R4a) | survival fully manual | **Needs policies** (interrupt → act → resume) |
| 2026-11-14 (R4b) | no reaction to events | **Learner event hooks** (source text stored in state, run in the sandbox by the session) |
| 2026-11-16 (R3) | gathered units went straight into base stock; HQ-only capacity; storehouse a decoration | **Carry + deposit**: units move node → survivor's hands → base stock via a walk to the nearest working storage building; `survivor.deposit()`; capacity pooled over working buildings (HQ + tent + repaired storehouse); `SIM_VERSION` 0.5.0 |
| 2026-11-16 (O3) | survivors walked in a straight line through buildings and the fence (`stepToward`; its `_state` collision check was dead code) | **Pathing**: deterministic A* (`buildings/pathing.js`); buildings and the fence perimeter block, the gate is the only opening; routes cached on the action; no way → `NO_PATH`; `SIM_VERSION` 0.7.0 |
| 2026-11-16 (O4) | skills were fixed numbers; gather skill added +3%/level to the trip load (could exceed the requested amount) | **Skill XP**: simulation awards XP from work (gather per unit, repair, tiles walked, rest ticks, meals); levels 0–10; `skill.levelup`; skills only speed work up — a requested gather amount is a hard cap; `SIM_VERSION` 0.8.0 |
| 2026-11-16 (O5) | upgrades existed only as level-2 data | **`survivor.upgrade(building)`**: repaired building → next level (materials reserved, Repair ≥ 1, `building.upgraded`); per-level `storage`; `building.upgrade` offer in the learner view; `SIM_VERSION` 0.9.0. Design decision: no free construction — buildings are ruins to repair, then upgrade |
| 2026-11-16 (O6) | no time or weather | **Environment**: `environment` module — day/night clock and a fixed, public 4-season weather calendar (pure function of the tick, no saved state, no randomness); learner reads `world.time/weather/forecast/nextChange/calendar`; HUD + calendar panel; `time.dawn/dusk`, `weather.changed`, `season.changed` events |
| 2026-11-16 (O7) | water had no source: 6 starting units, then nothing | **Water**: `water` module; deep well = renewable source building (reservoir is ledger account `source.<id>`, aquifer +amount every `every` ticks scaled by weather `recharge` %, integer accumulator); `gather("water")` draws from it and WAITS at an empty well (`waitTicks`); level-2 siphon auto-stores into base stock while a working water store is within `reach`; water tank building; `storageRoom` shared by gatherers and siphons; `SIM_VERSION` 0.10.0 |
| 2026-11-16 (O8) | food was one item (`food`, +30), `eat()` took whatever was there; no production | **Recipe engine + kitchen + bread**: `data/recipes.js`; station building `kitchen` (ruined in the scenario; repair it); standing `survivor.cook(recipe, count)` (batches, inputs reserved per batch and spent when the batch finishes, outputs into base stock; stop reasons `TARGET_REACHED` / `NO_INGREDIENTS` / `STORAGE_FULL` / `EXHAUSTED` / `NO_STATION`); items `wheat` (starting stock 10) and `bread` (+40); `eat(item?)` + `policy("eat", { prefer })` choose among foods (`actions.eat.items`, lowest `rank` first by default); cooking skill + XP; learner reads `recipes`, `foods`; `SIM_VERSION` 0.11.0 |
| 2026-11-16 (O9) | food never went off; stock was a plain counter | **Spoilage**: `spoilage` module; items with `shelfLife` (bread 4 days) keep age batches beside the ledger, eaten oldest first, aged once a day at dawn, spoiled units leave through `ledger.discard` (`food.spoiled`); storehouse level 2 (upgrade 25 wood + 30 stone) is a cold cellar: its 30 oldest units age 2× slower; `base.perishables`, `building.cold`; `SIM_VERSION` 0.12.0 |
| 2026-11-15 | no project memory layer | **`AI_MEMORY/`** navigation layer + `tests/invariants.test.js` (turn-model guard, projection purity, terminal-action finality, event/state agreement, AI_MEMORY accuracy) |

## Historical-only material (do not treat as requirements)

- `docs/correction/*.md` — the C0–C9 correction pass, written for the turn-based model. Parts (C2, "Next Turn", "3 commands per turn") are OBSOLETE.
- `docs/PHASES.md` line "C2 turn-based free play" — historical (marked in the file).
- `scripts/legacy-debug/*.mjs` — scratch debugging scripts moved out of the repo root (B20). Not part of the build or tests.
- Test expectations of the old turn model were replaced, not deleted: see `tests/stabilization.test.js` ("the old turn API is gone") and `tests/realtime.test.js` ("there is no per-turn command cap").

## Upcoming (not done)

production · environment · events · combat · enemies · buildings (BUILD/upgrade) · final assets · offline/release. See `AI_MEMORY/IMPLEMENTATION_STATUS.md`.
| 2026-11-17 (PA-1) | the renderer kept its own `scale`/`offsetX`/`offsetY` and `x * scale + offset` formulas in ~20 places; no camera | **`viewport` module** is the only grid↔pixel conversion; camera (pan, zoom) is presentation-only; default view identical; a stray undefined `scale` in the marker fallback fixed |
| 2026-11-17 (UI-1) | the "Available API" pane printed `describeApi()` as a flat list; no manual for reads, stop reasons or concepts | **Codebook** generated from the Game API + curated metadata, drift-tested; `docs/game/18-…` (pixel-art integration) and `19-…` (Codebook/UI) filed as specs |
| 2026-11-17 (PA-2) | flat colour ground with a brown rectangle per path cell | **Terrain tiles**: ground grid derived from the projection, hash-chosen tile variants, `resolveTerrain` fallback, seam-free covering rects; renderer + assets only, simulation untouched |
| 2026-11-17 (PA-3) | one brown rectangle per path cell | **Modular roads**: 16 connection-mask pieces chosen from neighbouring road cells and gates; renderer + assets only |
| 2026-11-17 (PA-4) | the fence was one whole-building sprite per perimeter cell; nodes always drawn under survivors | **Fence autotiling** from neighbours (+ level/condition pieces), **object registry** with explicit footprint vs sprite size, **row depth sorting** of trees and survivors; renderer + assets only |
| 2026-11-17 (PA-5) | every building occupied exactly its own tile; the HQ was a 1×1 blocker drawn as one sprite | **Multi-cell buildings**: definition `footprint` relative to the door cell; all footprint cells block walking, survivors still walk to the door (`x, y`); layout validation; HQ is 3×3; renderer draws across the footprint; `SIM_VERSION` 0.13.0 (state carries `footprint`; older saves are refused by the version check) |
