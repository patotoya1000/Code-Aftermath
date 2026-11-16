# Global rules and invariants

Authoritative for: rules every change must respect. Why they exist → `AI_MEMORY/DECISIONS.md`. Execution path → `AI_MEMORY/ARCHITECTURE_INDEX.md`.

## Non-negotiable rules

1. Do not guess; do not invent implementation; inspect the code.
2. The simulation is REAL-TIME. Never restore `startTurn()`, `executeTurn()`, `getTurnInfo()`, NEXT TURN, per-turn command limits or turn-based execution as the main model.
3. The simulation is the sole authority for gameplay state. The clock owns play/pause/speed/frame pacing; the simulation owns ticks, actions, state changes and events.
4. Learner code may only REQUEST actions. It must not mutate health, hunger, thirst, energy, skills, attributes, inventory, storage, resource quantities, task state or any other simulation state.
5. The renderer consumes projections and never mutates gameplay state. Projections are read-only views, never a second source of truth.
6. Tasks: `QUEUED → VALIDATING → RESERVED → EXECUTING → COMPLETED`, plus `FAILED`/`CANCELLED`. First command of a program replaces the current task; later ones queue; `survivor.queue()` appends. `gather` is standing (stop reasons `TARGET_REACHED`, `STORAGE_FULL`, `NO_TARGET`, `EXHAUSTED`).
7. Numbers and definitions are data (`src/modules/definitions/data/`), not code.
8. Determinism: no `Math.random`, `Date`, wall-clock or key-order dependence in simulation/definitions. Behaviour change ⇒ bump `SIM_VERSION` (`src/kernel/versions.js`).
9. Do not implement roadmap items merely because they are documented; do not claim implementation without code evidence.
10. Do not delete a failing test to get green; replace obsolete expectations with tests of the current architecture.
11. Module imports follow `src/architecture.js` (own files, kernel index, declared modules' `index.js`).
12. Do not make AI_MEMORY larger than necessary; one authoritative place per fact.

## Invariants and where they are enforced

| Invariant | Enforced by |
|---|---|
| Renderer does not mutate GameState (and cannot import simulation/actions) | `tests/architecture.test.js`, `tests/assets-render.test.js` |
| Learner code cannot mutate authoritative state | `tests/gate-phase0.test.js`, `tests/sandbox-api.test.js`, `tests/realtime.test.js`, `tests/invariants.test.js` (API maps only to validated types) |
| Simulation is the sole authority for state transitions | `tests/architecture.test.js` (manifest), `tests/invariants.test.js` |
| Tasks cannot execute without validation (validate → capability → reserve) | `src/modules/actions/engine.js` (`advance`), `tests/simulation.test.js` |
| Reserved resources cannot be double-consumed | `tests/ledger-defs.test.js`, `tests/simulation.test.js`, `tests/soak.test.js` (`ledgerViolations`) |
| Stock cannot exceed capacity | `tests/simulation.test.js`, `tests/realtime.test.js`, `tests/invariants.test.js`, `tests/soak.test.js` |
| Completed/failed/cancelled tasks do not continue and hold no reservation | `tests/invariants.test.js`, `tests/soak.test.js` |
| Events reflect authoritative outcomes | `tests/invariants.test.js` |
| Projections are frozen and pure (reading never changes the state hash) | `tests/simulation.test.js`, `tests/invariants.test.js` |
| Same seed + same commands at the same ticks ⇒ same world | `tests/realtime.test.js`, `tests/soak.test.js`, `tests/gate-phase0.test.js` |
| Obsolete turn model absent from active code | `tests/invariants.test.js`, `tests/stabilization.test.js` |
| AI_MEMORY matches the repository (files exist, modules/tests listed, template complete) | `tests/invariants.test.js` |

<<<<<<< HEAD
Also enforced since R3: a unit is in exactly one place (node, hands or base stock) — `tests/carry.test.js`, `tests/soak.test.js`, `tests/policies.test.js`; load never exceeds carry capacity; stock never exceeds pooled capacity.

Not yet covered (honest gaps): encumbrance/equipment effects (not implemented); a runtime check that no handler writes outside a tick.
=======
Not yet covered (honest gaps): inventory/carry capacity (carry does not exist); a runtime check that no handler writes outside a tick.
>>>>>>> f9c2a77d43f7703910e3e04ecf2a22b956f5ae5e
