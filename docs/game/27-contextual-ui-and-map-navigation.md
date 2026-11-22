# 27. Contextual UI and Outpost Road Navigation (UI-7)

**Status:** PLANNED · 2026-11-22
**Authority:** Presentation-only. This phase changes cards and map presentation only; it must not create or bypass simulation rules.

## 1. Goal

Make the selected object determine the inspector UI and make travel destinations visible at the roads that lead to them.

This phase must improve the existing UI-C1 card system rather than create a second card system.

## 2. Contextual survivor inspector

When a survivor is selected, the right-side inspector uses survivor-only navigation:

- **INFO** — identity, portrait, status, current task, conditions and primary state
- **ATTRIBUTES** — attributes, skills, XP, traits and specialization progress
- **EQUIPMENT** — equipped weapon, tool, armor and accessory slots
- **BAG** — carried items, load/carry capacity and pile/deposit actions
- **COMMANDS** — real contextual actions and command snippets

Rules:

- Tabs with no available section show a real empty state; they must not show invented data.
- Attributes and skills come only from the live survivor projection.
- Equipment and bag values come only from inventory/equipment projections.
- Commands insert code through the existing sandbox; the card never mutates GameState directly.
- Existing needs and conditions remain available under INFO or ATTRIBUTES without duplicating them across tabs.
- A mobile layout keeps the same tabs in a compact side or bottom navigation, not duplicate desktop panels.

## 3. Contextual building / defence inspector

A selected building, tower, wall or gate uses building-specific navigation rather than survivor tabs.

General building tabs:

- **INFO** — name, picture, level, health/condition and operating state
- **DEFENCE** — for defensive buildings only: range, armor, mounted weapon, aim target, reload/ammo and guard state
- **UPGRADE** — current level, next level, real requirements/cost and upgrade action
- **STORAGE** — for stock, kitchen, workshop or production buildings only: real input/output and capacity
- **COMMANDS** — repair, upgrade, reload, mount, guard or production commands supported by live rules

Dedicated variants may keep a specialized layout only while still using the shared card shell:

- Headquarters
- Wall and gate
- Tower and mounted weapon
- Kitchen and workshop
- Farm, hydroponics and storage
- Water and power buildings

Defence tabs must derive live range, armor, ammo and target state. UI text must show the real refusal reason for disabled actions.

## 4. Outpost road navigation

The live OUTPOST map is the road junction for the regional maps:

- Place a visible **forest / north-road arrow button** on or beside the **top road** of the OUTPOST map.
- The button opens MAP 4 **FOREST**.
- Place a visible **quarry / south-road arrow button** on or beside the **bottom road** of the OUTPOST map.
- The button opens MAP 5 **QUARRY**.

Map behavior:

- The buttons are world-screen presentation controls, not simulation commands.
- Labels show the destination and real travel/site status where available.
- The existing edge-arrows and Left/Right navigation remain usable.
- Forest/quarry navigation must keep a clear return path to OUTPOST and FRONT.
- Existing road signs may remain on the FRONT screen for backward compatibility, but the preferred direct routes are on the OUTPOST roads.
- The forest/quarry and FRONT maps remain static/presentation-only until a later live-region phase decides otherwise.

## 5. Subphases

| Subphase | Scope | Acceptance |
|---|---|---|
| **UI-7A** | Context-aware inspector navigation and tabs | Selecting a survivor exposes survivor tabs; selecting a building exposes building/defence tabs; unavailable tabs have honest empty states. |
| **UI-7B** | Survivor card presentation | INFO / ATTRIBUTES / EQUIPMENT / BAG / COMMANDS reflect live projections and real action availability. |
| **UI-7C** | Building/defence card presentation | INFO / DEFENCE / UPGRADE / STORAGE / COMMANDS reflect live building, tower, wall and gate projections. |
| **UI-7D** | Outpost road buttons | Top road opens FOREST; bottom road opens QUARRY; return navigation works; keyboard/touch/accessibility tests pass. |
| **UI-7E** | Drift and responsive validation | Desktop/mobile/keyboard tests confirm projection-only behavior and no stale or invented UI values. |

## 6. Test expectations

- Survivor selection shows only relevant survivor navigation and never building/defence tabs.
- Building, tower, wall and gate selection show building navigation and appropriate variants.
- Tabs are keyboard reachable, retain Escape behavior and preserve existing card closing rules.
- Every enabled action derives from live data and inserts a real Game API snippet.
- Every disabled action names a real blocking condition.
- The top and bottom road buttons open FOREST and QUARRY respectively.
- Return navigation can reach OUTPOST and the existing map sequence remains coherent.
- Mobile layout, focus, touch targets and reduced motion pass existing UI test conventions.
- Presentation changes do not change simulation state, replay, or state hash.

## 7. Explicitly out of scope

- Changing real travel or scavenge rules.
- Adding new survivor attributes or building formulas only for presentation.
- Direct state mutation from card buttons or map road buttons.
- Turning the forest or quarry into live grids in this phase.
- Replacing the full-screen map or bottom code/lesson dock.
