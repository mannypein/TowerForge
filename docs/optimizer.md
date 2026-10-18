# Optimizer — how upgrades are scored

Reference for `engine/optimizer.ts` and the build models it calls. Verified
facts about the UWs themselves are in [ultimate-weapons.md](ultimate-weapons.md);
module effects in [module-effects.md](module-effects.md).

## Paths

- **Stone path** (`simulateStonePath`): UW stats, UW+, card mastery unlocks
  and assist modules ranked together by gain per stone — one shared stone
  pool. Greedy: buy the best, re-score, repeat.
- **Coin / research paths** (Farming and eHP only): workshop (gain per coin
  where costs are known), labs and enhancements (gain per level — costs and
  lab times aren't compared yet). Glass Cannon shows "coming soon" for these.
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

## Battle history facts used for calibration

- `EnemiesHitBy…ThisRound` counts each enemy once (a run with 11M shots had
  662k enemies hit by projectiles).
- T18 ~W8600 farming run (39h game time): orbs 88% of damage, CL 9%, BH 2.4%;
  Golden Combo 47.5% of coins; 98% of kills inside a Black Hole; CL hits per
  enemy reached ≈ 15, smites ≈ 4.5.
