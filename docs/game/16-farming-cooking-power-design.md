# Farming, cooking, crafting and power — agreed design (2026-11-16)

Status: **build steps 1–6 are implemented (O5 upgrades, O6 environment, O7 water, O8 recipe engine/kitchen/bread, O9 spoilage + cold cellar, O10 farming, O11 power + freezer)**; hydroponics, battery and crafting are still design only. Built on repair, upgrade (O5), skill XP (O4), environment (O6) and water (O7).

## Principles (decided with the project owner)
- **No free construction.** Every building is placed by the scenario as a ruin. Learners repair it (`survivor.repair`) and then raise it (`survivor.upgrade`). Fixed world ⇒ fixed lessons and replays.
- **Weather is a public calendar** (O6). Learners predict and plan with `world.forecast`; weather never surprises them.
- **Cooking needs a building** (kitchen) to process food.

## Farming — a tiered building
| Level | Building | Weather | Yield | Needs |
|---|---|---|---|---|
| 1 | **Field** (open ground) | exposed: rain waters it; storm / heat / cold damage crops | ×1 | seeds, hand watering (or rain) |
| 2 | **Greenhouse** | blocks storm/heat/cold hazards; grows off-season | ~×1.5 | materials to upgrade; still watered |
| 3 | **Hydroponic** | ignores weather | ~×2.5 | **electricity** + water + nutrients; stops without them |

- Each farm holds a fixed number of **plots** (grows with level). Plot cycle: empty → planted → growing → ready → harvested. Crops are data (growth ticks, water need, hazard tolerance, yield).
- Learner commands (planned): standing action like `gather`, e.g. `survivor.farm(field_1, "potato")` plants / waters / harvests / replants until a stop reason fires. Farming skill XP reuses O4 diminishing returns.

## Power — for hydroponics
- A **Generator** building (level 1) produces electricity from **fuel**. Upgrade path chosen by the player:
  - **Advanced generator** — more output per fuel, still needs fuel (crafted / gathered).
  - **Solar panel** — no fuel (fuel-efficient path); output follows daylight and weather from the calendar (night and storms cut it) ⇒ needs battery/planning.
- Power is a simple per-tick budget: producers add, consumers (hydroponic, later workshop) draw; a shortfall stops the consumer. Learner reads `power.produced / used / stored`.
- Upgrade **branching** needs a small extension of the O5 upgrade table (`upgrade` offers per branch, e.g. `upgrade(generator, "solar")`).

## Cooking and crafting — one recipe engine
- **Recipe** = station building (must be repaired), inputs, ticks, outputs, skill. Inputs reserved through the existing ledger.
- **Kitchen** (cooking): raw food → meals (restores much more hunger than raw). **Workshop** (crafting): planks, glass, fertilizer, filters, fuel. Equipment/tools come after the equipment system.

## Recipe ladder and food values (decided 2026-11-16)
| Kitchen level | Recipe | Inputs | Hunger |
|---|---|---|---|
| 1 | **Bread** | 2 wheat, 1 water, 1 wood (fuel) | **40** |
| 2 | Hot meal (stew) | 1 vegetable, 1 wheat or bread, 1 water, 1 wood | 60 |
| 2 | Preserved ration | bread or meal + salt/sealed jar | 40–50, never spoils |
| 3 | **MRE** | 2 hot meals, 1 packaging (workshop), power for sealing | **100**, never spoils |
- The kitchen stays **food only** (no boiled-water mechanic) unless asked for later.
- `eat` takes a food item: default = the cheapest/oldest food; learners can pass `survivor.eat("mre")` or `policy("eat", { below: 30, prefer: "bread" })`.
- Cooking is a standing job like gather: `survivor.cook("bread", 10)`.

