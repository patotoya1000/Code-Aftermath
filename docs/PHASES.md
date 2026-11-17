# Build phases & tracker

> **Correction pass (C0–C9) comes first.** Detailed checklists with status live in
> [`docs/correction/`](correction/). Major gameplay stays frozen until C9 is fully green.
> The old “Phase 2…9” list below is kept for history; the dependency-ordered plan is
> `correction/CODE_AFTERmath_IMPLEMENTATION_PHASES.md` (I0–I15).

## Real-time pivot (2026-11-12) — replaces the turn model from C2
- [x] **R1** continuous clock: clock driver (play/pause/1×–4×), strategy points regenerate over time, turns removed, command timeline + `replayTimeline`, `runUntil`
- [x] **R2** standing actions: looping `gather(resource, load, total)`, stop reasons, `task.*` events, `survivor.lastTask`, replace-vs-queue (+ `survivor.queue()`), storage reserved per batch
- [x] **S0–S5 stabilization (2026-11-13)** — engine/lesson/UI bug fixes, free-play save/load, regression + soak tests. See `IMPLEMENTATION_PLAN_2026-11-13.md`
- [x] **R4a** needs policies (interrupt → act → resume) — 2026-11-14, see `game/15-realtime-simulation-and-tasks.md` §R4a · [x] **R4b** learner event hooks — 2026-11-14 · [x] **R3** carry + deposit trips — 2026-11-16, see `game/15-realtime-simulation-and-tasks.md` §R3 · [x] **R5** lessons on the timeline model · [x] **O3** collision/pathing — 2026-11-16 (A*, gate is the only opening in the fence; see `game/15-realtime-simulation-and-tasks.md` §O3)
- [x] **O5** building upgrades (2026-11-16) — design: no free construction; buildings start ruined, are repaired, then upgraded. Planned: environment → farming (field/greenhouse/hydroponic, farming handler DONE) → cooking (kitchen) → crafting (workshop).
- [x] **O6** environment: day/night + public weather calendar (2026-11-16)
- [x] **O9** spoilage + cold cellar (2026-11-16) — bread spoils after 4 days; storehouse level 2 slows it. Next: power (freezer) → crafting (farming field→greenhouse handler done).
- [x] **O8** recipe engine + kitchen + bread (2026-11-16) — `survivor.cook(recipe, count)`, ruined kitchen to repair, wheat → bread (+40 hunger), `eat(item)` / `policy("eat", { prefer })`; design in `docs/game/16-farming-cooking-power-design.md`. Next: spoilage + cold cellar → power → crafting (farming field→greenhouse handler done).
- [x] **O7** water: deep well, aquifer recharge, siphon, water tank (2026-11-16) — design in `docs/game/17-water-wells.md`
- [x] **UI-1** Codebook (2026-11-17) — API-generated manual, BOOK panel, search, insert example; spec `game/19-codebook-and-ui-display.md`.
- [x] **UI-2** live inspection (2026-11-17) — selected survivor/building/resource panels read current state, task status, route and stop reason without mutating the simulation.
- [x] **UI-3** contextual help (2026-11-17) — the tutor suggests relevant commands for a selected survivor/building/node and links them to the Codebook; rejected or invalid calls surface the same entry links without mutating the simulation.
- [x] **UI-4** lesson ↔ Codebook links (2026-11-17) — lesson starter code extracts the actual API calls and turns them into direct open-book buttons, reusing the same authoritative command metadata instead of duplicating API text.
- [x] **UI-5** mobile tabs (2026-11-17) — narrow-screen layout uses a tab bar for World / Code / Book / Inspect / Lessons, keeping the same read-only game data and panel behavior without inventing new simulation behavior.
- [x] **UI-6** final polish (2026-11-17) — accessibility and motion refinements on the existing shell: explicit focus states, gentle interaction transitions, and reduced-motion handling without changing any gameplay or API contracts. Next: continue with the next gameplay phase when the current shell is stable.
- [x] **PA-1** (2026-11-17) shared grid↔pixel + camera (`viewport` module), renderer migrated, no visual change at the default camera
- [x] **PA-2** (2026-11-17) terrain tiles: ground grid derived from the render projection (grass / dirt yard + path / damaged under ruins / soil by zone), 4+3+2+2 placeholder tile variants chosen by a coordinate hash, pixel-covering draw with no seams, only visible cells drawn (`assets/terrain.js`, `tests/terrain.test.js`)
- [x] **PA-3** (2026-11-17) paths: road pieces chosen from the 4 neighbours (16 masks → straight h/v, 4 corners, 4 T, cross, 4 ends, isolated); a gate joins the road that leaves it; `pathCells`, `resolvePath`, `renderer.lastPaths`; `tests/paths.test.js`
- [x] **PA-4** (2026-11-17) static objects + fence autotiling: fence pieces chosen from neighbours on the fence line (straight/corner/end, gate joins, per level × condition), object registry with explicit logical footprint vs sprite size (tree drawn 1.5× its 1×1 cell), trees and survivors depth-sorted by row; `assets/objects.js`, `tests/objects.test.js`
- [x] **PA-5** (2026-11-17) multi-cell buildings — the one PA phase that touches the simulation, on purpose: a building definition may declare a `footprint` (rectangle relative to its DOOR cell, which stays the building's `x, y`); every footprint cell blocks walking, survivors still walk to the door, scenario validation rejects overlaps / fence-line contact / a survivor starting inside. The HQ is 3×3. Renderer draws the sprite across the footprint, tap/selection/ground use every cell. `SIM_VERSION` 0.13.0 (state now carries `footprint`). `tests/footprint.test.js`
- [x] **PA-6** NPC sprites (2026-11-17): expanded placeholder sprite set for readable actor states (`work`, `guard`, `attack`, `hurt`, `dead`), kept in the renderer-only asset layer; fallback chain still resolves without touching gameplay state. `tests/assets-render.test.js`
- [x] **PA-7** zombies (2026-11-17): same renderer-only architecture as survivors, with zombie animation keys, projection compatibility, and hit-testing added without creating gameplay rules. `tests/assets-render.test.js`
- [x] **PA-8** interaction and UI (2026-11-17): selection, hover, logical lookup, and contextual overlays remain renderer-only and do not create new simulation rules. `tests/assets-render.test.js`
- Order changed: R4 before R3 — the learner must be able to *react* before the economy gets deeper (reasoning in the plan).
- Spec: `docs/game/15-realtime-simulation-and-tasks.md`. The C2 line below ("turn-based free play") is historical.

## Correction status (this session)
- [x] C0 baseline · [x] C1 sandbox boundary · [x] C2 turn-based free play · [x] C3 no fake controls
- [x] C4 one renderer · [x] C5 world geometry · [x] C6 data-driven UI · [x] C7 asset resolver · [x] C8 Survivor Card
- [x] C9 completion gate — 11/11 (browser smoke passes)
- I0 ✅ · I1 🟡 placeholder atlas only · I2 ✅ · I3 🟡 in progress (lesson player UI + curriculum content) · I4 🟡 in progress (capability system implemented) · I5–I15 not started

Legend: [x] done and tested · [ ] to do. A phase is finished only when its **gate** passes.

## Phase 0 — Proof spike ✅
- [x] Seeded RNG, hashing, event log (kernel)
- [x] Sandboxed learner code (Worker) with time limit, command cap, static safety check
- [x] Game API v1 contract + command builder
- [x] Action queue, lifecycle, tick loop, event log
- [x] Lesson validator + feedback; deterministic replay
- **Gate** (`tests/gate-phase0.test.js`): pipeline works end to end · replay identical · runaway code stopped · learner cannot mutate state · different coding styles pass

## Phase 1 — Core state & Stage 1 world ✅
- [x] Survivor schema v1 (identity / needs / attributes / skills / traits / inventory / equipment / occupation / position)
- [x] Resource ledger (reserve / commit / release) — no double-spend
- [x] Buildings & fence as data with level, health and ruined/damaged/repaired condition
- [x] Stage 1 scenario (HQ, tent, fence, 3 trees, rock), 7 commands: moveTo, gather, rest, eat, drink, repair, stop
- [x] Needs decay, derived conditions, starvation → downed
- [x] Read-only projections (student view, render projection, Inspector card)
- [x] Save/load with integrity check (memory + IndexedDB), progress that only grows
- [x] Debug view + learner shell (editor, lessons, feedback, replay, save/load); 4 starter lessons
- [x] Command console mode (superseded by R1/R2): was per-turn budget + Next Turn; now strategy points + a real-time clock
- **Gate**: save/load identical · no double-spend · retries never corrupt progress · same inputs ⇒ same hashes · strategy points respected

## Phase 2 — Renderer, asset resolver, Inspector  (delivered by C4/C5/C7/C8)
- [x] `render` module: canvas renderer consuming the render projection (replaced `debugview`, now removed)
- [x] `assets` module: semantic IDs (`npc_survivor_walk_down_right`, `building_fence_lv1_ruined`) → atlas frames, with the 5-step fallback chain
- [x] Placeholder atlas generated in code (transparent PNG, fixed frame, foot pivot, no text) so real art can drop in
- [x] 8-direction animation playback; animation never changes state
- [x] Survivor Card UI (portrait slot, needs, attributes, task)
- **Gate**: swap the atlas without touching gameplay · missing frame falls back to idle · building visual changes only via state

## Phase 3 — Learner shell & curriculum
- [x] Editor upgrades (API panel, safety feedback, run-in-sandbox) + lesson player UI + progress screen
- [x] Campaign Modules 1–3 as data (7 lessons: M1 wood/rest/fence, M2 loop/variable, M3 condition/function)
- [x] Hidden seeded test scenarios per lesson (unique `seed` per lesson for deterministic replay)
- [ ] Step/inspect mode UI (state reserved in mainscreen.js; UI pending — next: line-by-line execution stepping)

## Phase 4 — Capability & task resolution
- [ ] Attributes, skills, traits, needs effects (data)
- [ ] Equipment effect model; capability check before action acceptance
- [ ] Task-resolution framework (each task declares its factors); building level as functional modifier
- [ ] Ordinary work tasks on top of it

## Phase 5 — Loops, collections, carry
- [ ] Multiple survivors, task queues, inventory + carry capacity + encumbrance
- [x] Gather → carry → deposit (R3; encumbrance/equipment effects still open)

## Phase 6 — Progression
- [x] Skill XP with diminishing returns (O4, 2026-11-16, see `game/15-…` §O4)
- [ ] Training buildings, specialization unlocks

## Phase 7 — Production & environment
- [x] Farming (O10) and power: generator, solar panel, freezer (O11)
- [ ] Crafting / workshop, hydroponic level, battery, reusable planning routines (cooking and day/night/weather already done)

## Phase 8 — Events & defense
- [ ] Event framework (preparation → travel → execution → risk → recovery → result)
- [ ] Supply scavenge, zombie nest raid, defense waves, capstone automation

## Phase 9 — Later
- [ ] Weapons/infrastructure, instructor tools, balancing, final art

## Open design items (from the docs) that gate later phases
attribute & skill lists · formula coefficients · building level effects · event curves · XP thresholds · trait catalog ·
enemy/resource/material/consumable/weapon visuals · final atlas size & frame counts · first-release language.
