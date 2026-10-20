# Optimizer — how upgrades are scored

Reference for `engine/optimizer.ts` and the build models it calls. Verified
facts about the UWs themselves are in [ultimate-weapons.md](ultimate-weapons.md);
module effects in [module-effects.md](module-effects.md).

## Goals (2026-10-18)

The Optimizer asks what the player wants, and every panel ranks by it
(`OptGoal` in constants/optimizerConfig.ts, set up by
`engine/accountModels.ts → applyGoal`):

| Goal | Score | Builds |
|---|---|---|
| Push further (milestones, tournaments) | flat damage × e^(skipWorth × skip%) | Glass Cannon |
| More damage | calibrated eDPS | Glass Cannon |
| More coins | coins per hour (`farming.ts`) | all |
| Survive longer | eHP (`ehp.ts`) | eHP, Farming |
| Coins and push together | coins^w × push^(1 − w), w on a slider (default 50%) | all (push = waves for GC, survival otherwise) |

- The blend is a weighted geometric mean, so an upgrade that helps both
  halves beats one that helps only one at the same price; rows show both
  halves (`attachParts`). The code's assumption: a 1% coin gain and a 1%
  push gain count the same at 50%.
- Tournaments use the push ranking. Their battle conditions scale enemies
  the same for every upgrade, so the order holds — an assumption, not
  checked against tournament runs.

## Every currency (2026-10-18)

What each currency buys (wiki Currencies page) and how it's ranked:

| Currency | Ranked | Price source |
|---|---|---|
| Power Stones | UW stats, UW+, card mastery unlocks, assist modules — one path | wiki (see ultimate-weapons.md) |
| Coins | workshop (per coin), enhancements (per coin) | game table via TheTowerSDK; discount labs |
| Lab time | labs (per hour of research) | SDK lab catalog; Labs Speed, relic, Labs Coin Discount |
| Module Shards | module slot levels, 5 at a time (per shard; coins shown) | SDK module tables + wiki level 1; Module Shard/Coin Cost labs (1% a level) |
| Medals | bot stat and Bot+ levels vs Event Shop trades (per medal) | bots: 100 + 40 × (L − 1) a level (wiki bot Cost pages, every bot); Bot+: 100 + 50 × (L − 1), Echoing Shot 100 + 200 × (L − 1); trades 40, 65, 90, 130, 175, 230, then 380 |
| Gems | card slots: the best owned card not in the preset, into a free slot or the next one bought (per gem) | wiki Cards: 50 → 10,000 gems, 22 slots |
| Elite Cells | not a path: a table of lab boosts (×1.5 at 15/h … ×8 at 1M/h) and the extra lab hours per cell, on the top lab | wiki Currencies |
| Bits | Guardian chip stats, each equipped chip's next level (per Bit) | wiki Chips tables and TheTowerSDK guardian upgrades — matched at every level (`constants/guardianData.ts`) |
| Keys, Guild Tokens | not ranked (Vault, Guild Store) | — |

