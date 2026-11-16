# Sprite index

Authoritative for: the technical sprite contract the code assumes. Design rules live in `docs/game/10-assets-specification.md` and `docs/game/11-npc-visual-spec.md`; the registry is `AI_MEMORY/assets/ASSET_INDEX.md`.

## Contract in code (`src/modules/assets/index.js`)

- Frame size `FRAME` 32×32; shared foot pivot `PIVOT` (16, 30); transparent background; atlas laid out on a 12-column grid (`sheet.w = 12×32`).
- 8 directions for every NPC action; `FRAME_COUNT`: idle 1, walk 2, gather 2, repair 2, rest 1, eat 1, drink 1, downed 1. FPS: walk 6, gather 4, repair 4 (others static).
- Animation is presentation only: `frameIndexAt(resolved, timeMs, offsetMs)`; the renderer staggers per-entity offsets. Animation never decides task completion.
- Placeholder painter draws simple shapes (no text) so real art can replace the atlas without code changes.
- Missing frames degrade through the resolver's fallback chain; deleting a frame does not change gameplay (tested).

## Status

IMPLEMENTED: contract + placeholder atlas. PLANNED: real sprite sheets, per-skin variants (`NPC_VARIANT = 'survivor'` is the only variant), weapon/tool overlays, building level-2 art.

## Forbidden changes

- Do not hard-code image filenames or pixel offsets in gameplay, projection, definitions or UI logic.
- Do not let sprite state feed back into simulation state.
- Do not change frame size/pivot without updating the manifest, the renderer and `tests/assets-render.test.js` together.
