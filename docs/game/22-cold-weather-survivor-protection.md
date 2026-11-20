# 22. Cold weather, survivor protection and efficiency (DESIGN, 2026-11-20: NOT implemented)

> Status: an owner decision plus a proposal. **[decided]** = stated by the owner; **[proposed]** = recommendation to confirm; **[open]** = needs an answer before it is built. Every number is a PLACEHOLDER to tune. Nothing here changes the simulation until its phase is built.
> Builds on the weather calendar ([15](15-realtime-simulation-and-tasks.md) O6), farming hazards ([16](16-farming-cooking-power-design.md)) and the capability modifiers (`src/modules/capability/index.js`).

## 1. What exists today (verified in the code)

- The `cold` weather (a "cold snap", `hazard: 'cold'`) and the winter season exist in `definitions/data/environment.js`.
- Its only effects: unsheltered crops lose a share (wheat 50 %, carrot 25 %), wells recharge slower (80 %), solar gives 90 %.
- **Survivors are not affected by cold at all yet.** There is no cold condition, no clothing and no efficiency change.

## 2. What the owner decided

1. **[decided]** Survivors need a **winter outfit or equipment** to avoid freezing in the cold.
2. **[decided]** Cold weather **reduces survivor efficiency**.
3. **[decided]** The default tree family on the map is **green**.

## 3. Proposed rules

- **[proposed]** A new survivor condition **chilled**: a survivor who works **outdoors** during `cold` weather (and, in winter, at night) without protection becomes chilled. Chilled applies a slower work duration and a lower output through the existing capability modifiers (placeholder: x1.3 duration, x0.8 output).
- **[proposed]** Staying chilled for a long time adds a **freezing** condition: health loss per hour until the survivor warms up (placeholder: 1 HP per 10 ticks) and a stop reason `COLD` for standing actions, so learner code can react.
- **[proposed]** Protection comes from equipment: a **winter coat** (body slot) removes chilled; **gloves** and a **scarf** are optional extras that each give back part of the efficiency (a later step). Coats are crafted at the workshop (hide and rags) or found while scavenging.
- **[proposed]** Warming up: resting inside the HQ, tent or kitchen removes chilled over time. A heater or campfire building is an option for later.
- **[proposed]** Learner API: `world.weatherInfo.hazard` already says `cold`; add `survivor.conditions` containing `chilled` / `freezing` and `survivor.equipment.body`, so the lesson is "check the forecast, craft coats before the snap, send protected survivors outside".
- **[proposed]** Sheltered work (greenhouse, kitchen, workshop interior) is never chilled, matching how greenhouses already block crop hazards.

## 4. Art this needs

- **Winter outfit for every survivor** (required, not optional): the same sheets with a coat, scarf and hat. File pattern `npc_<name>_winter_<action>.png`. The asset resolver already supports a variant name, so the game shows the winter sheet when the survivor wears the coat.
- Item icon `item_winter_coat.png` (and `item_gloves.png`, `item_scarf.png` if added).
- Status icons `ui_status_chilled.png` and `ui_status_freezing.png`, breath puff effect `fx_breath_puff.png`, frost border `fx_frost_vignette.png`, snow ground, trees and rocks (see the asset checklist).

## 5. Open questions

1. **[open]** Does cold affect everyone outdoors, or only during `cold` weather and winter nights?
2. **[open]** Can a survivor without a coat still work, just slower (proposed), or refuse outdoor tasks?
3. **[open]** Is a coat one-time equipment, or does it wear out and need repair?
4. **[open]** Do survivors start with coats, or must the player craft the first ones?

## 6. Proposed phase

**WT1 (proposed):** definitions (`winter_coat`, `chilled`, `freezing`), condition derivation, capability modifier, stop reason, learner API fields, tests. Presentation (winter sheets, icons) follows when the art exists.
