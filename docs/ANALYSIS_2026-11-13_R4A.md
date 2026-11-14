# Analysis, plan, R4a implementation and recommendations — 2026-11-13 (session 2)

## 1. What was analysed
The uploaded `code-aftermath.zip` (src ≈3.1k lines, 17 test files) against the four revised guides (active phases, alignment audit, strict guidelines, revised curriculum). Everything below was verified by running code.

## 2. Findings in the zip as delivered
| # | Finding | Evidence | Fixed |
|---|---|---|---|
| A1 | The docs claim "122 tests, 0 failing", but `tests/turns.test.js` was still present and called removed APIs (`runTurnCode`, `getTurnInfo`, `executeTurn`) | 132 run / 124 pass / **8 fail** | ✅ file removed; the still-valid tests (sandbox errors, invalid args, card weights) ported to `tests/learner-boundary.test.js` |
| A2 | `node_modules` still tracked in git | 183 tracked files | ✅ untracked (`.gitignore` already lists it) |
| A3 | Scratch scripts still in the repo root; `tmp-verify.mjs` used the removed turn API | root listing | ✅ root copies removed, `tmp-verify.mjs` deleted, `scripts/legacy-debug/README.md` added |
| A4 | Historical correction docs presented turn mechanics as current | 11+7+4… turn mentions | ✅ every file in `docs/correction/` carries the HISTORICAL banner |
| A5 | Condition lesson proved only "final energy ≥ 70" + the keyword `if` (audit weakness D) | `m3_c_condition` | ✅ hidden "already rested" world added; always-rest now fails |
| A6 | Every lesson was required to pass **from its own starter**, which forces starters to be the solution (contradicts curriculum §18) | `stabilization.test.js` | ✅ optional `solution` field; starter may be a scaffold |
| A7 | `Survival is manual` was absolute in the spec; with R4a it is opt-in | `docs/game/15` | ✅ updated |

## 3. Plan and what was (not) done
Dependency chain: S0–S5 → **R4a** → R4b → R3 → R5 → I6+.
- **S0–S5 cleanup: done** except the browser smoke run (no Chromium in this environment).
- **R4a: implemented and tested** (below).
- **R4b, R3, R5, I6+: deliberately not started.** R4b needs Worker-resident hooks plus a replay timeline for hook execution; R3 depends on R4's reaction model; R5 on R3. Starting them in the same pass would have broken the "gate before next phase" rule.

## 4. R4a design (summary — full rules in `docs/game/15-…md`)
`survivor.policy("eat", { below: 30 })` / `clearPolicy(name)`; policies are data (`definitions/data/actions.js → policies`); the simulation runs them once per tick before actions advance. Interrupt → survival action → **resume action** (gather banks the partial batch and resumes with only the missing total). Priority drink 1 → eat 2 → rest 3, one policy action at a time, learner-chosen survival actions never interrupted, replace/stop/downed cancel the whole chain, a failing policy is silenced for `retryAfter` ticks. Only `policy()`/`clearPolicy()` cost strategy points and enter the timeline, so replay reproduces every reaction. `SIM_VERSION` 0.2.0 → 0.3.0.

## 5. Hidden-bug hunt — what was checked and what it found
Risks designed out (each has a test, and each test was mutation-checked by breaking the code on purpose):
| Risk | Guard | Mutation result |
|---|---|---|
| Partial batch lost or duplicated on interrupt | bank-on-interrupt + soak wood-conservation invariant (trees + stock + spent) | breaking it fails tests 3/4; injecting +1 wood fails the soak |
| Failing policy thrashes the job every tick | `retryAfter` silence | removing it fails test 7 |
| Resume runs after queued commands | insertion "after policy action" | moving it fails test 9 |
| `policy()` steals the program's "first command" slot (next gather would queue instead of replace) | `config` flag in the API | breaking it fails test 14 |
| Resume overshoots the requested total | resume asks only `total − gathered` | breaking it fails test 3 |
| Interrupting a learner-chosen `rest` | `interruptible` data flag + definition validation | making rest interruptible is rejected by validation |
| Prototype/odd objects through the API | plain-object-only options, ≤4 primitive keys, simulation re-validates | tests 15/16 |
| Stale/silent state in old saves | `SIM_VERSION` bump → `SAVE_VERSION_MISMATCH` | existing persistence tests |

Honest finding: my own first hidden threshold in `m7_a_dont_starve` (hunger ≥ 40 from a start of 12) was unreachable by a correct policy (ends at 39). The hidden-scenario machinery exposed it; the goal is now "not hungry (≥ 30)". Other test failures during development were test-design mistakes (interrupt landing in travel rather than work), not engine faults.

## 6. Curriculum changes
- Hidden scenarios (`lesson.hidden[]`, own seed/goals, shown only after a run, validated in `definitions`).
- New **M7 · Don't Starve** (visible: hunger 31; hidden: hunger 12). Solvable with a policy **and** by eating by hand — policies are a tool, not a keyword gate. The starter is a scaffold that does not pass.
- Results merge into the existing UI result list, so no UI change was needed.

## 7. Evaluation
| Check | Before | After |
|---|---|---|
| `npm test` | 132 tests, **8 failing** | **154 tests, 0 failing** |
| Deep soak `SOAK_SEEDS=300` (3000 ticks each) | n/a on this build | 300/300 seeds, all invariants incl. new ones |
| Policy events exercised by random play (40 seeds) | — | 84 interrupts, 81 resumes, 413 completed, 1212 silenced failures |
| Mutations killed | — | 6/6 (+1 soak injection) |
| Real-browser smoke | — | **NOT RUN** (Chromium unavailable here); check added to `scripts/smoke.mjs` |
| UI wiring (fake DOM) | policy card/feed not covered | covered |

## 8. Recommendations (in order)
1. **Run `npm install && npm run smoke` on your machine** before calling R4a complete; per your own gate it is not complete until browser behaviour passes.
2. **R4b next.** Keep the same discipline: hooks execute in the Worker with a frozen event view, a per-hook command budget and timeout, and their commands are timeline-recorded. Reuse `policy.triggered`-style events as the hook triggers.
3. **Prune finished actions (O1) before R3.** A policy chain adds two actions per reaction; R3's carry trips will add many more. Do it with the R5 save-size gate or earlier.
4. Strengthen `m3_d_function` (parameterised reuse across two calls) and `m2_*` lessons with hidden scenarios — audit weaknesses C/E are still open; M0 orientation lessons are not written.
5. Add `morale` effects or remove it from the card (O5 still open); collision/pathing (O3) before any gate/fence gameplay.
6. Decide whether policies should persist across programs (currently they do, until cleared). The card now shows them; if learners forget them, consider a "policies cleared on new program" option as data.
