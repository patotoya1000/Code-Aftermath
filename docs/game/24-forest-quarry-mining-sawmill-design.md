# 24 · Forest, quarry, camps, sawmill, mining station, vehicles (design + phases)

Status: **R0, R1, W1, R2 and R3 IMPLEMENTED 2026-11-22, R4, R5, R6 and R7 IMPLEMENTED 2026-11-23/24.** Decisions come from the author's brief of 2026-11-22; items marked [open] are still undecided.

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
| **R4** | **Mining station** (outpost building, **HQ 3, decided**) + **Mining skill** + `survivor.mine("iron_ore")`. Ores: iron ore, lead ore, coal. The smelter turns ore into iron and lead bars (scrap stays for steel). Level 1 by hand, level 2 a rail cart (more ore per trip), level 3 a powered drill that draws power. A little cave-in risk. | IMPLEMENTED (`SIM_VERSION` 0.46.0, see section 3d) |
| **R5** | **Vehicles**: hand cart, then cart with a beast or motor, then truck (fuel). A multiplier on a retrieve run: more carry capacity, fewer travel ticks. | IMPLEMENTED (`SIM_VERSION` 0.47.0, see section 3e; the beast-drawn cart is [open]) |
| **R6** | **Weapon and armor use of the bars**: bullets from lead bars, weapon upgrades and body armor from iron bars (and steel). | IMPLEMENTED (`SIM_VERSION` 0.48.0, see section 3f) |
| **R7** | **Road camps and road danger** (a camp building that shortens a road; loaded runs are a target in a wave). | IMPLEMENTED (`SIM_VERSION` 0.49.0, see section 3g) |

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

## 3d. How R4 works (mining station)
- Building `mining_station` (`mining_1`, a ruin in every scenario; on the painted outpost south of the road next to the smelter). Level 1 `Mining Station`, level 2 `Rail Cart Mine` (upgrade 25 wood + 30 stone + 8 scrap, HQ 3), level 3 `Powered Drill` (20 wood + 40 stone + 20 scrap + 4 steel plate, **HQ 4**, draws 8 power). Repair 10 wood + 8 stone.
- `survivor.mine(ore, rounds?)` (`mine` handler, Mining skill, needs strength 1 + endurance 1): walk to the nearest repaired station, then repeat { dig a round -> cave-in roll -> ore into base stock }. **Opens at HQ 3** (`mining.minHq`; refusal `HQ_LEVEL`, nothing changes). Stops with TARGET_REACHED (rounds done), STORAGE_FULL, EXHAUSTED, TOO_HURT, NO_STATION, NO_POWER (drill waited 90 ticks for the grid) or NO_PATH. Like cook: some work done = COMPLETED with the reason, none = FAILED with it. A needs policy that interrupts a job resumes it with the remaining rounds.
- Ores: `iron_ore` (24 ticks, 2 per round), `lead_ore` (24 ticks, 2), `coal` (18 ticks, 3). A round brings `yield x level % x output modifier` (levels 100 / 200 / 300 %), never more than base storage has room for. Skill makes rounds faster (like every skill) and adds a little ore.
- **Cave-in**: after each round a pure hash roll (seed + survivor + tick) can collapse it: no ore, no XP, she loses 15 health (never below 1), event `mine.caveIn`. Chance 10 % / 6 % / 4 % by station level, minus 1 point per Mining level (floor 1 %). Below `mining.minHealth` (25) she cannot start and a running job stops with TOO_HURT.
- Mining skill: `mine` XP award 4 per finished round (like crafting); recruits can arrive with it.
- Smelter: `iron_bar_ore` (3 iron ore + 1 coal -> 2 iron bars) and `lead_bar_ore` (3 lead ore + 1 coal -> 2 lead bars), smelter level 1, HQ 2. The scrap recipes for bars stay as the slower fallback; scrap is still what steel is made from.
- Learner read `mining_1.mining` ({ working, open, level, yieldPercent, caveInPercent, power, powered, ores[] }) and one **Mine <ore>** button per ore on the building card (it only inserts `survivor.mine("<ore>", 5);`).
- Not built: ore deposits that run out or regrow, the Mining skill training buildings, a mining station picture (placeholder), consumers of the bars (R6).
- Data: `data/mining.js`, `data/world.js` `mining_station`. Code: `actions/handlers/mine.js`, `buildings/mining.js` (pure rules + learner view), `power/index.js` (drill demand). Tests: `tests/mining.test.js`.

