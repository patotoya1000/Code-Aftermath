# 28. Testing State Fixtures (Proposed)

**Status:** DESIGN / TESTING PROCEDURE — NOT IMPLEMENTED

## 1. Purpose

Provide repeatable JSON fixtures for tests that need a particular resource or building state.

A fixture can be used to prepare a state where, for example:

- wood is 500 instead of its normal starting amount;
- the kitchen is ruined;
- the tower is working and mounted;
- the HQ is damaged or upgraded;
- storage is full or nearly full;
- a survivor has selected needs or equipment states.

Fixtures are testing tools. They must not become a learner-facing API or a production state-mutation mechanism.

## 2. Recommended location

Recommended test locations:

```text
tests/fixtures/
  ui-building-states.json
  resource-shortage.json
  storage-full.json
  upgrade-ready.json
```

A fixture loader should remain under `tests/`, for example:

```text
tests/helpers.js
```

The loader is test infrastructure, not a runtime module.

## 3. Fixture format

```json
{
  "name": "upgrade-ready",
  "scenarioId": "stage1_outpost",
  "seed": 42,
  "resources": {
    "wood": 500,
    "stone": 300,
    "scrap": 100,
    "bread": 20
  },
  "buildings": {
    "hq": {
      "level": 2,
      "condition": "repaired"
    },
    "kitchen_1": {
      "level": 1,
      "condition": "ruined"
    },
    "tower_1": {
      "level": 3,
      "condition": "repaired"
    }
  },
  "survivors": {
    "survivor_1": {
      "needs": {
        "hunger": 20,
        "thirst": 20,
        "energy": 20
      }
    }
  }
}
```

### Supported fields

The initial implementation should support only fields that correspond to existing authoritative state:

| Section | Field examples | Expected behavior |
|---|---|---|
| Resources | `wood`, `stone`, `bread`, `ammo` | Set matching ledger stock account |
| Buildings | `level`, `condition`, `health` | Set or derive the building state |
| Survivors | `needs`, `equipment`, `skills`, `attributes` | Set test values through existing state structures |
| Nodes | resource or amount values | Set node ledger quantities |
| Power | stored charge or building power state | Set only values needed by power tests |
| Stash | site items | Set a remote stash account |

Unknown fields should be refused with a clear validation error.

## 4. Loading procedure

The recommended test procedure is:

1. Call `createInitialState()` with the fixture scenario and seed.
2. Load the JSON fixture.
3. Validate every item and building ID against the loaded definitions.
4. Apply resource quantities to ledger stock accounts.
5. Apply building health or condition values.
6. Derive building conditions through the existing `conditionOf()` rules.
7. Synchronize dependent systems, such as spoilage batches, farm plots or power state.
8. Create the simulation from the resulting state.

Existing tests already use this pattern through the `mutate(state)` callback in `tests/helpers.js`. A fixture loader should perform the same operations, not a separate state system.

## 5. Building state rules

Prefer `health` over a direct condition override when health is available.

- High health: `repaired`
- Health below the damaged threshold: `damaged`
- Health at or below the ruined threshold: `ruined`

When a fixture has no `health`, it may use `condition`:

- `repaired`: set health to max health
- `damaged`: set health to a mid-range valid health
- `ruined`: set health to zero or another existing ruined threshold

Fixtures must not assume that the building condition alone means the building is fully operational. Systems may also require repair, level, HQ level, fuel or power.

Examples:

- A kitchen with `condition: repaired` but an insufficient level may still not satisfy a recipe.
- A tower with `condition: repaired` may still lack an operator or mounted weapon.
- A generator may be repaired but have no fuel.

## 6. Resource rules

Resources must be stored in the simulation ledger.

A fixture must not write directly to UI display variables, because UI values are projections and must remain read-only.

Negative quantities are invalid. Quantities must not exceed applicable storage capacity unless the test explicitly uses a ledger stress case that validates overflow behavior.

Perishable items require batch synchronization after changing stock. Otherwise, spoilage and consume behavior can become inconsistent.

## 7. Example fixture application

Conceptual test helper:

```js
const fixture = loadFixture('tests/fixtures/upgrade-ready.json');
const sim = newSim(fixture.scenarioId, fixture.seed, (state) => {
  applyFixture(state, defs, fixture);
});
```

