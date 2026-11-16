# Architecture Index

Authoritative for: the execution path, module ownership and traces. Decisions → `AI_MEMORY/DECISIONS.md`. Global rules and invariants → `AI_MEMORY/RULES.md`.

## Execution path (active, real-time)

```
Learner JavaScript
  → Sandbox / Worker            (Clock A: runs once, synchronously, bounded)      src/modules/sandbox
  → Game API v1                 (validates + normalises calls to plain JSON)       src/modules/api
  → Command Builder             (buildCommand → versioned Command)                 src/modules/api, src/modules/session
  → Action Queue / Lifecycle    (replace-vs-queue, validate → capability → reserve) src/modules/actions
  → Real-Time Simulation Tick   (Clock B: tickOnce)                                src/modules/simulation
  → Authoritative GameState     (closure inside the simulation; only writer)       src/modules/simulation, world
  → Event Log / Projection      (append-only events; frozen read-only views)        src/kernel/eventlog.js, src/modules/projection
  → Renderer / Inspector / Lesson feedback                                          src/modules/render, src/app, src/modules/lessons
```

Frame pacing: animation frame → `createClockDriver.update(dt)` → `sim.step(n)`. The driver owns play/pause/speed only.

## Who owns what

| Responsibility | Owner (module) |
|---|---|
| Parse/run learner code, budgets, isolation | `sandbox` |
| Command contract, argument validation | `api` |
| Replace-vs-queue ordering, strategy-point charging call, hooks runner, lesson attempt | `session` (charging itself is in `simulation`) |
| Tick counting, tick order, strategy points, hook storage, command timeline | `simulation` |
| Action queue, lifecycle, handlers, policies | `actions` |
| Can this survivor do it, how fast/much | `capability` |
| Spendable quantities (reserve/commit/release) | `resources` |
| Survivor schema, needs decay, conditions | `survivors` |
| Building health/condition | `buildings` |
| Initial state from scenario + seed | `world` |
| Data tables (items, actions, policies, hooks, needs, clock, buildings, scenarios, lessons) and their validation | `definitions` |
| Day/night clock, season calendar, weather and forecast (pure functions of the tick) | `environment` |
| Read-only views (student, render, inspector) | `projection` |
| Semantic asset key → atlas frame, fallback chain, animation timing | `assets` |
| Drawing, picking, selection (no gameplay) | `render` |
| Goal checks and feedback | `lessons` |
| Replay verification | `replay` |
| Saves and campaign progress | `persistence` |
| Seeded RNG, hashing, event log, errors, versions, 8-direction grid | `kernel` (`src/kernel`) |
| Wiring of all modules | `src/app/index.js` (composition root); UI in `src/app/mainscreen.js` |

## Module manifest (`src/architecture.js`, enforced by `tests/architecture.test.js`)

A module may import only its own files, `src/kernel/index.js`, and the `index.js` of modules it declares. No cycles. The kernel imports nothing. `render`, `assets`, `lessons`, `replay`, `persistence` must not depend on `simulation` or `actions`.

| Module | Declared dependencies |
|---|---|
| `definitions` | — |
| `resources` | — |
| `survivors` | — |
| `buildings` | — |
| `world` | `resources`, `survivors`, `buildings` |
| `projection` | `resources`, `survivors`, `buildings`, `environment` |
| `actions` | `resources`, `survivors`, `buildings`, `capability` |
| `simulation` | `survivors`, `actions`, `projection`, `capability`, `environment` |
| `environment` | — |
| `api` | — |
| `sandbox` | `api` |
| `session` | `world`, `simulation`, `api` |
| `lessons` | `session` |
| `replay` | `session` |
| `persistence` | — |
| `capability` | `definitions` |
| `assets` | — |
| `render` | `assets` |

## Trace maps (implemented flows only)

