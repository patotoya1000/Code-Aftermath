# Building assets

Registry → `AI_MEMORY/assets/ASSET_INDEX.md`. Domain → `AI_MEMORY/domains/BUILDING_INDEX.md`.

- Keys: `building_<type>_lv<level>_<condition>` for `hq`, `fence`, `tent`, `storage`, `gate`; conditions `ruined | damaged | repaired` only (thresholds 0.25 / 0.6 of max health, from definitions). The simulation computes the condition; the key comes from `assetKey` in `src/modules/buildings/index.js`.
- The fence is drawn from its authoritative `bounds` (perimeter cells), leaving the gate cell open (`perimeterCells` in `src/modules/render/index.js`).
- Files: none (placeholder). Visual rules: `docs/game/12-buildings-visual-spec.md`.
- Level-2 keys exist in the manifest for `hq` and `fence` because the definitions list level 2, but nothing upgrades a building yet.
- PLANNED: real art, construction-in-progress looks, upgrades.
- Forbidden: one asset per health percent; building art deciding gameplay.

## Painted art (2026-11-21)

- Files live in `assets/sprites/buildings/`: `<type>_<repaired|damaged|ruined>.png` (one piece per condition, drawn per cell / per footprint) and, for the line wall and the gate, `wall_level<1-5>.png` + `gate_level<1-5>.png` (a whole wall SECTION each, ~340x670, transparent).
- Level pictures are drawn only on a LINE wall (`bounds.shape === 'line'`). `src/modules/assets/wallart.js` lays them out: sections 4 cells tall, the gate section centred on the gate cell (so the door lands on the road), the remaining runs divided into whole sections stretched vertically by < 20 %. A rectangular wall, or a wall whose picture has not loaded, keeps the old per-cell pieces.
- The game defines wall levels 1-2 and gate level 1 only; levels 3-5 (wall) and 2-5 (gate) have pictures but are unreachable until the `buildings` data gets those levels. Preview any level with `?wallLevel=1..5` on the main screen (`renderer.wallArtLevel`).
- There is no damaged / ruined level picture: those conditions draw the same picture darkened (`LEVEL_TINT`), a stand-in until condition art exists.
- The painted gate is taller than its one logical cell; clicking it picks the gate (renderer `gateBoxes`). The logical footprint, pathing and rules are unchanged.

## Towers and mounts (2026-11-22)

- `tower_level_<1-5>.png` (drawn at 190 source px per cell, standing on the tower's cell) and `tower_mount_<ballista|machinegun|minigun|dual_minigun>.png`. `buildingArt.getTower(level, condition)` / `towerState` / `getMount(weaponId)`; a ruined tower still uses `tower_ruined.png`.
- Mount seats, head/base cut and pivot are measured per picture in `src/modules/assets/towerart.js`; replacing a picture means re-measuring `TOWER_SEATS` / `MOUNT_ART` there.
- Mounts turn toward the aim the simulation reports (`mounts[i].aim` in the render projection); the turning is renderer-only state.
