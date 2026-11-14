# Analysis, fixes and revised implementation plan — 2026-11-13

Scope: full read of `src/` (≈3.6k lines), `tests/`, `docs/`, the real-time pivot (R1–R2) and the UI. Everything below was
verified by running code, not just by reading it.

## 1. Where the project stood

| Check | Result before |
|---|---|
| `npm test` | **104 tests, 9 failing** |
| Lessons passable with their own starter code | 5 of 7 |
| Browser lesson UI | unusable (see B7, B8) |
| Real-browser smoke | passing, but it never touched the lesson UI |

## 2. Findings (all fixed unless marked *open*)

### Engine / rules
| # | Bug | Effect | Fix |
|---|---|---|---|
| B1 | `rest` "adjustment" hack topped energy up to `defaultTicks × energyPerTick` whatever length was asked; `rest(5)` gave +40 | wrong numbers, failing test | plain arithmetic: +`energyPerTick` per tick, capped, rounded to 2 dp |
| B2 | Being *tired* made `rest` recover 30 % slower (fatigue penalty applied to every action) | the cure for tiredness was worse when tired | fatigue penalty skipped for `rest` |
| B3 | Energy cost counted work ticks **per batch**; a 2-tick batch never reached "1 energy / 10 ticks" | `gather("wood", 1)` worked forever without tiring (exploit) | cumulative `workTotal` per action |
| B4 | `gather` credited `floor(batch × outputModifier)` but removed only `batch` from the node | strong/skilled survivors **created wood from nothing**; a modifier < 1 could credit 0 and crash the tick (`INVALID_QUANTITY`) | the modifier now changes how much a *trip carries*; node loss and base gain are always the same number |
| B5 | Modifiers (tired / hungry / skill) were frozen when the standing job started | a 10-minute gather ignored the survivor getting hungry | modifiers re-read for every batch; work-tick count stored per batch |
| B6 | Partial-batch yield on exhaustion used `progress / ticksPerUnit`, ignoring the survivor's speed | wrong units when slowed | share of the batch's own work ticks, always `< batch` |

### Lessons
| # | Bug | Fix |
|---|---|---|
| B7 | `m2_a_variable` required construct `const`, which the checker did not know → **impossible to pass** | `const` / `let` / `variable` constructs |
| B8 | `m3_c_condition` starter (`rest()` = +40) could not reach its own goal (energy ≥ 70) | starter uses `rest(40)`; goal gets a hint |

### UI (found by the real-browser run, not by the fake-DOM tests)
| # | Bug | Fix |
|---|---|---|
| B9 | Lesson buttons used inline `onclick=`; the page CSP (`script-src 'self'`) blocks inline handlers → **dead buttons** (and module functions are not global anyway) | `data-action` + one delegated listener |
| B10 | `#lesson-player-panel` had **no CSS at all**; it rendered unstyled below the page and the full-screen code panel covered it | styled left drawer; code panel shifts right while it is open |
| B11 | Pressing the letter **L anywhere** (including while typing code) toggled lesson mode; Space toggled the clock while typing | shortcuts ignore text inputs; lesson mode is Alt+L as the comment always said |
| B12 | Opening a lesson silently **reset the free-play world** | lessons no longer touch it |
| B13 | Progress screen showed only the *last* attempt, not saved progress | reads `app.progress` |
| B14 | UI chose the IndexedDB adapter even where IndexedDB is unavailable | falls back to memory |
| B15 | `collectEvents` copied the whole event log every refresh; render projection rebuilt + deep-frozen every frame | `log.since(cursor)`; projection cached per (tick, log length) |

### Persistence / kernel / housekeeping
| # | Item | Fix |
|---|---|---|
| B16 | `stableStringify` hashed `undefined`-valued keys that JSON drops → a state with one would **fail its own integrity check after save/load** | undefined keys skipped, like JSON |
| B17 | `app.runTurnCode` called `sim.getTurnInfo`, `sim.defs`, `sim.survivors` — all removed in R1 | removed |
| B18 | `tests/turns.test.js` (8 tests) tested the removed turn model | removed; replaced by `stabilization.test.js` |
| B19 | Free-play progress was never saved (listed as open since 2026-11-12) | `saveFreePlay` / `loadFreePlay` + SAVE / LOAD buttons (see §4) |
| B20 | `node_modules` tracked in git; scratch scripts (`debug-*.mjs`, `tmp-verify.mjs`) in the repo root; CRLF in `capability/index.js`; dead `"main"` in package.json | `.gitignore`, `.gitattributes`, scripts moved to `scripts/legacy-debug/`, normalized |

