# Legacy debug scripts (not part of the build or the test suite)

One-off probes from early development. They are kept only for reference and may break as the engine evolves.
Run them from the repository root, e.g. `node scripts/legacy-debug/debug-app-run.mjs`.
`tmp-verify.mjs` was removed (2026-11-13): it called the removed turn API (`runTurnCode`).
