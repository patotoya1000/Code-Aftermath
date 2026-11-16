# Implementation status

Authoritative for: what exists *now* (verified in code on 2026-11-16; `npm test`: 203 tests, 0 failing). Legend: IMPLEMENTED · PARTIALLY IMPLEMENTED · PLANNED · BLOCKED · OBSOLETE · NEEDS REFACTOR · NEEDS TESTS · NEEDS DOCUMENTATION. Nothing is listed IMPLEMENTED without source evidence.

## Systems and domains

| Area | Status | Evidence |
|---|---|---|
| Real-time clock driver (play/pause, 1×/2×/4×, frame cap) | IMPLEMENTED | `src/modules/simulation/clock.js`, `tests/realtime.test.js` |
| Simulation tick + strategy points + command timeline | IMPLEMENTED | `src/modules/simulation/index.js` |
| Action engine + lifecycle + reservations | IMPLEMENTED | `src/modules/actions/engine.js`, `lifecycle.js` |
| Standing gather (stop reasons) | IMPLEMENTED | `src/modules/actions/handlers/gather.js` |
| move, rest, eat, drink, repair, stop | IMPLEMENTED | `src/modules/actions/handlers/` |
| Replace vs queue, `survivor.queue()` | IMPLEMENTED | `src/modules/session/index.js` `submitCalls` |
| Capability gating + modifiers | IMPLEMENTED (modifier constants in code → NEEDS REFACTOR into data) | `src/modules/capability/index.js` |
| Needs decay, conditions, starvation | IMPLEMENTED | `src/modules/survivors/index.js` |
| Needs policies (R4a) | IMPLEMENTED | `src/modules/actions/policies.js`, `tests/policies.test.js` |
| Learner event hooks (R4b) | IMPLEMENTED (free play only) | `src/modules/simulation/hooks.js`, `src/modules/session/index.js`, `tests/hooks.test.js` |
| Game API v1 (13 commands incl. `deposit`) | IMPLEMENTED | `src/modules/api/v1.js` |
| Sandbox (static check, Worker, budgets, hardening) | IMPLEMENTED | `src/modules/sandbox/` |
| Resource ledger, nodes, depletion | IMPLEMENTED (no regeneration) | `src/modules/resources/ledger.js` |
| Base storage capacity (HQ) | IMPLEMENTED | `gather.js` `storageSpace` |
| Carry capacity, inventory items, gather→carry→unload trips, `deposit()` (R3) | IMPLEMENTED (no equipment/encumbrance) | `src/modules/actions/handlers/gather.js`, `carry.js`, `deposit.js`, `src/modules/survivors/index.js`, `tests/carry.test.js` |
| Pooled storage (HQ + tent + repaired storehouse) | IMPLEMENTED | `src/modules/buildings/index.js` `storageCapacity` |
| Buildings: health, condition, repair | IMPLEMENTED | `src/modules/buildings/index.js` |
| Buildings: upgrade (`survivor.upgrade(building)`, level 1→2 for HQ and fence; needs a fully repaired building, materials, Repair skill 1) | IMPLEMENTED | `actions/handlers/upgrade.js`, `buildings` `nextUpgrade`, `tests/upgrade.test.js` |
| Buildings: free placement / construction from scratch | OBSOLETE by design — buildings start as ruins in the scenario and are repaired (decision 2026-11-16) | — |
| Buildings: occupancy | PLANNED | — |
| Buildings: storage effect (storehouse adds capacity when repaired) | IMPLEMENTED | `world.js` `storage` table, `storageCapacity` |
| World: one map, three scenarios, layout validation | IMPLEMENTED | `src/modules/world/index.js`, `definitions/index.js` |
| Collision / pathing (O3): A* routes, buildings + fence perimeter block, gate is the opening, `NO_PATH` | IMPLEMENTED (no unit-vs-unit collision; nodes do not block; depot choice still by straight-line distance) | `src/modules/buildings/pathing.js`, `actions/handlers/shared.js` `walkStep`, `tests/pathing.test.js` |
| Skills: XP from work, levels 0–10, diminishing returns, `skill.levelup`, `survivor.skillProgress`, card XP bars (O4) | IMPLEMENTED | `definitions/data/survivors.js` `progression`, `survivors/index.js` `awardSkillXp`, `tests/skills.test.js` |
| Skills: training buildings, specialization, failure-XP, attribute training; `observant`, `hardy` have no effect | PLANNED | — |
| Equipment, occupation, progression | PLANNED | empty fields in the survivor schema |
| Environment: day/night clock, 4-season weather CALENDAR, public forecast, `time.*`/`weather.changed`/`season.changed` events, HUD + calendar panel, night/weather tint (O6) | IMPLEMENTED (information only — weather has no gameplay effect until farming/hazards use it) | `src/modules/environment/index.js`, `definitions/data/environment.js`, `tests/environment.test.js` |
| Production (farming, cooking, crafting), power (generator → advanced generator / solar panel) | PLANNED | design in `docs/game/16-farming-cooking-power-design.md` |
| Events framework / risk events | PLANNED | log exists; no risk events |
| Zombies, combat, enemies | PLANNED / NOT IMPLEMENTED | no code (`AI_MEMORY/domains/ZOMBIE_INDEX.md`) |
| Projections (student, render, inspector) | IMPLEMENTED | `src/modules/projection/index.js` |
| Renderer (canvas, picking, smoothing, debug) | IMPLEMENTED with placeholder art | `src/modules/render/index.js` |
| Asset resolver + in-code placeholder atlas | IMPLEMENTED (dotted semantic ids PLANNED) | `src/modules/assets/index.js` |
| Final art / real sprite sheets | PLANNED (I1) | none in repo; `*.png` is git-ignored |
| Lessons: 8 lessons as data + pure checks | IMPLEMENTED; validators NEEDS REFACTOR (keyword/regex, single scenario) | `src/modules/lessons/`, `AI_MEMORY/systems/LESSON_INDEX.md` |
| Lessons on the real timeline, shown on map (R5) | IMPLEMENTED | `src/modules/session/index.js` `tests/lesson-timeline.test.js` |
| Free-play save/load, campaign progress | IMPLEMENTED | `src/modules/persistence/index.js`, `src/app/index.js` |
| Replay verification | IMPLEMENTED | `src/modules/replay/index.js` |
| UI shell (editor, inspector, lessons, save/load) | IMPLEMENTED | `src/app/mainscreen.js` |
| Seven bottom-bar controls (ASSIGN TASK … SETTINGS) | PLANNED (disabled in UI) | `index.html` |
| Step/inspect mode UI | PLANNED | state reserved in `mainscreen.js` |
| Browser smoke (`npm run smoke`) | IMPLEMENTED — 20/20 checks passed on 2026-11-16 after R3 (real Chromium) | `scripts/smoke.mjs` |
| Pruning of finished actions (O1) | PLANNED | `state.actions` grows forever |
| Offline/release packaging | PLANNED | none |