### Known and left open (documented, deliberately not changed now)
- **O1** `state.actions` keeps every finished action forever; very long sessions grow state, hashes and saves. Plan: prune terminal actions older than N ticks into a counter, in R5.
- **O2** Lesson mode runs in an isolated simulation, so the map does not show the lesson run. Plan: R5 (lessons on the timeline model, replayed on the map).
- **O3** Survivors walk through buildings (no collision/pathing). Needed once the gate matters (I6).
- **O4** Placeholder art only (I1). **O5** `morale` need exists but nothing changes it.
- **O6** The sandbox's static check also flags forbidden words inside strings/comments (friendly but noisy). The Worker is the real boundary, so this is cosmetic.

## 3. Revised implementation plan

Order changed from the previous roadmap (R3 → R4 → R5). **Reason:** the learner's code runs once and cannot wait for
the future (`async`/`await` are forbidden), and survival is manual. Without a way to *react* to hunger, thirst or an
empty tree, the only tool is "write the whole day in advance", which teaches sequencing but not conditions. Reaction
(R4) is the core teaching loop; carrying (R3) adds economy depth on top of it, so it should come second.

| Phase | Scope | Gate (must pass before the next phase) |
|---|---|---|
| **S0–S5 Stabilization** (this pass) | everything in §2 | 122 tests green, soak 300 seeds green, real-browser smoke green |
| **R4a Needs policies** | data-driven policies per survivor, e.g. `survivor.policy("eat", { below: 30 })`: a policy *interrupts* a standing job, runs the action, and **resumes** it; stop reasons `INTERRUPTED` / `RESUMED` | policies are deterministic and replayable; a lesson can be solved with a policy and without one |
| **R4b Learner event hooks** | `survivor.on("hungry", fn)`, `on("stopped", fn)`: handlers run in the Worker with a frozen view and may only issue commands; per-hook command budget; hooks stored in the timeline so replay still works | a runaway hook is killed like runaway code; hooks cost strategy points |
| **R3 Carry + deposit** | carry capacity (strength + equipment), gather → carry → walk to HQ → deposit; storehouse adds capacity; tent/HQ pooling | conservation test extended to carried items; no item can be in two places |
| **R5 Lessons on the timeline** | lessons run on the real simulation and are shown on the map; replay records become timelines; prune finished actions (O1) | lesson replay verified by hash; saves stay small after 100k ticks |
| **I6+** | collision/pathing (O3), events/enemies, production art (I1) | per the existing implementation phases |

Rules that carry across every phase (they are what kept this pass safe): every new mechanic gets (1) a regression test
that fails on the old behaviour, (2) an invariant added to `soak.test.js`, (3) a real-browser smoke check when it has UI.

## 4. What was added

- **Free-play save/load.** A save is the session *record* (scenario, seed, the commands with the ticks they were issued,
  and the state hash), not a state dump. Loading replays the record and refuses to continue if the hash differs
  (`SAVE_CORRUPT`) or the simulation version differs (`SAVE_VERSION_MISMATCH`). Reuses `replayTimeline`, so it costs no new
  engine code and cannot drift from the real rules.
- **`tests/stabilization.test.js`** — one test per bug above; 13 of them fail on the original code.
- **`tests/soak.test.js`** — seeded random play, invariants after every 50 ticks (ledger balance, no negative stock, storage
  capacity, needs in range, positions in bounds, stone conservation, no reservations on finished actions, determinism).
  `SOAK_SEEDS=300 npm test` runs the deep version.
- **Smoke test** now covers typing safety, lesson buttons under the CSP, lesson pass, save/load.

## 5. Evaluation

| Check | Before | After |
|---|---|---|
| `npm test` | 104 tests, **9 failing** | **122 tests, 0 failing** (+ soak 12 seeds) |
| Deep soak (`SOAK_SEEDS=300`) | not available | 300 seeds × up to 3000 ticks, all invariants hold |
| Lessons passable from starter | 5 / 7 | **7 / 7** |
| New regression tests vs. original code | — | 13 fail on the original, pass on the fix |
| Real-browser smoke (Chromium) | 15 checks | **20 checks**, 0 console errors |
| Determinism | hash-checked replay | unchanged, plus save→load→continue produces an identical hash |

Not measured here: real touch devices, Firefox/Safari, and performance on a low-end phone (the projection cache should
help; profile before R3 adds more per-frame work).
