# Implementation status

<<<<<<< HEAD
Authoritative for: what exists *now* (verified in code on 2026-11-16; `npm test`: 162 tests, 0 failing). Legend: IMPLEMENTED · PARTIALLY IMPLEMENTED · PLANNED · BLOCKED · OBSOLETE · NEEDS REFACTOR · NEEDS TESTS · NEEDS DOCUMENTATION. Nothing is listed IMPLEMENTED without source evidence.
=======
Authoritative for: what exists *now* (verified in code on 2026-11-15; `npm test`: 0 failing). Legend: IMPLEMENTED · PARTIALLY IMPLEMENTED · PLANNED · BLOCKED · OBSOLETE · NEEDS REFACTOR · NEEDS TESTS · NEEDS DOCUMENTATION. Nothing is listed IMPLEMENTED without source evidence.
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e

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
<<<<<<< HEAD
| Game API v1 (13 commands incl. `deposit`) | IMPLEMENTED | `src/modules/api/v1.js` |
| Sandbox (static check, Worker, budgets, hardening) | IMPLEMENTED | `src/modules/sandbox/` |
| Resource ledger, nodes, depletion | IMPLEMENTED (no regeneration) | `src/modules/resources/ledger.js` |
| Base storage capacity (HQ) | IMPLEMENTED | `gather.js` `storageSpace` |
| Carry capacity, inventory items, gather→carry→unload trips, `deposit()` (R3) | IMPLEMENTED (no equipment/encumbrance) | `src/modules/actions/handlers/gather.js`, `carry.js`, `deposit.js`, `src/modules/survivors/index.js`, `tests/carry.test.js` |
| Pooled storage (HQ + tent + repaired storehouse) | IMPLEMENTED | `src/modules/buildings/index.js` `storageCapacity` |
| Buildings: health, condition, repair | IMPLEMENTED | `src/modules/buildings/index.js` |
| Buildings: construction, upgrades, occupancy | PLANNED | level-2 data exists, no code path |
| Buildings: storage effect (storehouse adds capacity when repaired) | IMPLEMENTED | `world.js` `storage` table, `storageCapacity` |
=======
| Game API v1 (12 commands) | IMPLEMENTED | `src/modules/api/v1.js` |
| Sandbox (static check, Worker, budgets, hardening) | IMPLEMENTED | `src/modules/sandbox/` |
| Resource ledger, nodes, depletion | IMPLEMENTED (no regeneration) | `src/modules/resources/ledger.js` |
| Base storage capacity (HQ) | IMPLEMENTED | `gather.js` `storageSpace` |
| Carry capacity, inventory items, deposit trips (R3) | PLANNED | `survivor.inventory.items` always `{}`; `deposit()` credits stock directly |
| Buildings: health, condition, repair | IMPLEMENTED | `src/modules/buildings/index.js` |
| Buildings: construction, upgrades, occupancy, effects | PLANNED | level-2 data exists, no code path |
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e
| World: one map, three scenarios, layout validation | IMPLEMENTED | `src/modules/world/index.js`, `definitions/index.js` |
| Collision / pathing | PLANNED (O3) | `stepToward` is a straight line |
| Skills: modifiers from levels/traits | PARTIALLY IMPLEMENTED | no XP/training/specialization; `observant`, `hardy` have no effect |
| Equipment, occupation, progression | PLANNED | empty fields in the survivor schema |
| Production, environment (day/night, weather) | PLANNED | none |
| Events framework / risk events | PLANNED | log exists; no risk events |
| Zombies, combat, enemies | PLANNED / NOT IMPLEMENTED | no code (`AI_MEMORY/domains/ZOMBIE_INDEX.md`) |
| Projections (student, render, inspector) | IMPLEMENTED | `src/modules/projection/index.js` |
| Renderer (canvas, picking, smoothing, debug) | IMPLEMENTED with placeholder art | `src/modules/render/index.js` |
| Asset resolver + in-code placeholder atlas | IMPLEMENTED (dotted semantic ids PLANNED) | `src/modules/assets/index.js` |
| Final art / real sprite sheets | PLANNED (I1) | none in repo; `*.png` is git-ignored |
| Lessons: 8 lessons as data + pure checks | IMPLEMENTED; validators NEEDS REFACTOR (keyword/regex, single scenario) | `src/modules/lessons/`, `AI_MEMORY/systems/LESSON_INDEX.md` |
| Lessons on the real timeline, shown on map (R5) | PLANNED | O2 |
| Free-play save/load, campaign progress | IMPLEMENTED | `src/modules/persistence/index.js`, `src/app/index.js` |
| Replay verification | IMPLEMENTED | `src/modules/replay/index.js` |
| UI shell (editor, inspector, lessons, save/load) | IMPLEMENTED | `src/app/mainscreen.js` |
| Seven bottom-bar controls (ASSIGN TASK … SETTINGS) | PLANNED (disabled in UI) | `index.html` |
| Step/inspect mode UI | PLANNED | state reserved in `mainscreen.js` |
<<<<<<< HEAD
| Browser smoke (`npm run smoke`) | IMPLEMENTED — 20/20 checks passed on 2026-11-16 after R3 (real Chromium) | `scripts/smoke.mjs` |
=======
| Browser smoke (`npm run smoke`) | IMPLEMENTED — 20/20 checks passed on 2026-11-15 after R4a/R4b (real Chromium) | `scripts/smoke.mjs` |
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e
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
<<<<<<< HEAD
4. **Docs vs code on carry:** `docs/game/05-resources-inventory-carry.md` also lists encumbrance and equipment effects on capacity; code implements load/capacity/pickup/unload only. `AI_MEMORY` follows the code.
=======
4. **Docs vs code on carry:** `docs/game/05-resources-inventory-carry.md` describes carry; code has none (R3). `AI_MEMORY` follows the code.
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e
5. **Traits:** the `tireless` description promises slower energy decay; the code only shortens work duration.

## Priority (master prompt §19)

<<<<<<< HEAD
S0–S5 cleanup/alignment — done (2026-11-13). R4a Needs Policies — done. R4b Learner Event Hooks — done. R3 Carry + Deposit — done (2026-11-16). **R5 Timeline Lessons — next.** Then collision/pathing, skills, production, environment, events, combat, enemies, buildings, final assets, offline/release. Do not start combat or final art while core foundations are unstable.
=======
S0–S5 cleanup/alignment — done (2026-11-13). R4a Needs Policies — done. R4b Learner Event Hooks — done. **R3 Carry + Deposit — next.** R5 Timeline Lessons — after R3. Then collision/pathing, skills, production, environment, events, combat, enemies, buildings, final assets, offline/release. Do not start combat or final art while core foundations are unstable.
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e

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
<<<<<<< HEAD
| `tests/carry.test.js` | R3 carry capacity, per-tick conservation (node + hands + stock), trip caps, stop-while-carrying, `deposit()`, storehouse pooling, storage never overfilled, determinism |
=======
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e
| `tests/world-i2.test.js` | stage layout, storage info, gate/storehouse repair, ids in learner code |
| `tests/assets-render.test.js` | asset keys, fallback chain, renderer is projection-only |
| `tests/ui-wiring.test.js` | main screen wiring |
| `tests/soak.test.js` | seeded random play, invariants every 50 ticks (`SOAK_SEEDS=300` deep) |
| `tests/serve-script.test.js` | dev-server entry detection |
| `tests/helpers.js` | shared helpers (not a test) |

Obsolete tests: none remain. No test calls `startTurn`/`executeTurn`/`getTurnInfo`; the removed turns.test.js was replaced earlier (see `AI_MEMORY/CHANGELOG.md`).
