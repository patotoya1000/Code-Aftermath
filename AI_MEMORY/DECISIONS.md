# Decisions (ADR log)

Each record: Decision · Reason · Consequence · Forbidden Alternative · Status. History of *when* things changed lives in `AI_MEMORY/CHANGELOG.md`; rules in `AI_MEMORY/RULES.md`.

## ADR-001 — Real-time simulation
- **Decision:** The world ticks continuously. A clock driver turns frame time into `sim.step(n)`; survivors keep working on standing actions until they stop by themselves. 3 ticks/s at 1×, speeds 1×/2×/4×, starts paused.
- **Reason:** Survivors should behave like people in a living world; "turns" taught sequencing but not reacting.
- **Consequence:** `sim.runUntil` / `isIdle` exist for tests and finite lesson runs only. Strategy points (start 10, max 10, +1 per 20 ticks, 1 per command) replace the per-turn budget.
- **Forbidden Alternative:** `startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, three-command-per-turn caps, turn-based execution as the main model.
- **Status:** ACCEPTED, implemented (R1, 2026-11-12). Guard: `tests/invariants.test.js`, `tests/stabilization.test.js`.

## ADR-002 — The simulation owns authoritative gameplay state
- **Decision:** GameState lives in the `createSimulation` closure; only the simulation mutates it. Outsiders get commands in, ticks in, frozen projections/snapshots out.
- **Reason:** One writer makes replay, hashing, save/load and bug-tracing possible.
- **Consequence:** No module exports the state object. Handlers mutate state only inside a tick via the context the simulation passes.
- **Forbidden Alternative:** UI, renderer, lessons, sandbox or persistence writing to state; exporting the state object.
- **Status:** ACCEPTED, implemented.

## ADR-003 — Renderer is read-only
- **Decision:** The renderer consumes the render projection (frozen plain data) and cannot import `simulation`/`actions`. Animation timing, selection, smoothing live in the renderer and never feed back. Animation never decides completion.
- **Reason:** Presentation must be replaceable (final art, other UIs) without touching rules.
- **Consequence:** Anything the renderer needs must be added to `renderProjection` first.
- **Forbidden Alternative:** Renderer reading GameState, deciding task completion from animation, or mutating anything.
- **Status:** ACCEPTED, implemented, enforced by `tests/architecture.test.js`.

## ADR-004 — Learner code requests actions; it never changes state
- **Decision:** Learner code runs once in a Worker with frozen reads and can only call `survivor.xxx()` commands, which become validated Commands.
- **Reason:** Safety, determinism and teaching: intent vs. effect.
- **Consequence:** Reactions to the future go through policies (data-driven rules) and hooks (handler source re-run in the sandbox on events), never through waiting (`async`/`await` forbidden).
- **Forbidden Alternative:** Giving learner code live state, setters, `await sim`, or commands such as `setHealth`.
- **Status:** ACCEPTED, implemented.

## ADR-005 — Standing tasks execute across multiple ticks
- **Decision:** An action can be a standing job (gather): batches repeat until `TARGET_REACHED`, `STORAGE_FULL`, `NO_TARGET` or `EXHAUSTED`. Lifecycle stays `QUEUED → VALIDATING → RESERVED → EXECUTING → COMPLETED` (`FAILED`/`CANCELLED` from any live state). First command of a program replaces; later ones queue; `survivor.queue()` appends.
- **Reason:** "Keep gathering until the job is over", like real work.
- **Consequence:** Each batch reserves node units and storage room, so two gatherers never double-spend or overfill. Modifiers are re-read per batch.
- **Forbidden Alternative:** Turn-based task semantics; one-shot gather that needs re-issuing every turn.
- **Status:** ACCEPTED, implemented (R2).

## ADR-006 — Semantic asset ids and an asset resolver
- **Decision:** Gameplay and projection name assets by semantic key (`npc_survivor_walk_down_right`, `building_fence_lv1_ruined`, `node_tree_available`); the `assets` module resolves a key to an atlas frame with a fallback chain. Real art swaps in through the manifest.
- **Reason:** Art can change without touching gameplay; missing frames must degrade gracefully.
- **Consequence:** Today's keys use underscores. The master prompt prefers dotted ids (`npc.survivor.default`, `building.hq.level1`, `resource.wood.node`, `item.axe.basic`). That migration is **PLANNED, not done**; do not force it until the resolver and manifest loader are ready.
- **Forbidden Alternative:** Hard-coded image filenames in gameplay, projection, definitions or UI logic.
- **Status:** ACCEPTED (underscore keys implemented; dotted ids planned).

## ADR-007 — AI_MEMORY is navigation, not duplicated source
- **Decision:** `AI_MEMORY/` routes and records decisions/status; code stays authoritative. One authoritative location per fact; link instead of copying.
- **Reason:** Let humans and AI agents find the right files without rescanning the repo, without a second source of truth.
- **Consequence:** If memory and code disagree: inspect code, find the conflict, update memory to the verified implementation. `tests/invariants.test.js` checks that referenced paths exist.
- **Forbidden Alternative:** Pasting source into memory files; trusting memory over code; documenting planned systems as implemented.
- **Status:** ACCEPTED (2026-11-15).

## ADR-008 — Modular monolith with a declared dependency manifest
- **Decision:** One deployable app (static ES modules, no build step), split into modules whose allowed imports are listed in `src/architecture.js` and tested.
- **Reason:** Visible, reviewable boundaries; a new dependency is a one-line diff.
- **Consequence:** Cross-module imports go through `index.js` only; the composition root `src/app/index.js` wires modules.
- **Forbidden Alternative:** Deep imports into another module's files; cycles; the kernel importing modules.
- **Status:** ACCEPTED, enforced.

## ADR-009 — Resource ledger with reserve → commit/release
- **Decision:** Every spendable quantity is a ledger account; actions reserve, then commit on success or release on failure/cancel.
- **Reason:** No double-spend, clean cancellation, checkable invariant (`ledgerViolations`).
- **Forbidden Alternative:** Direct arithmetic on quantities outside the ledger.
- **Status:** ACCEPTED, implemented.

## ADR-010 — Needs policies interrupt then resume (R4a)
- **Decision:** `survivor.policy("eat"|"drink"|"rest", …)` is a data-driven standing rule. When it fires, the current job is cancelled with reason `INTERRUPTED`, the policy action is queued at the front and an equivalent continuation behind it. All three are ordinary actions.
- **Reason:** Teach reaction (conditions) before economy depth; replay/save/soak cover it for free.
- **Forbidden Alternative:** Policies that edit needs directly or hide work outside the action lifecycle.
- **Status:** ACCEPTED, implemented (2026-11-14).

## ADR-011 — Learner event hooks store source text, run in the session (R4b)
- **Decision:** `survivor.on(event, fn)` registers the function source as a command (stored in `state.hooks`). The session's hook runner reacts to events, runs the handler in the sandbox with a fresh frozen view and submits the resulting commands through the normal path.
- **Reason:** The simulation must never run learner code; replay must need no handler code.
- **Consequence:** Hooks are free-play only (lessons reject them); a failing/slow handler is switched off and reported as `hook.failed`; cooldown 10 ticks, max 4 hooks per survivor, 5 commands per run.
- **Forbidden Alternative:** Running handlers inside the tick; letting hooks nest (`survivor.on` inside a hook).
- **Status:** ACCEPTED, implemented (2026-11-14).

## ADR-012 — A free-play save is a session record
- **Decision:** Save `{scenarioId, seed, tick, timeline, stateHash}`; load replays it and refuses a changed `SIM_VERSION` or hash.
- **Reason:** Proves the loaded world equals the saved one; no drift from a second state format.
- **Consequence:** Behaviour changes must bump `SIM_VERSION`; old saves are refused clearly (no migration yet).
- **Forbidden Alternative:** Raw state dumps for free play; silently loading mismatched saves.
- **Status:** ACCEPTED, implemented (S0–S5).

## ADR-013 — Roadmap order: R4 (react) before R3 (carry)
- **Decision:** Needs policies and event hooks came before carry + deposit.
- **Reason:** The learner must be able to *react* before the economy gets deeper (`docs/IMPLEMENTATION_PLAN_2026-11-13.md`).
- **Status:** ACCEPTED; R4a, R4b and R3 done. **Next: R5.**

## ADR-014 — Carry as hands + pooled storage (R3)
- **Decision:** Gathered units move node → survivor's `inventory.items` → base stock. Capacity is derived from data (`defs.carry`), never stored. Storage capacity is POOLED over every building that is not ruined; survivors unload at the nearest working building that accepts the item. Room for a trip (pooled capacity − stock − all carried − batches in flight) is checked BEFORE the units are picked up, so unloading cannot overfill.
- **Reason:** Conservation (a unit is in exactly one place) and the "check capacity at reserve time" rule; a repaired storehouse gives repair a visible economic effect and shortens trips.
- **Forbidden Alternative:** crediting stock directly from the node; per-building stock accounts (would need transfers); a carry total stored on the survivor.
- **Consequence:** `gather` trips are longer (walking home), lesson/time budgets were verified; `total` counts units that reached storage. Behaviour change ⇒ `SIM_VERSION` 0.5.0.
- **Status:** ACCEPTED, implemented.

## ADR-015 — Water: a refilling reservoir, not a counter (O7)
- **Decision:** A deep well is a building whose reservoir is a ledger account. The aquifer refills it with time (data per level, scaled by the public weather calendar); survivors draw with `gather("water")` and wait when it is empty; a level-2 siphon moves water to base stock automatically, but only while a WORKING water store stands within `reach` of the well. The machine tier is a powered pump, deferred to the power phase.
- **Reason:** Water straight into stock would remove the programming task and the survival pressure. A reservoir keeps hauling a loop to write, makes over-drawing meaningful, gives the forecast a use, and the siphon turns repeated manual code into structure-dependent automation.
- **Consequence:** Wells never refill randomly (integer accumulator, replay-safe). Gather draw points are nodes AND working source buildings. Conservation: nothing is created except aquifer recharge.
- **Forbidden Alternative:** crediting base stock directly from a timer; a siphon that ignores the building structure; floating-point recharge; learner-visible randomness.
- **Status:** ACCEPTED, implemented (`SIM_VERSION` 0.10.0).

## ADR-016 — One recipe engine for cooking and crafting (O8)
- **Decision:** A recipe is data (`definitions/data/recipes.js`): station building type, minimum station level, inputs (including fuel), outputs, ticks, skill. `cook` is a standing action made of batches. Inputs are reserved per batch and spent only when the batch finishes; outputs go straight into base stock (the station is part of the base). Eating chooses among foods through a data table (`actions.eat.items`, `rank` = default order, lowest first); a named food is hard (`eat("bread")` never falls back), a policy `prefer` is soft.
- **Reason:** Cooking, the workshop and later the MRE must share one mechanism; reservation per batch keeps the ledger exact when a job is cancelled or interrupted by a needs policy. Eating the cheapest food first keeps the good food for when it matters.
- **Consequence:** Station buildings are scenario ruins that must be repaired (no free construction). A kitchen level is added together with the recipes that need it. Output room is checked twice (before the batch and before inputs are spent) because two cooks could both pass the first check. Behaviour change ⇒ `SIM_VERSION` 0.11.0.
- **Forbidden Alternative:** cooking inside the survivor's hands/queue without a building; consuming inputs at the start of a batch; hard-coded recipe numbers in the handler; `eat()` silently substituting a different food when a named one is missing.
- **Status:** ACCEPTED, implemented.

## ADR-017 — Spoilage as age batches beside the ledger (O9)
- **Decision:** The ledger keeps owning quantities. Perishables additionally have batches `{ qty, age }` (integer age points, 100 per day); `syncStock` reconciles them after every change so ages stay exact (surplus = fresh, deficit = oldest). Ageing runs once per calendar day. Cold storage protects its `capacity` OLDEST units (shared over all perishables), which age ⌊100/factor⌋ instead of 100. Spoiled units leave via `discard`, the only ledger sink; units reserved by an action in progress cannot be discarded and spoil the next day.
- **Reason:** Keeps one source of truth for amounts (reservation, capacity and conservation code untouched) while adding time pressure; oldest-first protection is a rule a learner can reason about and automate.
- **Consequence:** Stock changed outside the game rules counts as fresh. Freezer (power) tier = another `cold` level later. Behaviour change ⇒ `SIM_VERSION` 0.12.0.
- **Forbidden Alternative:** random spoilage; per-unit timers; spoiling inside the ledger; ageing every tick.
- **Status:** ACCEPTED, implemented.

## Battery bank: discharge before fuel, charge only from surplus (O14, 2026-11-17)
- **Decision:** A battery is a third kind of power level (`store`), alongside producers and consumers. Per tick: solar, then batteries cover the remaining demand (up to `rate`, limited by charge), then generators burn fuel only for what is still missing; after every consumer and powered job is served, surplus GENERATION charges the batteries that did not discharge this tick. A ruin keeps its charge but is inert. Integers only, no losses.
- **Reason:** Makes solar usable at night and saves fuel, without any new action; "never burn fuel to charge" keeps the generator demand-driven (O11 decision).
- **Consequence:** A battery that discharges in a tick is not charged in that tick, so a generator's spare output that tick is lost. No efficiency loss, no manual switch. Behaviour change => `SIM_VERSION` 0.18.0.
- **Forbidden Alternative:** generators burning fuel to charge; random charge loss; a battery that powers things while ruined.
- **Status:** ACCEPTED, implemented.

## Hydroponics is the third field level and a continuous consumer (O13, 2026-11-17)
- **Decision:** The hydroponic farm is level 3 of the same `field` building (upgrade needs 12 glass from the workshop). Its level has `power.use` (5), so it is a normal grid consumer like the freezer, and `tickFarms` skips growth on ticks it is not powered. `farm.indoor` stops rain watering it (hazards are already blocked by `shelter`). Water stays hand-delivered.
- **Reason:** Reuses the O11 consumer path (one grid, no special case); holding crops when unpowered teaches power planning without punishing with lost food.
- **Consequence:** It burns fuel all the time while repaired, so solar or a fuel stock is a real choice. Nutrients (fertilizer) and a battery are not built. Behaviour change => `SIM_VERSION` 0.17.0.
- **Forbidden Alternative:** crops dying when power drops; a farm that draws power only while someone works it; a second building for the hydroponic tier.
- **Status:** ACCEPTED, implemented.

## Crafting reuses the cook engine; machines draw power while they work (O12, 2026-11-17)
- **Decision:** `craft` is a second action definition on the SAME `cook` handler. A recipe names the command that makes it (`action: 'cook' | 'craft'`); the handler reads `defs.actions[a.actionType]` for range/skill/limits, awards XP by action type and refuses a recipe from the wrong command (`INVALID_PARAMS`). An action may declare its own `skill` (capability uses it before the handler map). A recipe may declare `power`: while a survivor works a batch of it at a working station, the power module counts that as consumer demand (after building consumers, in action-id order) and sets `action.powered`; unpowered, she waits and after `powerWaitTicks` the job ends with `NO_POWER`. Kitchen gets levels 2-3 and the MRE seal and the glass furnace are the first powered recipes. Hot meal uses potato + carrot (a stew from the farm's vegetables; the design's "wheat or bread" alternative needs recipe alternatives, not built).
- **Reason:** One batch engine keeps ledger conservation, interruption/resume, reservations and stop reasons in one place; a per-recipe `power` avoids a kitchen that burns fuel all day (a building-level consumer would demand power when idle).
- **Consequence:** Preserved ration (needs salt), fuel and fertilizer recipes are not built. Glass exists for the hydroponic level (next). Behaviour change ⇒ `SIM_VERSION` 0.16.0.
- **Forbidden Alternative:** a separate craft handler duplicating cook; a kitchen/workshop that draws power while idle; MRE or glass that ignore the grid.
- **Status:** ACCEPTED, implemented.

## Power: producers and a freezer on one grid (O11, 2026-11-17)
- **Decision:** Power is one integer budget per tick. Producers: a fuelled generator (burns 1 wood per `every` ticks, only on ticks when the grid still needs power) and a solar panel (output x weather `solar` %, 0 at night). Consumers (the level-3 freezer storehouse) are served in id order, all-or-nothing; an unpowered freezer protects nothing. Fuel leaves base stock through `ledger.discard`. The design's "upgrade branch" (generator → advanced generator OR solar) is built as TWO separate buildings in the scenario (`generator_1` with level 2 = advanced, and `solar_1`): the player repairs/upgrades what they want, so the O5 upgrade table stays linear.
- **Reason:** Demand-driven burning makes solar-first a real planning choice without a second action type; separate buildings avoid extending `upgrade` with branches before there is a lesson that needs it; all-or-nothing keeps a learner's mental model simple ("is it powered?").
- **Consequence:** No battery (surplus is lost), so night and storms matter. Fuel is wood for now (competes with building materials); workshop fuel comes with crafting. Hydroponics and a powered pump are the next consumers. Behaviour change ⇒ `SIM_VERSION` 0.15.0.
- **Forbidden Alternative:** random outages; per-unit power accounting in the ledger; a generator that burns fuel when nothing needs it; a freezer that silently falls back to the cellar rate.
- **Status:** ACCEPTED, implemented.

## Fertilizer is opt-in, charcoal is automatic (O15, 2026-11-17)

Fertilizer is only spread when the learner passes `{ fertilize: true }` to `survivor.farm`, so stock is never spent silently and the choice stays in the learner's code. Running out of fertilizer never stops the farming (it only improves a harvest). Generators prefer `fuel.better` (charcoal) over wood automatically, because it needs no decision and existing wood-only behaviour is unchanged when there is no charcoal.

## The pump draws power all the time (O16, 2026-11-18)

The Pump House is a plain grid consumer (`power.use`), like the freezer, instead of a demand-based draw. This reuses the existing all-or-nothing grid with no new rules; a demand-based pump is a later refinement. Its siphon status reports `NO_POWER` so learners can see why water stopped.

## Nutrients are required, not a bonus (O17, 2026-11-18)

The design says the hydroponic tier "stops without nutrients", so a starved plot holds like an unpowered one. This makes the workshop -> fertilizer -> nutrients chain necessary for level 3, and the existing hydroponic tests were updated to supply nutrients.

## Events are a public pure schedule, not a random roll (O18, 2026-11-18)

Whether a day has an event, which one, and its roll are hashes of (seed, day): no RNG state is saved, replays cannot diverge, and the schedule is readable `warnDays` ahead so learners can prepare (a lesson in planning, like the weather calendar). Effects use the ledger and building health only. The shared test world runs with `chancePercent: 0` so older exact-stock tests stay valid; `tests/events.test.js` uses its own world with events on. Combat/zombie raids are NOT events yet.

## Raids are abstract until the enemy design is decided (O19, 2026-11-18)

The enemy taxonomy, sprites and animation list are still OPEN in docs/game/14, so this phase adds only what is safe: stat blocks marked provisional, a public pure schedule (same idea as risk events) and a dusk resolution against the fence defence. The point for learners is planning (read `threats.upcoming`, repair/upgrade the fence), not fighting. No zombie entity, movement, combat or survivor damage exists; the render projection's `zombies` stays empty. The shared test world runs with raids OFF so older tests stay valid.

## Zombie, wave, weapon and tower design is decided on paper (2026-11-18)

Seven zombie types (common, runner, boomer with radius explosion, thrower, screamer, tank, fixed-milestone boss), learner-enforced "inside the wall" during waves, a gate that closes during a wave, loot collected by sortie, equipment-driven combat (knife/spear -> advanced spear -> bow -> crossbow -> rifle with ammo items) and towers on the fence line that add range to ranged weapons. Full detail and placeholders in `docs/game/20-zombies-waves-loot-design.md`. Nothing is implemented; build order is movement before combat, special types last. Forbidden: auto-recalling survivors, combat hidden inside existing actions, towers that grant range to melee weapons.

Addendum (2026-11-18, second round): rifle is loud (noise is a real mechanic), ammo is carried by the survivor, and towers can host mounted weapons up to a minigun that needs grid power. Mounted weapons use a hopper that survivors stock. See `docs/game/20-zombies-waves-loot-design.md` sections 12-14.

## Z2: waves are entities; wall armor stands in for defence until combat exists (2026-11-18)

A raid is a wave of zombie entities (spawn at dusk on one edge, walk with the same A* as survivors, retreat at dawn) instead of an abstract dusk comparison. Because nobody can kill a zombie before Z3, a wall's strength is expressed as flat ARMOR per level (`wallArmorPerLevel`): damage dealt is `zombie damage - armor`, so upgrading the fence is the way to survive early waves, mirroring the zombie-armor / weapon-pierce rule. The outcome is real: a wall at 0 health = breached = looting at dawn. The gate closes for BOTH sides during a wave (a survivor left outside is stranded and chased; "inside the wall" stays the learner's job, no auto-recall). The old `defense` number stays as an informational rating. Forbidden: restoring the abstract `raidDusk`, auto-recalling survivors, letting zombies pass a standing gate, damaging survivors before Z3.

## W4: the town only sells survivors, and only for supplies (2026-11-20)

Recruiting follows docs/game/21 sections 7-8 and 14. Decisions made while building it (all placeholders to tune in a playtest):
- **Offers are a pure function of (seed, day)** (no stored randomness); the only state is `state.town.hired` (so a candidate cannot be hired twice) and a short history. A board lasts `rotateDays` (2) days; whoever is not hired leaves.
- **Price = the candidate's worth in trade points** (24 + 6 per skill level + 3 per attribute point above 5 + 10 per trait, floor 20), shown in every accepted item (`payWith`, whole units rounded up). Pricing by NEEDS is left out (open question 3 in doc 21).
- **No money anywhere**: `payWith` is validated to contain only real items. A refused hire spends nothing.
- **API shape**: `town` is a global in learner code (read: offers, beds, prices; command: `town.recruit`). It is a normal API command with `global: true`, so it goes through the same validation, strategy points, timeline and replay; it is absent from `survivor.*`. Reads are properties (`town.offers`), like `events.upcoming`, not functions as the doc 21 sketch had them.
- **Housing**: a hire needs a free bed; working hq and tent give 2 each (so the starting camp holds 4). Upkeep is simply the new survivor's own hunger and thirst.
- The train (W5), town health, scavenging (W3) and the line wall (W2) are NOT part of this step.

