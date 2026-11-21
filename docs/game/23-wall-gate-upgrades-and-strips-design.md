# 23. Wall and Gate Upgrades, Reserved Defence Strips, Smelter and HQ-Gated Levels (DESIGN — NOT implemented)

> Status: owner direction (2026-11-21/22) turned into a phased plan. **[decided]** = stated by the owner, **[proposed]** = recommendation to confirm, **[open]** = needs an answer before its phase.
> Builds on [21](21-outpost-wall-town-economy-design.md) (line wall, scavenging), [20](20-zombies-waves-loot-design.md) (zombies, waves, boss), [12](12-buildings-visual-spec.md) (building visuals) and [19](19-codebook-and-ui-display.md) (UI actions only insert code).
> Every number is a PLACEHOLDER to tune. Nothing here changes the simulation until its phase is built. The wall/gate level pictures (levels 1-5) already exist and are drawn; this plan makes levels 3-5 reachable.

## 1. What the owner decided

1. **[decided]** Walls stay as they are (one building, one pooled health). New strength comes from **upgrade recipes**, not new wall buildings.
2. **[decided]** The wall grid has two **strips**: left column (inside) = **catwalk**, right column (outside) = **additional defence builds**.
3. **[decided]** The strips are **static reserved cells**: pre-placed slots, not free construction. A slot exists from the start; what is built in it is the player's choice.
4. **[decided]** Each reserved cell is **locked until the HQ reaches a given level**.
5. **[decided]** The player **chooses which upgrade/build** goes in a cell.
6. **[decided]** Outer defences: **barbed wire slows** zombies; **electrified mesh stuns** them; **sandbags have their own health, and it must be depleted before zombies can continue to the wall**.
7. **[decided]** Materials: **steel plate** from a new **smelter** (a separate building from the workshop) + workshop; **sand and cement** come from raid/scavenge loot.
8. **[decided]** Gate levels have their **own upgrade recipes** (a different structure from the wall).
9. **[decided]** The **boss** is tied to wave level / progression (boss day 25, then every 10 days). The top tier needs a **boss core**.
10. **[decided]** **A building's level is capped by the HQ level** (wall, gate, strip builds).

## 2. Wall and gate ladder (levels already have art)

Existing: fence L1 100 HP, L2 160 HP (20 wood + 10 stone, 50 ticks); gate L1 80 HP. Armor today = 1 x level.

| Lvl | Wall (name) | HP | Armor | Upgrade cost [proposed] | Ticks | Min HQ |
|---|---|---|---|---|---|---|
| 1 | Fence | 100 | 1 | (start) | - | 1 |
| 2 | Wood | 160 | 2 | 20 wood, 10 stone (exists) | 50 | 1 |
| 3 | Stone | 320 | 3 | 30 wood, 20 stone, 10 cement | 80 | 2 |
| 4 | Concrete | 600 | 5 | 12 concrete block, 6 steel plate | 110 | 3 |
| 5 | Reinforced concrete | 1000 | 7 | 16 concrete block, 12 steel plate, **1 boss core** | 150 | 4 |

| Lvl | Gate | HP | Upgrade cost [proposed] | Ticks | Min HQ |
|---|---|---|---|---|---|
| 1 | Plank gate | 80 | (start) | - | 1 |
| 2 | Braced gate | 130 | 15 wood, 4 hinge set | 60 | 1 |
| 3 | Iron-banded gate | 250 | 6 steel plate, 4 hinge set | 90 | 2 |
| 4 | Steel gate | 480 | 12 steel plate, 6 hinge set | 120 | 3 |
| 5 | Airlock (double door) | 800 | 16 steel plate, 8 hinge set, **1 boss core**, power | 160 | 4 |

- The gate ladder differs from the wall on purpose: it needs **hinge sets** and steel plate (moving parts), never cement. The airlock lets sorties leave and return during a wave (today `sortieOnlyAfterClear` blocks that) and draws power.
- Armor jumps keep brutes (wall hit 12) and the boss (60) relevant; boomers ignore armor (flat 12), which is the sandbag's job (section 4).
- Repair costs scale with level (same recipe shape as today: wood early, stone/cement later).

## 3. HQ gates everything [decided]

