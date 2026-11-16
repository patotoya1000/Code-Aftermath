# Water: the deep well (O7, 2026-11-16)

## What exists
- **Deep well** (`well`, a ruin in stage 1): repair it, then it holds a **reservoir** (level 1: 40, level 2: 80) that the **aquifer refills with ticks**: +1 every 24 ticks (level 1) / 16 (level 2) in clear weather. Nothing refills while it is ruined.
- **Weather** scales the refill (public calendar, so it can be planned): rain 160%, storm 200%, cold 80%, heat wave 50%. Pure function of the tick, integer accumulator, no randomness.
- **Drawing:** `survivor.gather("water", 10)` — same trips, carry and storage rules as wood. At an empty well she **waits** (up to `waitTicks`, 120) for the next water instead of failing; a ruined well is `NO_TARGET`.
- **Siphon** (well level 2, `upgrade(well)`: 25 wood + 20 stone): every 6 ticks moves 1 unit from the reservoir into base stock by itself. It only works while **connected**: a working building that stores water within **3 tiles** of the well. In stage 1 the HQ is 4 tiles away, so the learner must repair the **water tank** (`tank`, 2 tiles away; +120 water capacity, level 2: 240).
- Siphon status (read it in code): `well.water.siphon.status` = `OFF` · `BROKEN` · `NO_STORAGE` · `FULL` · `ACTIVE`; `siphon.status` events fire only when it changes.
- Learner reads: `well.water` = `{ amount, available, capacity, working, recharge: { every, amount, percent, perDay }, siphon }`; `world.weatherInfo.recharge`.

## Why not "water just increases in stock"
1. It would delete the programming task and the pressure (nothing to loop, check or plan).
2. A reservoir makes over-drawing, waiting and the forecast matter; the ledger still balances (a unit is in the aquifer, the reservoir, her hands or stock).
3. The upgrade ladder mirrors the curriculum: manual loop (L1) → automation that depends on structure (siphon) → powered machine (pump, later).

## Planned (not built)
- **Pump tier (well level 3, the "machine"):** faster, larger reach, needs electricity; stops without power. Arrives with the power phase (generator/solar). Open question for the owner: ladder (tube then machine, as built) or a one-way **choice** between them.
- Farming and cooking draw water from the same stock; bread needs 1 water.
