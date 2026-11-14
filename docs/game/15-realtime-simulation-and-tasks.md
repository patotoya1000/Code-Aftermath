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

- Ended **after doing some work** → the action is `COMPLETED` with `stopReason`; events `task.started`, `resource.gathered` (per trip), `task.stopped { reason, gathered, trips }`.
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

## Compatibility notes
- `gather(resource, n)` used to be a one-shot batch of `n`. It now means *trips of n, until done*. Use `gather(resource, n, n)` for the old behaviour. Starter code in the four lessons was updated this way.
- `API_VERSION` stays 1 (pre-release); `SIM_VERSION` is now `0.2.0`.

## Still to come
| Phase | Scope |
|---|---|
| R3 | Carry capacity and deposit trips (gather → carry → walk to HQ → deposit), tent/HQ storage pooling |
| R4 | Needs interrupts and policies, learner event hooks |
| R5 | Lessons and replay records moved fully to the timeline model; saving free-play sessions |