The helper may use `newSim()`, but it must:

- reject unknown IDs;
- reject unknown resource names;
- preserve the scenario seed;
- keep stock within valid ledger invariants;
- not mutate the definitions data;
- not bypass simulation validation.

## 8. Browser and manual testing

A JSON fixture may also support manual browser testing through a debug-only test menu.

Recommended controls:

- select fixture;
- restart the scenario with the fixture;
- show the loaded fixture name in the test HUD;
- reset to the normal scenario;
- export the current test state as JSON.

Manual fixture loading must be disabled in normal release builds or hidden behind an explicit developer/debug flag.

The current UI must continue to read state from projections. A test control must only restart or mutate the authoritative test state before the simulation/session begins, or through an existing test-only helper. It must not mutate UI fields or projection objects directly.

## 9. Automated test procedures

### Resource test

1. Load a fixture with 500 wood and 300 stone.
2. Verify the base stock projection.
3. Submit a real repair or upgrade command.
4. Confirm that the ledger changes exactly as expected.
5. Verify no stock was reserved or consumed on refusal.

### Ruined building test

1. Load a building as ruined.
2. Verify the building card reports the ruined state.
3. Verify a repair action is available and an upgrade is disabled.
4. Submit a real repair command.
5. Step until completion.
6. Verify the condition changes to `damaged` or `repaired` through normal health rules.

### Working building test

1. Load the building as repaired.
2. Set its level and all required inputs.
3. Verify storage, recipes or mounted equipment are exposed only when operational.
4. Submit the real action from the relevant card or API.
5. Confirm the result through state, projections and events.

### Storage-full test

1. Set a resource equal to its pooled storage capacity.
2. Run gather or production.
3. Verify `STORAGE_FULL` or the correct refusal reason.
4. Confirm no partial amount was consumed or left in an inconsistent ledger state.

### Upgrade test

1. Set HQ level, building level and health as required.
2. Set exact recipe or upgrade resources.
3. Verify enabled and disabled UI states.
4. Verify a refused upgrade spends nothing.
5. Verify a valid upgrade spends exact resources and changes the building level.

### Replay test

1. Load the fixture twice with the same seed.
2. Submit identical commands at identical ticks.
3. Compare snapshots or state hashes.
4. Confirm the final state and event sequence match.

## 10. Validation requirements

A fixture applicator should validate:

- scenario ID exists;
- seed is an integer;
- every item exists in definitions;
- every building ID exists in the selected scenario;
- every survivor ID exists in the selected scenario;
- building level exists in building definitions;
- health is between zero and max health;
- resource quantities are finite, whole and non-negative;
- perishable items are synchronized with their batches;
- the resulting ledger satisfies storage and conservation invariants.

## 11. Invariants

Every fixture application must preserve these project rules:

- the simulation remains the sole authority for gameplay state;
- learner code cannot directly apply fixture state;
- resource quantities stay in the ledger;
- one unit remains in exactly one place;
- stock cannot exceed pooled capacity unless the test is specifically testing a capacity refusal;
- projections remain read-only;
- UI buttons only insert or submit real Game API actions;
- identical fixture and command inputs produce identical replay results;
- any behavior change requires the appropriate `SIM_VERSION` update.

## 12. Implementation order

### Phase F1 — Test JSON loader

- Add fixture JSON files.
- Add a strict fixture validator.
- Add a test-only state applicator.
- Add tests for unknown IDs, unknown resources and invalid quantities.

### Phase F2 — Common test states

- Add resource-rich and resource-poor fixtures.
- Add ruined, damaged and repaired building fixtures.
- Add full-storage and near-full-storage fixtures.
- Add upgrade-ready and upgrade-blocked fixtures.

### Phase F3 — Optional debug UI

- Add a debug-only fixture selector.
- Add restart/reset controls.
- Add a visible test-fixture label.
- Keep it outside normal release builds or behind a debug flag.

## 13. Acceptance

A fixture testing system is complete when:

- tests can alter resource quantities through JSON;
- tests can set building levels and health/condition through JSON;
- every fixture is deterministic and replayable;
- invalid fixture values are refused;
- ledger and conservation invariants remain intact;
- UI reads the resulting state through normal projections;
- learner code cannot bypass the fixture system or mutate production state;
- the normal game and save/load behavior are unchanged.