**GATHER** — learner `survivor.gather("wood", 10, 30)` → Worker records a call (`src/modules/sandbox/runtime.js`) → `normalizeCall`/`COMMANDS.gather.params` (`src/modules/api/v1.js`) → `buildCommand` + replace/queue mode (`submitCalls`, `src/modules/session/index.js`) → `sim.submitCommand` charges 1 strategy point after `sim.submit` → `engine.submit` creates the action (QUEUED) → each tick `advance`: VALIDATING (`gatherHandler.validate`: if she still carries something the job starts with the unloading leg; otherwise `planBatch` picks the nearest node able to fill the batch, caps the load at what she can carry (`carryRoom`) and at the room left in pooled storage) → capability check (`src/modules/capability/index.js`) → reservation of the node units (`reserve`) → RESERVED → EXECUTING, leg `node`: `approachThenWork` walks then works `batch × ticksPerUnit` ticks (energy drains) → batch end: `commit` the node units and `pickUp` puts them in `survivor.inventory.items`, emits `resource.gathered` (and `node.depleted`) → leg `depot`: `stepDeposit` (`handlers/carry.js`) walks to the nearest working storage building that accepts the item, unloads for `unloadTicks`, credits `stock.<item>`, emits `resource.deposited` → `planBatch` again; a stop reason ends the job (COMPLETED with `stopReason`, or FAILED if no work was done) → `task.stopped` event + `survivor.lastTask` → `studentView`/`renderProjection`/`inspectorCard` → renderer animates WALK/GATHER; UI feed; lesson checks (`stockAtLeast`) read the final view. A job cut off while she carries something leaves the load in her hands; `survivor.deposit()` (handler `deposit.js`, same `stepDeposit`) or the next gather unloads it.

**REST** — `survivor.rest(ticks)` → API → action `rest` → `restHandler.tick` adds `energyPerTick` (2) per tick until `ticks` or `until`/max → `survivor.rested` event.

**REPAIR** (the only building action; there is no BUILD) — `survivor.repair(fence)` → `repairHandler`: validate (exists, damaged, not too tired) → reserve wood cost → walk → work `repair.ticks` → `complete`: `applyHealth` → `building.repaired`, `building.condition_changed`.

**EAT / DRINK** — `consumeHandler`: reserve 1 food/water → `ticks` → `need += restore` → `survivor.consumed`.

**QUEUE TASK / REPLACE** — `submitCalls`: first non-instant command per survivor in a run uses mode `replace` (`engine.cancelFor(..., 'REPLACED')`), later ones `queue`; `survivor.queue()` marks the survivor append-only; policies/hooks/`clearPolicy` are instant and never count as "first".

**NEEDS UPDATE** — `tickOnce` → `applyNeedsDecay` (decay table; starvation damage; `survivor.conditions_changed`; downed cancels actions with `ACTOR_DOWNED`) → `applyPolicies` (R4a: interrupt → policy action at queue front → continuation behind it).

**POLICY** — `survivor.policy("eat",{below:30})` → instant command `policy` → `setPolicy` (state) → checked each tick in `applyPolicies`; blocked (no stock) ⇒ `policy.blocked`, retry after `retryEvery`.

**HOOK (R4b)** — `survivor.on("hungry", fn)` registers the function *source* (`hook_register`) → stored in `state.hooks` → session `createHookRunner.pump()` (called each frame by the UI) reads new events, on a match runs the handler in a fresh sandbox run with a fresh frozen view, and sends its commands through `submitCalls` → replay records the resulting commands only.

**RESOURCE COLLECTION** — see GATHER; ledger invariants checked by `ledgerViolations` (tests, soak).

**LESSON VALIDATION** — `app.runLesson` → `runLesson` → `runAttempt` (fresh `createInitialState`, sandbox, `sim.submit` per call, step until idle/`maxTicks`, checkpoints every 25 ticks, replay record with hashes) → `evaluateLesson` (pure `CHECKS`) → `recordLessonResult` → UI.

**SAVE / LOAD (free play)** — `saveFreePlay`: `{scenarioId, seed, tick, timeline, stateHash}` → `loadFreePlay`: version check → `replayTimeline` → hash check → continue.

## Not implemented (do not trace as if they existed)

BUILD, DEPOSIT as a separate step, CARRY, CRAFT, PRODUCE, collision/pathing, combat, enemies, environment, skill XP. See `AI_MEMORY/IMPLEMENTATION_STATUS.md`.
