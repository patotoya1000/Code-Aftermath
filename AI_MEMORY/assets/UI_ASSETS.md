# UI assets

Registry → `AI_MEMORY/assets/ASSET_INDEX.md`. Renderer/UI → `AI_MEMORY/systems/RENDERER_INDEX.md`.

- The UI is HTML + CSS (`index.html`, `src/app/mainscreen.css`) with emoji/text icons; there are no image files.
- Survivor card: portrait slot shows a `?` placeholder; needs and attributes are bars/grids.
- Seven bottom-bar buttons are disabled placeholders ("Coming in Phase …"): ASSIGN TASK, TASK, BUILD, SURVIVORS, RESEARCH, MENU, SETTINGS.
- The page CSP forbids inline handlers (a regression test enforces it: `tests/stabilization.test.js`).
- PLANNED: portrait art, icon set, event visuals (`docs/game/13-events-visual-spec.md`).
- Forbidden: UI code that computes gameplay numbers or parses commands.
