# Real-Time Simulation and Standing Actions

> Added 2026-11-12 (phases R1 + R2). This supersedes the "Command Console Mode" turn rules from correction phase C2.
> Part of the CODE: AFTERMATH design set — see [README](README.md).

## Why
Survivors should behave like people in a living world: tell Mara to `gather("wood", 20)` and she keeps working until
the job is really over, not until a "turn" ends. The world keeps moving whether or not the learner is typing.

## What did NOT change
- Learner code only *expresses intent*; the simulation is the only writer of GameState.
- The two-clock rule: learner code runs once in the Worker (Clock A) and never waits for the world; the simulation ticks (Clock B).
- Action lifecycle `QUEUED → VALIDATING → RESERVED → EXECUTING → COMPLETED` (or `FAILED`/`CANCELLED`), resource reservation → commit/release, deterministic replay, rendering downstream of state.

## R1 — Continuous clock
- **No turns.** `executeTurn`, `startTurn`, `getTurnInfo`, the 3-commands-per-turn cap and NEXT TURN are gone.
- **The simulation only counts ticks.** A *clock driver* (`simulation/clock.js`) converts wall-clock time into `sim.step(n)`.
  It owns play / pause / speed and frame pacing, and nothing else. All numbers live in `definitions/data/actions.js → clock`:
  `ticksPerSecond: 3`, `speeds: [1, 2, 4]`, `maxTicksPerFrame: 30`.
- **Starts paused.** Running code from the editor resumes the clock (PAUSE is one click away; Space toggles it).
- **Strategy points** replace the per-turn budget: each command costs 1, start 10, max 10, +1 every `regenEvery` (20) ticks.
- **Determinism at any speed.** Same seed + same commands issued at the same ticks ⇒ same state hash, whether the world is stepped one tick at a time or in bursts. `sim.commandTimeline()` records `(tick, command)` for free play and `replayTimeline()` rebuilds the session from it.
- **`sim.runUntil(predicate, maxTicks)`** replaces "run until idle" for open-ended work (lessons still use idle, because their code gives finite jobs).
- Renderer: optional presentation-only smoothing (`mountRenderer(..., { smoothing: true })`) glides survivors between tiles. Off by default; never feeds back into gameplay.

## R2 — Standing actions
A *standing action* is one action that keeps working until a stop reason fires. `gather` is the first one. It reuses the existing queue, lifecycle, reservations and cancellation, so nothing about the engine's guarantees changed.

```
survivor.gather(resource, load = 5, total)
```
- `load` (1–20): units per trip. `total` (1–500, optional): stop after this many.
- Loop: pick the nearest node that can fill the trip (else the nearest with anything left) → walk → work one batch → credit base stock → repeat.
- Each batch reserves its units from the node **and** room in storage, counting what other gatherers already have in flight, so two survivors can never take the same wood or overfill the HQ.

### Stop reasons (`StopReason` in `actions/lifecycle.js`)
| Reason | Meaning |
|---|---|
| `TARGET_REACHED` | the requested `total` was gathered |
| `STORAGE_FULL` | base storage has no room for this resource (the last trip is trimmed to fit exactly) |
| `NO_TARGET` | no node of that resource has anything left |
| `EXHAUSTED` | survivor energy fell below `needs.work.minEnergy`; units already chopped in the unfinished trip still count |

- Ended **after doing some work** → the action is `COMPLETED` with `stopReason`; events `task.started`, `resource.gathered` (picked up, per trip), `resource.deposited` (unloaded), `task.stopped { reason, gathered, trips }`.
- Ended **before any work** → `FAILED` with the same reason code (so "no trees at all" is still a failure).
- `stop()` or a replacing command cancels the job: the unfinished trip is released back to the node (not credited); everything already delivered stays.
- Learner-readable result: `survivor.lastTask = { type, status, reason, gathered, tick }` explains why a survivor is idle.

### Replace vs queue
- The **first command a program gives each survivor replaces** what that survivor was doing (cancel reason `REPLACED`); the rest of that program's commands queue behind it, so a program reads top to bottom.
- `survivor.queue()` is a free marker: commands after it are appended to the end of the queue instead.
- An endless job blocks the commands queued behind it until it stops — that is intentional ("gather until done, then eat").

