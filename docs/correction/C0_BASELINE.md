> **HISTORICAL — DO NOT USE AS ACTIVE IMPLEMENTATION REQUIREMENT**
> Written for the turn-based / correction phase. It may describe removed mechanics (turns, NEXT TURN, per-turn command caps).
> Active sources of truth: [`docs/game/15-realtime-simulation-and-tasks.md`](../game/15-realtime-simulation-and-tasks.md) and [`docs/active/`](../active/).

# C0 — Baseline (recorded before the correction work)

**Status:** the screen that existed before this correction pass is a **prototype shell**, not final UI. No gameplay feature was added during C0–C9.

## Authorities
- Logic authority: `docs/game/01…09` (from `CODE_AFTERmath_GAME_LOGIC…docx`)
- Visual authority: `docs/game/10…14` (from `CODE_AFTERmath_ASSET…docx`)
- Gameplay authority: `modules/simulation` + `modules/api`

## Misleading controls / placeholders recorded
| Item | What it implied | Reality | Fixed in |
|---|---|---|---|
| PAUSE / PLAY / 1× | real-time clock | only toggled UI variables | C2 (removed; TURN / COMMANDS / STRATEGY / NEXT TURN) |
| ASSIGN TASK, TASK, BUILD, SURVIVORS, RESEARCH, MENU, ⚙ | working systems | no handlers | C3 (disabled + “Coming in Phase …”) |
| Code editor | JavaScript environment | one regex + `JSON.parse`, called `buildCommand()` directly, bypassed sandbox and turn budget | C1, C2 |
| Fence | square perimeter | drew only the origin tile | C5 |
| Carry Load `22 kg`, `qty * 2` | carry system | hardcoded future mechanic | C6 |
| `crafting` among attributes | attribute | a skill | C6 |
| NPC circle + letter | animation | no atlas / resolver | C7 |
| Two UI paths (`browser.js`→`debugview`, `mainscreen.js`→`renderer.js`) | — | duplicated pipelines | C4 |

## Extra defects found while applying the correction
| Defect | Fix |
|---|---|
| `simulation.executeTurn()` called an `isIdle` that did not exist (would throw) | defined |
| Strategy points started at 2, not 10 | start at 10, +2 per new turn, cap 10 |
| `executeTurn` used an **absolute** tick cap of 600 (game would freeze after tick 600) | cap is per turn |
| Top bar day/clock were invented from `tick` | replaced by TURN / TICK (day/night belongs to Phase I8) |
| Top bar showed a `metal` stock that does not exist; base condition read `proj.hq` (undefined → always 100%) | stock keys come from the projection; base condition from `studentView().hq` |
| Tutor read `proj.survivors` (not in the render projection) | reads the Survivor Card |
| Bottom hint advertised `survivor.returnToBase()` (not in Game API) | hints generated from the real API |
| Inspector rebuilt every animation frame | panels refresh on state change; canvas animates |
| `serve-script` test failed on non-Windows | drive-letter normalisation made portable |

## Rule going forward
No new gameplay until C9 is fully green, including `npm run smoke` in a real browser.
