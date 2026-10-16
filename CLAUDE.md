# TowerForge

Companion web app for the mobile game **The Tower** (by Tech Tree Games), live at
https://towerforge.net. Players enter or import their account (workshop, labs, cards,
UWs, modules, bots, relics…) and the site models damage, eHP and coin farming and
suggests what to upgrade next.

## Layout

- `towerforge.client/` — React 19 + TypeScript + Vite, state in Zustand (`src/store/useGameStore.ts`, saved to localStorage under `tc_*` keys).
  - `src/engine/` — calculations and the game-export importer. **Pure functions, no store imports.**
  - `src/constants/` — game data tables (`gameData.ts`, `moduleData.ts`, `botData.ts`) and the export index maps (`gameExportMaps.ts`).
  - `src/components/tabs/` — one component per tab; styles in `tabs.css`, theme tokens in `src/styles/variables.css`.
  - `src/assets/{modules,bots}/` — game icons, looked up by slug in `constants/gameIcons.ts`.
- `TowerForge.Server/` — ASP.NET Core 8 API (accounts, saves, share links). On the server its data lives in `/var/lib/towerforge` (SQLite), outside the deploy folder.
- `docs/game-export-format.md` — field-by-field notes on the game's `tool_export.json` and how each mapping was confirmed. `docs/module-effects.md` — unique module formulas and assumptions.

## Commands

Run from `towerforge.client/` unless noted.

| What | Command |
|---|---|
| Dev server | `npm run dev` |
| Tests | `npm test` (Vitest; `npm run test:watch` to rerun on save) |
| Type-check + build | `npm run build` (`tsc -b` also checks the test files) |
| Lint | `npx eslint <files>` |
| Deploy (repo root) | `powershell -ExecutionPolicy Bypass -File deploy.ps1` — runs the tests first and stops if any fail |
| Import game icons (repo root) | `powershell -ExecutionPolicy Bypass -File import-icons.ps1` — trims, centers and resizes PNGs from `Desktop\Tower-Forge-Assets` |

`npx eslint src` shows older `no-explicit-any` errors in LoginModal, moduleDefinitions,
saveParser, towerAuth and gameTypes (`CloudSaveData`). Lint the files you change instead.

## Rules

- **Commit and push every finished change to GitHub without asking** (owner's standing request): once a change works and the tests pass, commit it with a clear message and push to `main`. Scan the staged files first (see the next rule).
- **Ask before you deploy** to towerforge.net. Approval covers one deploy, not later ones.
- **This repo is public.** Never commit secrets or a player's personal data. Scan staged files before every push.
  - The game's Firebase web key is only in `towerforge.client/.env.local` (`VITE_TOWER_FIREBASE_KEY`, template in `.env.example`). A fresh clone needs it before deploying, or cloud-save login won't work.
  - Commits use the owner's GitHub noreply address (already set in this repo's git config).
- **Never ship or commit a real game export.** Don't copy one into `public/`, tests, fixtures or docs. Tests build a made-up export with `src/test/makeExport.ts`.
- **Before deploying:** check `towerforge.client/public/` for `__test_export*` files and personal data.
- Don't run the Save Tool's login or pull scripts, and don't create accounts on the production site.
- **Game data only goes in when it's confirmed.** Map an export index only after checking it against a real account (or in-game screenshots), and note how in `docs/game-export-format.md`. Anything unconfirmed keeps what the player entered. Wiki values are a starting point; the in-game screen wins.
- When a formula is checked against an in-game number, add that number as a test anchor (see `src/engine/calculations.test.ts`).

## Conventions

- Match the surrounding code: each file opens with a header comment block, and comments explain the game mechanic or why, not what the code does.
- New CSS goes in `tabs.css` with a short prefix per feature (`modg-` modules, `botg-` bots). Colors come from tokens in `variables.css` or the nearby block.
- Every tab must work at phone width (375px) with no sideways scrolling.
- Player-facing text uses the game's own words (stat names, rarities, "preset", "Bot+").

## Checking UI changes

Build (`npm run build`), then start `towerforge-preview` from `.claude/launch.json` (serves `dist/` on port 4174). Put made-up data into localStorage (`tc_profile`, `tc_modules`, `tc_bots`, …), check desktop and phone widths, then remove the test data.

## Environment notes

- Windows: PowerShell 5.1 and Git Bash. For multi-line file edits from the shell, write a Python script to a temp file and run it with `python -I`. Heredocs that pipe into `python3 -` work for short patches.
- Pillow isn't installed. Image work uses PowerShell `System.Drawing` (see `import-icons.ps1`).
