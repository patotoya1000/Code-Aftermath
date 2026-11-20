# 21. The Outpost Wall, the Town Behind It, Events and the Economy (DESIGN — updated 2026-11-20: **W1 the zone bar, W2 the line wall, W3 scavenging, W4 recruiting and W5 the train are ALL IMPLEMENTED**)

> Status: a direction the owner described and a plan built on it. Items marked **[decided]** were stated by the owner; **[proposed]** are recommendations to confirm; **[open]** need an answer before the phase that uses them.
> Builds on [20](20-zombies-waves-loot-design.md) (waves, sorties, towers) and [19](19-codebook-and-ui-display.md) / [HUD.md](../HUD.md) (screen layout).
> Every number is a PLACEHOLDER to tune. Nothing here changes the simulation until its phase is built.

## 1. What the owner decided

1. **[decided]** The wall is **one line**, not a four-sided fence. Zombies are on the **right** (east) side.
2. **[decided]** An arrow on the right leads to a **map of events** (raid and scavenge).
3. **[decided]** **Behind the wall is the town.** The town only offers **survivors to recruit**, paid for with **in-game resources** (food, raw food and other supplies), priced by the survivor's stats.
5. **[decided]** **Scavenge sites regenerate.**
6. **[decided]** Now and then a **train** from the town arrives at the outpost, offering survivors to recruit or goods such as weapons.
7. **[decided]** **No real money anywhere in the game.** It is an educational game; selling advantage or content to learners is out of scope for good.
4. **[decided]** Backstory: the outpost is a defence wall protecting a town or city. The NPC survivors are tasked to **defend and maintain** it, using **resources found outside**, because resources are **scarce**.

## 2. Backstory (draft text for the intro and lessons)

> The city behind you has no more fuel, no more steel, no more time. You hold the only wall between it and the dead. The wall eats stone and timber every week; the city can send you almost nothing. Whatever keeps the wall standing has to come from the wasteland outside it — and every trip out is a risk. Your survivors do what you command, no more. Write it well.

Why it helps (the design reasons, not just flavour):
- It explains **one front**: the wall closes a gap, so the dead come from one side.
- It makes **scarcity** the core pressure: repairs and ammo cost materials that only exist outside.
- It gives failure a **stake**: if the wall falls, the town falls (town health, section 7).
- It keeps the town **safe and off-map**, so it is a panel/market, not a second playable world.

## 3. Geography: one wide map, three zones

```
  TOWN (panel, behind the wall)      OUTPOST (playable)          WALL LINE        FRONT / WILDS (playable)
  [recruits for hire, train, town health] [HQ, kitchen, workshop...]  | gate, towers |  [road, forest, loot, zombies]
  west  <----------------------------------------------------------------------------------------------> east
```

- **[proposed]** Keep ONE deterministic simulation grid. Zones are regions of the same grid plus presentation, not separate maps. (Several maps would multiply state, saves, replays and the learner API.)
- **[proposed]** The town is **not a tile area to walk around** in v1. It is a UI panel fed by simulation data (recruit offers, train, town health).
- **[proposed]** The "events map" on the right is first an **event board** (list + a map view of sites), not a second playable map. Expeditions (section 6) are timed actions; the map view only visualises them.

## 4. The core loop

```
 scavenge outside (risk, sites regrow)  ->  repair/upgrade wall + towers  ->  survive the dusk wave
        ^                                                                          |
        |                                                                          v
  recruit survivors / train goods  <-  spend resources (food etc.)  <-  keep the stock the town can be paid with
```

- Raids are **defence** (stay inside, protect or attack from the wall).
- Scavenging is **offence/logistics** (leave through the gate, come back before dusk).
- **[proposed]** Never build both rule sets in the same phase (see 11).

## 5. The wall as a line