**Rule:** wall level, gate level and any strip build level <= the level the HQ allows. The HQ today has levels 1-2 only (200/300 HP), so **HQ levels 3-4 must be added** (Phase 0).

| HQ level | HQ HP [proposed] | HQ upgrade cost [proposed] | Opens |
|---|---|---|---|
| 1 | 200 | start | Wall/Gate L1-2; no strips |
| 2 | 300 | 30 wood, 15 stone (exists) | Wall/Gate L3; catwalk cells 1-2; barbed wire cells 1-2 |
| 3 | 450 | 40 wood, 40 stone, 8 steel plate | Wall/Gate L4; catwalk cells 3-4; sandbag cells; electric cells 1-2 (needs power) |
| 4 | 650 | 20 concrete block, 16 steel plate, 1 boss core | Wall/Gate L5; all remaining cells; floodlights |

- A locked cell is drawn as a faint reserved footprint with a padlock and "Needs HQ level N"; the card shows the same reason (the buttons already mirror real rules with enabled/disabled + reason).
- Refusal reason in code: `survivor.upgrade('fence')` returns a normal failure "HQ level 3 required" (same pattern as other gates).
- **[open]** Whether the final-tier boss core is consumed by the HQ or the wall (one core per tier-5 item as written).

## 4. Reserved strips [decided]

Line wall at x = 12 (y 0..15): left strip = x 11 (inside), right strip = x 13 (outside). Cells are **fixed slots** (`strip.left[i]`, `strip.right[i]`), several per wall section, none on the gate rows (reserved for the gate approach).

**Left strip: catwalk.** Slot content choices: *Catwalk post* (lets a survivor stand on the wall line and shoot over it without hitting it), later *Floodlight* mount. A survivor on a catwalk cell gets the tower-style ranged bonus and is only hit if the wall section beside it falls.

**Right strip: outer defences.** The player picks one build per slot (and can swap by demolishing, refund 50%):

| Build | Effect | Health | Cost [proposed] | Needs |
|---|---|---|---|---|
| Barbed wire | Zombies crossing the cell are **slowed** (move 50%) and take chip damage 1/tick contact | 40 | 4 wood, 3 scrap | HQ 2 |
| Sandbags | **Have their own health; zombies must deplete it before advancing to the wall** (they stop and attack the bags first); absorbs boomer blasts | 120 | 6 rags, 8 sand | HQ 3 |
| Electrified mesh | **Stuns** zombies touching it (stun 3 ticks, cooldown 10) and chips 2/hit | 80 | 6 steel plate, 4 scrap | HQ 3, power |
| Spikes (base) | Contact damage only | 60 | 6 wood, 2 steel plate | HQ 2 |

Rules:
- Outer builds are **only buildable/repairable between waves**; the slot shows "wave in progress".
- Targeting order for zombies (new rule): the nearest standing outer build in their row first (bags -> wire/mesh), then the wall. Walkers/runners stop at bags; brutes and boomers use their normal wall multipliers on bags too.
- A destroyed outer build leaves a **ruined slot** that can be repaired cheaper than rebuilding.
- Power: mesh and floodlight draw from the existing generator/battery network; no power = no stun (the build still works as a barrier).
- UI/API only insert code, e.g. `survivor.build('wall_strip', 'right', 2, 'sandbags')` and `survivor.upgrade('fence')`.

## 5. Materials and sources

New items (all **[proposed]**): `sand`, `cement`, `steel_ingot`, `steel_plate`, `concrete_block`, `hinge_set`, `sandbag` (made from rags + sand).

| Item | Made at | Inputs | Notes |
|---|---|---|---|
| steel_ingot | **Smelter** (new building) | 2 scrap + 1 charcoal | ticks 40; powered variant later |
| steel_plate | Workshop L2 | 2 steel_ingot | ticks 30 |
| hinge_set | Workshop L1 | 2 scrap + 1 wood | ticks 20 |
| concrete_block | Workshop L2 | 2 cement + 3 sand + 1 water | ticks 40 |
| sandbag | Workshop L1 | 2 rags + 3 sand | ticks 15 |

**Smelter** (separate building): ruin -> repair -> upgrade like other buildings; L1 melts scrap only, L2 raises throughput and allows powered smelting. Placed on a reserved base slot; opens at **HQ 2**. Draws charcoal (kitchen/campfire or from bones/wood).