## OBSOLETE (kept only as history)

- Turn-based model and its docs: `docs/correction/*.md` (banner added). Not present in code.
- `scripts/legacy-debug/*.mjs` (scratch scripts; not used by `npm test`).
- `docs/PHASES.md` line "C2 turn-based free play" (marked historical in the file).

## Conflicts found (recorded, not silently reconciled)

1. **Lessons:** the master prompt lists 7 starter lessons; the code has 8 (extra `m3_e_policy` "Look After Yourself", added with R4a). Both are recorded in `AI_MEMORY/systems/LESSON_INDEX.md`.
2. **Curriculum numbering:** lesson titles use "Module 1–3"; the roadmap M0–M10 places functions in M4 and policies/events in M7. Decide before adding lessons.
3. **Asset ids:** the prompt prefers dotted ids (`npc.survivor.default`); code uses underscore keys (`npc_survivor_idle_down`). Migration is planned, not forced.
4. **Docs vs code on carry:** `docs/game/05-resources-inventory-carry.md` also lists encumbrance and equipment effects on capacity; code implements load/capacity/pickup/unload only. `AI_MEMORY` follows the code.
5. **Traits:** the `tireless` description promises slower energy decay; the code only shortens work duration.

## Priority (master prompt §19)

S0–S5 cleanup/alignment — done (2026-11-13). R4a Needs Policies — done. R4b Learner Event Hooks — done. R3 Carry + Deposit — done (2026-11-16). R5 Timeline Lessons — done. Collision/pathing (O3) — done (2026-11-16). Skills/XP (O4) — done (2026-11-16). Building upgrade (O5) — done (2026-11-16). Environment (O6) — done (2026-11-16). **Next: farming (field → greenhouse → hydroponic as ruined buildings repaired + upgraded), cooking (kitchen building), crafting (workshop).** Then production, environment, events, combat, enemies, buildings, final assets, offline/release. Do not start combat or final art while core foundations are unstable.

