<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Inventory / storage / carry domain

# Purpose

Where quantities live and how much fits. A unit is always in exactly ONE place: a resource node, a survivor's hands (`inventory.items`), or base stock. Survivors carry what they gather and unload it at storage (R3).

# Responsibilities

- Base stock = ledger accounts `stock.<item>` (one pooled stock per item).
- Pooled storage capacity per item = sum of the `storage` tables of every building that is NOT ruined (`storageCapacity`, `src/modules/buildings/index.js`). HQ wood/stone 150, food/water 100; tent food/water 50; storehouse wood/stone 100 once repaired.
- Carry capacity (weight units) = `(carry.base + carry.perStrength × strength) × trait multipliers`, floored (`carryCapacity`, data in `defs.carry`). Load = Σ quantity × `unitWeight` (`carriedLoad`). Neither is stored.
- Room accounting: before a trip is planned, room = pooled capacity − stock − everything survivors carry − batches other gatherers have reserved but not picked up (`storageSpace` in `gather.js`). Unloading therefore can never overfill storage; `stepDeposit` still checks.
- Unloading leg shared by gather and `deposit()`: `src/modules/actions/handlers/carry.js` (`stepDeposit`): nearest working depot that accepts the first carried item (alphabetical) → walk → `unloadTicks` → move everything that depot accepts → repeat for the rest. Nothing moved ⇒ `STORAGE_FULL`.

# Does NOT Own

- Item definitions (ITEM).
- Equipment effects on capacity (not implemented), encumbrance/slowdown (not implemented: load never slows her down).

# Core Data

`defs.carry`, `defs.items[*].unitWeight`, `defs.buildings[*].storage`, `defs.actions.deposit` / `gather.unloadTicks`.

# State

Base stock in the ledger. `survivor.inventory.items` = `{ [item]: quantity }` (authoritative, no zero entries). `state.buildings[id].storage` is the per-building capacity table copy.

# Commands / API

Commands: `survivor.deposit()` (unload everything), plus `gather` (trips). Reads: `survivor.inventory`, `survivor.carry { load, capacity }`, `base.*` (stock only, not what is carried), `base.capacity.*` (pooled), building `storageInfo { capacity, pooledCapacity, current, remaining, working }`.

# Events

`resource.gathered { actorId, resource, amount, nodeId }` = picked up at a node (into her hands). `resource.deposited { actorId, depotId, resource, amount }` = unloaded into base stock.

# Dependencies

`resources`, `buildings`, `survivors`, `definitions`.

# Dependents

`actions` (gather, deposit), `projection`.

# Source Files

- `src/modules/actions/handlers/gather.js` (`storageSpace`, `pickUp`, trip state machine)
- `src/modules/actions/handlers/carry.js` (`stepDeposit`), `deposit.js`
- `src/modules/survivors/index.js` (`carryCapacity`, `carriedLoad`, `carryRoom`, `addCarried`, `removeCarried`)
- `src/modules/buildings/index.js` (`storageCapacity`, `nearestDepot`, `isOperational`)
- `src/modules/projection/index.js` (`storageInfoFor`, `carry`, `base.capacity`)
- `src/modules/definitions/data/items.js`, `world.js`

# UI Files

`src/app/mainscreen.js` (`buildingSections`, inventory list on the survivor card). The card does not show carry load/capacity yet (projection has it).

# Asset Files

None. Unloading reuses the GATHER pose (placeholder); no carry/unload animation exists.

# Tests

- `tests/carry.test.js` (R3: capacity, conservation per tick, caps, stop-while-carrying, deposit, storehouse pooling, never overfilled, determinism)
- `tests/simulation.test.js`, `tests/realtime.test.js` (STORAGE_FULL, shared storage room)
- `tests/world-i2.test.js` (storageInfo)
- `tests/soak.test.js` (units conserved = nodes + hands + stock; load ≤ capacity; stock ≤ pooled capacity)

# Current Status

IMPLEMENTED: carry capacity, pickup, unload trips, `deposit()`, pooled storage (HQ + tent + repaired storehouse). NOT IMPLEMENTED: equipment/encumbrance effects, picking up from the ground, transfers between survivors, carrying food/water to eat later (eating still takes from base stock), choosing a depot from learner code.

# Known Problems

- `gather(..., total)` counts units that reach base stock during the job, including a load she was already carrying when the job began.
- A survivor that runs out of energy mid-trip keeps her load (the job ends `EXHAUSTED`); she needs `deposit()` or a new gather to unload it.
- The depot is chosen by straight-line distance from where she stands, then she walks an A* route to it (O3); a long detour is not weighed in the choice.

# Planned Changes

Equipment/encumbrance; dedicated carry/unload animations (I1); learner-chosen depot; pickup of food/water for field eating.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not let inventory exceed capacity; check at reserve time, not afterwards.
- Do not duplicate stock (a unit is either in a node, in transit, or in base stock).

# Related Documentation

- `docs/game/05-resources-inventory-carry.md`
- `docs/IMPLEMENTATION_PLAN_2026-11-13.md` (R3 row)
