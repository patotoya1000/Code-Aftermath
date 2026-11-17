<!-- AI_MEMORY: navigation only. Source code is authoritative; if this file disagrees with it, fix this file. -->

> Codebook (player-facing API/variable manual) and its UI

# Purpose

Let the learner look up what they can control (commands), what they can read (variables), what a command needs and why a job stopped, without a second hand-written command list. The Codebook is a VIEW generated from the Game API (`docs/game/19-codebook-and-ui-display.md`).

# Responsibilities

- `describeCodebook()` joins `COMMANDS` + `READ_SURFACE` (authoritative, `src/modules/api/v1.js`) with curated teaching metadata (`src/modules/api/codebook-data.js`) into sections → groups → entries (kinds: command, read, concept, term). Deep-frozen.
- `searchCodebook(book, query)`: all words must match; title/name/keywords weigh more. `findEntry`, `entryForCommand`.
- UI (`src/app/ui/codebook.js`): pure HTML-string renderers (`renderCompactList`, `renderNav`, `renderEntry`); `src/app/mainscreen.js` owns panel state (BOOK button, Alt+B, search, insert example, rejected-command chips open their entry).
- Drift guards in `tests/codebook.test.js`: COMMAND_BOOK ⇔ COMMANDS, every READ_SURFACE line covered once, examples run through the real sandbox, outcome codes exist in the action engine, links resolve.

# Does NOT Own

- The API itself (signature, doc, validation) → `AI_MEMORY/systems/API_INDEX.md`.
- Live state (Inspector shows it; the Codebook explains operations).
- Gameplay numbers, lesson checks, the AI tutor.

# Core Data

- `COMMAND_BOOK[name]`: group, effect, requires, parameters, example, reads (`read.*` ids), outcomes (codes), notes. `READS[]`: one per READ_SURFACE line (`covers` = join key). `CONCEPTS[]`, `OUTCOMES{code: meaning}`.
- Entry ids: `command.<name>`, `read.<slug>`, `concept.<slug>`, `term.<CODE>`.

# State

None in the module. UI state: open/closed, current entry id, search text (in `mainscreen.js`).

# Commands / API

None for learners. App surface: `app.codebook`, `app.searchCodebook(q)`, `app.entryForCommand(name)`.

# Events

None.

# Dependencies

`src/modules/api/codebook.js` imports only the kernel and `api/v1.js`. UI imports nothing but data passed in.

# Dependents

`src/app/index.js`, `src/app/mainscreen.js`.

# Source Files

- `src/modules/api/codebook.js`
- `src/modules/api/codebook-data.js`
- `src/app/ui/codebook.js`

# UI Files

`index.html` (`btn-book`, `codebook-panel`, `code-api-search`), `src/app/mainscreen.css` (Codebook block at the end)

# Asset Files

None (text and emoji only).

# Tests

- `tests/codebook.test.js`
- `tests/ui-wiring.test.js` (Codebook flow)

# Current Status

UI-1 IMPLEMENTED (2026-11-17): BOOK panel, search, compact API list, insert example, rejected chip → entry. One-column layout under 800px. PLANNED: UI-2 live inspection, UI-3 contextual help (selected survivor → commands, tutor links), UI-4 lesson links, UI-5 mobile tabs, UI-6 polish.

# Known Problems

- Curated text in `codebook-data.js` can go stale in meaning (tests catch structure, not prose). Update it with each new command/read/stop reason.
- Concepts are short; no step-by-step lessons here (lessons own that).

# Planned Changes

New commands/reads must come with Codebook metadata (tests fail otherwise). Optional later: live values (current stock) shown beside read entries from the projection only.

# Forbidden Changes

- Do not add a second command list or hand-copied signatures for the UI; derive from `COMMANDS`.
- Do not expose or document commands that write state; the Codebook teaches "read, then request".
- Do not let the Codebook UI mutate state, parse learner code or compute gameplay numbers.
- Do not move teaching text into the simulation modules.

# Related Documentation

- `docs/game/19-codebook-and-ui-display.md`
- `AI_MEMORY/systems/API_INDEX.md`
- `AI_MEMORY/systems/RENDERER_INDEX.md`
