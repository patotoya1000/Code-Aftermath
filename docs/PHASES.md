# Build phases & tracker

Authoritative detail lives in `AI_MEMORY/IMPLEMENTATION_STATUS.md` (what exists now) and `AI_MEMORY/CHANGELOG.md` (what replaced what). This file is the short roadmap. Legend: [x] done and tested · [ ] to do. Specs: `docs/game/`.

## Foundation (done)
- [x] **Phase 0** proof spike: seeded RNG, hashing, event log, sandboxed learner code (Worker), Game API v1, action lifecycle, lesson validator, deterministic replay
- [x] **Phase 1** core state and stage-1 world: survivor schema, resource ledger, buildings as data, needs, projections, save/load with integrity check
- [x] **Phase 2** renderer + asset resolver + inspector (one canvas renderer, semantic asset keys, fallback chain, placeholder atlas)
- [x] **Phase 3** learner shell + curriculum: editor, lesson player, 8 lessons (Modules 1–3), hidden seeded scenarios
- [x] **C0–C9** correction pass (sandbox boundary, no fake controls, one renderer, asset resolver, survivor card)
- [x] **R1/R2** real-time clock and standing actions (replaced the turn model) · **S0–S5** stabilization · **R4a** needs policies · **R4b** event hooks · **R3** carry + deposit · **R5** lessons on the timeline

## Economy and world (done)
- [x] O3 pathing (A*) · O4 skills/XP · O5 upgrades (no free construction: ruins are repaired, then upgraded) · O6 day/night + weather calendar
- [x] O7 water (well, siphon, tank) · O8 recipes + kitchen · O9 spoilage + cold cellar · O10 farming · O11 power · O12 workshop crafting
- [x] O13 hydroponics · O14 battery · O15 fertilizer + charcoal · O16 powered pump · O17 nutrients · O18 risk events · O19 threats groundwork

## Zombies and defence (done)
- [x] Z1 data · Z2 wave entities · Z3 combat · Z4 loot + sorties · Z5 weapons/ammo · Z6a towers · Z6b mounted weapons · Z6c noise
- [x] Z7a–f runner, boomer, thrower, screamer, tank, boss · Z8 suppressor + noise lure (`SIM_VERSION` 0.38.0)

## Town and outpost economy (docs/game/21)
- [x] **W4** (2026-11-20) town recruit offers priced by stats, paid with supplies only, `town.recruit`, beds, HUD TOWN panel (`SIM_VERSION` 0.39.0)
- [x] **W5** (2026-11-20) the town train: pure schedule, extra recruits, limited goods, `town.buy` (`SIM_VERSION` 0.40.0)
- [x] **W2** (2026-11-20) `line` wall: full-height column, inside = west, waves spawn east, scenario `stage1_line`; `perimeter` kept (`SIM_VERSION` unchanged)
- [x] **W3** (2026-11-20) event board + scavenge expeditions: `survivor.scavenge`, `scavenge` / `board` reads, recovery, danger, lost-on-wave, HUD EXPEDITIONS (`SIM_VERSION` 0.41.0)
- [x] **W1** (2026-11-20) zone bar: camera pans TOWN / OUTPOST / FRONT, opens the Town and Expeditions panels (presentation only)

## UI and art
- [x] UI-1 Codebook · UI-2 live inspection · UI-3 contextual help · UI-4 lesson↔Codebook links · UI-5 mobile tabs · UI-6 polish
- [x] **UI-R1** (2026-11-19) full-screen map, on-map selection card, drag-pan / zoom, bottom-docked code and lesson panels, lesson Run feedback, completion from saved progress
- [x] PA-1 camera · PA-2 terrain · PA-3 roads · PA-4 objects + fence autotiling · PA-5 multi-cell buildings
- [~] PA-6 … PA-8 NPC/zombie sprites and interaction: placeholder art only
- [ ] **I1 final art / real sprite sheets** (next, after the UI is accepted)

## Still to do
- [ ] Playtest balance of the whole zombie ladder (long game)
- [ ] Step/inspect mode UI · training buildings and specialization · encumbrance/equipment effects · research system
- [ ] Pruning of finished actions (O1) · offline/release packaging · instructor tools

## Open design items
Attribute and skill lists · formula coefficients · event curves · XP thresholds · trait catalog · final atlas size and frame counts · first-release language.
