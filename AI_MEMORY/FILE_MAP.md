# File-level traceability (important files only)

Columns: Purpose · Owns · Does not own · Used by · Depends on · Tests · Memory · Status. "Used by" follows the manifest in `src/architecture.js`. Trivial utilities are omitted.

| File | Purpose | Owns | Does NOT own | Used by | Depends on | Tests | Memory | Status |
|---|---|---|---|---|---|---|---|---|
| `src/architecture.js` | Module dependency manifest | allowed imports | any logic | `tests/architecture.test.js` | — | architecture | ARCHITECTURE_INDEX | IMPLEMENTED |
| `src/kernel/eventlog.js` | Append-only event log | event storage, `hash`, `since` | event meaning | simulation, session, UI | `kernel/hash.js` | kernel, invariants | EVENT_INDEX | IMPLEMENTED |
| `src/kernel/rng.js` | Seeded RNG | deterministic randomness | — | world, sandbox | — | kernel | REPLAY_INDEX | IMPLEMENTED |
| `src/kernel/hash.js` | Stable stringify + checksum | state/log hashes | security | replay, persistence | — | kernel, stabilization | REPLAY_INDEX | IMPLEMENTED |
| `src/kernel/versions.js` | Version stamps | `SIM_VERSION`, `API_VERSION`, formats | — | replay, persistence, simulation | — | stabilization | SAVELOAD_INDEX | IMPLEMENTED |
| `src/modules/simulation/index.js` | The simulation (sole state writer) | tick loop, submit, strategy points, timeline | action details, rendering | session, app | actions, survivors, projection | simulation, realtime, invariants | SIMULATION_INDEX | IMPLEMENTED |
| `src/modules/simulation/clock.js` | Clock driver | play/pause/speed/pacing | any rule | app | — | realtime | SIMULATION_INDEX | IMPLEMENTED |
| `src/modules/simulation/hooks.js` | Hook registration storage | `state.hooks` | running handlers | simulation | kernel | hooks | SIMULATION_INDEX | IMPLEMENTED |
| `src/modules/actions/engine.js` | Queue + lifecycle | transitions, reservations, cancel | handler maths | simulation | resources, capability | simulation, soak | TASK_INDEX | IMPLEMENTED |
| `src/modules/actions/lifecycle.js` | Statuses, failure/stop reasons | state machine table | — | engine, lessons | — | simulation | TASK_INDEX | IMPLEMENTED |
| `src/modules/actions/policies.js` | Needs policies (R4a) | policy rules, interrupt/resume | needs decay | engine, simulation | resources, lifecycle | policies | NEEDS_INDEX | IMPLEMENTED |
| `src/modules/actions/handlers/gather.js` | Standing gather (trips) | node → hands → depot, stop reasons, room accounting | node amounts (ledger) | engine | resources, survivors, buildings, capability | realtime, hardening, stabilization, carry | RESOURCE_INDEX, INVENTORY_INDEX, TASK_INDEX | IMPLEMENTED |
| `src/modules/actions/handlers/carry.js` | Unloading leg (`stepDeposit`) | walk to nearest working depot, unload, retarget | — | gather, deposit | resources, survivors, buildings, shared | carry | INVENTORY_INDEX | IMPLEMENTED |
| `src/modules/actions/handlers/deposit.js` | `deposit()` | unload everything carried | — | engine | carry, shared | carry | INVENTORY_INDEX, TASK_INDEX | IMPLEMENTED |
| `src/modules/actions/handlers/move.js` | Move | stepping to a tile/entity | pathing | engine | shared | simulation | TASK_INDEX | IMPLEMENTED (walks A* routes via `walkStep`) |
| `src/modules/actions/handlers/rest.js` | Rest | energy gain per tick | — | engine | shared | stabilization | NEEDS_INDEX | IMPLEMENTED |
| `src/modules/actions/handlers/consume.js` | Eat/drink | choose item (`pickConsumable`), restore need, reserve item | — | engine, policies | resources | simulation | NEEDS_INDEX | IMPLEMENTED |
| `src/modules/actions/handlers/farm.js` | Farm (standing chores: harvest, water, plant) | one crop at one farm, reserve/commit per chore, stop reasons | — | engine | resources, buildings, farming, capability, survivors, spoilage | simulation | TASK_INDEX |
| `src/modules/actions/handlers/cook.js` | Cook + craft (standing batches, one handler for both commands) | recipe batches at a station, stop reasons incl. NO_POWER | — | engine | resources, buildings (`stationsFor`), capability, survivors | simulation | TASK_INDEX | IMPLEMENTED |
| `src/modules/definitions/data/recipes.js` | Recipes (data) | station, level, inputs, outputs, ticks, skill, action (cook/craft), optional power | — | definitions, projection, cook | — | — | TASK_INDEX | IMPLEMENTED |
| `src/modules/actions/handlers/repair.js` | Repair buildings | health gain, wood cost | construction | engine | buildings | simulation, world-i2 | BUILDING_INDEX | IMPLEMENTED |
| `src/modules/actions/handlers/shared.js` | Walk-then-work helper | work energy cost, `tooTired` | — | handlers | kernel | stabilization | TASK_INDEX | IMPLEMENTED |
| `src/modules/capability/index.js` | Capability + modifiers | `checkCapability` | state writes | actions | definitions | stabilization | SKILLS_INDEX | IMPLEMENTED (constants in code) |
| `src/modules/resources/ledger.js` | Resource ledger | accounts, reservations | what to gather | actions, world, projection | kernel | ledger-defs, soak | RESOURCE_INDEX | IMPLEMENTED |
| `src/modules/survivors/index.js` | Survivor schema, needs decay | `createSurvivor`, `applyNeedsDecay`, conditions | tasks | world, simulation, projection | kernel | simulation | NPC_INDEX, NEEDS_INDEX | IMPLEMENTED |
| `src/modules/buildings/index.js` | Building schema/condition | `createBuilding`, `applyHealth`, `assetKey` | repair lifecycle | world, actions, projection | kernel | world-i2 | BUILDING_INDEX | IMPLEMENTED |
| `src/modules/world/index.js` | Initial state | `createInitialState` | rules | session | resources, survivors, buildings | simulation | WORLD_INDEX | IMPLEMENTED |
| `src/modules/definitions/index.js` | Validated frozen definitions | `createDefinitions`, layout validation | behaviour | app, capability | data files | ledger-defs, world-i2 | WORLD_INDEX | IMPLEMENTED |
| `src/modules/definitions/data/actions.js` | Action/policy/hook/needs/clock numbers | data | code | everything | — | ledger-defs | TASK_INDEX, NEEDS_INDEX | IMPLEMENTED |
| `src/modules/definitions/data/world.js` | Node types, buildings, scenarios | data | rules | world, projection | — | world-i2 | WORLD_INDEX, BUILDING_INDEX | IMPLEMENTED |
| `src/modules/definitions/data/lessons.js` | Lessons | data | validators | lessons | — | stabilization | LESSON_INDEX | IMPLEMENTED |
| `src/modules/definitions/data/items.js`, `src/modules/definitions/data/survivors.js` | Items; survivor templates, skills, traits | data | behaviour | world, projection | — | ledger-defs | ITEM_INDEX, SKILLS_INDEX | IMPLEMENTED |
| `src/modules/projection/index.js` | Read-only views | `studentView`, `renderProjection`, `inspectorCard` | any write | simulation, render input | resources, survivors, buildings | simulation, invariants | RENDERER_INDEX | IMPLEMENTED |
| `src/modules/api/v1.js` | Game API v1 | `COMMANDS`, `buildCommand`, `READ_SURFACE` | feasibility | sandbox, session, UI docs | kernel | sandbox-api, invariants | API_INDEX | IMPLEMENTED |
| `src/modules/sandbox/runtime.js` | In-Worker execution | env, hardening, budgets | applying commands | sandbox worker | api | sandbox-api | SANDBOX_INDEX | IMPLEMENTED |
| `src/modules/sandbox/safety.js` | Static check | forbidden-word scan | containment | runner | — | sandbox-api | SANDBOX_INDEX | IMPLEMENTED |
| `src/modules/sandbox/runner.js` | Worker spawn + timeout | isolation lifecycle | rules | session | safety, runtime | sandbox-api | SANDBOX_INDEX | IMPLEMENTED |
| `src/modules/session/index.js` | Free sim, `submitCalls`, hook runner, `runAttempt`, `replayTimeline` | replace/queue order, attempts | state mutation | lessons, replay, app | world, simulation, api | realtime, hooks, gate-phase0 | SIMULATION_INDEX, LESSON_INDEX | IMPLEMENTED |
| `src/modules/lessons/checks.js` | Goal checks | pure predicates | state | lessons | — | gate-phase0 | LESSON_INDEX | IMPLEMENTED (NEEDS REFACTOR: keyword checks) |
| `src/modules/lessons/index.js` | Lesson run + feedback | `runLesson`, `evaluateLesson` | progress storage | app | session | gate-phase0, stabilization | LESSON_INDEX | IMPLEMENTED |
| `src/modules/replay/index.js` | Replay verification | `verifyReplay` | saving | app | session | gate-phase0 | REPLAY_INDEX | IMPLEMENTED |
| `src/modules/persistence/index.js` | Save store, progress | adapters, envelope, `recordLessonResult` | replay | app | kernel | persistence | SAVELOAD_INDEX | IMPLEMENTED |
| `src/modules/assets/index.js` | Asset resolver + placeholder atlas | keys, fallback chain, frame timing | gameplay | render, app | kernel | assets-render | ASSET_INDEX | IMPLEMENTED (placeholder art) |
| `src/modules/render/index.js` | Canvas renderer | drawing, picking, selection | gameplay | app | assets | assets-render | RENDERER_INDEX | IMPLEMENTED |
| `src/app/index.js` | Composition root | wiring, progress, save/load glue | rules | `src/app/mainscreen.js`, tests | all modules | stabilization, ui-wiring | ARCHITECTURE_INDEX | IMPLEMENTED |
| `src/app/mainscreen.js` | UI controller | DOM, frame loop, panels | gameplay numbers | `index.html` | app, render, assets, persistence | ui-wiring, smoke | RENDERER_INDEX | IMPLEMENTED |
| `scripts/smoke.mjs` | Real-browser check | UI smoke | unit logic | `npm run smoke` | Playwright | — | RENDERER_INDEX | IMPLEMENTED (20/20 on 2026-11-15) |
| `src/modules/spoilage/index.js` | Spoilage (O9): perishable batches `{qty, age}`, daily ageing, cold storage | `syncStock`, `ageFood`, `coldOf`, `perishableView`, `coldInfoFor` | cook/eat handlers, simulation (day change), projection | simulation | resources, buildings | tests/spoilage.test.js | ITEM_INDEX | IMPLEMENTED |
| `src/modules/events/index.js` | Risk events (O18): pure seed+day schedule, dawn effects, warnings, history, learner `events` read | `eventForDay`, `upcomingEvents`, `eventDay`, `eventsView` | `simulation` day change, projection |
| `src/modules/threats/index.js` | Threats (O19 + Z1 + Z2): pure raid schedule (day-gated types), boss milestone, wave entities (spawn/target/walk/hit, dawn resolution), weapon range/mount/noise helpers, learner `threats` read | `waveStart`, `tickWave`, `waveDawn`, `zombieProjection`, `raidForDay`, `zombiesAvailable`, `bossForDay`, `upcomingBosses`, `effectiveRange`, `canMount`, `shotNoise`, `defenseOf`, `upcomingRaids`, `raidWarning`, `raidDusk`, `threatsView` |
| `src/modules/definitions/data/threats.js`, `src/modules/definitions/data/arsenal.js` | Zombies, bosses, wave rules, loot tables, raid schedule; weapons, towers, noise (Z1, docs/game/20) | data tables | `definitions` validation | `simulation` dawn/dusk, projection |
| `src/modules/farming/index.js` | Farming (O10): plots per farm building, growth + rain per tick, hazard damage per day, farm/crop views | `syncPlots`, `tickFarms`, `farmDay`, `farmInfoFor`, `cropBook`, `yieldFor` | farm handler, simulation (tick + day change), projection, world, upgrade | resources, buildings, environment, survivors | simulation, actions, world, projection | WORLD_INDEX |
| `src/modules/power/index.js` | Power (O11): one grid per tick — solar, then generators burning wood only while needed, then consumers (freezer); producer/consumer/grid views | `tickPower`, `powerInfoFor`, `gridView`, `sunPercent`, `powerDefOf`, `hasPower` | simulation (tick), projection | resources, buildings, environment | simulation, projection | BUILDING_INDEX | IMPLEMENTED |
| `src/modules/water/index.js` | Water (O7): aquifer recharge, siphon, well view | `tickWater`, `workingSources`, `siphonTarget`, `waterInfoFor` | gather trips, building repair | simulation, gather, projection | resources, buildings, environment | water | WATER_INDEX | IMPLEMENTED |
| `src/modules/api/codebook.js`, `src/modules/api/codebook-data.js` | Codebook view of the API (UI-1) | sections/entries, search, curated teaching text | the API contract, state | app | `api/v1.js`, kernel | codebook | CODEBOOK_UI_INDEX | IMPLEMENTED |
| `src/modules/assets/terrain.js` | Ground grid, tile variants, road pieces by neighbour mask, placeholder terrain/road painters (PA-2, PA-3) | ground kinds, `groundGrid`, `tileKeyAt` | gameplay, RNG | assets, render | — | assets | RENDERER_INDEX | IMPLEMENTED |
| `src/modules/assets/objects.js` | Object footprint/sprite-size registry, fence autotiling + placeholder fence painter, building footprint cells/placement (PA-4, PA-5) | `OBJECT_SPECS`, `fenceCells`, `footprintCells` | gameplay, collision | assets, render | — | assets | RENDERER_INDEX | IMPLEMENTED |
| `src/modules/viewport/index.js` | Grid↔pixel conversion + camera (PA-1) | cell size, origin, zoom/pan, clamping | gameplay positions | render | — | viewport | RENDERER_INDEX | IMPLEMENTED |
| `src/app/ui/codebook.js` | Codebook HTML renderers | pure string rendering | panel state, gameplay | `src/app/mainscreen.js` | data from `app.codebook` | ui-wiring | CODEBOOK_UI_INDEX | IMPLEMENTED |
