# Build phases & tracker

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
- [x] Command console mode: per-turn command budget (3 commands/turn), strategy points (10/turn), turn-based execution via `survivor.commandName(args)` calls; replaced Play/scrubber with "Next Turn" control
- **Gate**: save/load identical · no double-spend · retries never corrupt progress · same inputs ⇒ same hashes · command budget respected per turn

## Phase 2 — Renderer, asset resolver, Inspector  ← next
- [ ] `render` module: canvas renderer consuming the render projection (replaces `debugview`)
- [ ] `assets` module: semantic IDs (`npc_survivor_walk_down_right`, `building_fence_lv1_ruined`) → atlas frames, with the 5-step fallback chain
- [ ] Placeholder atlas generated in code (transparent PNG, fixed frame, foot pivot, no text) so real art can drop in
- [ ] 8-direction animation playback; animation never changes state
- [ ] Survivor Card UI (portrait slot, needs, attributes, task)
- **Gate**: swap the atlas without touching gameplay · missing frame falls back to idle · building visual changes only via state

## Phase 3 — Learner shell & curriculum
- [ ] Editor upgrades (line errors, API panel, step/inspect), lesson player, progress screen
- [ ] Campaign Modules 1–3 as data (needs Revision 4 plan for exact content)
- [ ] Hidden seeded test scenarios per lesson

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
- [ ] Weapons/infrastructure, instructor tools, balancing, final art, Capacitor packaging

## Open design items (from the docs) that gate later phases
attribute & skill lists · formula coefficients · building level effects · event curves · XP thresholds · trait catalog ·
enemy/resource/material/consumable/weapon visuals · final atlas size & frame counts · first-release language.