## Spoilage and the storage ladder (decided 2026-11-16: spoilage is in; storage levels include a freezer that SLOWS it)
- Perishable items (bread, meals, raw crops) have a `shelfLife` in days. Stock of a perishable is kept as **batches** `{ qty, age }`; eating takes the oldest first; a batch past its shelf life is lost (`food.spoiled`, a ledger sink so conservation still balances). Canned starting `food`, preserved rations and MREs never spoil.
- **Storehouse levels** (upgrade path, O5 mechanism): L1 plain shed (normal spoilage) → L2 **cold cellar** (spoils ~2× slower, no power) → L3 **freezer** (~5× slower, **needs electricity**: without power it reverts to normal rate).
- Cold capacity is limited per level. Each day the cold capacity protects the **oldest** batches first; everything else ages at the normal rate. Deterministic, checked once per day (at dawn).
- Learner reads: `base.perishables` (item, qty, daysLeft) and `building.cold` (capacity, factor, powered).
- Ties systems together: the freezer needs the generator/solar, solar depends on weather (calendar), so power planning protects the food.

## As built (O8, 2026-11-16)
- **Data:** `definitions/data/recipes.js` (`bread`: 2 wheat + 1 water + 1 wood → 1 bread, 12 ticks, cooking skill), building `kitchen` (level 1, repair 6 wood + 4 stone, ruined at (9,9) in stage 1), items `wheat` and `bread`, `actions.eat.items` (food +30 rank 1, bread +40 rank 2), `cook` action, `cooking` skill and `cook` XP award. HQ storage holds 60 wheat / 40 bread (120 / 80 at level 2).
- **Learner API:** `survivor.cook("bread", 5)` (count 1–100, optional: without it she cooks until a stop reason fires), `survivor.eat()` (cheapest food first) / `survivor.eat("bread")` (hard choice), `survivor.policy("eat", { below: 30, prefer: "bread" })` (soft choice). Reads: `recipes` (inputs, outputs, ticks, `stationWorking`, `canAfford`), `foods` (restore, rank, available), `building.recipes`, `base.wheat`, `base.bread`.
- **Stop reasons for cook:** `TARGET_REACHED`, `NO_INGREDIENTS`, `STORAGE_FULL`, `EXHAUSTED`, `NO_STATION`, `NO_PATH`. Failures before any work: `NO_STATION` (no kitchen exists), `NEEDS_REPAIR` (kitchen is ruined/damaged or too low a level), `INSUFFICIENT_RESOURCE` (first batch cannot be paid for), `STORAGE_FULL`, `EXHAUSTED`, `INVALID_PARAMS`.
- **Not yet:** hot meal / preserved ration / MRE (they come with kitchen levels 2–3 and the workshop), spoilage, a cooking animation (a working pose stands in).

## As built (O9, 2026-11-16)
- Bread has `shelfLife: 4` days; wheat and canned food never spoil (raw crops will get a shelf life with farming). Ageing runs at dawn (calendar day change), 100 points/day, integers only.
- Storehouse level 2 = **cold cellar**: repair the storehouse, then `survivor.upgrade(storage_1)` (25 wood + 30 stone). Its `cold` table (capacity 30, factor 2) protects the 30 OLDEST perishable units; the rest age normally. A ruined cellar protects nothing. Level 3 (freezer, needs power) is not built.
- Learner reads: `base.perishables` ([{ item, qty, daysLeft, cold }], oldest first), `storage_1.cold` ({ capacity, factor, working }). Event `food.spoiled { item, qty, day }`.

