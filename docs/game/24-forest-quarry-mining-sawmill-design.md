# 24 · Forest, quarry, camps, sawmill, mining station, vehicles (design + phases)

Status: **R0, R1, W1, R2 and R3 IMPLEMENTED 2026-11-22.** R4-R7 are design only. Decisions come from the author's brief of 2026-11-22; items marked [open] are still undecided.

## 1. Decisions
- The **upper road** of the outpost map leads to the **forest** (far, slow, wood). The **lower road** leads to the **quarry** (heavy stone and sand, nearer). Each is its **own map screen**.
- **Survivors do the mining** (a `survivor.mine(...)` command with a Mining skill), not hired miners. The **mining station is a building on the OUTPOST map**, opened by the HQ level (**HQ 3, decided**).
- A **sawmill** (lumber processing) comes first as a building of its own; it later feeds the **ballista** and advanced woodworking.
- Later, **stash and retrieve runs** and **vehicles** shorten trips and raise loot capacity.
- Lead bars (bullets) and iron bars (weapon upgrades, body armor) already exist (docs/game/23): the mine becomes their real source in R4.

## 2. Phases
| Phase | What | Status |
|---|---|---|
| **R0** | **Loader animation for art still loading** (calm pulse / shimmer on the map, trees, rocks, buildings and walls instead of the old green tiles, mock tree and mock fence; a picture that FAILED to load keeps the plain placeholder). The **cut tree** (`tree_cut_<n>`) is the drained-resource picture (the `gone` stage, amount 0). | IMPLEMENTED (`assets/loader.js`, `state()` on every art cache, renderer hooks, `tests/loader.test.js`) |
| **R1** | **Forest and quarry maps with travel time.** Scavenge sites carry a `region` (`front` default, `forest`, `quarry`). MAP 4 FOREST (`forest_edge` 70 ticks, `deep_forest` 130 ticks, wood and hide) and MAP 5 QUARRY (`quarry` 50 ticks, `deep_quarry` 90 ticks, stone and sand). The FRONT map keeps its sites and gets two road signs (north to the forest, south to the quarry) that jump to those maps. Trips use the existing scavenge rules (danger, regrowth, dusk, being lost in a wave). | IMPLEMENTED (`SIM_VERSION` unchanged: the saved state has the same shape) |
| **W1** | **Random wandering zombie** (a walker) outside the wall in daylight: about 60% of days from day 2, appears within 40 ticks of dawn, drifts at random, chases a survivor outside within 5 cells, hits like a walker, can be killed with `attack` (no wave needed), drops walker loot, wanders off at dusk. | IMPLEMENTED (`SIM_VERSION` 0.43.0) |
| **R2** | **Camp stash and retrieve run.** A survivor gathers at a remote site into a **stash** there instead of walking home; one `survivor.retrieve(site)` hauls it back. **Decided defaults:** a stash is only at risk on a raid night; a raid takes 30% of a near-site stash and 50% of a deep-site stash; each site holds at most 60 units; a camp or a guard cuts the loss to 10%; the view warns when a stash is at risk tonight. | IMPLEMENTED (`SIM_VERSION` 0.45.0, see section 3b) |
| **R3** | **Sawmill** (HQ 2): logs to planks, planks to beams (level 2). New items `plank`, `beam`. The ballista and advanced woodworking switch to planks in a later weapon pass. | IMPLEMENTED (see section 3c) |
| **R4** | **Mining station** (outpost building, **HQ 3, decided**) + **Mining skill** + `survivor.mine("iron_ore")`. Ores: iron ore, lead ore, coal. The smelter turns ore into iron and lead bars (scrap stays for steel). Level 1 by hand, level 2 a rail cart (more ore per trip), level 3 a powered drill that draws power. A little cave-in risk. | PLANNED |
| **R5** | **Vehicles**: hand cart, then cart with a beast or motor, then truck (fuel). A multiplier on a retrieve run: more carry capacity, fewer travel ticks. | PLANNED |
| **R6** | **Weapon and armor use of the bars**: bullets from lead bars, weapon upgrades and body armor from iron bars (and steel). | PLANNED |
| **R7** | **Road camps and road danger** (a camp building that shortens a road; loaded runs are a target in a wave). | PLANNED |

## 3. How R1 works
- `data/scavenge.js`: every site may carry `region`. The definitions check rejects any region other than `front`, `forest`, `quarry`.
- The learner view (`scavenge.sites[]`) carries `region`; `survivor.scavenge("forest_edge")` is the same command as before.
- `ui/screens.js`: five screens in order TOWN, OUTPOST, FRONT, FOREST, QUARRY; `sitesOf(view, map)` and `ROAD_SPOTS`.
- `ui/scenes.js`: `regionSceneSvg(view, 'forest' | 'quarry')` draws one hotspot per site, the away marker and a way back; `frontSceneSvg` lists only `front` sites plus the road signs.
- A road sign or the way-back spot only changes the screen. Everything else still just inserts code in the editor.

## 3b. How R2 works (camp stash)
- `survivor.stash(site, rounds?, { camp }?)`: same walk-to-the-gate departure as `scavenge`; she works 1-3 rounds (each extra round +30 ticks, each later round 25% less) and walks home empty-handed. The haul goes into `state.scavenge.stash[site]` (cap 60 units per site, overflow lost, base storage room ignored). `camp: true` adds 20 ticks and protects that stash until it is emptied.
- `survivor.retrieve(site)`: a haul run of 80% of the site's ticks; she brings home what she can carry (carry capacity in weight, halved when hurt) and what base storage has room for; the rest stays. It never counts as looting the site.
- A raid night (a wave starting at dusk) takes a share of every item in every stash, rounded up: near 30%, deep (site 90+ ticks away) 50%, camped 10%. Events `stash.stored` / `stash.retrieved` / `stash.raided`; the view marks `atRiskTonight`.
- A survivor out on any of the three trips when a wave starts is lost, exactly as before.
- Not built: a guard cutting the loss (needs R7 camp buildings); the camp is a trip option for now. Data: `data/scavenge.js` `stash`. Code: `scavenge/index.js`, `actions/handlers/scavenge.js`. Tests: `tests/stash.test.js`.

## 3c. How R3 works (sawmill)
- Building `sawmill` (`sawmill_1`, a ruin in every scenario, south of the road on the outpost map). Level 1 `Sawmill`, level 2 `Beam Mill` (upgrade 20 wood + 20 stone + 6 scrap, needs HQ 3 like the smelter's level 2). Repair 8 wood + 4 stone.
- Recipes on the shared `survivor.craft` handler, both closed until the HQ is level 2 (`HQ_LEVEL` below it): `plank` = 3 wood -> 2 planks (20 ticks, sawmill 1); `beam` = 3 planks -> 1 beam (30 ticks, Crafting 1, sawmill 2). Wood is the log: there is no separate log item.
- Items `plank` (weight 2) and `beam` (weight 4); the HQ stores them at every level (20/10, 60/30, then grown with the HQ).
- Nothing consumes planks or beams yet: the ballista and woodworking switch to them in a later weapon pass (R6). Powered sawing is not built. No sawmill picture yet (placeholder).
- Code: `data/world.js` `sawmill`, `data/recipes.js`, `data/items.js`. Tests: `tests/sawmill.test.js`.

## 4. Open questions
- (decided) The mining station opens at HQ 3; stash risk follows the R2 defaults above.
- [open] Whether FOREST and QUARRY should later become live grids with real trees and rocks like the outpost.
