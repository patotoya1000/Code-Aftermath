# NPC assets

Authoritative for: the survivor's visual states. Registry → `AI_MEMORY/assets/ASSET_INDEX.md`. Domain → `AI_MEMORY/domains/NPC_INDEX.md`.

- Keys: `npc_survivor_<action>_<direction>` — actions `idle, walk, gather, repair, rest, eat, drink, downed`; 8 directions.
- Mapping from simulation: `animationFor` in `src/modules/projection/index.js` — downed ⇒ `DOWNED`; no EXECUTING action ⇒ `IDLE`; move or `phase === 'travel'` ⇒ `WALK`; else by action type (`GATHER`, `REPAIR`, `REST`, `EAT`, `DRINK`).
- Direction comes from the simulation (`stepToward`), never from the renderer.
- Files: none. Placeholder shapes from `paintPlaceholderAtlas`. Style reference: `docs/game/media/npc-reference-style.jpeg`.
- UI portrait: a `?` placeholder in `index.html` (`inspector-portrait`); no portrait art.
- PLANNED: real 8-direction sheet, equipment/tool overlays, damage/injury looks.
- Forbidden: storing sprite keys on the survivor; choosing animation by wall-clock in gameplay.
