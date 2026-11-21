# NPC assets

Authoritative for: the survivor's visual states. Registry → `AI_MEMORY/assets/ASSET_INDEX.md`. Domain → `AI_MEMORY/domains/NPC_INDEX.md`.

- Keys: `npc_survivor_<action>_<direction>` — actions `idle, walk, gather, repair, rest, eat, drink, downed`; 8 directions.
- Mapping from simulation: `animationFor` in `src/modules/projection/index.js` — downed ⇒ `DOWNED`; no EXECUTING action ⇒ `IDLE`; move or `phase === 'travel'` ⇒ `WALK`; else by action type (`GATHER`, `REPAIR`, `REST`, `EAT`, `DRINK`).
- Direction comes from the simulation (`stepToward`), never from the renderer.
- Files (PA-7): painted survivor in `assets/sprites/npc/*.png` (transparent, one shared pixel scale, `sizes.json` = size + foot anchor `ax`), sliced from `assets/source/npc-sheet.png` + `npc-walk-sheet.png` by `scripts/slice-npc-sprites.py`. Code: `src/modules/assets/npcart.js`; the renderer asks `npcPose` and draws feet-on-cell; until a picture loads, `paintPlaceholderAtlas` draws as before (fallback chain above is unchanged).
- Poses: `idle_{down,up,left,right}`, `walk_{view}_{0,1}` (2 stride frames, 5 fps), `tool_axe|pickaxe|wrench` (gather wood/other, gather stone, repair/upgrade/cook/craft), `tool_spear|bow|crossbow|rifle` (drawn, not yet mapped: combat phase), `downed`, `dead`.
- 8 directions → 4 views: diagonals use the side view (`VIEW_OF`). Tool poses face right; the renderer mirrors them for left views. rest / eat / drink / guard / hurt show the idle picture until their own art exists.
- Projection: `npcs[].resource` (what a gather job is after) selects axe or pickaxe; presentation only.
- UI portrait: the inspector header shows `idle_down.png` (cropped to head and shoulders by CSS); no fallback glyph (CSP forbids inline handlers).
- PLANNED: winter outfit (cold-weather design), weapon poses wired to combat, sit/sleep (rest), eat/drink, hurt, per-survivor palette variants (Mark / Anna / John), gather/repair as 2-frame loops.
- Forbidden: storing sprite keys on the survivor; choosing animation by wall-clock in gameplay.
- No mock model while painted art loads (2026-11-21): `createNpcArt().preload()` (called by `mountRenderer`) loads all poses at start, idle first; `pending()` is true while pictures are on the way (4 s timeout). The renderer draws the wanted pose, else the survivor's last drawn painted pose, else the standing picture of her view, else (nothing painted ready) no body while `pending()`, and the placeholder atlas figure only when no painted picture exists (files missing / timed out). The placeholder zombie (`spec.zombie`) is tinted grey-green so it is never mistaken for a survivor.

## Chopping / mining swing (2026-11-21)

- The tool pictures (`tool_axe`, `tool_pickaxe`) are stills. While a GATHER tool pose is drawn the renderer moves the survivor toward her node and back (`workSwing` in `src/modules/assets/npcart.js`: lean back, lunge, press, recover, 900 ms cycle, staggered per survivor id) and tilts her about her feet, with four wood / stone chips at the hit. Tune with `WORK_SWING_MS`, `WORK_LUNGE_CELLS`, `WORK_TILT_RAD`. Presentation only: the logical cell, the node and the simulation never move. Repair (wrench) and fighting are not animated this way yet.