### Survival is manual
Hunger, thirst and energy keep draining while survivors work. Nothing eats or rests automatically: the learner writes that logic (this is the teaching point). An unattended survivor works until `EXHAUSTED`, or starves and is downed. Automatic policies and event hooks (`survivor.on(...)`) are planned for R4.

## Rules clarified in the stabilization pass (2026-11-13)
- **Energy cost of work is cumulative.** 1 energy per `needs.work.energyEvery` work ticks *across all trips of the job* (small trips cannot dodge it).
- **Output modifiers change the trip size, never the ledger.** A skilled/strong survivor carries `floor(load × bonus)` per trip; the node loses exactly what the base receives.
- **Modifiers are re-read every trip** (tired / hungry / thirsty slow work as they happen).
- **`rest` is plain arithmetic:** +`energyPerTick` per tick (rest skill / endurance speed it up; hunger/thirst slow it; tiredness does *not*), capped at 100.
- **Save / load** stores scenario + seed + command timeline + state hash; loading replays and verifies (`SAVE_CORRUPT`, `SAVE_VERSION_MISMATCH`).

## R4a — Needs policies (added 2026-11-14)
`survivor.policy(name, { below, until })` stores a standing rule on the survivor (`eat`→hunger, `drink`→thirst, `rest`→energy; thresholds and retry times are data in `definitions/data/actions.js → policies`). `survivor.clearPolicy(name?)` removes one or all. Both are instant commands (1 strategy point, not part of the replace/queue order) and are recorded in the command timeline, so replay and save/load cover them.

Each tick, after needs decay and before the queue advances, every active survivor's policies are checked:
1. **Fire** when `need < below`, the policy has no action of its own already queued, and the survivor's current job is not already the cure (a manual `rest` is left alone).
2. **Pre-check:** no food/water in stock → nothing is interrupted; `policy.blocked` is emitted once and the policy waits `retryEvery` ticks. A policy action that later FAILS blocks it the same way.
3. **Interrupt → act → resume:** the running job is cancelled with reason `INTERRUPTED` (reservations released, the unfinished trip is not credited, like `stop()`); the policy action is queued at the FRONT; a continuation of the job is queued right behind it. Continuations keep the learner's `total` (already-gathered units count), the remaining ticks of a `rest`, and the cumulative work-tick counter (so interrupting cannot dodge energy cost). `task.resumed` is emitted when it really starts. Jobs queued after the interrupted one keep their order.
Events: `policy.set`, `policy.cleared`, `policy.triggered`, `policy.blocked`, `task.resumed`. Survivor card shows active policies; `survivor.policies` is readable. `SIM_VERSION` is now `0.3.0` (old saves are refused with `SAVE_VERSION_MISMATCH`).
Lesson `m3_e_policy` (scenario `stage1_weary`) is passable with a policy or with a manual rest, and fails if the learner does neither.

## R4b — Learner event hooks (added 2026-11-14)
`survivor.on(event, fn)` registers a hook; `survivor.off(event?)` removes one or all (max 4 per survivor, one per event). Both are instant commands (1 strategy point) stored in `state.hooks` and in the command timeline.
- **Registration sends the function's SOURCE TEXT** (a function cannot cross the Worker boundary). The handler therefore cannot use variables from the code around it; it reads the world through `survivor`, `base`, `nodes` … exactly as top-level code does. Max 600 characters.
- **Running:** the session's `createHookRunner(...).pump()` (called every frame by the UI) reads new events. `hungry`/`thirsty`/`tired` fire when the condition is newly gained; `stopped` fires on `task.stopped` or `action.failed` and passes `{ reason, task }`. The handler runs in a fresh sandbox Worker with a fresh frozen view, may issue at most `limits.maxCommands` (5) commands, and a hook cannot fire again within `limits.cooldownTicks` (10).
- **Commands from a hook** follow the program rule (first task command replaces, the rest queue) and go through `submitCalls`, so they cost points and are recorded in the timeline. **Replay and save/load never run hooks**; they replay the commands the hooks produced. After loading, a new runner takes over from the end of the log.
- **Failure:** an error, timeout or budget overrun emits `hook.failed` and switches that hook off until it is registered again (not persisted across load). `survivor.on` inside a hook is refused (`HOOK_NOT_ALLOWED`).
- **Lessons:** rejected with `HOOKS_FREE_PLAY_ONLY` until R5 puts lessons on the live timeline.
- Events: `hook.set`, `hook.cleared`, `hook.ran`, `hook.failed`. `SIM_VERSION` is `0.5.0` (after R3).

