# Building assets

Registry → `AI_MEMORY/assets/ASSET_INDEX.md`. Domain → `AI_MEMORY/domains/BUILDING_INDEX.md`.

- Keys: `building_<type>_lv<level>_<condition>` for `hq`, `fence`, `tent`, `storage`, `gate`; conditions `ruined | damaged | repaired` only (thresholds 0.25 / 0.6 of max health, from definitions). The simulation computes the condition; the key comes from `assetKey` in `src/modules/buildings/index.js`.
- The fence is drawn from its authoritative `bounds` (perimeter cells), leaving the gate cell open (`perimeterCells` in `src/modules/render/index.js`).
- Files: none (placeholder). Visual rules: `docs/game/12-buildings-visual-spec.md`.
- Level-2 keys exist in the manifest for `hq` and `fence` because the definitions list level 2, but nothing upgrades a building yet.
- PLANNED: real art, construction-in-progress looks, upgrades.
- Forbidden: one asset per health percent; building art deciding gameplay.
