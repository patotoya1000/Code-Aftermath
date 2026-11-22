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

## Map screens (2026-11-20): MAP 1 TOWN · MAP 2 OUTPOST · MAP 3 FRONT
- The live map is the 40x16 line-wall map (`stage1_long`): the outpost west of the wall, the front east of it. `#screen-west` / `#screen-east` are big arrows on the left and right screen edges (also the Left/Right keys); `#screen-badge` in the top bar says `MAP n NAME` with position dots (green outpost, blue town, amber front).
- TOWN (west) and FRONT (east) are static SVG maps (`src/app/ui/scenes.js`) that slide over the canvas (`#screen-town`, `#screen-front`; the canvas dims and shifts like parallax; reduced-motion users get no slide). Click an object: recruit hall, train station, housing (town); a scavenge site or the raid road (front). A card opens beside the map with the real rows (`src/app/ui/panels.js`, shared with the nav-bar panels); Esc closes it, Esc again returns to OUTPOST.
- The east arrow pulses red while a wave is on and amber when a raid is due tonight and dusk is near. There is no "start a raid" button: waves are scheduled (see DECISIONS).
- Presentation only: buttons insert code, nothing here changes the running simulation. Tests: `tests/screens.test.js`, `tests/long-map.test.js`, `tests/outpost-backdrop.test.js`. The OUTPOST screen draws the painted `assets/backdrops/outpost.jpg`; the arrows sit on its road line.
- **Map tags (on the canvas, not cards):** hovering a tree, rock, survivor or building shows a name + state tag (nodes: amount bar and a "Mara is gathering" line; survivors: what they are doing; buildings: level and condition). A clicked tree / rock keeps its tag and adds the GATHER button. Picked survivors, buildings, trees and rocks glow green.

## UI-R1 (2026-11-19): the map never shrinks
- **Selection card:** the inspector (`#inspector-region`) floats over the top-right of the map and is `hidden` until a survivor, building or resource is picked. ✕, Esc or a click on bare ground closes it (`cardOpen` in `mainscreen.js`). Phones keep the tab layout.
- **Camera:** `src/app/ui/gestures.js` — drag pans, wheel/pinch zooms at the pointer, double-click on bare ground resets; ＋ − ⌖ buttons sit on the right edge. A press that moves under 5 px is still a click.
- **Bottom band:** the code panel, lesson drawer and Codebook dock at the bottom, so resources, clock and PLAY stay visible. PLAY and speed live in the Clock card; the System card holds the rarely used buttons.
- **Lessons:** Run tests the code on the lesson's own world and reports in the code panel (goal chips). "Completed" always comes from saved progress, so a failed retry never un-completes a lesson.
- Tests: `tests/gestures.test.js`, `tests/ui-wiring.test.js`.

## Planned UI-7 contextual cards and outpost roads
- Survivor selection should use side navigation for `INFO / ATTRIBUTES / EQUIPMENT / BAG / COMMANDS`; building, tower, wall and gate selections should use context-specific `INFO / DEFENCE / UPGRADE / STORAGE / COMMANDS` variants.
- Tabs are presentation-only and every action continues to insert a real sandbox/API command.
- Add a top-road OUTPOST arrow for `FOREST` and a bottom-road OUTPOST arrow for `QUARRY`; see `docs/game/27-contextual-ui-and-map-navigation.md`.
