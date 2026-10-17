# The Tower — Game Data Export (`tool_export.json`)

Reference for the official data export from The Tower (TTG), as read by
TowerForge's **Import Game Data** button (`towerforge.client/src/engine/gameExport.ts`).
Written from a fresh test account (game version 1245, `DataVersion` 30), so almost
every value was 0. Anything marked 🔜 or ❓ needs a real, played account to confirm.

**Status key**

| | Meaning |
|---|---|
| ✅ | Imported now |
| 🔜 | Usable — the field is clear, but which array position is which stat must be confirmed with a real export before it can overwrite what players entered |
| 📊 | Lifetime/record stat — readable, not used by the site yet |
| ⚪ | Not needed by the site (settings, cosmetics) |
| ❓ | Not sure what it is or how to read it — question for the player |

Arrays of 0/false values in the test file can't reveal their order, so "index = …"
notes below are the expected layout, not yet verified.

---

## The file's format, and PDFs

The export is pretty-printed JSON: ~29,000 lines, none longer than ~63
characters (a real account, 600 KB). Some players end up with it as a **PDF**
(their phone printed it or "saved as PDF"). Import accepts PDFs too
(`engine/pdfImport.ts`), after a warning that it might not work:

- pdf.js (loaded only for PDFs) reads the text one line at a time;
- headers / footers printing adds to every page (date, file path + "3/448",
  Chrome's "Pretty-print" label) are dropped: lines near a page's top or
  bottom that aren't a JSON line and start the same way at the same height on
  at least half the pages — a real JSON line is never dropped;
- the lines are joined and parsed; if that fails (a line wrapped mid-value),
  they're joined without breaks and parsed again.

Checked on Chrome's and Edge's "Save as PDF" of a full real export (448 pages,
with and without headers): identical data back, in ~0.5–0.8 s. A minified copy
printed with wrapped lines also imports; the only loss was spaces where a line
wrapped ("Preset 1" → "Preset1", treated as a default name). A file named
`.json` that's really a PDF is detected by its `%PDF` start.

---

## File info

| Field | Status | Notes |
|---|---|---|
| `VersionNumber` | ✅ | Game build (1245). Kept with the import. |
| `DataVersion` | ✅ | Save-format version (30). If this changes, the layout may have changed. |
| `PlayTime` | 📊 | Total play time in seconds (63 on the test account). |
| `GameStartedDate` | 📊 | Account creation date (UTC). |

## Currencies

| Field | Status | Notes |
|---|---|---|
| `Coins`, `Gems`, `Stones`, `Medals`, `Cells`, `Keys`, `Tokens`, `Bits` | ✅ | Shown and editable in the currency bar. |
| `ModuleCannonShards`, `ModuleArmorShards`, `ModuleGeneratorShards`, `ModuleCoreShards` | 📊 | Module shards — easy to add to the bar if wanted. |
| `ModuleRerollCurrency`, `ModuleTickets` | 📊 | Reroll shards and module tickets. |
| `CurrencyEarnedThisCycle`, `CurrencySpentThisCycle` | ❓ | `{ Currencies: { coin, gem, … } }` totals "this cycle" — what is a cycle (tournament season? event?). |

## Tier progress

| Field | Status | Notes |
|---|---|---|
| `CurrentTier` | 📊 | Tier currently selected. |
| `HighestWaveThisTier[40]` | ✅ | Highest wave per tier; **index = tier number** (index 0 unused). Fills the Tiers tab, highest tier unlocked and highest tier completed. |
| `RoundsStartedThisTier[40]` | ✅ | Runs started per tier (used to find the highest tier played). |
| `HighestCoinsEarnedThisTier[40]`, `HighestCellsEarnedThisTier[40]` | 📊 | Best coins/cells in a run, per tier. |
| `HighestWavePerTierThisCycle[40]` | ❓ | Highest wave per tier "this cycle". |
| `HighestLeague` | ✅ | Highest tournament league reached: 0 Copper, 1 Silver, 2 Gold, 3 Platinum, 4 Champion, 5 Legend, 6 Mythic (confirmed: a Mythic player has 6). Sets the profile league. |

- **Highest tier unlocked** = the highest tier played (wave > 0 or a run
  started), or one past the highest completed tier, up to Tier 24.
- **Highest tier completed** = the highest tier whose best wave unlocks the
  next: wave 100, or wave 300 from Tier 15 (Tiers 16–24 need 300 on the tier
  before — Fandom "Tiers" page). A real account (best waves T1 7,827 … T22 528,
  T23 197) imports as unlocked 23, completed 22.
- Labs, cards and assist slots unlock at "Tier X, Wave Y" milestones; the
  site checks them against the best wave on that tier (`milestoneReached` in
  `engine/statHelpers.ts`), since completing a tier doesn't mean its later
  milestones are reached (e.g. Extra Black Hole needs Tier 5 wave 500).

## Workshop

| Field | Status | Notes |
|---|---|---|
| `UpgradeWorkshopLevel[20]`, `UpgradeWorkshopDefenseLevel[20]`, `UpgradeWorkshopUtilityLevel[20]` | ✅ | Workshop levels of the loaded workshop preset, same order as the site's `WS_STATS` (17/18/13 used of 20). Confirmed on a real account: every maxed stat sits exactly at its max. Read for the loaded preset in case it has unsaved changes. |
| `PresetUpgradeWorkshopLevel[100]` (+ Defense, Utility) | ✅ | 5 workshop presets × 20 stats. Site preset i ← the workshop preset of `GlobalPresets[i]`. |
| `CurrentWorkshopPreset`, `WorkshopPresetName[5]` | ✅ | Loaded workshop preset (used). Any upgrades in workshop presets 3–5 set the profile to 5 presets; any Wall Health sets Wall Unlocked. Preset names: site preset i takes its global preset's name if the player set one, else that preset's workshop name; repeats stay on the default. |
| `UpgradeTierUnlocked[20]` (+ Defense, Utility), `Upgrade…TierEverUnlocked[20]` | ❓ | Probably which workshop stats are unlocked (bought). |
| `UpgradeLevel[20]`, `UpgradeDefenseLevel[20]`, `UpgradeUtilityLevel[20]` | ❓ | Probably the in-run (cash) upgrade levels of the current/last run. |
| `AttackBuyMultiplier`, `DefenseBuyMultiplier`, `UtilityBuyMultiplier`, `WorkshopBuyMultiplier`, `EnhancementBuyMultiplier` | ⚪ | Buy ×1/×10/max settings. |

## Enhancements

| Field | Status | Notes |
|---|---|---|
| `EnhancementLevel[20]`, `EnhancementDefenseLevel[20]`, `EnhancementUtilityLevel[20]` | ✅ | Enhancement levels in the wiki's order — attack: Damage, Rend Armor, Critical Factor, Damage/Meter, Super Crit Mult, Attack Speed; defense: Health, Health Regen, Wall Health, Land Mine Damage, Defense Absolute, Orb Size; utility: same as the site. Remapped by `ENH_GAME_ORDER`. |
| `EnhancementTierUnlocked[20]` (+ Defense, Utility) | ✅ | `[k]` = the game's enhancement k + 1 is bought (the first one is free). |
| `PresetEnhancementLevel[100]` (+ Defense, Utility) | ✅ | Enhancement levels are per workshop preset (5 × 20). Stored per site preset in `enhData.p`. |

## Labs

| Field | Status | Notes |
|---|---|---|
| `ResearchLevel[260]` | ✅ | Level of every lab by the game's lab number (in-game screens show the *next* level, so the file holds one less). Numbers come in blocks; labs added later got numbers further down, so the on-screen order only holds within a block. Mapped in `GAME_LABS` / `GAME_LAB_GROUPS` (constants/gameExportMaps.ts) and confirmed against a real account's in-game screens for every research category. Labs with equal levels were told apart by `ResearchPercentComplete` (a green timer in game = partial progress). Two groups share numbers in an unknown order and import only when all members agree: 132/133/150/151 (Reroll Daily Missions, Workshop Enhancement, Light Speed Shots, Unmerge Module) and 134/193/199 (Common Drop Chance, Garlic Thorns, Battle Condition Reduction). 160–189 are the card mastery labs (see Cards). 242 = Overcharge Enemy Health, 252 = Global Presets. Numbers still unknown (level 0 on that account): ILM Chrono Jump, Enhancement Defense Discount, the battle-condition resistances, Ray/Vampire/Scatter and the other new enemy labs, Cells / Area of Effect mastery labs. |
| `ResearchPercentComplete[260]` | 📊 | Progress of labs currently researching. |
| Primary module efficiency labs | 🔜 | One per module type (Cannon, Armor, Generator, Core), unlocked at T23 W500, +1% primary-module efficiency per level (100% → 130%). Added to the site as `Primary-<Type> Mult`; their lab numbers aren't known yet, so the import keeps what the player enters. Probably at the end of `ResearchLevel` once an account has them. |
| `ResearchesComplete`, `TotalCoinsSpentOnResearch` | 📊 | Lifetime lab stats. |
| `LabsUnlocked`, `LabLevel[5]`, `CompletedLabs[]` | ❓ | Possibly lab slots (5) and their state. |

## Cards

| Field | Status | Notes |
|---|---|---|
| `CardLevel[40]` | ✅ | Star level by the game's card number (`GAME_CARDS`). Confirmed on a real account: its 13 green-star (mastered) cards and 21 equipped cards match `CardMasteryUnlocked` / `CardActive` exactly. The in-game inventory sorts by rarity, then card number. Cells = 37; Area of Effect is one of 35/36/38/39 (unconfirmed). Unowned numbers read 1. |
| `CardCount[40]` | ⚪ | Copies owned toward the next star. |
| `CardUnlocked[40]`, `CardMasteryUnlocked[40]` | ✅ | Owned / mastery unlocked. Mastery level is the card's mastery lab: `ResearchLevel[160 + k]` for the k-th of the original 30 cards in card-number order (Cells' lab isn't in that run). |
| `CardActive[40]` | ✅ | Equipped right now — used for the loaded card preset. |
| `SlotsUnlocked` | ✅ | Card slots. |
| `SlotPresetCardInt[140]`, `SlotPresetCardAssignedBool[140]` | ✅ | 5 card presets × 28 slots → card number in each slot. Site preset i ← the card preset of `GlobalPresets[i]`. |
| `CurrentPreset`, `PresetName[5]` | ✅ / ⚪ | Loaded card preset (used). Card preset names aren't used — the site's presets are named after the workshop presets. |
| `BattleStartSlotCardInt[140]`, `BattleStartSlotCardAssignedBool[140]` | ❓ | Cards at the start of the current battle? |
| `CardsBoughtTotal` | 📊 | |

## Ultimate Weapons

| Field | Status | Notes |
|---|---|---|
| `UltimateWeaponsSystemUnlocked` | 🔜 | |
| `UltimateWeaponUnlocked[9]` | ✅ | Order CL, SM, DW, CF, ILM, GT, PS, BH, SL (same as the site). |
| `UltimateWeaponLevel[27]` | ✅ | Grouped by UW (CL×3, SM×3, …), stats in the site's order, 0-based (site level = game + 1). Confirmed: CL Quantity, CF Slow/Cooldown, GT Cooldown, BH Cooldown and SL Quantity land exactly on their max. |
| `UltimateWeaponSelectedLevel[27]` | ❓ | The level chosen to use, if lower than owned? |
| `UltimateWeaponPlusUnlocked[9]`, `UltimateWeaponPlusLevel[9]` | ✅ | UW+ owned and level (0-based, same as the site). |
| `UltimateWeaponOn[9]`, `UltimateWeaponPlusOn[9]` | ⚪ | On/off toggles. |
| `UltimateWeaponUnlockedIndex` | ❓ | −1 on the test account. |

## Perks

| Field | Status | Notes |
|---|---|---|
| `BannedPerksIndex[8]` | ✅ / 🔜 | Banned perks by perk number in ban order (−1 = empty slot), mapped by `GAME_PERKS`. 0–14 standard, 20–28 UW, 40–49 trade-off. Confirmed from in-game Ban Perks and Auto Pick screens: 3 = All Coin Bonuses, 5 = Interest, 10 = Perk Wave Requirement, 12 = Max Game Speed, 14 = Defense Absolute; 21 PS, 24 GT, 25 CL, 27 BH, 28 SL; 40, 41, 43, 49. UW and trade-off perks follow the wiki's order at every confirmed number, so the rest of those groups use it. Standard perks don't follow the wiki, so the other standard numbers stay unmapped (bans on those keep what the player entered) until the rest of the Auto Pick list is seen. |
| `FirstPerkIndex`, `FirstTradeOffPerkIndex` | ⚪ | First-perk choices (10 = Perk Wave Requirement, confirmed). |
| `AutoPickPerk`, `AutoPickOrder[34]` | ⚪ | Auto-pick setting and ranking — same order as the in-game Auto Pick list (used to confirm perk numbers). |
| `PerkLevel[50]`, `PerksPickedCount` | ❓ | Perks picked in the current run? |

## Bots

| Field | Status | Notes |
|---|---|---|
| `BotsUnlocked[4]`, `BotsActive[4]`, `BotsLevel[16]` | ⚪ | Old bot system — all empty on a real account that owns Golden Bot and Bot Bot. The current bot data (per-bot `…BotPresets` in the full save) isn't in the export, so bots can't be imported. |
| `CurrentBotPreset`, `BotsUnlockedPresets[12]`, `BotsActivePresets[12]`, `BotsLevelPresets[48]` | ⚪ | Old bot presets — empty. |
| `SynchronicityUnlocked`, `SynchronicityLevel`, `SynchronicityBots[5]` | ❓ | Is this Bot+ / Bot Bot? |

## Modules

Confirmed against 27 real module cards (all the uniques on one account, including 4 primary and 4 assist): every effect, rarity, main ×value and assist-scaled value matches. Tables: `GAME_MODULES`, `GAME_MODULE_RARITY`, `GAME_MODULE_EFFECT_ORDER` (constants/gameExportMaps.ts).

| Field | Status | Notes |
|---|---|---|
| `ModuleInventory[]` | ✅ | Every module not equipped: `{Guid, InfoIndex, CurrentRarity, Level (0 — levels live on slots), MaxLevelReached, Effects[8], EffectLocked[8] (reroll locks), …}`. |
| `InfoIndex` | ✅ | Which module it is — the same number for every player (see *Identifying modules* below). Blocks of 10 per type (cannon 1–10, armor 11–20, generator 21–30, core 31–40): 3–6 are the generic modules (no unique effect — skipped), 7–10 the original uniques, then newer uniques in waves from 41. All 27 uniques seen are named; 49 and 52 haven't appeared yet. |
| `CurrentRarity` | ✅ | 10 = Ancestral (max Lv 200), 11–15 = Ancestral ★1–★5 (max 220–300); below that the wiki's order (2 Rare … 9 Mythic+). |
| `Effects[8]` | ✅ / 🔜 | Effect codes count up from 1 through every (effect, rarity) pair: cannon 1–80, armor 81–154, generator 155–216, core 217–326 — workshop order for cannon/armor/generator, UW order (CL, SM, DW, CF, ILM, GT, PS, BH, SL) for core, one code per rarity the effect can roll. Effects added later are appended: Max Recovery Epic = 328 (327 unconfirmed). Generator 197–204 = Interest/Wave (Epic 197, confirmed) then Recovery Amount. Still unconfirmed: core 297–304 (Poison Swamp Duration / Cooldown). Every slot is pre-rolled (6 for Legendary/Ancestral, 7 at ★1, 8 at ★5); slots 4, 5, 6 and 8 unlock at levels 101, 141, 161 and 241 by `MaxLevelReached`, the rest are always shown. Code 300 shows up only in still-locked slots. |
| `ModuleEquipped[4]` | ✅ | Primary modules: cannon, armor, generator, core. |
| `AssistModuleSlots[4]` | ✅ | Per `Type` (0–3): `Unlocked`, `EquippedModule`, `Level` (assist slot level), `UniqueEffectEfficiencyLevel` (0 Epic … 3 Ancestral), `MainEffectEfficiencyLevel`, `SubstatEfficiencyLevel`. Efficiency % = 1 + stone level + the Assist Module lab (e.g. cannon substats 1 + 7 + 9 = 17%). |
| `SlotLevels[4]` | ✅ | Primary slot levels. A module can't exceed its rarity's max level (Ancestral at a Lv 202 slot shows 200/200). |
| `ModulePresets[5]`, `CurrentModulePreset` | ✅ | `PresetName`, `PrimaryModuleGuids[4]`, `AssistModuleGuids[4]`. Imported as loadouts, the equipped set first (the calculators read loadout 0). |
| `SlotCoinsSpent[4]`, `SlotShardsSpent[4]`, `Module…Shards`, `Module…Lifetime`, `TotalGemsSpentOnModules`, `Common/Rare/EpicModulesObtained`, `TotalModulesShattered`, `TotalMergesDone` | 📊 | |

Main effect: ×value = base[rarity] + Σ level gains × (1 + 4% per Ancestral star). Checked: Ancestral armor L200 ×16.24; ★5 cannon L217 ×23.37, generator L216 ×2.476, core L216 ×29.86. Assist main = 1 + (×value at the assist level − 1) × Mult Efficiency.

### Identifying modules

- **InfoIndex** says *which* module it is. It's the same number for every player, so it's what the import maps (`GAME_MODULES`).
- **Guid** identifies one particular copy. It's random and different for every player; it's only used to link presets and equipped slots to that copy.

**How each one was identified:** a module card lists its effects top to bottom in slot order, and that matches the decoded `Effects[]` codes slot by slot. With 6–8 effects per card (rarity and effect each), a match is unambiguous. The effect-code range also gives the type, and the card's unique-effect text matches the wiki's value for that rarity.

| InfoIndex | Module | Type | Guid on the tested account |
|---|---|---|---|
| 7 | Havoc Bringer | Cannon | 7fea6381-a855-4838-b927-d4e08c036d07 |
| 8 | Death Penalty | Cannon | 4315591e-d9cc-4964-98c6-04fbed42ddfb |
| 9 | Being Annihilator | Cannon | 1ca25429-7951-49a6-8ec0-90d530996c31 (assist) |
| 10 | Astral Deliverance | Cannon | 3b7bedd1-91f3-45c8-85f3-e7f9b7a9fe5c |
| 41 | Shrink Ray | Cannon | a6acf5d1-b9ee-4866-84ed-ce1a5839e18c |
| 45 | Amplifying Strike | Cannon | 9b1e4822-beef-4711-96ba-2c39f58541b3 (primary) |
| 51 | Gilded Sniper | Cannon | b07331e5-7c1b-4537-bae6-dea1d0b3d766 |
| 17 | Wormhole Redirector | Armor | 03bdb4fd-51c9-4edf-be40-df4cf1948478 |
| 18 | Negative Mass Projector | Armor | 28841fd9-99a3-4202-abf5-05d11cfbc93c |
| 19 | Space Displacer | Armor | 36bcb245-846a-4ad0-90e6-8a437427dce8 (assist) |
| 20 | Anti-Cube Portal | Armor | 7aa42217-4300-4861-be25-2c7cbc026d0a |
| 42 | Sharp Fortitude | Armor | 64828fe9-a734-4b7d-8492-3512f601493a |
| 46 | Orbital Augment | Armor | 9ec9f0fd-c9b4-4b20-b65b-6fc7a10531ca |
| 50 | Sentry Protocol | Armor | 6e2f3f67-e04a-40ee-9fc3-0b4d3d71b964 (primary) |
| 27 | Black Hole Digestor | Generator | a0f73479-9719-4b97-b747-a13fa74ae358 (primary) |
| 28 | Pulsar Harvester | Generator | 054bd74f-0e94-49b8-818d-2bff97eeed7c |
| 29 | Galaxy Compressor | Generator | d3763816-c739-4d3c-9274-6260ffe985d5 (assist) |
| 30 | Singularity Harness | Generator | 4d5fe55d-6c71-4f28-9600-b3f35ce2510b |
| 43 | Project Funding | Generator | 43616067-2134-4242-a717-2a11a5deffe8 |
| 47 | Restorative Bonus | Generator | 34238dcd-14dd-4422-b60d-ea0d40d97887 |
| 53 | Infinity Threshold | Generator | 89a7269b-61b6-4be4-988d-345ad885112a |
| 37 | Multiverse Nexus | Core | d8e2551f-c525-4c29-be13-4586c7b4a827 (primary) |
| 38 | Dimension Core | Core | d2c54b27-2d09-444f-9a9e-a192fc76f299 (assist); second copy a445eb18-381d-4ce2-9cd8-03bb8ba1ca04 |
| 39 | Harmony Conductor | Core | 4a9e1943-22ca-42de-9b22-c5eddf400581 |
| 40 | Om Chip | Core | 2c6f2efb-808d-4125-b308-9c0cda21b87f |
| 44 | Magnetic Hook | Core | ef30a03d-e6ea-4b0c-bc40-64ac2b0c3d84 |
| 48 | Primordial Collapse | Core | 18b3f2e6-ab0a-4ed2-b81e-56458c544b87 |

Infinity Threshold is newer than the wiki's module pages; its Legendary value (2000 levels) comes from the card, other rarities unknown.


## Relics

| Field | Status | Notes |
|---|---|---|
| `RelicsUnlocked[336]` | 🔜 | One entry per relic slot: 2 = owned, 0 = not (304 of the first 318 owned on a real account; 318–335 are empty). The slots are NOT in the wiki's numbered order — that account can't own T:XX, T:XXI or the 4th–6th birthday relics, yet the matching wiki positions are owned. The in-game relic grid (owned only, grouped by rarity) runs No Spoon, the T:I–T:V / Copper / Silver relics, birthdays 1–3, then events in the wiki's order, so the game numbers relics roughly in release order. Not owned on that account: 74, 80–82, 92–93, 188–189, 300–302, 305–306, 308. Validation target for any slot mapping — that account's in-game totals (Relics → ⓘ): Damage 124, Attack Speed 18, Crit Chance 16, Crit Factor 118, Damage/Meter 86, Super Crit Chance 6, Super Crit Factor 5, Rend Armor 2, Health 112, Health Regen 39, Defense % 5, Defense Absolute 76, Thorns 14, Knockback 33, Orb Speed 31, Wall Rebuild −2s, Cash 29, Coins 87, Free Attack 16, Free Defense 12, Free Utility 10, Recovery Amount 22, Enemy Attack Skip 2, Enemy Health Skip 2, Ultimate Damage 42, Lab Speed 69, Bot Range 10m. Some exceed the wiki's all-relic totals, so the wiki is missing newer relics. Until a slot table exists, players copy the ⓘ totals into the Relics tab. |
| `ProfileRelics[5]` | ⚪ | Relic slot numbers shown on the profile (4, 29, 85, 5, 1 on that account) — useful anchors for the relic order. |

## Vault, tech trees, guardian, dissonance

| Field | Status | Notes |
|---|---|---|
| `Vault` | ❓ | `UnlockedGroups` (100, 2000 on the test account), `UpgradesLevel` (vault upgrade levels by ID), respec info. Vault gives e.g. +1.5% Defense % — need the ID list. |
| `PowerNodesUnlocked[46]`, `PowerNodesLevel[46]`, `PowerNodesMaxLevel[46]`, `HarmonyNodesUnlocked[48]` | ❓ | Power and Harmony tech trees (Harmony includes the card-slot keys)? |
| `Guardian…` (slots, chips, skins, presets) | ⚪ | Guardian chips — the site doesn't model the guardian yet. |
| `GlobalPresets[6]`, `CurrentGlobalPreset` | ✅ / ❓ | Each global preset points at a workshop, card, bot, module and guardian preset; site preset i follows global preset i. `CurrentGlobalPreset` can be stale (0 on a real account whose loaded workshop/card presets match global preset 1), so it isn't used. |
| `DissonanceActive`, `DissonanceSelected`, `Dissonance…Boost[25]` | ❓ | Dissonance run boosts. |
| `EnemyAttackLevelSkips`, `EnemyHealthLevelSkips` | ❓ | Totals or current-run counts? |

## Profile, cosmetics, settings, milestones

| Field | Status | Notes |
|---|---|---|
| `UserName` | ✅ | Fills the player name. |
| `AvatarId`, `SelectedTower`, `SelectedBackground`, `SelectedProfileBanner`, `SelectedMenu`, `TowerUnlocked[100]`, `BackgroundUnlocked[100]`, `TotalSkinsBought` | ⚪ | Cosmetics. (Do owned skins add the coin "skin bonus"? ❓) |
| `TargetPriority`, `TargetPriorityList[10]`, `LifeSavingOrder[6]` | ⚪ | Settings. |
| `MilestonesPremiumUnlocked[8]`, `MilestonesRewardClaimed[575]`, `MilestonesRewardPremiumClaimed[575]` | ⚪ | Milestone rewards. |

## Lifetime stats 📊

`TotalDamageDealt`, `TotalEnemiesDestroyed`, `TotalCashEarned`, `TotalCoinsEarned` (+ `FromAdBonus`, `FromKills`, `FromWaves`, `FromMine`), `TotalGemsEarned`, `TotalGemsBought`, `TotalStonesEarned/Spent/Bought`, `TotalWavesCompleted`, `TotalUpgradesBought`, `TotalWorkshopUpgradesBought`, `TotalCoinsSpentWorkshop`, `TotalCashEarnedFromInterest`, `TotalCoinsSpent(Attack/Defense/Utility)Enhancements`, `TotalFree(Attack/Defense/Utility)Upgrades`, `TotalEnemiesDestroyedBy…` (orbs, death ray, thorns, land mines, projectiles, CL, SM, ILM, PS, BH, flame bot, death penalty, other), `TotalEnemiesDestroyed(Normal/Fast/Tank/Ranged/Boss/Protector)`, `TotalDamageBy…` (thorns, SM, land mines, DW, CL, swamp, BH, bot, guardian), `TotalDroppedLandMinesSpawned`, `TotalDeathDefyCount`, `TotalLifestealAbsorbed`, `TotalWavesSkipped`, `BlackHoleCoins`, `SpotlightCoins`, `TotalStunsByBot`, `TotalCoinsByBot`, `TotalCoinsByGuardian`, `TotalCatchesByGuardian`, `TotalMedals/Cells/Keys/Tokens/BitsEarned/Spent`.

`WrappedStats[]` — the yearly recap (tournaments, per-UW totals, deaths/kills by enemy type, battles, waves, missions, cards pulled).

## Battle history ✅

`BattleHistory[5]` — the last 5 runs, oldest first, ~150 fields each (the same numbers as the in-game Battle Report). Times are in **seconds**. The optimizer can calibrate Farming and eHP from any of them instead of a pasted report (the newest non-tournament run is picked by default).

| Used field | For |
|---|---|
| `BattleDate`, `Tier`, `Wave`, `GameTime`, `RealTime`, `IsTournament` | Run summary, coins/hour, wave length |
| `CoinsEarned`, `CoinsEarnedWaveSkip`, `CoinsEarnedCPW`, `CoinsFromGoldenTowerPlus` (Golden Combo), `CoinsFromCritCoin`, `GuardianCoinsFetched` | Farming calibration |
| `TotalEnemies`, `DestroyedInGoldenTower`, `TaggedByDeathwave`, `DestroyedInSpotlight`, `DestroyedInGoldenBot`, `DestroyedInBlackhole`, `DestroyedInOrbs` | Share of kills each coin effect covers |
| `WavesSkipped`, `LargestGoldenCombo`, `RecoveryPackages`, `DestroyedByThorns` | Farming + eHP calibration |

Everything else in a battle (damage by source, damage taken/blocked, healing by source, enemy counts, guardian drops, per-source coins) is 📊 for now. `KilledBy` is a number (99 on the test runs, which were quit at wave 1) ❓ — need the list of what each number means. `DissonanceType` ❓.

---

## Open questions for the player

1. What is a "cycle" (`…ThisCycle` fields)?
2. ~~`HighestLeague`~~ — answered: 0 Copper … 6 Mythic.
3. Bots: the export only has the old (empty) bot fields — can TTG add the current bot data?
4. `RelicsUnlocked` — 2 = owned; the order of relic slots (release order?) still needs anchors.
5. `Vault.UpgradesLevel` IDs and the Power/Harmony node lists — what do they unlock?
6. `KilledBy` numbers — what enemy is each?
7. `UltimateWeaponSelectedLevel`, `UpgradeTierUnlocked`, `UpgradeLevel` arrays, `PerkLevel`, `LabLevel[5]` — confirm what they hold.
8. Remaining lab numbers (see Labs), Area of Effect's card number, module `InfoIndex`/effect codes and relic numbers.