What changes (this is an **engine and scenario** change, not only drawing):
- Today the fence is a rectangle in scenario data (`bounds` x6–16, y3–12 on a 24×16 map). Zombie pathing, the "inside the wall" rule, renderer wall pieces, towers on the fence line and many tests assume it.
- **[proposed]** Add a scenario wall shape: `perimeter` (today, unchanged — keeps existing tests valid) and `line`. A `line` wall runs the full height of the map at a chosen x, with a gate in it. The map's north and south edges are closed by terrain (cliffs, water, ruins) so there is no way around.
- **[proposed]** "Inside the wall" means "west of the line" in a `line` scenario. Learner code that already uses `inside` checks should work unchanged.
- **[proposed]** In a `line` scenario the wave spawn edge is fixed to the east. Today the spawn edge is chosen from the seed and day; keep that for `perimeter`.
- **[proposed]** Towers and segment hit points stay per wall segment, so the boomer radius, thrower and tank rules from [20](20-zombies-waves-loot-design.md) keep working.
- Trade-off to accept: **less variety** (no flanking, no surprise side). Compensate with wave composition and noise rather than directions.

## 6. Events: raids and scavenging

- **[proposed]** Events are a pure function of (seed, day), like waves today. No stored randomness.
- **Raid** = the dusk wave (already built). Gets a warning two days ahead (already built). The event board shows it.
- **Scavenge** = an expedition to a **site** on the right-hand map.
  - Site data: `id`, distance (ticks away), danger, yield table, `expiresDay`.
  - Learner action (placeholder name): `survivor.scavenge(siteId)`. The survivor leaves through the gate, is away for a number of ticks, and returns with loot or does not return.
  - The learner decides who goes, when, and with what ammo. The rule from [20](20-zombies-waves-loot-design.md) stands: survivors outside during a wave are the first victims; nothing recalls them automatically.
  - **[proposed]** v1 resolves an expedition from rules (no walking the survivor tile by tile on a second map). Walking it for real can come later if it proves fun.
- **[decided]** Sites **regenerate**. Scarcity must then come from elsewhere: **[proposed]** a looted site yields little until it has recovered (a regrow timer, per site), and the nearest sites recover fastest but are the most dangerous on dusk days. The learner decides how often to go back.

## 7. The town (recruit-only)

- **[decided]** The town offers **survivors to recruit**. It sells nothing else at its gate. Payment is **resources**: food, raw food and other supplies.
- **[proposed]** Price depends on the survivor's **stats** (skills, health, endurance) and on what they need. A strong, hungry survivor costs more food than a weak one. The price is shown before hiring and is deterministic from the survivor's data.
- **[proposed]** Offers are a pure function of (seed, day), like waves. The learner reads them (`town.offers()` — placeholder) and hires with a command (`town.recruit(offerId)` — placeholder), paying from base stock. A failed hire gives a clear error (not enough food, no free bed).
- **[decided]** **The train.** Occasionally a train arrives from the town and stays a short time. It brings extra recruits and/or goods such as weapons. **[proposed]** The train is announced a day ahead in the event board; goods on it are paid with resources too, and what it carries is limited and different each visit. Miss it and the offer leaves.
- **[proposed]** Why this suits an educational game: recruiting is a decision the learner programs (compare cost with benefit, check stock, handle failure), and it uses the same scarcity loop as everything else.
- **[proposed]** The town has a **health** meter shown in the HUD: if the wall falls, it drops. This is the campaign score; there are no quotas or credits in this version.
- **[open]** Does the town ever send help (a patrol, a guard)? Recommended: no, so the learner's code is what matters.

## 8. No real money (decided)

The game never involves real money: no purchases, no store, no premium tier, no payment code. Everything in the town is paid for with in-game resources.

## 9. Learner API sketch (placeholders — names to be decided in each phase)

- `events.board()` — read-only list of raids and scavenge sites.
- `survivor.scavenge(siteId)` — start an expedition.
- `town.offers()` — read-only list of survivors for hire (and train goods when a train is in).
- `town.recruit(offerId)` — hire a survivor, paying resources from base stock. Fails with a clear error if stock is short.
- `town.train()` — read-only: when the next train arrives and what it carries.
- Principle kept from [20](20-zombies-waves-loot-design.md): **no combat or trade hidden inside existing actions**; each is its own command with its own error messages.