## 3e. How R5 works (garage and vehicles)
- Building `garage` (`garage_1`, a ruin in every scenario; on the painted outpost south of the road at (4,8), in stage 1 at (11,11)). Level 1 `Cart Shed`, level 2 `Motor Pool` (upgrade 20 wood + 20 stone + 10 scrap, HQ 3), level 3 `Truck Garage` (25 wood + 40 stone + 24 scrap + 4 steel plate, **HQ 4**). Repair 10 wood + 6 stone. Following the "no free construction" rule, the garage is repaired and upgraded like any station; **its level is what unlocks a vehicle**. There is no vehicle item.
- `survivor.retrieve(site, { vehicle })`: the same haul run as R2 with a vehicle from the garage. Vehicle runs **open at HQ 2** (`vehicles.minHq`). Placeholder numbers (data/vehicles.js, to tune in a playtest):

| Vehicle | Garage level | Carry capacity | Run time | Fuel per run |
|---|---|---|---|---|
| `hand_cart` | 1 | x2 | 90 % | none |
| `motor_cart` | 2 | x4 | 60 % | 1 coal or charcoal |
| `truck` | 3 | x8 | 40 % | 3 coal or charcoal |

- The multiplier is on her carry capacity in weight (a rookie carries 60: 15 stone on foot, 30 with the cart, 60 with the motor cart). The run takes `ceil(site ticks x 80 % x ticksPercent)`, never under 1 tick. A hurt survivor still drops part of the load. Only haul runs take a vehicle (`stash` and `scavenge` refuse the option).
- **Fuel** is paid from base stock when she LEAVES (coal first, charcoal when coal cannot cover it) and is not refunded if she is lost. Coal comes from the mining station (R4), so the mine now feeds the trucks.
- **One vehicle of each kind**: it is busy while a survivor is away with it (`away.vehicle`), so a lost survivor frees it and nothing extra is saved. The rules are checked when the command is given and AGAIN when she reaches the gate (two survivors can race for one cart).
- Refusals (nothing changes): `UNKNOWN_TARGET` (no such vehicle), `HQ_LEVEL`, `NO_STATION` (no garage in the world), `NEEDS_REPAIR` (garage ruined or too low a level for that vehicle), `VEHICLE_BUSY` (new reason), `INSUFFICIENT_RESOURCE` (not enough fuel), `INVALID_PARAMS` (vehicle on a stash/scavenge command). The stash rules (`NO_STASH`, `STORAGE_FULL`) are checked first.
- Learner reads: `garage_1.garage` = `{ working, open, minHq, level, fuelItems, vehicles: [{ id, name, garageLevel, carryPercent, ticksPercent, fuel, busyWith, canUse, reason }] }`, and `scavenge.sites[].stash.retrieveTicksWith` (ticks per vehicle). Events: `scavenge.departed` carries `vehicle` and `fuel`, `scavenge.returned` and `stash.retrieved` carry `vehicle`. The garage card has one **Haul with <vehicle>** button per vehicle (it only inserts the call).
- Not built: wear or breakdowns, a beast-drawn cart (feed instead of fuel), noise from a motor (R7), a vehicle picture (placeholder), a loaded run being a target in a wave (R7).
- Data: `data/vehicles.js`, `data/world.js` `garage`. Code: `buildings/vehicles.js` (pure rules + learner view), `scavenge/index.js`, `actions/handlers/scavenge.js`. Tests: `tests/vehicles.test.js`.

## 3f. How R6 works (bars into gear)
- **Bullets from lead**: `bullets_lead` (workshop level 2, Crafting 1): 1 lead bar -> 10 bullets. The gland recipe `bullets` (workshop 3) stays; ammo no longer depends on zombie loot.
- **Iron spear** (`weapons.iron_spear`, workshop 2, Crafting 1: 2 iron bars + 2 wood + 1 rags): melee, reach 3, damage 8, pierce 3, needs Combat 1 (between the advanced spear and the bow). `survivor.equip("iron_spear")`.
- **Body armor** (`data/arsenal.js` `armors`, new `equipment.armor` slot, taken with `survivor.equip` like a weapon: from base stock, the piece she wore goes back, the weapon stays in her hands, event `armor.equipped`):

