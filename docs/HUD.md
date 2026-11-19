# HUD layout (presentation only)

The main screen uses a HUD layout: the map fills the whole screen and nothing ever resizes it; every panel is a floating card (`.hud-card`) with a fold button.
Nothing here changes the simulation; the engine modules are untouched.

| File | Role |
|---|---|
| `index.html` | HUD markup. Every id the screen script binds to is unchanged. |
| `src/app/hud/hud.css` | Layout, card style, palette tokens (re-themes the whole screen), tablet and phone rules. |
| `src/app/hud/hud.js` | Card folding (remembered in localStorage), inspector tabs, roster/selector, event-log tags, tactical overlay. |
| `src/app/mainscreen.js` | Four added lines: import, `mountHud(...)` in `init()`, and `hud?.frame(...)` after `renderer.draw(...)`. |

- **Folding:** every card (resources, clock, system, tip, log, navigation, selector, roster, tutor) and every inspector section. `⇕ FOLD ALL` collapses or expands everything.
- **Inspector tabs:** Info / Stats / Equipment / Bag / Command regroup the existing sections by heading (`TAB_OF` in `hud.js`); an unlisted heading stays on Info.
- **Tactical overlay** (`◎ TACTICAL` toggles it): compound wash and grid, road with approach lane, gate readout and bar, tower rings (reach when selected), zombie health bars. It reads the renderer's viewport, so it follows pan and zoom.
- **Left out on purpose:** the mock HUD's direct-action buttons (+HORDE, REPAIR GATE, EXEC) and its invented numbers. Commands still go through the Code panel and the sandbox.

## Buttons mirror the game's real rules (added with the HUD nav panels)

- `src/app/ui/actions.js` (pure functions) derives every inspector button from the student view: building actions (repair, fetch water, cook/craft recipes, upgrade, mount/reload/guard on towers) and survivor actions (eat, drink, rest, gather, deposit, queue, stop). A button is enabled only when the documented requirement is met right now; a disabled button's tooltip says why.
- Buttons never change the game. They insert a code snippet into the editor (`data-action="insert"`), and the player still presses Run, so every command goes through the sandbox. The second and later survivors are addressed as `survivors[i].`.
- Navigation bar: CODE, BOOK, TASK (what each survivor is doing), ASSIGN (pick a survivor and a codebook command), BUILDING (condition, repair/upgrade) and SURVIVORS (needs) open a panel above the bar. RESEARCH is shown but disabled because the game logic has no research system; MENU and SETTINGS wait for Phase I3.
- Tested in `tests/ui-actions.test.js` (every enabled snippet runs through the real sandbox).
## UI-R1 (2026-11-19): the map never shrinks
- **Selection card:** the inspector (`#inspector-region`) floats over the top-right of the map and is `hidden` until a survivor, building or resource is picked. ✕, Esc or a click on bare ground closes it (`cardOpen` in `mainscreen.js`). Phones keep the tab layout.
- **Camera:** `src/app/ui/gestures.js` — drag pans, wheel/pinch zooms at the pointer, double-click on bare ground resets; ＋ − ⌖ buttons sit on the right edge. A press that moves under 5 px is still a click.
- **Bottom band:** the code panel, lesson drawer and Codebook dock at the bottom, so resources, clock and PLAY stay visible. PLAY and speed live in the Clock card; the System card holds the rarely used buttons.
- **Lessons:** Run tests the code on the lesson's own world and reports in the code panel (goal chips). "Completed" always comes from saved progress, so a failed retry never un-completes a lesson.
- Tests: `tests/gestures.test.js`, `tests/ui-wiring.test.js`.
