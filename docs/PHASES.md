# Build phases & tracker

> **Correction pass (C0–C9) comes first.** Detailed checklists with status live in
> [`docs/correction/`](correction/). Major gameplay stays frozen until C9 is fully green.
> The old “Phase 2…9” list below is kept for history; the dependency-ordered plan is
> `correction/CODE_AFTERmath_IMPLEMENTATION_PHASES.md` (I0–I15).

## Real-time pivot (2026-11-12) — replaces the turn model from C2
- [x] **R1** continuous clock: clock driver (play/pause/1×–4×), strategy points regenerate over time, turns removed, command timeline + `replayTimeline`, `runUntil`
- [x] **R2** standing actions: looping `gather(resource, load, total)`, stop reasons, `task.*` events, `survivor.lastTask`, replace-vs-queue (+ `survivor.queue()`), storage reserved per batch
- [ ] **R3** carry + deposit trips · [ ] **R4** needs interrupts/policies + learner event hooks · [ ] **R5** lessons/replay on the timeline model, free-play save
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
- [ ] Gather → carry → deposit

## Phase 6 — Progression
- [ ] Skill XP with diminishing returns, training, specialization unlocks

## Phase 7 — Production & environment
- [ ] Farming, crafting, cooking, day/night, weather, reusable planning routines

## Phase 8 — Events & defense
- [ ] Event framework (preparation → travel → execution → risk → recovery → result)
- [ ] Supply scavenge, zombie nest raid, defense waves, capstone automation

## Phase 9 — Later
- [ ] Weapons/infrastructure, instructor tools, balancing, final art

## Open design items (from the docs) that gate later phases
attribute & skill lists · formula coefficients · building level effects · event curves · XP thresholds · trait catalog ·
enemy/resource/material/consumable/weapon visuals · final atlas size & frame counts · first-release language.