## R3 — Carry and deposit (2026-11-16)
- A survivor has a **carry capacity** in weight units: `(20 + 8 × strength) × trait multipliers` (`strong` ×1.25), from `defs.carry`. A rookie carries 60 weight = 30 wood or 15 stone. `survivor.carry` shows `{ load, capacity }`; `survivor.inventory` shows what she holds.
- A `gather` **trip**: walk to the nearest node → gather up to `load` units (never more than she can carry or than fits in storage) → the units go into her hands (`resource.gathered`) → she walks to the nearest working storage building that accepts them → unloads (`resource.deposited`, `unloadTicks` 2) → next trip. Base stock only grows when she unloads. `total` counts units that reached storage.
- **Storage is pooled:** base stock is one stock per item; its capacity is the sum of the `storage` tables of every building that is not ruined (HQ, tent, and the storehouse once repaired). `base.capacity.wood` shows it. A ruined building contributes nothing and cannot be unloaded at.
- **Room is reserved before pickup:** pooled capacity − stock − everything survivors carry − batches other gatherers have reserved. Storage therefore never overfills, however many survivors work.
- **Interruptions never lose units:** `stop()`, a policy interruption, exhaustion or `replace` leave the load in her hands. `survivor.deposit()` walks it to storage; so does the next `gather`, before its first trip. A policy that interrupts a carrying job resumes it and the load is unloaded on the way.
- `survivor.deposit()` fails with `NOTHING_TO_DEPOSIT` when her hands are empty. New stop reason `NO_DEPOT` (nothing that works accepts what she carries).
- Not in R3: encumbrance (load does not slow her), equipment effects, field eating from her hands, learner-chosen depot, pathing.

## O3 — Walking: collision and pathing (2026-11-16)
- Survivors no longer walk in a straight line through the world. Every walking action (`moveTo`, the walk leg of `gather`, `repair`, `deposit`) follows a **deterministic A\* route** (`src/modules/buildings/pathing.js`, 8 directions, cost 1 per step, no cutting the corner of a blocked tile, ties broken by tile order).
- **Blocked:** a building whose definition does not say `blocks: false` (HQ, tent, storehouse) blocks its tile; a fence blocks every tile of its perimeter. **Open:** the gate tile (`blocks: false`), the interior, and everything outside. Resource nodes do not block.
- The destination tile is always enterable, so `moveTo("hq")` still ends on the HQ.
- Routes are cached on the action (`route`, `routeGoal`) and replanned when the goal changes or the next tile becomes blocked.
- No way to the destination → the action fails with **`NO_PATH`** (a gather that already did work ends `COMPLETED` with stopReason `NO_PATH`, like the other stop reasons). Hint: "The gate is the only opening in the fence."
- `SIM_VERSION` is `0.7.0` (old saves are refused). Not in O3: unit-vs-unit collision, a closed/ruined gate (the gate always opens), choosing a depot by walking distance, terrain costs.