## Tests (every file in `tests/`)

| File | Covers |
|---|---|
| `tests/architecture.test.js` | module manifest, no cycles, kernel isolation, render must not depend on simulation/actions |
| `tests/invariants.test.js` | turn-model guard, projection purity/frozen, terminal-action finality, event/state agreement, capacity, API→validated types, AI_MEMORY accuracy |
| `tests/kernel.test.js` | RNG, hashing, event log, 8 directions |
| `tests/ledger-defs.test.js` | ledger reserve/commit/release, definitions validation |
| `tests/simulation.test.js` | action lifecycle, gather/repair/rest/eat, needs, determinism, projections frozen |
| `tests/realtime.test.js` | clock driver, standing gather, stop reasons, replace/queue, no per-turn cap |
| `tests/policies.test.js` | R4a policies, replay, soak |
| `tests/hooks.test.js` | R4b hooks |
| `tests/hardening.test.js` | prototype-chain ids, refused commands cost nothing, node choice |
| `tests/stabilization.test.js` | S0–S5 regressions, save/load, lessons passable, UI CSP, old turn API gone |
| `tests/sandbox-api.test.js` | API contract, sandbox isolation, budgets, determinism |
| `tests/gate-phase0.test.js` | end-to-end pipeline, replay, lessons |
| `tests/persistence.test.js` | save/load integrity, progress only grows |
| `tests/pathing.test.js` | O3: blocked tiles, A* determinism/no corner cutting, gate route, `NO_PATH`, replanning, gather through the gate |
| `tests/skills.test.js` | O4 XP awards, level-ups, diminishing returns, top-level cap, speed effect, no attribute growth, `skillProgress`, determinism, progression validation |
| `tests/upgrade.test.js` | upgrade: cost, levels, storage growth, NEEDS_REPAIR / MAX_LEVEL / capability / resources failures, cancel, API, determinism |
| `tests/environment.test.js` | O6 clock, calendar determinism, forecast vs reality, nextChange, season calendar, views, events, replay, learner reads forecast, validation |
| `tests/carry.test.js` | R3 carry capacity, per-tick conservation (node + hands + stock), trip caps, stop-while-carrying, `deposit()`, storehouse pooling, storage never overfilled, determinism |
| `tests/world-i2.test.js` | stage layout, storage info, gate/storehouse repair, ids in learner code |
| `tests/assets-render.test.js` | asset keys, fallback chain, renderer is projection-only |
| `tests/ui-wiring.test.js` | main screen wiring |
| `tests/soak.test.js` | seeded random play, invariants every 50 ticks (`SOAK_SEEDS=300` deep) |
| `tests/serve-script.test.js` | dev-server entry detection |
| `tests/helpers.js` | shared helpers (not a test) |

Obsolete tests: none remain. No test calls `startTurn`/`executeTurn`/`getTurnInfo`; the removed turns.test.js was replaced earlier (see `AI_MEMORY/CHANGELOG.md`).
