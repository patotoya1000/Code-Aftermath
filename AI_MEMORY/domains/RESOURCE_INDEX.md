<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Resource domain: nodes, quantities, ledger, gathering, depletion

# Purpose

Every spendable quantity (base stock, node contents) is a ledger account with `total` and `reserved`, so two actions can never spend the same unit.

# Responsibilities

- Accounts `stock.<item>` and `node.<nodeId>`; `reserve`, `commit`, `release`, `releaseOwner`, `credit`; `ledgerViolations` as a test/debug invariant checker.
- Node types: `tree` (wood, 35 + 0–10) and `rock` (stone, 25 + 0–10), amount rolled with the seeded RNG at world creation.
- Depletion: a node reaching 0 emits `node.depleted`.

# Does NOT Own

- Choosing which node to gather (gather handler).
- Storage capacity rules (BUILDING `storage` table, enforced by gather).
- Regeneration — not implemented.

# Core Data

`nodeTypes` in `src/modules/definitions/data/world.js`; stage-1 nodes `tree_1` (20,4), `tree_2` (20,7), `tree_3` (21,11), `rock_1` (3,13); starting stock wood 0, stone 0, food 6, water 6.

# State

`state.ledger[key] = { total, reserved }`, `state.reservations[id] = { id, owner, account, qty }`, `state.nodes[id] = { id, type, resource, x, y }` (quantity lives only in the ledger).

# Commands / API

`survivor.gather(resource, load = 5, total)`; reads `base.wood|stone|food|water` (AVAILABLE = total − reserved) and `nodes[]`.

# Events

`resource.gathered { actorId, resource, amount, nodeId }` (picked up into her hands), `resource.deposited { actorId, depotId, resource, amount }` (unloaded into base stock), `node.depleted { nodeId }`.

# Dependencies

kernel only.

# Dependents

`actions`, `world`, `projection`.

# Source Files

- `src/modules/resources/ledger.js`
- `src/modules/resources/index.js`
- `src/modules/actions/handlers/gather.js`
- `src/modules/world/index.js`
- `src/modules/definitions/data/world.js`

# UI Files

`src/app/mainscreen.js` (top-bar resources, node inspector)

# Asset Files

`AI_MEMORY/assets/RESOURCE_ASSETS.md` (keys `node_tree_available`, `node_tree_depleted`, `node_rock_*`).

# Tests

- `tests/ledger-defs.test.js`
- `tests/simulation.test.js` (no double-spend)
- `tests/hardening.test.js` (node choice)
- `tests/stabilization.test.js` (node loss = base gain)
- `tests/invariants.test.js`
- `tests/soak.test.js` (stone conservation)

# Current Status

IMPLEMENTED: ledger, reservation, node gathering, depletion. NOT IMPLEMENTED: regeneration, food/water production (food and water are stock only; there are no food or water nodes). Carry trips: IMPLEMENTED (R3) — see INVENTORY_INDEX.

# Known Problems

A gather of `food`/`water` fails with `NO_TARGET` because no node yields them (intended for now; the soak test uses this as a clean-failure case).

# Planned Changes

Production/environment later.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not change a quantity without the ledger (`credit`/`commit`); never write `ledger.total` directly.
- Do not let output modifiers change how much the node loses versus what the base receives (ledger must balance).

# Related Documentation

- `docs/game/05-resources-inventory-carry.md`
- `docs/game/14-enemies-resources-items-open.md`
