<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Item domain: definitions, weight, equipment

# Purpose

Item definitions (name, unit weight). Today items are only base-stock resources.

# Responsibilities

- Define the four items: wood (w2), stone (w4), food (w1), water (w1).
- Project `unitWeight` and per-stack weight in `inventoryDetail` (display only).

# Does NOT Own

- Quantities (RESOURCE ledger / INVENTORY).
- Capacity or encumbrance rules (not implemented).
- Equipment effects (not implemented).

# Core Data

`items` in `src/modules/definitions/data/items.js`.

# State

No item instances exist. `survivor.inventory.items` is `{}` in every scenario; stock is a ledger account.

# Commands / API

Item ids are used as resource names (`gather("wood")`) and in the eat/drink definitions. No item commands.

# Events

None specific.

# Dependencies

None.

# Dependents

`world` (opens `stock.<item>` accounts), `actions` (eat/drink items), `projection`.

# Source Files

- `src/modules/definitions/data/items.js`
- `src/modules/projection/index.js` (`inventoryDetail`)

# UI Files

`src/app/mainscreen.js` (equipment grid is a placeholder)

# Asset Files

None (no item sprites; `item.axe.basic` style ids are PLANNED).

# Tests

`tests/ledger-defs.test.js` (definitions valid and frozen).

# Current Status

PARTIALLY IMPLEMENTED: resource items only. PLANNED: tools/weapons/consumables, equipment.

# Known Problems

<<<<<<< HEAD
The `strong` trait now raises carry capacity (`defs.carry.traits`); the `gathering` skill text promises "carry more per trip" but skill level does not change capacity (it only changes the batch size through the output modifier).

# Planned Changes

Equipment effects on capacity with Skills/Capability phases. `unitWeight` is used for carry load (R3).
=======
The skills/traits text in `src/modules/definitions/data/survivors.js` mentions carry capacity that does not exist yet.

# Planned Changes

Weight → carry capacity with R3; equipment with Skills/Capability phases.
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not put sprite filenames in item definitions; use semantic asset ids through the asset resolver.
- Do not add item behaviour in the UI.

# Related Documentation

- `docs/game/14-enemies-resources-items-open.md`
- `docs/game/05-resources-inventory-carry.md`
