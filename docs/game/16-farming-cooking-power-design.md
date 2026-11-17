# Farming, cooking, crafting and power — agreed design (2026-11-16)

Status: **build steps 1–4 are implemented (O5 upgrades, O6 environment, O7 water, O8 recipe engine/kitchen/bread, O9 spoilage + cold cellar)**; farming field→greenhouse handler is DONE; power (generator/solar → hydroponic, freezer) and crafting are still design only. Built on repair, upgrade (O5), skill XP (O4), environment (O6) and water (O7).

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

## Build order
1. ✅ Upgrade existing buildings (O5)  2. ✅ Environment / weather calendar (O6)
2b. ✅ Water source (O7, `17-water-wells.md`) — bread, crops and later the pump all draw on it
3. ✅ Recipe engine + kitchen + bread + `eat` choosing among foods (wheat given as starting stock until farming exists) — O8
4. ✅ Spoilage (batches) + storehouse cold cellar (L2) — O9
5. ✅ Farming: field → greenhouse (handler + plot storage + ledger reservations DONE; weather hazards and greenhouse multipliers pending)
6. Power: generator (+ upgrade branches) → hydroponic, freezer (storehouse L3)
7. Crafting / workshop recipes (packaging, fuel, glass, fertilizer), hot meals, MRE