| Armor | Workshop | Crafting | Materials | Reduction | Combat to wear |
|---|---|---|---|---|---|
| `iron_vest` | 2 | 1 | 4 iron bars + 2 rags + 1 hide | 2 | 0 |
| `steel_vest` | 3 | 3 | 2 iron bars + 3 steel plate + 2 hide | 4 | 1 |

  Each point of `reduction` is taken off EVERY zombie hit on her (a walker or wanderer hit, a thrown object, a boomer's blast); a hit that did damage still does at least 1 (`armoredDamage` in `survivors/index.js`). The `survivor.damaged` event carries the reduced damage. Wall armor is a different thing (docs/game/23).
- **Ballista** now costs 4 planks + 1 beam + 2 iron bars (was 6 wood + 4 scrap), so the sawmill and the mine both matter. `weapons.ballista.craft` and the recipe stay equal.
- Learner reads: `threats.armors` (reduction, minCombat, craft) next to `threats.weapons`; the survivor's `equipment.armor`. HQ stores the new items at every level.
- Not built: armor wear or durability, the survivor-gear pieces from docs/game/22 (jacket, helmet, boots, bag) are still art only, armor pictures (no icon yet), weapon upgrade levels of an existing weapon (the iron spear is a new weapon, not an upgrade), the machine guns still use scrap + gland, and iron bars are not yet used by tower or wall upgrades.
- Data: `data/arsenal.js`, `data/recipes.js`, `data/items.js`, `data/world.js` (HQ storage). Code: `actions/handlers/equip.js`, `survivors/index.js`, `threats/index.js`. Tests: `tests/armor.test.js`.

## 3g. How R7 works (road camp and road danger)
- Building `road_camp` (`camp_1`, a ruin in every scenario; on the painted outpost at (10,12), in stage 1 at (13,5)). Level 1 `Waystation`, level 2 `Fortified Camp` (upgrade 25 wood + 25 stone + 12 scrap, HQ 3). Repair 12 wood + 4 stone. One camp serves BOTH roads (forest and quarry); the front sites are unchanged. A camp WORKS when repaired and the HQ has reached `roads.minHq` (2). Placeholder numbers (tune in a playtest):

| Camp level | Road travel time | Run danger | A raid night takes at most (stash on a road) |
|---|---|---|---|
| 1 Waystation | 85 % | -30 % | 10 % |
| 2 Fortified Camp (the guard) | 70 % | -60 % | 5 % |

- **Shorter road**: `scavenge`, `stash` and `retrieve` trips to forest/quarry sites take the camp's share of their TRAVEL ticks (the extra rounds and camp-pitching time are not shortened); the vehicle multiplier then applies on top. Learner read: `scavenge.sites[].ticksNow`.
- **Safer runs**: `runDanger` = site danger, raised by a loud motor vehicle (`vehicles.types[].noisePercent`: motor cart +25 %, truck +50 % of the danger itself, so a calm site stays calm), plus `roads.loadedRaidDayDanger` (15) on a LOADED run (retrieve) along a road on a raid or boss day (the full cart is the target), then cut by the camp. Danger is fixed at departure (`away.danger`) and drives the existing hurt roll (half the load, health damage). `scavenge.sites[].dangerToday` now includes the camp cut.
- **Guard**: `stashLossPercent` = the normal near/deep/camped share, capped by the camp level's `stashLossPercent` for road sites. The "camp or a guard cuts the loss" item of R2 is now real.
- Learner reads: `camp_1.camp` = `{ working, open, minHq, level, active, activeLevel, regions, loadedRaidDayDanger, now, thisLevel, next }` (`now` / `thisLevel` / `next` = `{ roadTicksPercent, dangerCutPercent, stashLossPercent }` or null), `scavenge.sites[].road` = `{ road, camp, ticksPercent, dangerCutPercent, stashLossPercent }`. The camp card has a "Road report" button (inserts `console.log(camp_1.camp)`); repair and upgrade are the usual buttons.
- Decision: noise is expressed as danger, not as the wave attention meter (that meter only matters during a wave and decays before dusk).
- Not built: a camp sheltering a survivor caught outside by a wave (she is still lost, `survivor.lost`), one camp per road, a camp picture (placeholder art), a guard survivor posted at the camp, vehicle wear.
- Data: `data/roads.js`, `data/world.js` `road_camp`, `data/vehicles.js` `noisePercent`. Code: `buildings/roads.js` (pure rules + learner view), `scavenge/index.js` (`roadPercent`, `runDanger`, `tripPlan` `road`, `stashLossPercent`). Tests: `tests/roadcamp.test.js`.

## 4. Open questions
- (decided) The mining station opens at HQ 3; stash risk follows the R2 defaults above.
- [open] Whether the old scrap recipes for iron and lead bars should be removed now that ore exists (kept for now as a slow fallback).
- [open] A beast-drawn cart as the other branch at garage level 2 ("cart with a beast or motor"): feed instead of fuel? Only the motor branch is built.
- (decided in R7) A motor run is loud: it raises the run's danger. [open] Whether vehicles should wear out.
- [open] Whether FOREST and QUARRY should later become live grids with real trees and rocks like the outpost.
