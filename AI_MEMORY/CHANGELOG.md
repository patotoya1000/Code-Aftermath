# Changelog of architectural transitions

Purpose: stop future agents from following stale documentation. When an old document says OLD, the answer is CURRENT. Dates come from `docs/PHASES.md` and `docs/IMPLEMENTATION_PLAN_2026-11-13.md`.

> **WARNING — do not restore anything marked OLD.** Many files under `docs/correction/` still describe OLD behaviour; they are historical and carry a banner. Only `docs/game/15-realtime-simulation-and-tasks.md`, `README.md` and `AI_MEMORY/` describe the active model.

| When | OLD (obsolete) | CURRENT |
|---|---|---|
| 2026-11-12 (R1) | **Turn-based simulation**: `startTurn()`, `executeTurn()`, `getTurnInfo()`, NEXT TURN, 3 commands per turn (C2, 2026-11-11) | **Real-time simulation**: clock driver → `sim.step(n)`; strategy points regenerate over time; `runUntil` for open-ended tests |
| 2026-11-12 (R2) | gather = one batch per command | **Standing gather**: trips of `load` until `TARGET_REACHED` / `STORAGE_FULL` / `NO_TARGET` / `EXHAUSTED`; `survivor.lastTask` says why |
| 2026-11-12 (R2) | every command appended to the queue | **First command of a program replaces, later ones queue, `survivor.queue()` appends** |
| earlier (C1) | learner code directly controls state / the UI parsed commands with a regex | **Learner requests actions** through Sandbox → Game API → Command Builder |
| earlier (C4) | `debugview` module | **One production renderer** (`render`) over the render projection |
| earlier (C7) | rendering without an asset resolver | **Semantic asset keys + asset resolver** with a fallback chain |
| 2026-11-13 (S0–S5) | the removed turns.test.js; `app.runTurnCode`; free-play progress not saved; `node_modules` tracked | **`tests/stabilization.test.js`**; no turn code in `src/app`; free-play save = command timeline + hash; `.gitignore` |
| 2026-11-14 (R4a) | survival fully manual | **Needs policies** (interrupt → act → resume) |
| 2026-11-14 (R4b) | no reaction to events | **Learner event hooks** (source text stored in state, run in the sandbox by the session) |
| 2026-11-16 (R3) | gathered units went straight into base stock; HQ-only capacity; storehouse a decoration | **Carry + deposit**: units move node → survivor's hands → base stock via a walk to the nearest working storage building; `survivor.deposit()`; capacity pooled over working buildings (HQ + tent + repaired storehouse); `SIM_VERSION` 0.5.0 |
| 2026-11-15 | no project memory layer | **`AI_MEMORY/`** navigation layer + `tests/invariants.test.js` (turn-model guard, projection purity, terminal-action finality, event/state agreement, AI_MEMORY accuracy) |

## Historical-only material (do not treat as requirements)

- `docs/correction/*.md` — the C0–C9 correction pass, written for the turn-based model. Parts (C2, "Next Turn", "3 commands per turn") are OBSOLETE.
- `docs/PHASES.md` line "C2 turn-based free play" — historical (marked in the file).
- `scripts/legacy-debug/*.mjs` — scratch debugging scripts moved out of the repo root (B20). Not part of the build or tests.
- Test expectations of the old turn model were replaced, not deleted: see `tests/stabilization.test.js` ("the old turn API is gone") and `tests/realtime.test.js` ("there is no per-turn command cap").

## Upcoming (not done)

R5 lessons on the timeline model · collision/pathing · skills/XP · production · environment · events · combat · enemies · buildings (BUILD/upgrade) · final assets · offline/release. See `AI_MEMORY/IMPLEMENTATION_STATUS.md`.
