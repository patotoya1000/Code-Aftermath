# HUD layout (presentation only)

The main screen uses a HUD layout: the map fills the screen and every panel is a floating card (`.hud-card`) with a fold button.
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