**Loot (sand and cement)** [proposed]: new scavenge sites with the existing fields (ticks, danger, regrowDays, yield): *construction site* (cement, sand, scrap), *quarry* (sand, stone), *hardware depot* (hinges, scrap, tools). Raid rewards also drop sand and cement. Both are heavy, so carry capacity limits trips; a storage building holds them.

Cost to reach top tier (rough, wall 3->5 plus gate 2->5): ~20 cement, ~40 sand, ~28 blocks-worth in total after crafting, ~44 steel plates (~88 ingots, ~176 scrap, ~88 charcoal), 18 hinge sets, 2 boss cores.

## 6. Boss and progression [decided]

- Boss: horde king, day 25 then every 10 days (existing). Each boss drops 1 **boss core**; tier 5 (wall, gate, HQ 4) consumes one core, so the first full fortress is realistic around the second or third boss.
- Wave strength scales with the day; with HQ-gated levels the player cannot out-build a wave they have not earned. A boss wave should be survivable at wall L4 with strips full, and hard at L3.

## 7. Wall navigation card (UI) [decided direction]

Clicking the wall opens the nav card with tabs: **INFO** (level, health bar, armor, pooled health, next-level preview) | **UPGRADE** (the next level, its recipe with have/need, HQ requirement, button disabled with a reason when locked) | **STRIPS** (left catwalk slots, right outer slots; per slot: locked until HQ N / empty -> choose build / built with health, repair) | **CODE** (copyable snippets: `survivor.repair('fence')`, `survivor.upgrade('fence')`, strip builds). The gate has the same card with its own ladder. Buttons only insert code into the editor (never run commands), as in `src/app/ui/actions.js`.

## 8. Phases and priorities

| Phase | What | Priority | Why / dependency |
|---|---|---|---|
| **P0** | HQ levels 3-4 (data + art reuse), HQ-cap rule: `buildings.level <= hqLevel` check with a clear refusal reason | **Top** | every later gate depends on it |
| **P1** | Items (sand, cement, steel, blocks, hinges, sandbag), recipes, new scavenge sites, raid drops, `SIM_VERSION` bump | **Top** | no new construction rule; pure data |
| **P2** | Smelter building (ruin/repair/upgrade, ingot recipe) | **Top** | unlocks steel |
| **P3** | Wall L3-5 and gate L2-5 data with costs/HP/armor and the HQ gate; wall/gate nav card tabs INFO / UPGRADE / CODE | **Top** | makes the existing level art reachable using today's `survivor.upgrade` |
| P4 | Reserved strip slots (static cells, locks by HQ level, choose-build UI), catwalk | High | new construction rule (slots) |
| P5 | Outer defences: barbed wire (slow), spikes, sandbags (health first), targeting order | High | combat rule change in `sim.step` |
| P6 | Electrified mesh (stun, power), floodlight | Medium | needs power network + stun status |
| P7 | Boss core gating of tier 5, airlock gate behaviour (sorties during wave) | Medium | needs boss drop and sortie rule change |
| P8 | Condition art for wall/gate (replace darkening), strip art, forest parallax | Low | presentation only |

Top priorities in one line: **P0 -> P1 -> P2 -> P3** (HQ cap, materials, smelter, levels reachable). That delivers the visible payoff (levels 3-5 walls and gates) before any new combat rule.

## 9. Tests to write per phase

- P0/P3: upgrading above the HQ cap is refused with a reason; level costs/HP/armor match the tables; deterministic hash unchanged for untouched paths.
- P1/P2: recipes produce items at the right station/level; smelter needs repair before use.
- P4/P5: a locked slot refuses a build with the HQ reason; a slow zombie covers less ground per tick; zombies stop at sandbags and the wall takes no damage until the bags are at 0; outer builds cannot be built during a wave.
- P6: powered mesh stuns, unpowered does not.
- Renderer tests stay presentation-only (no import of simulation).

## 10. Open questions

1. HQ level 3-4 art: reuse HQ picture with level overlays, or new pictures?
2. Slots per section (proposed 3 left, 3 right per 4-cell section) and the exact HQ levels per slot.
3. Whether the sandbag line stops *all* zombies or lets runners jump it.
4. Demolish refund rate (proposed 50%).
