# What the site models — and what's missing

The whole game, system by system, against what TowerForge models (2026-10-18).
✅ modeled · ◐ partly · ✗ not yet. "Calibrated" means the player's own battle
reports set the baseline, so even unmodeled effects are already in it; only
*changing* them isn't valued. Details of each model: [optimizer.md](optimizer.md),
[run-simulation.md](run-simulation.md), [ultimate-weapons.md](ultimate-weapons.md),
[module-effects.md](module-effects.md).

## Damage

| System | Status | Notes |
|---|---|---|
| Tower damage, attack speed, crit, super crit, Damage/Meter, range | ✅ | towerDamage.ts; workshop, labs, cards, masteries, enhancements, relics, modules |
| Multishot, Bounce Shot, Rapid Fire | ✅ | Averages (2026-10-18); give Chain Lightning, tower shots and Smite more hits |
| Rend Armor | ◐ | In the tower-shots share; Rend chance/mult upgrades aren't modeled on their own |
| All 9 UWs + UW+ | ✅ | uwdps.ts; Golden Tower for coins only |
| Flame Bot | ✅ | From the run's FlameBotDamage (2026-10-18): ×Damage × tower damage × crits ÷ cooldown; burn stacks and Wild Fire (Bot+) not modeled |
| Amplify Bot, Bot Bot | ✅ | Tower damage multiplier |
| Death Ray card | ◐ | Read from runs and shown; kills what it touches (not bosses or protected enemies), so it isn't flat damage; its upgrades (Double Death Ray lab) aren't valued |
| Guardian / Attack chip, Electrons, Spotlight damage | ◐ | Read from runs and shown, kept fixed — what scales them isn't documented |
| Orbs, thorns, land mines | ◐ | Fixed share for damage; orbs and thorns modeled for coins / survival |
| Demon Mode, Plasma Cannon, Berserker, Super Tower | ◐ | Berserker and Super Tower in the model; Demon Mode and Plasma Cannon aren't |
| Protectors' damage reduction (55%) | ◐ | Inside the calibration; the Protector labs aren't valued |

## How long enemies are in range (time to tower)

| System | Status | Notes |
|---|---|---|
| Range, Chrono Field slow and uptime, Chrono Loop (CF+), Slow Aura | ✅ | ttt.ts; every source counts per enemy pass (2026-10-18) |
| Thunder Bot stun and linger | ✗ | Wiki: stun on a cooldown, half as effective on bosses and elites, linger slow after. Needs where the bot sits and how its area meets the tower's range |
| Poison Swamp / Inner Land Mine / Land Mine stuns, Energy Net | ✗ | Stuns weaken on the same enemy ("stun debt", TheTowerSDK); needs in-game timings |
| Knockback, Shockwave | ✗ | Push = force ÷ enemy mass, and mass grows with waves (wiki, SDK); weak on late-wave elites, but unmeasured |

## Enemies and how far a run gets

| System | Status | Notes |
|---|---|---|
| Health/damage per wave and tier, elites, fleets, bosses, speeds | ✅ | enemyStats.ts — matches the in-game Wave Info panel at T18 |
| Enemy Level Skip (health and attack) | ✅ | levelSkip.ts; workshop, lab, enhancement, relic, substats |
| Enemy health labs | ✅ | By how often each type ends your runs (KilledBy) |
| Enemy mix of normal types | ◐ | Not confirmed; doesn't change the push ranking |
| Run length (Glass Cannon) | ✅ | runLength.ts — your last 5 deaths, luck-averaged, with the spread shown |
| Run length for tanky builds | ◐ | eHP scores survival but not waves |
| Death Defy, Energy Shield, Second Wind, Demon Mode / Nuke automation | ◐ | Counts read from each run ("Saved by", 2026-10-18); Death Defy valued as killing hits survived (exact chance math), not yet as waves — needs how often killing hits come near the end |
| Wall | ◐ | eHP only; how many GC hits it takes isn't modeled |
| Tournaments and battle conditions | ◐ | Same push ranking; tournament waves and heat aren't modeled |
| Dissonance runs | ✗ | Not in the export the site reads |

## Economy

| System | Status | Notes |
|---|---|---|
| Coins per kill and wave, tier multiplier, Golden Tower / Combo, Black Hole, Spotlight, Death Wave, Golden Bot coin bonuses, Wave Skip, Critical Coin | ✅ | farming.ts + runCoins.ts, calibrated on your runs |
| Coins per run and per hour as runs get longer | ✅ | Coins per Run projection |
| Cells, gems, medals, reroll and module shards per run | ◐ | Read from your runs (2026-10-18, Coins per Run page); upgrades that raise them (Cells / Kill enhancement, DW cell bonus, Cells card) aren't valued |
| Guardian fetch | ◐ | In the run drops; chips not modeled |
| In-run cash, interest, free upgrades, perks picked in a run | ✗ | The site assumes AFK runs; the calibration includes what you usually pick |

## Spending

| Currency | Status | Notes |
|---|---|---|
| Coins: workshop, enhancements | ✅ | Game cost tables, discount labs |
| Lab time | ✅ | Per hour of research; lab speed and relic |
| Power Stones: UWs, UW+, masteries, assist modules | ✅ | Bot+ (1,250 stones) not offered |
| Medals: bots, Event Shop trades | ✅ | Bots only where a model reads the stat |
| Module Shards: slot levels | ✅ | Shard cost lab; level caps by rarity |
| Gems: card slots | ✅ | Card pulls random; lab slots and rushes not ranked |
| Elite Cells: lab boosts | ◐ | Boost table; your cells per day now visible in run drops |
| Keys (Vault), Bits (Guardian chips), Guild Tokens | ✗ | Vault data in TheTowerSDK is marked unverified; chips not documented enough |

## What it would take to close the biggest gaps

1. **Death Defy in waves:** how often killing hits come near the end of a
   run. A recording of the last waves of one push, or the wave of the first
   Death Defy in a run.
2. **Stuns and knockback:** the wave an elite gets stunned or pushed, and
   for how long or how far, at your waves (a short recording).
3. **Cells and drops from upgrades:** with cells per run now read, the
   Cells / Kill and Death Wave cell bonuses can be valued the way coins are —
   next step.
4. **Vault and Guardian chips:** in-game values for the trees and chips you own.
