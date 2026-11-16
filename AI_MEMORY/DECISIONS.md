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
