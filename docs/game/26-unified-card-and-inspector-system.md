# 26. Unified Card and Inspector System (UI-C1)

**Status:** IMPLEMENTED 2026-11-22 (UI-C1A-F, presentation only).
**Date:** 2026-11-22
**Authority:** Presentation-only. Cards must read render projections and insert learner code. They must never mutate simulation state directly.

## 1. Existing foundation

The repository already has card and panel components, but they are feature-specific rather than one shared system:

- Survivor/selection inspection: `src/app/mainscreen.js`, `src/app/hud/hud.js`, `index.html`.
- Building, survivor and node action derivation: `src/app/ui/actions.js`.
- Shared town/train/scavenge panel rows: `src/app/ui/panels.js`.
- Map/Town/Front/Forest/Quarry screens: `src/app/ui/screens.js`, `src/app/ui/scenes.js`.
- Wall/gate tabs: `src/app/ui/wallcard.js`.
- Codebook and contextual help: `docs/game/19-codebook-and-ui-display.md`.
- HUD card folding, inspector tabs and tactical view: `docs/HUD.md`.
- Survivor card rules: `docs/game/11-npc-visual-spec.md`.

The following gaps justify UI-C1:

- Card markup and state formatting are duplicated between feature areas.
- No single card contract exists for loading, empty, damaged, ruined, away or unavailable states.
- Buttons derive real rules independently of the visual card components.
- World-object cards and HUD panels use inconsistent layouts and tab behavior.
- Object coverage is incomplete for zombies, loot, mounted weapons, inventory, work queues and future systems.
- Accessibility and mobile behavior are not described or tested as one card system.

## 2. Non-negotiable rules

1. Cards are read-only presentations of frozen/derived projections.
2. Cards may insert API code into the Code/lesson editor.
3. Cards must not call mutation APIs or change state directly.
4. Every enabled card action must run through the real API and sandbox.
5. Every disabled action must show the real blocking reason.
6. Cards must derive values from live projections; they must not invent numbers or duplicate engine formulas.
7. Cards must remain usable with keyboard, touch and no hover.
8. Card presentation must not affect the simulation state hash or replay.

## 3. Shared card contract

The UI-C1 implementation should add a shared data-to-card adapter with a stable shape:

```text
CardView
├── kind: survivor | building | node | loot | zombie | mount | offer | panel
├── id
├── title
├── subtitle/status
├── portrait/icon
├── severity/state
├── tabs[]
├── sections[]
├── metrics[]
├── inventory[]
├── actions[]
├── disabledReasons[]
└── codeExamples[]
```

Required visual behavior:

- Header: identity, icon/portrait and primary status.
- Metrics: health bars, amount bars and compact status rows.
- Tabs: optional; group detail rather than adding duplicate cards.
- Actions: insert code, including a copyable fallback.
- Empty state: explains why there is no data.
- Loading state: keeps the existing fallback/placeholder without claiming it is known state.
- Ruined/destroyed/away state: removes invalid actions and explains the condition.
- Fold/collapse: consistent with the existing HUD card behavior.

## 4. Implementation phases

### UI-C1A — Shared foundation

- Add shared card shell, tab and metric components.
- Add shared card-state helpers for loading, empty, damaged, ruined, away and destroyed objects.
- Consolidate action insertion and disabled-reason behavior.
- Define and test the card view adapter boundary.
- Preserve `Esc`, click-away, keyboard, touch and focus behavior.

**Acceptance:** one card shell handles the common layout, and cards cannot mutate state.

### UI-C1B — Survivor and personal inventory

- Portrait and identity.
- Needs and conditions.
- Attributes, skills and XP.
- Traits and specialization progress when present.
- Carry load and inventory.
- Equipped weapon/tool/accessory/armor.
- Current task, queue, stop reason and policy state.
- Contextual valid actions.

**Acceptance:** all personal information is sourced from the projection and live rules.

### UI-C1C — Building cards

- Name, level, health and repair state.
- Operating status and power/water demand.
- Storage and production data.
- Upgrade cost, capability and HQ requirements.
- Current and next-level preview.
- Contextual repair, upgrade, mount, reload, craft and guard actions.

Use dedicated card variants for headquarters, kitchen, workshop, smelter, farm, hydroponics, wells, pumps, power buildings, storage, tower, wall and gate.

**Acceptance:** no building card contains hard-coded costs or unsupported actions.

### UI-C1D — World-object cards

- Resource nodes: amount, recovery, workers and gather action.
- Loot piles: item list, amount and collect action.
- Zombies: type, health, armor, behaviour and current target.
- Wanderers: wave-independent status and attack action.
- Mounted weapons: weapon, ammo hopper, crew/operator, reload, cooldown and power status.
- Train/recruit/scavenge offers: available items, prices, capacity and real refusal reasons.

**Acceptance:** object cards expose live state and route every action through existing Game API rules.

### UI-C1E — Panels and navigation

- Standardize Town, Train, Expeditions, Raid, Power, Water, Resources and Event panels.
- Reuse card row components with the map-screen hotspots.
- Preserve existing nav and bottom-dock behavior.
- Use one consistent fold, close, tab and empty-state vocabulary.

**Acceptance:** panel rows and card rows use the same presentation rules across both nav and map screens.

### UI-C1F — Validation and accessibility

- Shared tests for card state, tabs, actions and projection-only behavior.
- Drift tests against API commands and learner reads.
- Mobile and desktop layout tests.
- Keyboard, Escape, focus and reduced-motion tests.
- Screens for loading, empty, disabled, damaged, ruined, away and destroyed states.

**Acceptance:** cards cannot expose mutation-only UI, stale values or invented blocking reasons.

## 5. Proposed file layout

```text
src/app/ui/cards/
├── card-shell.js
├── card-tabs.js
├── card-metrics.js
├── card-actions.js
├── card-state.js
├── survivor-card.js
├── building-card.js
├── node-card.js
├── loot-card.js
├── zombie-card.js
├── mount-card.js
└── offer-card.js

tests/
├── cards.test.js
├── ui-actions.test.js
├── ui-wiring.test.js
└── gestures.test.js
```

The exact file names may change, but card logic should remain presentation-only and reusable.

## 6. What implementation adds

After UI-C1:

- Every major game object has a consistent inspector experience.
- Walls, towers and buildings have the same tab/action patterns.
- Survivors expose complete identity, needs, progression, inventory and equipment.
- World objects are inspectable without permanently changing camera or map behavior.
- Town, train and expedition offers use one shared row/card vocabulary.
- The HUD, map cards and bottom inspector remain aligned on the same rules.
- Future systems such as research, road camps, defences and vehicles can use the card contract instead of creating bespoke UI.

## 7. Explicitly out of scope

- Direct mutation from cards or panels.
- New simulation rules hidden inside UI code.
- Hard-coded prices, costs or capability formulas in presentation code.
- Card-only state that can diverge from the simulation or replay.
- Replacing the full-screen map or command/lesson bottom dock during the card consolidation.

## 8. Test expectations

At minimum, UI-C1 should add coverage for:

- Shared card shell and tab behavior.
- Projection-only rendering.
- Enabled and disabled action derivation.
- Real sandbox/API command snippets.
- Survivor and building variants.
- Node, loot and zombie states.
- Mounted weapon and offer states.
- Mobile, keyboard and reduced-motion behavior.
- Empty/loading/damaged/ruined/away/destroyed states.
