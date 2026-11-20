# Resource assets

Registry → `AI_MEMORY/assets/ASSET_INDEX.md`. Domain → `AI_MEMORY/domains/RESOURCE_INDEX.md`.

- Keys: `node_<type>_<visual>` for `tree` and `rock`; visuals `available` (ledger amount > 0) and `depleted` (0). Chosen in `renderProjection`.
- Base-stock items (wood, stone, food, water) have no world sprite and no icon art; the top bar shows text/emoji.
- Files: painted sprites `assets/sprites/nodes/<type>_<family>_<stage>.png` (transparent PNG; trees: green/dead/autumn × full/worn/stump; rocks: spire/arch/slab × full/worn/rubble), sliced from `assets/source/*-sheet.png` by `scripts/slice-node-sprites.py`. Stage comes from the projection `amount` vs `capacity` (`nodeStage`: gone at 0, worn below half); family is picked from the node id. Placeholder atlas still draws until a sprite has loaded or if it is missing. PLANNED: item icons (`item.*` ids), carried-load overlay with R3.
- Forbidden: a node look that disagrees with the ledger; more than three stages (full / worn / gone); a sprite size that changes the node's logical footprint.
