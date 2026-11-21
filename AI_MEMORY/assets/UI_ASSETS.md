# UI assets

Registry → `AI_MEMORY/assets/ASSET_INDEX.md`. Renderer/UI → `AI_MEMORY/systems/RENDERER_INDEX.md`.

- The UI is HTML + CSS (`index.html`, `src/app/mainscreen.css`) with emoji/text icons; there are no image files.
- Codebook panel (`#codebook-panel`) and the compact API list are text/CSS only; see `AI_MEMORY/systems/CODEBOOK_UI_INDEX.md`. Painted-art plan (pixel art scrapped 2026-11-20): `docs/game/18-grid-asset-integration.md` (PLANNED).
- Survivor card: portrait slot shows a `?` placeholder; needs and attributes are bars/grids.
- Seven bottom-bar buttons are disabled placeholders ("Coming in Phase …"): ASSIGN TASK, TASK, BUILD, SURVIVORS, RESEARCH, MENU, SETTINGS.
- The page CSP forbids inline handlers (a regression test enforces it: `tests/stabilization.test.js`).
- PLANNED: portrait art, icon set, event visuals (`docs/game/13-events-visual-spec.md`).
- Forbidden: UI code that computes gameplay numbers or parses commands.

- Equipment icons (2026-11-21): `assets/equipments/*.png` (250x250, transparent) are connected through `src/modules/assets/icons.js` (`ITEM_ICONS` item id → file; `iconUrl(id)` → URL or null). Shown in the survivor card (equipment slot and inventory row) when the item has an icon; weapons that exist today: spear (`makeshift_spear`), bow, crossbow (`common_crossbow`), rifle (`common_rifle`). Axe, pickaxe, repair tool and the survivor gear (boots, helmet, jacket, mask, bag) are connected as ids only: no such item exists in the definitions yet (see docs/game/22). Adding the item later needs no UI change.
