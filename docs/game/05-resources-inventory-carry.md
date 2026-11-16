# Resources, Inventory and Carry

> Source: `CODE_AFTERmath_GAME_LOGIC_ARCHITECTURE_RULES_UPDATED_v3_SIMPLE_NPC_WORLD_RULES.docx` (converted from the original .docx; content unchanged, only regrouped).
> Part of the CODE: AFTERMATH design set — see [README](README.md).

# 9. Resource Transaction Rules

- Resources are authoritative state, not informal counters.

- An accepted resource-consuming action reserves the required quantity before execution.

- Successful execution commits the reservation.

- Cancellation or failure releases the reservation.

- Two simultaneous actions cannot spend the same reserved quantity.

- The learner may receive a safe summary of resource availability/reservations, but not engine internals.

- Resource mutation happens only inside the simulation engine.

> **Update 2026-11-16 (R3):** gathered units go into the survivor's hands and reach base stock only when she unloads at a working storage building; room is reserved before pickup. Implemented: unitWeight, derived load and capacity, pickup, unload, pooled storage. Still open: encumbrance and equipment effects on capacity. See `game/15-realtime-simulation-and-tasks.md` §R3.

# 10. Inventory and Carry Rules

- Each item definition may provide unitWeight.

- currentLoad is derived from item quantities and weights.

- carryCapacity is derived from survivor configuration, attributes and permitted equipment effects.

- encumbrance is derived from load relative to capacity.

- Pickup, transfer and production actions must validate capacity before committing inventory changes.

- Student code cannot directly set currentLoad, carryCapacity or encumbrance.
