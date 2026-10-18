# TowerForge

Companion web app for the mobile game **The Tower** (by Tech Tree Games), live at
https://towerforge.net. Players enter or import their account (workshop, labs, cards,
UWs, modules, bots, relics…) and the site models damage, eHP and coin farming and
suggests what to upgrade next.

## Layout

- `towerforge.client/` — React 19 + TypeScript + Vite, state in Zustand (`src/store/useGameStore.ts`, saved to localStorage under `tc_*` keys).
  - `src/engine/` — calculations and the game-export importer. **Pure functions, no store imports.**
  - `src/constants/` — game data tables (`gameData.ts`, `moduleData.ts`, `botData.ts`), the export index maps (`gameExportMaps.ts`), and the Creator Codes list (`creatorCodes.ts` — add a creator's link only when it's confirmed as theirs). `workshopCosts.ts` and `labCosts.ts` are generated from TheTowerSDK — don't edit them by hand.
  - `src/components/tabs/` — one component per tab; styles in `tabs.css`, theme tokens in `src/styles/variables.css`.
  - `src/assets/{modules,bots}/` — game icons, looked up by slug in `constants/gameIcons.ts`.
- `TowerForge.Server/` — ASP.NET Core 8 API (accounts, saves, share links). On the server its data lives in `/var/lib/towerforge` (SQLite), outside the deploy folder.
- `docs/game-export-format.md` — field-by-field notes on the game's `tool_export.json` and how each mapping was confirmed. `docs/module-effects.md` — unique module formulas and assumptions.
- `docs/analytics.md` — Umami visitor analytics (self-hosted on the VPS at /analytics): what's tracked, where it runs, how to open the dashboard and update it. Setup scripts in `ops/umami/`.
- `docs/ultimate-weapons.md` — every UW and UW+ mechanic checked against the wiki (values, costs, labs, perks) and how the model uses it. `docs/optimizer.md` — how each build scores upgrades, calibration from battle reports, and the verified stone rules (card mastery, assist modules, primary module labs).
- `docs/run-simulation.md` — research for the planned run simulator: enemy scaling, spawning, elites/fleets, battle conditions, level skip, in-run cash/perks/free upgrades, survival, what battle reports hold, the gaps, and the disagreements between sources. TheTowerSDK (MIT, npm `thetowersdk`) is the main formula source.

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
| Creator profile pictures | `npm run creator-avatars` — downloads each YouTube-linked creator's picture into `src/assets/creators/`; run after adding a YouTube link to `creatorCodes.ts` (a test fails until you do) |
| Workshop and lab cost tables | `npm run upgrade-costs -- <unpacked thetowersdk package>` — rewrites `workshopCosts.ts` and `labCosts.ts` (steps in the script header) |

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
- **Write down what you verify.** Game mechanics checked against the wiki or the game go in `docs/ultimate-weapons.md` / `docs/optimizer.md` / `docs/run-simulation.md` (with the source), so they don't have to be looked up again. Say when something is the code's assumption rather than verified.
- Reading the wiki: Fandom (`the-tower-idle-tower-defense.fandom.com`) blocks plain fetches and Notion (`the-tower.notion.site`) renders client-side — read both in the browser; on a fandom tab, `fetch('/wiki/<Name>')` + `DOMParser` reads any page's tables.

## Conventions

- Match the surrounding code: each file opens with a header comment block, and comments explain the game mechanic or why, not what the code does.
- New CSS goes in `tabs.css` with a short prefix per feature (`modg-` modules, `botg-` bots). Colors come from tokens in `variables.css` or the nearby block.
- Every tab must work at phone width (375px) with no sideways scrolling.
- Player-facing text uses the game's own words (stat names, rarities, "preset", "Bot+").
- The site's version lives only in `towerforge.client/package.json` (`npm version <x.y.z> --no-git-tag-version`); Vite injects it as `__APP_VERSION__` for the header. Tag releases `vX.Y.Z` in git.

## Checking UI changes

Build (`npm run build`), then start `towerforge-preview` from `.claude/launch.json` (serves `dist/` on port 4174). Put made-up data into localStorage (`tc_profile`, `tc_modules`, `tc_bots`, …), check desktop and phone widths, then remove the test data.

## Environment notes

- Windows: PowerShell 5.1 and Git Bash. For multi-line file edits from the shell, write a Python script to a temp file and run it with `python -I`. Heredocs that pipe into `python3 -` work for short patches.
- Pillow isn't installed. Image work uses PowerShell `System.Drawing` (see `import-icons.ps1`).
