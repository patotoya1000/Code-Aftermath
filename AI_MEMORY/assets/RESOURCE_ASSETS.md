# Resource assets

Registry → `AI_MEMORY/assets/ASSET_INDEX.md`. Domain → `AI_MEMORY/domains/RESOURCE_INDEX.md`.

- Keys: `node_<type>_<visual>` for `tree` and `rock`; visuals `available` (ledger amount > 0) and `depleted` (0). Chosen in `renderProjection`.
- Base-stock items (wood, stone, food, water) have no world sprite and no icon art; the top bar shows text/emoji.
- Files: painted sprites `assets/sprites/nodes/`. Rocks: `rock_<spire|arch|slab>_<full|worn|rubble>.png`, sliced from `assets/source/rocks-sheet.png` by `scripts/slice-node-sprites.py`. Trees: `tree_<green|spring|autumn|winter>_full_<1|2>.png` and the felled tree `tree_cut_<1|2>.png` (shared by every family), made from the raw pictures in `assets/source/trees/` by `scripts/prepare-tree-sprites.py` (white background removed, trimmed, one scale: widest tree = `REF_W.tree` = 256 px; `sizes.json` merged). A tree shows the whole tree while standing (full and worn look the same: no half-chopped art) and `tree_cut` at amount 0; the family comes from `NODE_FAMILIES.tree` (main map = green; pass `{ tree: ['winter'] }` to `createNodeArt` for a season), the look 1/2 from the node id. Stage comes from the projection `amount` vs `capacity` (`nodeStage`). Placeholder drawing until a picture has loaded.
- Forbidden: a node look that disagrees with the ledger; more than three stages (full / worn / gone); a sprite size that changes the node's logical footprint.
