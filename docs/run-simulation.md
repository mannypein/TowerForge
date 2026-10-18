# Run simulator — research notes

Everything gathered (2026-10-17) for a simulator that plays a run wave by
wave, calibrated to the player's own battle history, to predict **how far a
run gets** and **coins / cells per run**, before and after an upgrade.

Status: **research only — nothing built yet.** Facts below say where they
come from. "SDK" = TheTowerSDK (below); "wiki" = the Fandom wiki; "GV" = the
Game Vault wiki. Where sources disagree it says so (see [Disagreements](#disagreements-to-settle)).
Game version at the time: **v29.1**.

---

## Sources

| Source | What it is | Licence / use |
|---|---|---|
| **TheTowerSDK** — github.com/TmRxJD/TheTowerSDK, npm `thetowersdk` 0.12.0 (commit `d73c9f5`, 2026-10-17) | TypeScript library by TmRxJD (jdevo; Official Discord moderator, runs the-tower-run-tracker.com). Game data tables for v29.1, a save/export reader, and the formulas: enemy wave scaling, spawning, level skip, elites/fleets, wave-panel values, workshop curves, damage-reduction stack, thorns, range, targeting, perks, battle conditions & tournament heat, Golden Combo, wave skip, per-wave coin / cell / shard simulation. Ships a sourced knowledge graph (320 facts with "traps") in `dist/knowledge/knowledge-graph.v1.json`. Its data tables are transcribed from the game; its formulas are partly the game's own and partly fitted — each docblock says which. | **MIT.** One runtime dependency (zod, MIT). README asks tools built on its Effective Paths ports to credit the Effective Paths team (creator code SHEETLORD). Pin an exact version (pre-1.0, exports may move). |
| **tower-idle-toolkit** by skye — github.com/tower-idle-toolkit | Older (2023, unmaintained) toolkit; worked out the enemy-scaling structure the SDK still uses. | ISC. Superseded by the SDK. |
| **Fandom wiki** — the-tower-idle-tower-defense.fandom.com | 527 pages. Enemies, Tiers, battle conditions, overheat, cash, interest, free upgrades, packages, wall, perks, labs. A full text copy was read for this; not committed. | CC BY-SA. Starting point; the game wins. |
| **Game Vault wiki** — the-tower-idle-tower-defense.game-vault.net | Second wiki; a few extra details (boss spawn timing). | — |
| **Tower Knowledge Hub** (Notion, by J Plays) — the-tower.notion.site | Guides, the Death Wave kill-wall calculator (eike23). | — |
| **Effective Paths sheet** (Mattew / QuietFanta / Bisse …) | The community upgrade-value spreadsheet; the SDK ports its maths. | — |
| Community tools | thetower.lol (tournament results), Project Rend (stats tracker), the-tower-run-tracker.com, mytower.app, thetower.tools. | Reference only. |
| **Reddit** (r/TheTowerGame) | **Not reachable from this setup** (Reddit blocks the research tools and the built-in browser). Could be read through the owner's own Chrome if needed. | — |

**Recommendation:** build on the SDK (as a pinned npm dependency, or by
porting the specific functions with credit) for enemy stats, spawning, level
skip, battle conditions and the economy; build the **fight** itself (does the
tower kill fast enough, how much damage reaches it, when it dies) and the
**calibration** ourselves — no public source models those.

---

## 1. Run structure and timing

- **Wave = spawn phase + cooldown.** 26 s spawning + 9 s cooldown at ×1 speed
  (wiki Gameplay). Tournament: 13 s spawning, cooldown halved (SDK
  `uptime/compute`). Wave Accelerator card shortens the cooldown (min 4 s at
  max), its mastery speeds up spawn-rate growth.
- **Game speed:** lab up to ×5, perk to ×6.25 — but "×5 behaves closer to ×4,
  6.25 closer to ×5" (wiki). Use the battle report's `GameTime` / `RealTime`
  ratio for the real figure. All in-run timers run on game time.
- **Spawning (SDK, v29):** the spawn timer ticks every **0.125 s**; each tick
  makes 3 gated basic-enemy attempts + a double-spawn roll — calibrated
  against a real save as **3.25 enemies per tick**. The master spawn gate
  (0–100) comes from the Wave Accelerator chart; each new wave adds
  `tier / 2.85` to the double-spawn chance. Functions:
  `expectedEnemiesPerWaveFromAccount`, `killsPerWaveFromSpawnContext`.
- **On-screen caps:** 120 normal, 10 bosses, elites 8 per type (+20 scatter
  splits), fleets 10 each + 30 escorts in their own pool since v28.3 (wiki).
  SDK states 150 total = 120 normal / 20 elite / 10 boss. Caps bound both
  damage-per-second and coins-per-wave.
- **Enemy level up:** every wave each enemy stat "levels up" unless an Enemy
  Level Skip fires (section 4).

## 2. Enemy stats

### Base health and damage per wave and tier
SDK `mechanics/waves/base-empirical-scaling.ts` + constants in
`scaling-regression-profile.ts` (structure from skye's toolkit):

```
health(w, t) = ⌊ M(w) × G(w) × (a·w^e + b·w + c) × P(t) ⌋
  M(w) = 1 + Σ kᵢ·⌊w / dᵢ⌋           12 banded terms (d = 5, 10, 25, 50, 60, 72, 83, 94, 100, 107, 200, 900)
  G(w) = Π rᵢ^⌊w / dᵢ⌋               growth chain (1.035 per 30 waves … 1.15 per 1024)
  campaign: a = 0.05, b = 0.8, c = 1.5, e = 2.13 + tier add-on
            (T10 +0.01, T11 +0.02, T12 +0.10, T13 +0.22, T14 +0.36, T15+ +0.51)
  P(t) = tier pressure: T1 1, T2 20, T3 60, T4 120, T5 240, T6 480, T7 960,
         T8 1920, T9 5760, T10 40320, T11 2.62e6, T12 1.57e9 … T21 4.97e30,
         then ×1200 per tier to T24.
```
Damage has the same shape with its **own** bands (7), chain, exponent
(2.007 + smaller add-ons), a tier attenuation divisor from T10, and extra
growth terms above T6. **Tournaments use different exponents** (and
×1.004 per wave, ×1.65 per 100 waves on health) — a different curve, not a
tweak. Both formulas step at band boundaries; don't smooth them.

Accuracy: one SDK file says these constants are the game's own, checked with
exact equality across 21 tiers × 34 waves × 8 contexts; another says "fitted,
close but not exact at extreme waves". **To settle with in-game Wave Info
screenshots** (the panel shows each enemy's health and attack).

### Per-type multipliers (relative to the wave's basic enemy)

| Enemy | Health | Damage | Speed (wiki) | Coins (base) | Cash | Notes |
|---|---|---|---|---|---|---|
| Basic | ×1 | ×1 | ×1 | 1 (SDK) / 0 (wiki) | ×1 | |
| Fast | ×1 | ×1 | ×2.1 (→ ~×3.9 from w750) | 2 | ×1.5 | |
| Tank | ×5 | ×1 | ×0.6 | 4 | ×3 | |
| Ranged | ×1 | ×1 | ×1.2 | 2 | ×1.5 | shoots from range |
| Protector | ×0.6 | ×1 | ×0.4 | 3 | ×1.5 | enemies in its radius take ×0.6 damage and can't be insta-killed; thorns −60% in range; T2+; 1 per wave max with a cooldown of 10 waves (9 from T4, 8 from T7, 7 from T10); cap 10 (or 8) |
| Boss | ×20 | ×1 | ×0.4 (wiki) / ×0.3 (SDK, GV) | 5 | ×5 | every 10 waves T1–13; T14 9, T15 8, T16 7, T17 6, T18+ 5. T1–6 spawns at a fixed point of the wave, T7+ at a random 5–75% (GV). Immune to orbs (except Orb Boss Hit lab), death ray, shockwave, black hole. Drops: common module 2%, rare 0.5%, reroll shards 15% (before labs). |
| Vampire (elite) | ×2 | — | ×0.4 | 4 | ×3 | drains 2% of tower **max** health per second, can't be changed by perks/modifiers, disables tower regen and lifesteal (not wall regen) while draining |
| Ray (elite) | ×1 | ×2 | ×0.4 | 4 | ×3 | charges 30 s then fires; immune to knockback |
| Scatter (elite) | ×2 | ×1 | ×0.6 | 4 | ×3 | splits 4 times into 2 (1, ¼, 1/9, 1/16 of basic health); one split drops cells |
| Saboteur (fleet) | ×20 | 0 | ×2.1 | 4 | ×3 | each tower hit lowers a random UW 1 level (to 0 = disabled) until it dies; can't break the wall |
| Commander (fleet) | ×20 | — | ×0.2 | 4 | ×3 | pulses ×1.15 health/mass/speed to nearby enemies, max 8 stacks, not bosses (wiki; SDK says "2× aura") |
| Overcharge (fleet) | ×20 | ×1 locked to **wave 1** of the tier | ×0.2 | 4 | ×3 | returning projectile, ×1.4 per consecutive hit; fires once more on death |

Elites and fleets: immune to orbs, death ray, shockwave, black hole (fleets
also knockback and BH pull); fleets take 50% from CF / swamp stun / mine
stun, 85% thorns resistance (and thorns hit % of their *current* health).
Fleets attack slowly at wave 1, full rate from wave 4000.

**Shared rules** (wiki, SDK): each **melee** hit is 4% stronger than that
enemy's previous one (×1.04^hits; not ranged shots, ray or vampire). An enemy
alive 3+ waves after spawning loses **50% of its coin value**. Mass +4% per
wave alive (weakens knockback). Speed grows +0.03%/wave above wave 100 (cap
×12), mass +0.1%/wave above 4000 (SDK wave-panel constants).

**Enemy research labs:** −0.4% health or attack per level (30 levels, −12%)
for common/fast/tank/ranged/ray/vampire/scatter; boss and protector −0.3%/level
(−9%); protector damage reduction −0.3%/level (20 levels); fast speed
−0.4%/level; ranged range −0.5%/level; v29 fleet labs (Overcharge exponent
1.4 − 0.005·lvl, Commander radius, Saboteur speed).

### Enemy mix (which types spawn)
Not fully known. Normal spawn chances sum to 100% each wave and Basic is the
remainder; fast/tank/ranged chances grow with a tier weight table (SDK
`WAVE_INFO_TIER_SPAWN_WEIGHT_TABLE`, 1.04 … 8.89). The SDK's own notes say
the shipped composition table is wrong, and give one measured T21 round:
**basic 19.9%, fast 28.3%, tank 26.7%, ranged 25.2%** of kills. Battle
reports count kills per type, so the mix can be **calibrated per player**.

### Elite and fleet schedules
- **Elites:** chance per wave rises through bands 1, 4, 9, 16 … 100% (squares,
  shared by the 3 types; the game shows ⅓ of it per type). Single-elite
  bands open at waves 500/1000/1500/2000/3000 … 8000 on T1, ×0.9 per tier
  through T15; T16–24 is a separate block (also ×0.9 within it). A second
  elite per wave opens from wave 8000 on T1 (same pattern). Enemy Balance
  mastery adds double-spawn chance. SDK `eliteSpawnChanceAtWave`. Three cells
  (row 1, T22–24) are missing in the chart.
- **Fleets:** T14 first at w2495 then every 1000; T15 1495/750; T16 995/500;
  T17 495/250; T18 95/100; T19 45/50; T20 from w5 every 10 waves (1 fleet);
  T21 2 fleets; T22 2 (SDK) or 3 (wiki); T23–24 3. Lower tiers: from wave
  15000 on T1, 250 waves earlier per tier, then every 100 waves. Each fleet
  brings 10–15 escorts (Overcharge + Ranged, Commander + Tank, Saboteur + Fast).
  Wave Skip doesn't skip a fleet. Drops: 80% reroll shards (1080 at ≤T14 …
  2750 at T24), 5% each module-shard type (5 → 25 by spawn wave).

## 3. Tiers, battle conditions, tournaments

- **Coin multiplier by tier:** 1, 1.8, 2.6, 3.4, 4.2, 5, 5.8, 6.6, 7.5, 8.7,
  10.3, 12.2, 14.7, 17.6, 21.3, 25.2, 29.1, 33, 40, 48, 60, 72, 86, 103
  (T22–24 confirmed in game by the SDK author, v28.3).
- **Battle conditions from T14** (fixed per tier, wiki Tiers table): More
  Bosses, Orb / Death Ray / Thorns / Plasma Cannon resistance, ELS "Skip
  Reduction – Subtract" (2.5% at T14 → 42.5% at T24), Knockback resistance,
  Armored Enemies (blocks the first 10 → 95 hits), and the enemy "Ultimates"
  (Protector, Tank, Ray, Scatter, Vampire, Fast, Boss overheal, Mass
  Enforcement, Saboteur through-wall, Commander, Overcharge scaling) phasing in
  from T16–T24. Battle-condition labs reduce them. SDK
  `battle-conditions/config.ts` holds the per-tier set.
- **Overheat** (campaign, after clearing w4500 once): from wave 15000 on T1,
  250 earlier per tier, 10000 from T21 — Skip Decay 1%/wave and an extra
  fleet every 100 waves.
- **Tournaments:** different scaling curve (above); league conditions and
  "heat" that ramps with wave (SDK `tournament-heat-bc.ts`); Legend adds Damage
  Decay / Health Decay from w1500 and More Elites from w2000.

## 4. Enemy Level Skip (deterministic)

- Workshop 0.05%/level, 699 levels → 35%; lab +2%; relics +2%; module
  substats; Enemy Level Skips enhancement ×1.01 … ×1.6. Separate for Health
  and Attack.
- **Not random since v26:** a 50% chance skips exactly every other wave. The
  SDK models it as credit that accumulates each wave and redeems a skip when
  credit is **strictly > 1**.
- Order (SDK): sum sources → × enhancement → clamp 0..1 → − Skip Reduction
  (subtract) → × Skip Reduction (multiply) → − Skip Decay, each floored at 0.
- Wave Skip processes ELS once per skipped wave.
- Big level reductions have diminishing returns: up to 100 count in full,
  above that `400 − 300·e^(−⌊(n−100)/1500⌋)`, truncated (flat from 101 to 1599).

## 5. The tower — offense

Most of this already exists in `engine/` (eDPS, UWs — see
[ultimate-weapons.md](ultimate-weapons.md)). New or more exact from the SDK:
- **Workshop Damage closed form** (SDK `workshop/damage.ts`, checked against
  all 6001 table rows): `3 + 2.8L + 0.077L² + Σ cᵢ(L − Tᵢ)^pᵢ` over bands at
  L 999/1499/1999/2499/2999/3499/3999 (p 2.10 → 2.34, c 0.08 → 0.20). The
  Damage Decay battle condition subtracts levels before this. In-run levels
  above 6000 (free upgrades with Infinity Threshold): Health and Regen keep
  their level-6000 base × Damage(L)/Damage(6000).
- **Attack speed:** (workshop × lab × card + module substat) × enhancement;
  not linear shots/second — diminishing returns at medium speed and above 40.
- **Range:** soft-capped (`computeMaxDistance`); multishot uses the range
  stat, normal fire the drawn ring. Targeting priorities, bounce and
  multishot rules in `combat/multishot-bounce.ts`.
- **Orbs** instantly kill most normal enemies they touch (not bosses,
  elites, fleets; "Orb Resistance" BC turns that into % of health). Up to
  12 + 3 orbs; speed in rotations/minute.
- **Land mines:** chance per kill to drop (to 30%), damage % of tower damage
  using average crit — `LM% × dmg × (1 + CF·CC) × (1 + SCM·SCC·CC)`.
- **Thorns:** % of the enemy's max health when it hits the tower (wiki;
  bosses half; fleets 85% resist, current health) — the SDK calls it a share
  of the enemy's contact damage (see disagreements).
- **Lifesteal:** % of projectile damage dealt (to 4.46%), can't heal past max.

## 6. The tower — defense and survival

- **Damage taken, in order (SDK, from the game):** Defense % (linear, hard
  cap 98%) → Defense Absolute (subtract) → Chrono Field damage reduction →
  Chain Thunder → Flame Bot → Primordial Collapse → Negative Mass Projector.
- **Workshop curves:** Health Regen, recovery amount/max, orb speed closed
  forms in `workshop/defense-stats.ts`.
- **Recovery packages:** chance per wave (6% base → 30% workshop; up to 82%
  with lab 4%, card 33%, Ancestral substat 15%); each heals 14% → 134% of max
  health, and can overheal up to ×16.5 (Max Recovery). Applied on spawn.
- **Wall:** health 20% → 200% of tower health (+enhancement ×5, labs);
  rebuild 600 s base, −2 s/level, hard cap 150 s; pushes enemies out on
  rebuild; wall regen = % of tower regen; wall thorns; invincibility lab.
- **Death prevention is a chain, not independent chances:** Death Defy
  (0.4%/level → 30%, 40% cap all sources) → Energy Shield (card; fires on
  **any** hit, recharges) → Second Wind (card) → Demon Mode → Nuke (the last
  two only with their vault automation). Each fires only if nothing earlier did.
- **Vampire drain** ignores defenses' modifiers and switches off regen.

## 7. In-run progression

- **Cash:** start $80 (+$5/level Starting Cash lab, to $575). Enemy cash
  value $1, +$1 every 10 waves to wave 200, then +$1 every 20 waves; × type
  multiplier (table above). Cash/Wave from wave 2. Interest = (cash +
  CPW × cash bonus) × interest% after Cash/Wave; cap $50 → $15,000 (lab) →
  ×7 enhancement = $105,000/wave.
- **In-run upgrades:** workshop levels (coins) are where each stat starts;
  cash buys more levels during the run, reset after. **How much a player
  buys depends on how they play** (AFK vs active) — a modelling choice.
- **Free upgrades:** each wave, per Attack/Defense/Utility: 0.5%/level → 49.5%
  + card + perk + substats, × enhancement (to ×2); over 100% can give 2;
  never picks a maxed stat; rolls again for each skipped wave. Infinity
  Threshold (generator unique) adds 1000–4000 extra free-upgrade levels for
  Damage / Health / Regen.
- **Perks:** a pick every N waves: `N = trunc((base − Waves Required lab) ×
  (1 − 0.20 × perks × (1 + SPB/100)))`, base 200 → 250 after 20 perks, 300
  after 30, 350 after 40. Pools: 15 standard / 9 UW / 10 trade-off, drawn
  65/20/15%. Caps: 5 for most, 3 Bounce Shot & Wave Requirement, 2 Orbs, 1
  for UW and trade-off perks. Exact stacking/routing in SDK `perks/benefit.ts`.
  Which perks get taken depends on the player's Auto Pick ranking.
- **Wave Skip:** a skipped wave pays ×1.1 of the previous wave's coins, cash
  and cells (×1.1ⁿ for a chain), rolls free upgrades and ELS per skipped
  wave, and doesn't skip fleets.

## 8. Economy

Already modelled relative to a battle report in `engine/farming.ts`. The SDK
adds a per-wave simulator (`simulateWaveEconRows`): expected kills, coins,
cells and shards per wave from spawn yield, drop rates and coin multipliers,
including wave skip, Golden Combo (`goldenComboMultiplier`, float32 like the
game), interest, intro sprint, fetch, generator modules. Coin decay and the
type mix are the two things it says it doesn't fully capture.

## 9. What a battle report gives us (for calibration)

`BattleHistory` in the export keeps **the last 5 runs only**, ~150 run
totals each (no per-wave timeline). Useful ones: tier, wave, game/real
time, coins (by source: kills, waves, wave skip, Golden Combo/GT, BH, SL,
DW, orbs, crit coin, fetch), cash, interest, cells, shards, **kills per
type** (basic, fast, tank, ranged, boss, protector, vampire, ray, scatter,
saboteur, commander, overcharge), kills and damage per source, enemies hit
per source, **damage taken** (tower, wall, while berserked), **blocked** by
Defense %, Defense Absolute, CF, Chain Thunder, Flame Bot, Primordial
Collapse, NMP, **healing** (regen, wall regen, lifesteal, packages, Death
Wave), death defies / second winds / energy-shield absorbs / nukes / demon
modes, recovery packages, free upgrades (per category), upgrades bought,
**enemy health / attack levels skipped**, waves skipped, largest Golden
Combo / wave skip / ILM charge / SM stack, and `KilledBy` (code, meaning
unknown).

**Today the site** replaces its stored runs on every import
(`useGameStore` → `importedBattles: imp.battles`) and keeps ~30 parsed
fields (`engine/battleReport.ts`). For the simulator it should keep **all**
fields of every run and **merge** imports (dedupe by date), so a player's
history grows past 5 runs.

## 10. Gaps — not documented anywhere reachable

1. **How often enemies attack** (seconds between melee hits; ranged fire rate
   and range), **base movement speed** (m/s), **spawn distance** and tower
   size. Needed to turn "enemies alive" into "damage per second at the tower".
   Plan: fit one "incoming pressure" factor per player from the reports'
   damage-taken + blocked totals; or measure from a short ×1-speed recording.
2. **Enemy type mix** by wave/tier (only averages). Plan: calibrate from
   per-type kill counts.
3. **How a player spends cash in-run and which perks they take.**
4. **Exactness of the health/damage formula** (SDK self-disagreement).
5. **Per-wave data** — reports are run totals; a run's shape (when damage
   taken rises) is invisible. Death wave + totals constrain it.
6. `KilledBy` codes.

## Proposed design (not built)

1. **Wave loop** (in a Web Worker): for each wave — enemy levels after ELS
   credit, spawn count by type (calibrated mix), boss / elite / fleet /
   protector schedule, battle conditions for the tier; tower stats after
   workshop + in-run levels + free upgrades + perks so far; UW uptime.
2. **Fight per wave:** time each type takes to die vs. the tower's eDPS
   (orbs / BH / DW / CL… by their real share, as `edps.ts` does), so enemies
   that survive pile up (caps), keep heating up, lose coin value; damage
   that reaches the tower goes through the defense stack, against regen,
   lifesteal, packages, wall; lethal hits go through the death-prevention
   chain. Death wave = first wave the tower can't survive.
3. **Economy per wave:** SDK-style coins / cells / shards, with coin decay
   and the calibrated mix.
4. **Calibration:** fit a few free factors (incoming pressure, effective
   damage, coin scale, enemy mix) so a chosen battle report is reproduced —
   death wave, damage taken / blocked, coins, kills per type.
5. **Backtest:** run every stored report through it and show the error
   (predicted vs. real death wave and coins) on the page.
6. **What-if:** apply an upgrade, re-run, show Δ waves and Δ coins per run;
   feed the optimizer.

## Needed from the owner

- **Wave Info screenshots** (tap the wave counter in a run): every enemy row
  (health, attack, spawn %, speed) at 3–4 waves (e.g. 100, 1000, 3000, 6000)
  on the tiers played, plus one tournament wave — settles the scaling
  formula, the type mix and the speed disagreements.
- **More battle history:** the export only keeps 5 runs. Import after
  several runs (farming, pushing, tournament) so we have 15–30 to calibrate
  and backtest with — the site should keep every imported run, not just the
  latest 5.
- **How runs are played:** AFK or active; is cash spent in-run (on what);
  game speed used; Auto Pick perk ranking; which UWs are on auto.
- Optional: a 2–3 minute ×1-speed screen recording mid-run with health
  visible — to measure enemy attack rate and movement, which nothing documents.
- `KilledBy` codes, if known (what killed you, per number).
- Decision: use `thetowersdk` as a pinned dependency (with credits on the
  site) or port its formulas.

## Disagreements to settle

| Topic | Says | Other source says |
|---|---|---|
| Basic enemy coins | 1 (SDK) | 0 (wiki table) |
| Tank speed | ×0.6 (wiki) | ×0.5 (SDK summary), ×0.336 (SDK wave-panel ratio) |
| Boss speed | ×0.4 (wiki) | ×0.3 (SDK, GV) |
| Protector damage cut | ×0.6 taken / "40% less" (wiki, SDK) | "60% reduced" (GV) |
| Protector cap | 10 (wiki Protector entry) | 8 (wiki Normal section, GV) |
| Commander buff | ×1.15 per pulse, 8 stacks (wiki) | "2× aura" (SDK summary) |
| T22 fleets per spawn | 3 (wiki) | 2 (SDK) |
| Thorns | % of enemy max health (wiki) | share of enemy contact damage (SDK) |
| Perk Wave Requirement | −25% (wiki table) | −20% (wiki worked example, SDK) |
| Energy Shield BC | longer recharge (wiki) | shorter duration (SDK lab text) |
| Wave base formula | exact (SDK scaler) | fitted/approximate (SDK constants file) |