## 10. HUD navigation (presentation only, can be built before the engine work)

- A bar: **TOWN ◂ OUTPOST ▸ FRONT**. It pans the camera across labeled zones of the current map; no engine change.
- The **TOWN** view is a collapsible panel with "coming soon" placeholders (recruits for hire, next train, town health).
- The right arrow opens an **Events** card: raid warning, scavenge sites (empty until phase W3).
- Every new card is a `.hud-card` with a fold button, like the rest of the screen ([HUD.md](../HUD.md)).
- Like every UI button, a recruit button would only insert code into the editor; it never changes the running simulation.

## 11. Build phases

| Phase | What | Exit check |
|---|---|---|
| **W0** | This document, reviewed | Owner confirms the [proposed]/[open] items |
| **W1** (DONE 2026-11-20) | HUD navigation bar + Events card + Town panel placeholders (visual only) | Camera pans between zones; cards fold; all current tests pass. Built as `#zone-bar` + `src/app/ui/zones.js`; the Town panel (W4) and the Expeditions panel (W3, the Events card) were built first and the bar opens them. The town health meter is not built |
| **W2** (DONE 2026-11-20) | `line` wall scenario (engine + scenario data), `perimeter` kept | New scenario test: spawn east, "inside" = west, no path around; old scenario tests untouched. Built as `bounds.shape: 'line'` + kernel helpers in `src/kernel/grid.js`, scenario `stage1_line`, `tests/wall-line.test.js`; the full-height rule replaces the "closed by terrain" idea (no terrain needed) |
| **W3** (DONE 2026-11-20) | Event board + scavenge expeditions (rule-resolved), raids unchanged | Deterministic per seed; a survivor outside during a wave is lost first. Built as `src/modules/scavenge/`, `data/scavenge.js`, `tests/scavenge.test.js`; `events.board()` became the read `board`, `survivor.scavenge(siteId)` as designed; site `expiresDay` was dropped because sites regenerate. Open question 1 answered with the placeholder regrow days per site |
| **W4** (DONE 2026-11-20) | Town recruit offers priced by stats, `town.recruit` | Hiring costs resources only; deterministic per seed; save/replay round-trips. Built as `src/modules/town/`, `data/town.js`, `tests/town.test.js`; reads are properties (`town.offers`, `town.freeBeds`), not functions. Open question 3 answered with the placeholder in `data/town.js` `pricing` (needs are not priced); beds: working hq 2 + tent 2 |
| **W5** (DONE 2026-11-20) | The train: scheduled visits with recruits and goods (weapons) | Train is a pure function of (seed, visit); goods are limited per visit. Built in `src/modules/town/`, `data/town.js` `train`, `tests/train.test.js`. Open question 4 answered with the placeholder: every 5-7 days, stays one day, announced a day ahead |

Rule: **never combine W2 and W3** (a new wall shape and a new expedition system in one phase).

## 12. Risks

- **Two modes in one game** (defence and expeditions). Mitigation: build them in separate phases and teach them in separate lessons.
- **Town economy becomes a second game.** Mitigation: ask of every town feature "what code concept does the learner practise?" If none, cut it.
- **Recruiting makes the game too easy** (more survivors, more output). Mitigation: price by stats, cap beds and food upkeep, limit offers per day.
- **Wall change breaks tests.** Mitigation: scenario-data switch, `perimeter` untouched.

## 13. Forbidden (decided or proposed)

- **Any real-money purchase, payment code or network code** (decided).
- A second playable map before expeditions are proven in W3.
- Auto-recalling survivors or auto-hiring/auto-delivering.
- Town items that bypass scarcity (free survivors or goods with no resource cost).

## 14. Open questions

1. How fast should a looted site recover (a regrow timer per site)? Needs tuning in W3.
2. Does the town ever send help? (recommended: no)
3. Recruit pricing: which stats count and how steep? (placeholder: sum of skill levels in food units)
4. How often does the train come and how long does it stay? (placeholder: every 5–7 days, stays one day)
