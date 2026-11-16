<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Needs domain (hunger, thirst, energy, health) and needs policies

# Purpose

Real-time decay of needs, derived conditions, starvation damage, and the data-driven needs policies (R4a) that let a survivor look after itself.

# Responsibilities

- Per-tick decay: hunger every 20 ticks (−1), thirst every 15 (−1), energy every 25 (−1) — numbers in `needs.decay`.
- Starvation: while hunger or thirst is 0, health −1 every 10 ticks; health 0 ⇒ `downed` and all the survivor's actions cancel with `ACTOR_DOWNED`.
- Work cost: 1 energy per 10 cumulative work ticks (`needs.work.energyEvery`); a job cannot start below `minEnergy` 5.
- Eat/drink restore 30; rest restores `energyPerTick` 2 per tick (see TASK handlers).
- Policies: "when need < X, interrupt the job, do eat/drink/rest, then resume" (`survivor.policy`).

# Does NOT Own

- The survivor record (NPC).
- The generic action lifecycle (TASK). Policies *use* it: the interrupted job, the policy action and the continuation are ordinary actions.
- Food/water stock (RESOURCE ledger).

# Core Data

- `needs` table (decay, starve, thresholds hungry/thirsty 30, tired 25, work) and `policies` table (eat/drink/rest: `below` min/max/default, `until`, `retryEvery`) in `src/modules/definitions/data/actions.js`.

# State

`state.survivors[id].needs` (0–100), `state.survivors[id].policies[key] = { below, until?, cooldownUntil, lastActionId, blocked }`.

# Commands / API

`survivor.policy(name, { below, until })`, `survivor.clearPolicy(name?)`, `survivor.eat()`, `survivor.drink()`, `survivor.rest(ticks)`. Instant (policy) commands cost 1 strategy point and do not count as "the first command" for replace-vs-queue.

# Events

`survivor.conditions_changed`, `survivor.damaged`, `survivor.downed`, `policy.set`, `policy.cleared`, `policy.triggered`, `policy.blocked`, `task.resumed`.

# Dependencies

`survivors` (decay, conditions), `actions` (policies), `definitions`.

# Dependents

Lessons (`needNeverBelow`, `needAtLeast`), hooks (`hungry`/`thirsty`/`tired` fire on `survivor.conditions_changed`), capability (tired/hungry/thirsty slow work).

# Source Files

- `src/modules/survivors/index.js` (`applyNeedsDecay`, `deriveConditions`)
- `src/modules/actions/policies.js`
- `src/modules/actions/handlers/shared.js` (`tooTired`, work energy)
- `src/modules/actions/handlers/consume.js`
- `src/modules/actions/handlers/rest.js`
- `src/modules/simulation/index.js` (`tickOnce` order)
- `src/modules/definitions/data/actions.js`

# UI Files

`src/app/mainscreen.js` (`bar`, `policySection`)

# Asset Files

None.

# Tests

- `tests/policies.test.js`
- `tests/simulation.test.js` (decay, starvation, eat)
- `tests/stabilization.test.js` (rest maths, work energy)
- `tests/soak.test.js` (needs in range)

# Current Status

IMPLEMENTED: decay, conditions, starvation, three policies (eat, drink, rest), policy blocking/cooldown. Tick order in `tickOnce`: tick++ → needs decay (downed cancel) → strategy-point regen → policies → action engine step.

# Known Problems

- `morale` has no rules (O5).
- Health never regenerates; there is no healing action.
- Policy continuation for non-gather/rest jobs (move, repair): `continuationOf` re-queues the same action type; only gather (`total`) and rest (`ticks`) shrink their goal. Verify behaviour before relying on it for repair/move.

# Planned Changes

Morale rules and healing with Events/Risk (M9). More policy kinds only through the `policies` data table.

# Forbidden Changes

- Do not reintroduce turns (`startTurn`, `executeTurn`, `getTurnInfo`, NEXT TURN, per-turn command caps). See `AI_MEMORY/DECISIONS.md` ADR-001.
- Do not let the renderer, UI or learner code write authoritative state. See `AI_MEMORY/RULES.md`.
- Do not hardcode need numbers in code; they live in `definitions/data`.
- Do not let a policy edit needs directly; a policy only queues ordinary actions.
- Do not run learner code from the simulation tick; reactions to events go through hooks in the session.

# Related Documentation

- `docs/game/15-realtime-simulation-and-tasks.md` (R4a)
- `docs/game/03-survivor-npc-state.md`