## O4 — Skill XP (2026-11-16)
- Skills grow only by **practice the simulation observes** (`defs.progression`, data in `definitions/data/survivors.js`): gather = 1 XP per unit picked up, repair = 6 per repair, move = 0.2 per tile walked (any walking), rest = 0.1 per tick, eat/drink = 1 per meal (Consume). Attributes never change from work; idle time teaches nothing; failure grants nothing yet.
- Levels 0–10 at total XP `0, 20, 50, 100, 170, 260, 380, 530, 720, 950, 1250`. `skill.levelup` is logged; a skill never exceeds the top level and stops earning there.
- **Diminishing returns:** full XP below `fullUntil`, falling linearly to `floor` (10%) at `teachesUpTo`, and `floor` after — trivial loops teach little.
- Effects are unchanged (capability module): −5% work time per level, floor 50%. **Gathering no longer raises the load above the amount asked** (`gather("wood", 5, 5)` always yields 5); skill speeds gathering up instead.
- Learner reads `survivor.skillProgress[skill] = { level, xp, next }`; the Survivor Card shows an XP bar per skill. `SIM_VERSION` 0.8.0.
- Not in O4: training actions/buildings, specialization, attribute training, failure XP, XP from hooks/policies beyond the actions they run.

## O5 — Building upgrades (2026-11-16)
- **Design decision:** the game has no free construction. Buildings are placed by the scenario as ruins; learners **repair** them and then **upgrade** them. This keeps the world fixed (good for lessons and replay) and reuses the repair loop.
- `survivor.upgrade(building)`: walk to the building, work `upgrade[level].ticks`, spend `upgrade[level].cost` (reserved up front, released if cancelled), then `level + 1`, full health at the new maximum, `levels[n].storage` replaces the building's storage table when present. Event `building.upgraded`.
- Preconditions (failures): `UNKNOWN_TARGET`, `MAX_LEVEL` (no higher level / no upgrade table), `NEEDS_REPAIR` (not fully repaired — ruined or damaged buildings are fixed with `repair` first), `INSUFFICIENT_RESOURCE`, `CAPABILITY_INSUFFICIENT` (needs Repair skill ≥ 1: advanced work unlocks through practice).
- Data: HQ 1→2 (wood 30, stone 15, 60 ticks; storage 150→300 per item, food/water 100→200) and fence 1→2 (wood 20, stone 10, 50 ticks). Upgrading earns Repair XP (12). The learner reads `building.upgrade` = `{ level, cost, ticks }` or `null`.
- Next: farming tiers (field → greenhouse → hydroponic) are planned as building *levels* using this mechanism; cooking needs a kitchen building; see the design notes in the project conversation / PHASES.

## O6 — Environment: day/night and the weather calendar (2026-11-16)
- **The weather is a calendar, not dice.** Every day's weather is written in `definitions/data/environment.js`, so a learner can read the future and plan (stock up before the storm, harvest before the cold snap). Time and weather are pure functions of the tick: nothing is saved, nothing is random, replays cannot disagree.
- Clock: 240 ticks/day (24 h, 10 ticks/hour); tick 0 = 06:00 of day 1; night = outside 06:00–18:00. Year = spring, summer, autumn, winter, 8 days each; each season is a list of phases (clear / rain / storm / heat wave / cold snap).
- Learner reads: `world.time`, `world.weather`, `world.weatherInfo` (`rainfall`, `hazard`), `world.forecast` (7 days, today first), `world.nextChange` (`{weather, day, inDays, inTicks}`), `world.calendar` (this season).
- Events: `time.dawn`, `time.dusk`, `weather.changed`, `season.changed`. UI: HUD line, 📅 calendar panel, night/weather tint on the map.
- **No gameplay effect yet** — this phase only publishes the information. Hazards (`storm`, `heat`, `cold`) and `rainfall` are consumed by farming: open fields are exposed, greenhouses block hazards, hydroponics ignore weather (see `16-farming-cooking-power-design.md`).

## Compatibility notes
- `gather(resource, n)` used to be a one-shot batch of `n`. It now means *trips of n, until done*. Use `gather(resource, n, n)` for the old behaviour. Starter code in the four lessons was updated this way.
- `API_VERSION` stays 1 (pre-release); `SIM_VERSION` is now `0.2.0`.

## Still to come
| Phase | Scope |
|---|---|
| R3 ✅ | Carry capacity and deposit trips (gather → carry → walk to storage → unload), tent/HQ/storehouse storage pooling — see §R3 |
| R4a ✅ | Needs policies |
| R4b ✅ | Learner event hooks |
| R5 ✅ | Lessons and replay records moved fully to the timeline model; saving free-play sessions |
| O3 ✅ | Collision and pathing — see §O3 |