## As built (O10, 2026-11-17)
- **One building, two tiers.** `field` (level 1 = Field, 4 plots, exposed) → `survivor.upgrade(field_1)` (20 wood + 15 stone, Repair 1) → level 2 = **Greenhouse** (6 plots, growth 150 %, yield 150 %, hazard shelter). It starts as a ruin at (8,4) in stage 1; repair it first. Hydroponics (level 3) waits for power; the `glass` cost the old scaffold used does not exist yet.
- **Plots** are `state.plots` entries (`field_1_1` …) with a ledger account `plot.<id>` that holds the ripe harvest, so harvest is a normal reserve/commit like gathering. Stages: empty → growing → ready.
- **Crops** (`data/crops.js`): wheat (720 ticks, yield 4; storm 40 %, cold 50 %), potato (480, 3; storm 25 %, heat 30 %), carrot (360, 3; heat 40 %, cold 25 %). A crop is also its own seed (`seeds` 1) and its own food (raw potato +18, carrot +12; bread is still better). Start stock: wheat 10, potato 4, carrot 4.
- **Water**: one unit keeps a plot growing 120 ticks (cap 240); a dry plot does not grow; rain fills every plot for free (greenhouse roofs let rain through).
- **Hazards**: at each day change a storm / heat / cold day damages plots of an unsheltered farm: a growing crop loses that % of its future yield (cap 90 %), a ripe crop loses that % of the units waiting (always keeps one). Greenhouses take none. The forecast is public, so the lesson is "harvest before the storm, or build the greenhouse".
- **Learner API**: `survivor.farm(field_1, "potato", 2)` — chores in order harvest → water → plant for one crop; she waits while crops grow (up to 480 ticks, then `NOTHING_TO_DO`); `count` = plots harvested. Stop reasons `TARGET_REACHED`, `NO_SEED`, `NO_WATER`, `NO_FARM`, `STORAGE_FULL`, `EXHAUSTED`, `NO_PATH`, `NO_DEPOT`, `NOTHING_TO_DO`. Reads: `crops` (growthTicks, seeds, yield, hazards, inStock), `field_1.farm` (working, sheltered, growth, yield, plots with stage / percent / water / dry / damage / ready), `base.potato`, `base.carrot`. Farming skill speeds chores up and earns XP per chore.
- **Not yet:** plot/crop art in the renderer, fertilizer, pests, crop rotation, several survivors sharing one farm in the tests (the claim logic exists), hydroponics.

## As built (O11, 2026-11-17)
- **Two buildings, one grid.** `generator` (level 1: 10 power for 1 wood per 20 ticks; level 2 "Advanced Generator": 24 power for 1 wood per 40 ticks, via `survivor.upgrade(generator_1)`: 20 wood + 25 stone) and `solar_panel` (8 power x the weather's `solar` %: clear 100, rain 40, storm 15, heat wave 110, cold snap 90; nothing at night). Both start as ruins in stage 1 (`generator_1` at (13,9), `solar_1` at (7,11)). The design's upgrade *branch* is realised as these two separate buildings (DECISIONS, O11).
- **Grid:** demand = sum of `power.use` of working consumers; solar covers it first, then generators in id order burn fuel only while demand remains; consumers are served in id order from what was produced, all-or-nothing; surplus is lost (no battery). Statuses: producer `OFF | BROKEN | IDLE | RUNNING | NO_FUEL | DARK`, consumer `BROKEN | POWERED | NO_POWER`; changes emit `power.status`.
- **Freezer:** storehouse level 3 (`survivor.upgrade(storage_1)`: 30 wood + 40 stone, after the cellar). Cold capacity 60, factor 5, `power.use` 6. While it is not powered it protects NOTHING (normal rate), which is visible as `storage_1.cold.powered === false`.
- **Learner reads:** `power` ({ produced, demand, balance, ok, sun, producers, working }), `generator_1.power` / `solar_1.power` ({ role, kind, output, producing, status, working, fuel }), `storage_1.power` and `storage_1.cold` ({ ..., needsPower, powered }) at level 3.
- **Not yet:** battery, hydroponic level 3 (needs glass from the workshop), powered pump, plot/power art beyond placeholder building sprites, power-on/off commands (the grid is automatic).

## Build order
1. ✅ Upgrade existing buildings (O5)  2. ✅ Environment / weather calendar (O6)
2b. ✅ Water source (O7, `17-water-wells.md`) — bread, crops and later the pump all draw on it
3. ✅ Recipe engine + kitchen + bread + `eat` choosing among foods (wheat given as starting stock until farming exists) — O8
4. ✅ Spoilage (batches) + storehouse cold cellar (L2) — O9
5. ✅ Farming: field → greenhouse, plots, `survivor.farm`, rain, weather hazards, greenhouse multipliers — O10
6. ✅ Power: generator + solar panel (two buildings) and the freezer (storehouse L3) — O11. Hydroponic needs glass: it moves to step 7
7. Crafting / workshop recipes (packaging, fuel, glass, fertilizer), hot meals, MRE
