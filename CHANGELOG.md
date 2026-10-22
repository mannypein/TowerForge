# Changelog

Every deploy to towerforge.net gets its own version (shown in the site
header, from `towerforge.client/package.json`). New features bump the middle
number, fixes only the last. `deploy.ps1` does the bump, and on success
commits it as "Release vX.Y.Z" and tags it — `.\deploy.ps1` for features,
`.\deploy.ps1 -Bump patch` for fixes.

Versions 1.1.0–1.18.0 were assigned on 2026-10-19 from the deploy times in
the server's service log (one backend restart per deploy) and the commits
each deploy shipped; the site said v1.0.0 until then. Times are US Eastern.

| Version | Deployed | What changed |
|---|---|---|
| 1.26.0 | 2026-10-22 15:35 | **Themes**: a 🎨 Theme button in the header with eight color themes (Synthwave, Neon Mint, Ember, Acid, Crimson, Ultraviolet, Stealth, Royal Gold), remembered per browser; Modules, Bots and share cards follow the theme. Glowing logo, tabs and buttons. **Easier to read**: clearer fonts (Exo 2, JetBrains Mono for numbers), nothing tiny, brighter secondary text. Phones: the sections sit in two rows; long table lines wrap. |
| 1.25.0 | 2026-10-22 13:20 | **Modules** like the game's screen: your module currencies (Reroll Shards and each type's shards, imported) and **Inventory / Assist** tabs — Assist shows each assist slot's tier, Main and Substat efficiency (stones and lab), and what the next upgrades cost. Shared module cards show each assist's tier and efficiencies. |
| 1.24.1 | 2026-10-22 11:24 | Fixes in Bots: each preset unlocks its own bots, like in game (a bot locked in a preset doesn't count there); Bot Bot's Bonus (×2.00 at Lv 19) and Range tables match the game; bot range adds the Vault's Bot Range. |
| 1.24.0 | 2026-10-22 10:40 | **Relics come with Import Game Data**: every relic you own, added up into the Relics tab's bonus totals (checked against the game's ⓘ screen). Optimizer **Filter**: untick workshop stats you keep low on purpose (like Range on an orb build) and the coin rankings leave them out. |
| 1.23.0 | 2026-10-22 10:01 | Waves count your **orbs and Death Ray** against the Tanks and Ranged that end runs: slowing enemies (CF, CF+, Slow Aura) lets them stop more of those before they reach the tower. What If shows it as its own line. |
| 1.22.0 | 2026-10-21 16:05 | **Tournaments** section: This Week (the Tournament page) and **History** — every tournament you've played (29.1.3 exports), waves and rank over time by league, league moves, per-league numbers. **Auto import**: keeps the site in step with the game's Auto export through TowerForge Link (Link 0.2). Labs being researched: the level, card mastery labs by name, and the real finish with the speed-up. "Stones", like the game. Ask AI (preview): your runs, another tier, cheapest picks, tournament history. |
| 1.21.0 | 2026-10-21 11:55 | **Ask AI** (preview, owner's account only): ask about your account in plain words — an open model (Qwen3) runs in your browser on the graphics card, downloaded once, and answers from the site's own numbers (Optimizer, What If, Tournament, game notes). Preview tabs show only for accounts the server lists. |
| 1.20.2 | 2026-10-21 11:09 | Fast's Ultimate in the game's words, and counted: slow enemies that end runs (Overcharge, bosses, tanks…) come in at Fast speed most of the time, so they take less damage on the way in. |
| 1.20.1 | 2026-10-20 14:58 | Fixes in What If: "Waves gained" is the unrounded gain (it matches each change and the chain); UW+ levels go to the top level (Chrono Loop 0.65); a tournament run that reaches a step in the battle conditions stops there instead of showing a loss; the chain shows stronger conditions further into the run as one line; Campaign mode always uses a campaign run. |
| 1.20.0 | 2026-10-20 14:28 | **Tournaments**: every battle condition counted — Enemy Speed, Armored Enemies, More Enemies, Orb / Death Ray Resistance, Tank's and Basic's Ultimate in waves; Death Defy Down and Energy Shields Down as killing hits survived; the rest say why a Glass Cannon run doesn't feel them. Each tournament's conditions ticked once and kept, with how runs went with and without each. The build used for tournaments. **What If: Tournament mode** (tournament build, this week's conditions). Fixes: settling where a run ends; Guardian edits now sync to accounts. |
| 1.19.0 | 2026-10-20 09:35 | **Guardian**: chips, presets and skins (imported), Scout and Attack in damage and run length, Bounty/Summon/Fetch in coins, a Bits panel. Ready for the game's 29.1.3 export (bots per preset, labs being researched, current league). Bot+ for v29 (new levels, imported). Every tab has its own address (towerforge.net/creators…). Shared stats: Bots and Modules in the tabs' look, every section fits a phone. Fix: damage scores without Chain Lightning. |
| 1.18.0 | 2026-10-19 14:19 | **Get from emulator**: TowerForge Link, a small Windows helper that reads the game's data export off BlueStacks (and other emulators) — no hunting for the file. Notes from an end-of-push recording (docs). |
| 1.17.0 | 2026-10-18 22:53 | Tournament battle conditions grow with the wave (heat), each league's fixed conditions; skip counts for less in tournaments. |
| 1.16.0 | 2026-10-18 22:18 | Tournament page: best module loadout for tournament waves, this week's battle conditions. |
| 1.15.1 | 2026-10-18 20:39 | Fix: waves measured against the runs that match the chosen Battle Report (tournament vs campaign). |
| 1.15.0 | 2026-10-18 16:36 | What If: waves per change and per link, run-to-run spread, multishot/bounce/rapid fire; every damage source, run saver and drop read from battle history. |
| 1.14.0 | 2026-10-18 15:55 | What If: time in range for every source, coins follow the longer run, "how it adds up" chain. |
| 1.13.0 | 2026-10-18 15:20 | Enemy health labs scored for pushing, by which enemies end your runs. |
| 1.12.0 | 2026-10-18 11:24 | Optimizer goals and every currency; What If page; workshop and labs ranked by waves. |
| 1.11.0 | 2026-10-18 10:27 | Enemy Health Level Skip upgrades in the waves ranking. |
| 1.10.0 | 2026-10-18 10:19 | Rank Glass Cannon upgrades by waves and coins per run. |
| 1.9.0 | 2026-10-18 10:09 | Run Length (run simulator step 2, Glass Cannon). |
| 1.8.0 | 2026-10-17 23:06 | Coins per Run (run simulator step 1). |
| 1.7.0 | 2026-10-17 22:38 | Enemy Stats page (the in-game Wave Info panel). |
| 1.6.0 | 2026-10-17 22:16 | Battle history kept across imports; the game's full number notation. |
| 1.5.0 | 2026-10-17 15:18 | Creator Codes: names, "known for" and more links. |
| 1.4.0 | 2026-10-17 13:40 | Creator Codes tab, with YouTube profile pictures. |
| 1.3.0 | 2026-10-17 12:56 | Tabs grouped into five sections so the menu fits a phone. |
| 1.2.1 | 2026-10-17 09:39 | Fix: Tier / Wave milestones checked against the exact best wave. |
| 1.2.0 | 2026-10-16 16:57 | Import game data from a PDF. |
| 1.1.0 | 2026-10-16 14:20 | Self-hosted visitor analytics (Umami). |
| 1.0.0 | 2026-10-16 13:38 | First release. |