- **Medal trades** are worth what 15 stones / 250 shards buy next on their own
  paths (`pathGain`): stones after the ones already held, shards from zero
  (shards held aren't saved). Prices reset each event; the path assumes one
  event. 150-gem trades aren't valued (gems have no single use to price them).
- **Bots**: only stats a model reads score — Amplify Bot and Bot Bot bonus
  (damage), Golden Bot (coins). Flame and Thunder Bot aren't modeled, so
  their levels show no gain: battle reports record Flame Bot kills and hits
  and Thunder Bot stuns (TheTowerSDK's battle field list), but no bot
  damage, so there's no share of damage to calibrate them from; Flame Bot's
  damage reduction only matters to tanky builds, and Thunder Bot's stuns
  would need a stun-uptime model in TTT. Bot+ (stones) isn't offered.
- **Bot+** (game v29, checked 2026-10-19): once all five bots are owned,
  each one's ability unlocks for 1,250 stones and then levels with medals —
  Wild Fire ×1.5 +0.1 to 20 levels, Titan Shock 5% +1% to 20, Bonus Cells
  ×1.25 +0.05 to 25, Echoing Shot 3 bullets +1 to 9, Maximum Power ×1.25
  +0.05 to 20 (level 0 = the unlock value). Level L costs 100 + 50 × (L − 1)
  medals, 100 + 200 × (L − 1) for Echoing Shot: 11,500 / 11,500 / 17,500 /
  8,100 / 11,500 to max. TheTowerSDK 0.12.0 (`data/bots`, the plus tier and
  `BOT_PLUS_*_V29`) and the "Total Medal Cost" rows of the wiki's bot pages
  agree on every number. Each preset keeps its own Bot+ level; the unlock is
  account-wide. Only Echoing Shot scores: "tower bullets within range count
  as N bullets", so tower shots × N — always on, like Amplify Bot's Bonus
  (the code's assumption). Not modeled: the wiki's 1/3 boost for Ultimate
  Weapon projectiles, and Maximum Power ("boosts the Bot+ abilities of other
  bots") — the SDK applies it to the part above 1, which isn't confirmed.
- **Card pulls** are random (80/17/3% by rarity), so stars aren't ranked;
  lab slots, rushes and tickets aren't either.
- Enhancement costs match every wiki level (the SDK prices up to 600 levels,
  the wiki and the site 400 — newer caps aren't confirmed).
- Module slot shards: SDK's table starts at level 2; the wiki's Modules/Cost
  gives level 1 as 7 shards + 10K coins, and its totals then match
  (3,136,095 shards to 300).
- Fixed 2026-10-18: the Critical Chance card counted even when not in the
  preset; like every card it now counts only while equipped.

## What If (2026-10-18)

`engine/whatIf.ts`, Optimizer → What If: any UW, UW+, workshop, lab,
enhancement, module slot or bot level set on a copy of the account. Each
score is calibrated on the account as it is (the chosen Battle Report) and
read on the copy: all damage, push (flat damage + skip), waves reached,
coins per run and per hour (Run Length, Coins per Run; GC), coin income at
the same wave, survival (not GC) — plus the cost in every currency.

- **Coins follow the run:** coins per run = Coins per Run's coins for a run
  to the new wave × the coin-bonus gain; coins per hour the same with its
  coins ÷ real time (later waves pay more per hour). "Coin income at the
  same wave" is the coin bonuses alone (`farming.coinRate`).
- **How it adds up** (`chain`): every link that moved — range, Chrono Field
  uptime, slow, Chrono Loop's extra path, time each enemy is in range; tower
  damage, attacks per second, crit multiplier; each damage source per enemy
  with its share of the run's damage; Smite procs (with CL+); level skip and
  the killers' health labs; each coin bonus's average factor
  (`farming.coinFactors`: 1 + coverage × (bonus − 1)).

## Best module loadout — Tournament page (2026-10-18)

`engine/loadoutOptimizer.ts`, Optimizer → Tournament. Which owned modules
to equip, main and assist per type, for the most tournament waves (Glass
Cannon) or survival (other builds).

- **Calibrated on tournaments:** the newest tournament run is the Battle
  Report (its damage mix and run rates), and waves come from the tournament
  deaths on the tournament health curve (`runModels` with that run chosen).
- **Search:** every owned module of a type is tried in the main slot and,
  once the slot is unlocked, the assist slot; one slot changes at a time and
  the best swap stays; up to 4 rounds, until nothing improves (coordinate
  ascent). A module can't sit in two slots. The score is `goalScore` — the
  same push score the Optimizer ranks by (flat damage × skip × killers'
  health labs), so main effects at the slot's level, substats at the assist
  slot's efficiency and the unique effects the model reads all count.
- **Waves:** the total gain goes through `pathRunGains` with the skip
  points the swap adds. Each swap is also shown on its own from the current
  loadout; swaps multiply, so those don't add up to the total.
- **What it can't see:** a module whose value is outside the push score
  (armor for Glass Cannon, coin modules) is never moved for waves.
  Battle conditions differ week to week and past tournaments mix them; the
  result is for an average week of the player's own tournaments.
- "Save as a loadout" adds (or replaces) a loadout named "Best for
  tournaments"; the equipped loadout doesn't change.
- **This week's conditions:** with conditions ticked on the page, the
  search scores under them at the heat of the wave the run ends
  (`OptimizerSnapshot.conditions`, applied in `getScore`; the calibration is
  built under the recent runs' conditions in `applyGoal`), so a module that
  answers one — Chrono Field duration against shorter UWs — is worth more
  that week. A loadout that goes much further is re-read at the stronger
  heat there. See [run-simulation.md](run-simulation.md) §3.
- **Tournament Battle Report anywhere:** the league's fixed conditions
  (Skip Reduction - Multiply, Skip Decay; profile league) scale every skip point in the
  Optimizer (waves score, Enemy Health Level Skip panel), What If and the
  module search — in Legend a skip point adds ×0.45 of what it would on a
  campaign run.

## Guardian (2026-10-19)

`engine/guardian.ts`, Gear → Guardian. The chips the Guardian runs for a
preset (its Guardian preset via the game's global preset; slots = 1 +
bought) and what the counted ones do:
- **Scout** — while active (duration ÷ cooldown of the time), enemies
  count as Range Bonus × farther for Damage/Meter. Damage/Meter adds
  DPM × distance to tower damage (wiki: Damage × DPM% × range), so tower
  shots get 1 + DPM × d × (1 + uptime × (bonus − 1)), d = half the range
  (the code's assumption). Damage/Meter itself is now in the tower-shot
  part too, so its workshop, lab and enhancement levels score.
- **Bounty** — tags Targets enemies per cooldown, at most the non-Common
  ~80% of kills (T18 W6000 spawn mix); each pays × Multiplier: kill coins
  × (1 + tagged share × (Multiplier − 1)). Coins per tagged kill = an
  average kill (assumption).
- **Summon** — 2 enemies a second while active: kills × (1 + 2 × duration
  ÷ cooldown ÷ kills per second); each pays an average kill (assumption).
  Its Cash Bonus is in-run cash — not counted (AFK).
- **Fetch** — finds per second = find chance × (1 + double find) ÷
  cooldown. The run's fetched coins (`GuardianCoinsFetched`) are their own
  share of its coins and scale with finds; the loot (gems, medals, shards,
  modules) is shown per hour from the run.
- **Skins** — +0.6% coins each, always on (wiki).
- **Attack** and **Ally** — not counted (coverage.md says why).

The Bits panel ranks each equipped chip's next stat level per Bit for the
goal; slots (200 / 300 Bits) and which chips to equip are left to the
player. What If takes the equipped chips' levels too.

## Chance mechanics and variance (2026-10-18)

Everything chance-based is counted at its average:
- Crit and super crit (crit multiplier), Chain Lightning chance and chains,
  Smite procs (≤ 100 per enemy), Consume.
- **Multishot, Bounce Shot, Rapid Fire** (`towerDamage.calcProjectileFactors`,
  added 2026-10-18): Chain Lightning procs "on enemy hit" (wiki), so
  every extra projectile hit is another chance for it; tower shots and
  Smite gain the same way. Expected values from the wiki's workshop values
  plus module substats:
  - Multishot: 1 + m(T − 1) projectiles per attack.
  - Bounce Shot: 1 + b + … + b^N hits per projectile.
  - Rapid Fire: ×(1 + 3U), uptime U = rAD/(1 + rAD).

  The code's assumptions:
  - Every extra projectile and bounce finds an enemy (a full field late in a push).
  - Each bounce rolls the chance again.
  - Rapid Fire doesn't re-trigger while it's active.
- Level skip is deterministic over a run; wave skip, Golden Combo and
  Gilded Sniper are averaged in the coin model.

Not valued yet — **Death Defy, Energy Shield, Second Wind, the wall, Nuke /
Demon Mode automation**. Their current levels are inside the death point
(Run Length is calibrated on real deaths), but raising them isn't scored.
How it would work: Death Defy ignores a killing hit with its chance, and
then Energy Shield, Second Wind and the rest take one each (wiki: Death Defy,
Activation Priority). So a run survives K/(1 − p) killing hits on average,
where K is the charges behind Death Defy + 1. The missing piece is how fast
killing hits pile up per wave near the end. Battle reports log Death Defy
procs, Energy Shield hits absorbed and Second Wind uses per run
(TheTowerSDK's battle field list); one end-of-run recording would give the
rate.

Variance: the waves are the average over the last 5 deaths, each averaged
over ±10% luck. What If shows each change's own waves and the spread
across those deaths (`runLength.wavesSpread`). It also says how far apart
the runs themselves ended, so a gain smaller than that is clearly something
seen over several runs. The breakdown splits the waves between the links
by the log of each part: flat damage (by what each source added), skip and
the killers' health labs. A change's own waves and its part of a combined
gain can differ, because changes work on each other.

## Every damage source in a run (2026-10-18)

Battle reports record more damage sources than the 11 the site parsed by name;
TheTowerSDK's run field list has Flame Bot, Death Ray, Spotlight, Electrons,
Guardian and Attack chip damage too. They're read from each run's stored
fields by the words in their names (`battleReport.extraDamage`), shown in the
Battle Report breakdown, and Flame Bot is calibrated as flat damage (see
edps.ts). The rest stay in the fixed share. The same name matching reads
what saved each run (`runSavers`) and what it dropped (`runDrops`); the exact
export names aren't confirmed, so the pages show the field names they found.

## Damage is per enemy pass (2026-10-18)

Owner's point: Chrono Field+ deals no damage but makes everything else deal
more. Before this, only the cooldown UWs (SM, DW, ILM, PS, BH) gained from a
longer time to tower (their activations during an enemy's pass); Chain
Lightning and tower shots were per second, so CF, CF+, Slow Aura and range
did nothing for them. Now both scores (`edpsScore`, `edpsSurvivalScore`)
multiply Chain Lightning and tower shots by time in range ÷ the anchor's,
and Smite procs per enemy scale with CL chance² × chains × attacks per
second × time in range. The code's model, not checked in game: an enemy
takes damage for as long as it's in range, so a 31% slower enemy (Slow Aura
7★) takes 1 ÷ 0.69 = 1.45× the damage on its way in. Consequence to watch:
range and slows are now worth much more for pushing than before.

## Paths

- **Stone path** (`simulateStonePath`): UW stats, UW+, card mastery unlocks
  and assist modules ranked together by gain per stone — one shared stone
  pool. Greedy: buy the best, re-score, repeat.
- **Coin / research paths**:
  - Since 2026-10-18, for every build: workshop by gain per coin, from the
    game's cost table after the Workshop Discount lab (stats over 300
    levels move 10 levels a step); labs by gain per hour of research, since
    lab slots run out before coins do. The other currencies: see Every
    currency above.
  - Shown in blocks of 10 steps, one row per stat or lab in each, so
    one-level steps that take turns (Crit Chance, Crit Factor, Crit Chance…)
    read as "Crit Chance 40 → 45, Crit Factor 40 → 44".
- Paths skip anything worth under `GC_SCORING.minGainPct` (0.001%).

## Build scores (all relative: the player's current setup = 1)

- **Glass Cannon** — `engine/edps.ts`, calibrated by the chosen run's damage
  by source (imported battle history has it; pasted reports only if they
  include damage lines). Each source counts for its real share of damage:
  - CL, SM (+ Spotlight Missiles), DW, ILM, PS scale with their modeled
    eDPS, including core module UW damage, the Ultimate Damage relic,
    Spotlight and damage-taken effects;
  - Black Hole scales with its reach (holes × uptime × size × BH Damage lab)
    because it deals % of enemy health;
  - tower shots / rend / land mines scale with tower damage × crit × attack
    speed × Spotlight;
  - orbs, thorns and the rest are fixed — so on a farming run where orbs do
    ~88% of the damage, a +20% Chain Lightning upgrade is worth ~+2%;
  - Smite and Consume add a share of enemy health (total damage ≈ total
    enemy health): Smite at the run's proc rate, Consume on kills inside a
    Black Hole.
  Without damage data the old uncalibrated model is used (its absolute eDPS
  isn't meaningful; the tab says so).
- **Glass Cannon, ranked by waves** (Rank by → "How far runs get") —
  `edpsSurvivalScore`: only the flat-damage sources (CL, SM, DW, ILM, PS,
  tower shots), renormalised to their share of the run's damage; orbs, Black
  Hole, Smite and Consume deal a share of enemy health so they don't move the
  death wave. Gains become waves and coins per run through Run Length and
  Coins per Run ([run-simulation.md](run-simulation.md)).
  - Enemy Health Level Skip (workshop stat and lab) is scored too: the skip
    chance counts as the flat damage that gains the same waves
    (`runLength.skipWorth`, score × e^(worth × skip%)). In the owner-like test
    runs (T18 ~W8300, 58% skip) one point of skip ≈ 205 waves ≈ +90% damage.
    That rate uses +50% damage, past the nearest health wall; the first +10%
    alone can buy more (53 waves there), which is why small probes mislead.
  - On the rows, a step's skip moves the death wave as skip (not as its
    damage equivalent), so the skip lab shows the same waves in the Labs
    panel as in the Enemy Health Level Skip panel.
  - Enemy health labs (2026-10-18): each type's lab (−0.4% health a level,
    −0.3% for Boss and Protector — values from Enemy Stats, which matches the
    in-game Wave Info panel) counts as that much more damage against its
    type, weighted by the share of the model's recent deaths that type
    caused (`killerMix`, from KilledBy): push × Π (1 ÷ health left)^share.
    The weighting is the code's assumption; runs without a recorded killer
    don't count, and with no killers the labs aren't scored. They're slow
    and costly per level (Ray Health Lv 1: 212.5q coins, 4d 12h), so they
    rank behind cheap labs until those are maxed.
- **Farming** — `engine/farming.ts`, calibrated by the run's coin breakdown
  and "killed with effect active" coverage. Golden Combo uses the wiki's
  compounding formula.
- **eHP** — `engine/ehp.ts`, calibrated by recovery packages and thorns
  kills. Not modeled: Chain Thunder, Slow Aura mastery (enemy attack speed),
  Enemy Level Skip workshop stats.

## Stone rules (verified)

- **Card mastery**: stones only unlock a mastery, at its level-0 value; levels
  1–9 come from that card's lab (1.1q → 10q coins, 20 → 104 days each). The
  optimizer offers unlocks only, never re-buys. Unlock costs (Notion Card
  Mastery page): 500 Cash / Free Upgrades; 750 Damage, Attack Speed, Health,
  Health Regen, Range, Critical Chance, Fortress, Extra Orb, Death Ray,
  Energy Net, Berserker, Ultimate Crit, Nuke; 1000 Slow Aura, Enemy Balance,
  Extra Defense, Critical Coin, Wave Skip, Land Mine Stun, Recovery Package
  Chance, Super Tower, Second Wind, Demon Mode, Energy Shield, Wave
  Accelerator; 1250 Coins, Plasma Cannon, Intro Sprint. (Cells and Area of
  Effect aren't on that page.) Land Mine Stun mastery is 2.7% per level.
- **Assist modules** (Fandom Modules page + player): unlock 1000, then
  Legendary 1000, Mythic 1200, Ancestral 1400 (4,600). Efficiency starts at
  1%; the k-th stone level costs 15 + 3k.
  - Main Effect: stones to 100% (16,038 stones), Assist Mult lab +30% → 130%.
  - Substats: stones to 70% (8,073 stones), Assist Substat lab +30% → 100%.
  - An assist module's main effect counts as 1 + (×value − 1) × efficiency
    (multiplicative since v27.1). Hard caps still apply (98% defense, 90% CF
    slow, 150s wall rebuild, 7s shockwave, 37s ILM cooldown).
- **Primary modules** run at 100%. The labs added in the latest update
  (unlocked T23 W500, one per type, +1%/level, 30 levels) take them to 130%:
  1 + (×value − 1) × (1 + lab%). Site names `Primary-<Type> Mult`; their game
  lab numbers aren't known yet.
- UW stat / UW+ costs: see [ultimate-weapons.md](ultimate-weapons.md).

## Workshop and lab costs (checked 2026-10-18)

Source: TheTowerSDK 0.12.0 (MIT, npm `thetowersdk`) — `data/workshop/table.json`
(the game's own workshop table: value, cash and coins at every level) and
`data/labs/catalog.data.js` (every lab's coins and time per level, which its
author checks against the community Effective Paths sheet). Generated into
`constants/workshopCosts.ts` and `constants/labCosts.ts` by
`npm run upgrade-costs -- <unpacked package>` (scripts/upgrade-costs.mjs).

- **Workshop vs the wiki** (every row of every Fandom cost page): 46 of 48
  stats match level for level (cost of level L = table entry L − 1; e.g.
  Super Crit Chance 50K at Lv 1, 355.49B at Lv 100; Damage 5.10T at Lv 6000,
  816.09T in all; Enemy Health Level Skip 3.72B to Lv 10). Two don't:
  - Rend Armor Mult: the wiki's table is a row-for-row copy of Rend Armor
    Chance's. The game table's Mult costs run up to ~30× higher late
    (Lv 299: 595q vs the wiki's 19.83q). We use the game table — unconfirmed
    in game.
  - Wall Health: the game table costs more from Lv 100 on (Lv 100: 56.4M vs
    31.91M; Lv 1800: 108T vs 23.48T). The eHP model still uses the wiki's
    curve (`WS_WALL_HEALTH`); Glass Cannon doesn't score walls. One in-game
    price would settle which is right.
- **Labs vs the wiki** (2,695 rows): times match everywhere except Death Wave
  Armor Stripping (wiki "10d 10h 52m", catalog "10:53:00" — one of them
  dropped the days). Costs match except single-row differences in Battle
  Condition Reduction, Cash Bonus, Double Death Ray, Labs Coin Discount,
  Protector Health/Radius, Recovery Package Max, Super Crit Chance (Lv 31:
  8.77B vs 8.70B) and Super Tower Bonus. We use the catalog. Max levels
  differ for Swamp Rend – Additional Enemies (site 11, catalog 9; levels
  10–11 have no price, so they're never recommended).
- **Discounts** (wiki lab pages): Workshop Attack/Defense/Utility Discount
  0.5% a level (49.5% at 99); Labs Coin Discount 0.3% a level (29.7% at 99);
  Enhancement Coin Discount 0.3% a level (30% at 100); Labs Speed ×(1 + 2% a
  level), times the Lab Speed relic, but not for its own research (the
  relic does count there). Gem speed-ups and the Vault's enhancement
  discount aren't counted.

## Battle history facts used for calibration

- `EnemiesHitBy…ThisRound` counts each enemy once (a run with 11M shots had
  662k enemies hit by projectiles).
- T18 ~W8600 farming run (39h game time): orbs 88% of damage, CL 9%, BH 2.4%;
  Golden Combo 47.5% of coins; 98% of kills inside a Black Hole; CL hits per
  enemy reached ≈ 15, smites ≈ 4.5.
