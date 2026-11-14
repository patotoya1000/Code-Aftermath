# CODE: AFTERMATH — Active Phase Tracker
## Revision: 2026-11-13

> This file replaces the turn-based roadmap as the active implementation tracker.
> Historical correction phases may remain in the repository, but they are not active requirements unless explicitly marked current.

---

# S0–S5 — Stabilization

Status: 🟡 code gates green (2026-11-13, session 2) — browser smoke still to be run on a machine with Chromium

Completed:

- [x] real-time clock
- [x] standing gather
- [x] replace/queue semantics
- [x] deterministic replay
- [x] free-play save/load
- [x] sandbox boundary
- [x] projection renderer
- [x] Stage 1 world
- [x] lesson player
- [x] 7 starter lessons
- [x] stabilization fixes
- [x] browser smoke coverage

Remaining gate:

- [x] remove/replace obsolete turn tests (`tests/turns.test.js` deleted; the still-valid sandbox/API/card tests were ported to `tests/learner-boundary.test.js`)
- [x] update active documentation so it no longer presents turns as current (`docs/active/` + `docs/README.md`; every document under `docs/correction/` is now marked HISTORICAL)
- [x] `npm test` = 0 failures (see `docs/ANALYSIS_2026-11-13_R4A.md` for the current counts)
- [ ] smoke test = 0 errors — `scripts/smoke.mjs` is extended for R4a but needs Playwright + Chromium; it could not be executed in the environment that produced this revision
- [x] repository hygiene: root scratch scripts removed, `node_modules` untracked, `tmp-verify.mjs` (removed turn API) deleted

---

# R4a — Needs Policies

Status: 🟡 implemented and tested; browser gate pending (smoke check written, not yet executed)

Goal:

Allow survivors to react to changing survival conditions while preserving deterministic simulation.

Example:

```js
survivor.policy("eat", { below: 30 });
```

Required:

- data-driven policy definitions
- interrupt standing action
- execute survival action
- resume previous task
- deterministic replay
- explicit policy priority
- explicit cancellation rules
- lesson validation

Gate:

A survivor can safely work, react to a need threshold, and resume without state corruption.

Delivered (2026-11-13, session 2):

- [x] data-driven policy definitions (`definitions/data/actions.js → policies`, validated)
- [x] interrupt standing action (gather banks the partial batch; repair/move restart cleanly)
- [x] execute survival action, then resume previous task (resume action carries only what is still missing)
- [x] deterministic replay (policy command is in the timeline; reactions are derived; save → load → continue hash-identical)
- [x] explicit policy priority (`drink` 1 → `eat` 2 → `rest` 3; one policy action at a time)
- [x] explicit cancellation rules (replace/stop/downed cancel the whole chain; `clearPolicy` leaves a started meal running; a failing policy is silenced for `retryAfter` ticks)
- [x] lesson validation (`m7_a_dont_starve`, behavioural goals + hidden scenario; solvable with and without a policy)
- [x] soak invariants extended (wood conservation, one running action, one policy action, resume integrity) — 300 seeds
- [ ] real-browser smoke of the policy flow (`scripts/smoke.mjs`, not run here)

---

# R4b — Learner Event Hooks

Status: 🟡 implementation complete; verification pending (tests + browser smoke)

Goal:

Introduce event-driven programming.

Example:

```js
survivor.on("hungry", () => {
    survivor.eat();
});
```

Required:

- Worker execution
- frozen event view
- command budget
- timeout protection
- replay timeline
- deterministic hook execution
- safety validation

Gate:

A runaway hook cannot crash or permanently block the simulation.

---

# R3 — Carry and Deposit

Status: ⬜ not started

Goal:

Replace direct "gather into base" behavior with logistics.

Flow:

```text
Gather
  ↓
Carry
  ↓
Return
  ↓
Deposit
```

Required:

- inventory
- unit weight
- carry capacity
- encumbrance
- multi-survivor support
- transfer
- storage
- conservation invariants
- task queue behavior

Gate:

No resource can be duplicated, lost, or exist simultaneously in two locations.

---

# R5 — Timeline Lessons

Status: ⬜ not started

Goal:

Run lessons against the real-time timeline model and show them on the same world renderer.

Required:

- lesson timeline
- command tick records
- map replay
- state hash verification
- save/load compatibility
- finished-action pruning

Gate:

Lesson replay produces the same state hash as the original attempt.

---

# I6+ — Advanced Game Systems

After R4/R3/R5:

- [ ] collision/pathing
- [ ] skill progression
- [ ] production
- [ ] environment
- [ ] events
- [ ] combat
- [ ] enemies
- [ ] buildings/infrastructure
- [ ] final assets
- [ ] offline release

Do not move these systems forward merely because their UI is visually desirable.

---

# Active dependency chain

```text
S0–S5
  ↓
R4a
  ↓
R4b
  ↓
R3
  ↓
R5
  ↓
I6+
```

---

# Phase completion rule

A phase is not complete because its source files exist.

It is complete only when:

```text
implementation
+
tests
+
invariants
+
replay
+
browser behavior
+
documentation
+
curriculum alignment
```

all pass.

---

# Documentation hygiene rule

Historical documents must be clearly marked:

```text
HISTORICAL — DO NOT USE AS ACTIVE IMPLEMENTATION REQUIREMENT
```

Any document containing removed turn mechanics must either:

1. be rewritten to the real-time model, or
2. be explicitly marked historical.

---

# Test hygiene rule

No removed feature may remain in the active test suite.

Examples of obsolete tests:

- turn command budget
- NEXT TURN
- executeTurn
- getTurnInfo
- runTurnCode

Replace them with:

- real-time clock tests
- strategy-point regeneration tests
- command timeline tests
- standing-action tests
- replay tests
- save/load hash tests
