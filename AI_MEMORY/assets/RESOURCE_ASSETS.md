# Resource assets

Registry → `AI_MEMORY/assets/ASSET_INDEX.md`. Domain → `AI_MEMORY/domains/RESOURCE_INDEX.md`.

- Keys: `node_<type>_<visual>` for `tree` and `rock`; visuals `available` (ledger amount > 0) and `depleted` (0). Chosen in `renderProjection`.
- Base-stock items (wood, stone, food, water) have no world sprite and no icon art; the top bar shows text/emoji.
- Files: none (placeholder). PLANNED: item icons (`item.*` ids), carried-load overlay with R3, partial-depletion looks.
- Forbidden: a node look that disagrees with the ledger; per-amount sprites.
