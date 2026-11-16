# CODE: AFTERMATH — AI_MEMORY Project Index

Read this first. It only routes you. **Source code is authoritative**; if a memory file disagrees with the code, inspect the code and fix the memory file (never assume the memory is right).

Active model: **real-time simulation** (continuous ticks, standing actions, learner code only *requests* actions). Obsolete: turns. Read `AI_MEMORY/RULES.md` before changing anything.

## "If I need to change X, read this first"

| Change | Read first | Then |
|---|---|---|
| Survivor / NPC data | `AI_MEMORY/domains/NPC_INDEX.md` | `AI_MEMORY/domains/NEEDS_INDEX.md` |
| Task, queue, action lifecycle, gather/rest/repair | `AI_MEMORY/domains/TASK_INDEX.md` | `AI_MEMORY/systems/SIMULATION_INDEX.md` |
| Learner API / new `survivor.xxx()` command | `AI_MEMORY/systems/API_INDEX.md` | `AI_MEMORY/systems/SANDBOX_INDEX.md`, TASK |
| Needs, hunger/thirst/energy, policies | `AI_MEMORY/domains/NEEDS_INDEX.md` | TASK |
| Resources, nodes, ledger | `AI_MEMORY/domains/RESOURCE_INDEX.md` | INVENTORY |
| Storage, carry, deposit (R3) | `AI_MEMORY/domains/INVENTORY_INDEX.md` | RESOURCE, ITEM, BUILDING |
| Items | `AI_MEMORY/domains/ITEM_INDEX.md` | INVENTORY |
| Buildings, repair | `AI_MEMORY/domains/BUILDING_INDEX.md` | WORLD |
| Map, scenarios | `AI_MEMORY/domains/WORLD_INDEX.md` | |
| Events / payloads | `AI_MEMORY/domains/EVENT_INDEX.md` | |
| Skills, traits, capability | `AI_MEMORY/domains/SKILLS_INDEX.md` | TASK |
| Zombies / combat | `AI_MEMORY/domains/ZOMBIE_INDEX.md`, `AI_MEMORY/domains/COMBAT_INDEX.md` | **Not implemented** — read the Forbidden Changes |
| Tick loop, clock, strategy points | `AI_MEMORY/systems/SIMULATION_INDEX.md` | |
| Learner code safety, Worker | `AI_MEMORY/systems/SANDBOX_INDEX.md` | API |
| Save / load / progress | `AI_MEMORY/systems/SAVELOAD_INDEX.md` | REPLAY |
| Replay / determinism | `AI_MEMORY/systems/REPLAY_INDEX.md` | |
| Renderer, UI, projections | `AI_MEMORY/systems/RENDERER_INDEX.md` | ASSET_INDEX |
| Lessons, validators, curriculum | `AI_MEMORY/systems/LESSON_INDEX.md` | API |
| Sprites / atlas / asset ids | `AI_MEMORY/assets/ASSET_INDEX.md` | `AI_MEMORY/assets/SPRITE_INDEX.md` + the relevant `*_ASSETS.md` |
| Why was it built this way | `AI_MEMORY/DECISIONS.md` | `AI_MEMORY/CHANGELOG.md` |
| What exists / what is missing | `AI_MEMORY/IMPLEMENTATION_STATUS.md` | |
| Which file does what | `AI_MEMORY/FILE_MAP.md` | |
| Execution path & traces (GATHER, REST, …) | `AI_MEMORY/ARCHITECTURE_INDEX.md` | |

## Where future AI work should begin (trace map)

| Area | Start in | Code entry |
|---|---|---|
| NPC | `AI_MEMORY/domains/NPC_INDEX.md` | `src/modules/survivors/index.js` |
| Building | `AI_MEMORY/domains/BUILDING_INDEX.md` | `src/modules/buildings/index.js`, `src/modules/actions/handlers/repair.js` |
| Resource | `AI_MEMORY/domains/RESOURCE_INDEX.md` | `src/modules/resources/ledger.js`, `src/modules/actions/handlers/gather.js` |
| Item | `AI_MEMORY/domains/ITEM_INDEX.md` | `src/modules/definitions/data/items.js` |
| Zombie | `AI_MEMORY/domains/ZOMBIE_INDEX.md` | none (planned) |
| Needs | `AI_MEMORY/domains/NEEDS_INDEX.md` | `src/modules/survivors/index.js`, `src/modules/actions/policies.js` |
| Task | `AI_MEMORY/domains/TASK_INDEX.md` | `src/modules/actions/engine.js` |
| API | `AI_MEMORY/systems/API_INDEX.md` | `src/modules/api/v1.js` |
| Simulation | `AI_MEMORY/systems/SIMULATION_INDEX.md` | `src/modules/simulation/index.js` |
| Renderer | `AI_MEMORY/systems/RENDERER_INDEX.md` | `src/modules/render/index.js` |
| Lesson | `AI_MEMORY/systems/LESSON_INDEX.md` | `src/modules/lessons/checks.js` |
| Asset | `AI_MEMORY/assets/ASSET_INDEX.md` | `src/modules/assets/index.js` |

## Change safety procedure (every change)

1. Identify the affected domain. 2. Read its AI_MEMORY file. 3. Trace dependencies (`AI_MEMORY/ARCHITECTURE_INDEX.md`, `src/architecture.js`). 4. Identify who owns the authoritative state. 5. Identify the tests. 6. Identify UI/projection impact. 7. Identify lessons affected. 8. Make the smallest safe change. 9. Update AI_MEMORY (and `CHANGELOG.md` if architecture moved). 10. Update tests. 11. `npm test` (0 failing). 12. Report what remains.

`tests/invariants.test.js` fails if AI_MEMORY points at a missing file, misses a module or a test file, or a domain/system file lacks a template section.
