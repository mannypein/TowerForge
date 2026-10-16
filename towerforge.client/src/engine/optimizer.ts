// ============================================================
//  TowerForge Companion — Optimizer Engine
//  Simulation-based upgrade path ranking.
//
//  Architecture:
//    1. simulateCategoryPath() clones full game state
//    2. buildCandidates() scores every possible next upgrade
//    3. Best candidate is applied via applyUpgrade()
//    4. Repeat until exhausted or step limit reached
//
//  Pure functions — no store imports.
//  All state passed as parameters.
// ============================================================
//
// Audit 2026-10-16 (checked against the wiki and a real account's runs):
//  • Glass Cannon is scored by engine/edps.ts when the chosen run has damage
//    by source: each source weighted by what it really dealt (orbs and other
//    fixed sources dilute UW gains), Black Hole by reach (it deals % of enemy
//    health), Smite at the run's proc rate, Consume on kills inside BH. The
//    uncalibrated model below is the fallback; its absolute eDPS isn't real.
//  • Card mastery: stones only unlock (Lv 0); levels come from labs.
//  • Assist: Substat stones stop at 70%, Main Effect at 100% (130% w/ labs).
//  • UW stat values and stone costs match the wiki for all 27 stats.
//  • Paths skip upgrades worth < GC_SCORING.minGainPct.
//
// ┌──────────────────────────────────────────────────────────┐
// │  GLASS CANNON OPTIMIZER — STATUS & HANDOFF (2026-06-25)   │
// └──────────────────────────────────────────────────────────┘
//
//  This documents the in-progress refinement of the GC optimizer so
//  work can continue in a fresh session. The model is eDPS-based:
//  TotalEDPS = (Σ damage-UW eDPS) × CoreUWDamage × SpotlightMult,
//  ranked by ΔeDPS per stone (stones) or raw ΔeDPS% (coin/research).
//
//  ── DONE (verified in-app) ─────────────────────────────────
//  • UW stats read REAL values via uwStatValue() (were using levels).
//  • UW+ models: CL Smite (separate %wave-HP metric, see
//    calcSmiteWaveHPFraction), SM Cover Fire, ILM Charged Mine
//    (ILM_CHARGE_TIME_S=100 assumption), PS Death Creep (1 tick/s
//    additive ramp), DW Kill Wall, CF Chrono Loop (research hidden-
//    slow), BH Consume, SL Light Range. GT+ excluded (coins only).
//  • Stone costs: Level 1 is FREE for every UW stat AND UW+ level;
//    cost of level L = costs[L-2]. maxLv = values.length per stat.
//  • CF: cooldown reaches 60s (maxLv 13); CF-Duration lab folded into
//    uptime; optimizer stops pushing CF Duration once uptime = 100%.
//  • Attack Speed does NOT reduce UW cooldowns (removed). ONLY CL
//    scales with attack speed via calcAttackSpeed() (fire rate).
//  • SL: bonus is a "×damage received" multiplier → uplift uses
//    (bonus-1); SL+ Light Range = lrVal × DamageMeter × range
//    (calcDamageMeter()).
//  • Assist rework: flat proxy REMOVED. multEff scales a module's MAIN
//    effect (cannon Tower Damage via calcCannonModuleMult; core UW
//    Damage via calcCoreUWDamageMult). subEff scales the module's
//    SUB-effects (modBonuses getActiveModules uses subEff). So assist
//    value now REQUIRES the module to be in the loadout assist slot
//    with its main ×value entered.
//  • Assist stone cost = curPct×3, capped at 70% (labs supply 30%).
//  • Workshop / Cards / Enhancements / Labs are eDPS-scored (raw
//    ΔeDPS%), BUT the Coin/Research panels are hidden behind a
//    "coming soon" placeholder in OptimizerTab (runOptimizer only
//    computes the 'stones' path). Re-enable by restoring the row-2
//    panels + computing those cats.
//  • Standalone "Modules" optimizer panel was added then REMOVED.
//
//  ── DONE (cont'd) ──────────────────────────────────────────
//  • MODULE MAIN-EFFECT DAMAGE now AUTO-computed from verified game
//    tables (ModLevels.xlsx → gameData MODULE_BASE_STATS +
//    MODULE_INCREMENT_BRACKETS). calcModuleMainMult(rarity,type,level)
//    = base + Σ per-level increments; cannon column → Tower Damage,
//    core column → UW Damage (different curves, as expected). The
//    earlier "bracket formula was wrong" issue was actually a
//    truncated/rarity-agnostic table; the old ≈×10.4 vs game ×3.293
//    mismatch was a misremembered LEVEL (the real module was ~L110,
//    not L180 — both cited anchors resolve to ~L108-110 under the new
//    table). Per-module `mainMult` kept as an optional manual override.
//    ⚠ TEMP: raw table undershoots the in-game card at HIGH levels by a
//    flat ~17% (A5 L201: cannon ×16.70→game 19.53, core ×21.63→game 25.36).
//    A ×1.17 stopgap (MODULE_MAIN_EFFECT_TEMP_MULT) is applied to the
//    auto-computed value for now. STILL TO TRACK DOWN: whether the 160+
//    increments actually keep climbing (sheet rows look filled-down) or
//    there's a separate global module boost. Need L160/180/201 card
//    readings to derive the real curve, then DELETE the fudge factor.
//
//  ── STILL MISSING / TODO ───────────────────────────────────
//  2. SL base Bonus/Angle/Quantity workshop values ✅ VERIFIED
//     Wiki data integrated into spotlightWorkshop.ts constants.
//  3. Spotlight Missiles lab unmodeled (fires SM-damage missiles
//     every 19s→2s) — would be an additive eDPS term.
//  4. Dimension Core UNIQUE effect (CL 60% initial-hit + stacking
//     shock) not modeled; named-module uniques only apply in MAIN
//     slot. CL "Quantity" & CL "Chance" subs aren't in matchUWSub.
//  5. Workshop Damage base = exponential approximation (lv1=6,
//     lv100≈1050) — calibration TODO (towerDamage.ts).
//  6. Super Tower UW mult (modBonuses calcSuperTowerUWMult) has an
//     ESTIMATED per-level constant + stCard=0 placeholder.
//  7. GT lab (GT-Bonus / GT-Duration) not used by calcGTMult
//     (deferred — GT is coins/cash, not GC eDPS).
//  8. Non-GC builds (eHP / Hybrid / Farming) not implemented
//     (BUILD_SUPPORT.ready=false).
//  9. Module level caps look module-specific (e.g. /300 vs /260) —
//     RARITIES maxLv may need revisiting alongside the dmg tables.
// ============================================================

import {
    UWS,
    UW_STONE_COSTS,
    UW_PLUS_DATA,
    UW_PLUS_UNLOCK_COSTS,
    CARDS,
    CARD_MASTERY_STONE_COSTS,
    LABS,
    WS_STATS,
    WS_ENH,
} from '../constants/gameData';

import { GC_SCORING } from '../constants/optimizerConfig';

import { calcTTT, calcCFPlusMarginalTTT, calcCFUptime } from './ttt';
import { calcTowerEDPS, calcSmiteWaveHPFraction } from './uwdps';
import { readActiveModuleBonuses } from './modBonuses';
import { coinRate } from './farming';
import type { FarmCalibration } from './farming';
import { ehpScore } from './ehp';
import type { EhpCalibration } from './ehp';
import { edpsScore } from './edps';
import type { EdpsCalibration } from './edps';
import {
    WS_COIN_PER_KILL, WS_COIN_PER_WAVE, WS_HEALTH, WS_HEALTH_REGEN, WS_DEFENSE_PCT,
    WS_DEFENSE_ABSOLUTE, WS_THORNS, WS_WALL_HEALTH, WS_RECOVERY_AMOUNT, WS_MAX_RECOVERY, WS_PACKAGE_CHANCE,
} from '../constants/buildStatCurves';
import type { StatCurve } from '../constants/buildStatCurves';

// Workshop stats whose coin costs are known (from the community wiki).
const WS_COST_CURVES: Record<string, StatCurve> = {
    'Health': WS_HEALTH,
    'Health Regen': WS_HEALTH_REGEN,
    'Defense %': WS_DEFENSE_PCT,
    'Defense Absolute': WS_DEFENSE_ABSOLUTE,
    'Thorn Damage': WS_THORNS,
    'Wall Health': WS_WALL_HEALTH,
    'Coin/Kill Bonus': WS_COIN_PER_KILL,
    'Coin/Wave': WS_COIN_PER_WAVE,
    'Recovery Amount': WS_RECOVERY_AMOUNT,
    'Max Amount': WS_MAX_RECOVERY,
    'Package Chance': WS_PACKAGE_CHANCE,
};

import type {
    AppState,
    OptCandidate,
    OptCategory,
    OptAlt,
    WSPreset,
    EnhData,
    UWData,
    LabData,
    CardData,
    ModBonuses,
    PerkData,
} from '../types/gameTypes';

// ── State Snapshot ────────────────────────────────────────────
// Subset of AppState the optimizer needs. Passed by value (cloned).
export interface OptimizerSnapshot {
    presetIdx: number;
    wsData: WSPreset[];
    labData: LabData;
    cardData: CardData;
    perkData: PerkData;
    uwData: UWData;
    relicData: Record<string, number>;
    modBonuses: ModBonuses;
    moduleState: AppState['moduleState'];
    enhData: EnhData;
    botData: AppState['botData'];
    excludedUWs?: string[];   // UW abbrs to skip in uw / uwp candidates
    // What upgrades are scored on: tower eDPS (Glass Cannon), coins per
    // hour (Farming, calibrated by `farm`) or survival (eHP, calibrated by
    // `ehp`). Defaults to eDPS.
    metric?: 'edps' | 'coins' | 'ehp';
    farm?: FarmCalibration;
    ehp?: EhpCalibration;
    // eDPS weighted by a run's real damage by source (engine/edps.ts). Without
    // it, eDPS is the uncalibrated UW model.
    edps?: EdpsCalibration;
}

// ── Deep Clone Snapshot ───────────────────────────────────────
function cloneSnapshot(s: OptimizerSnapshot): OptimizerSnapshot {
    return JSON.parse(JSON.stringify(s));
}

// ── eDPS Delta % ─────────────────────────────────────────────
// Core scoring function for GC build.
// Returns (after - before) / before × 100.
function edpsDeltaPct(
    before: number,
    after: number,
): number {
    if (before <= 0) return after > 0 ? 100 : 0;
    return ((after - before) / before) * 100;
}

// ── Get Current eDPS ─────────────────────────────────────────
function getEDPS(snap: OptimizerSnapshot): number {
    const tttData = calcTTT(
        snap.presetIdx,
        snap.wsData,
        snap.labData,
        snap.cardData,
        snap.uwData,
        snap.modBonuses,
    );
    return calcTowerEDPS(
        snap.uwData,
        snap.modBonuses,
        tttData.ttt,
        snap.presetIdx,
        snap.wsData,
        snap.labData,
        snap.cardData,
        snap.moduleState,
        snap.relicData,
        snap.enhData,
        snap.botData,
    );
}

// ── Build Score ──────────────────────────────────────────────
// eDPS for Glass Cannon; relative coins/hour for Farming; relative
// survival for eHP. Candidates are scored by the % change of whichever
// metric the snapshot uses.
function getScore(snap: OptimizerSnapshot): number {
    if (snap.metric === 'coins' && snap.farm) return coinRate(snap, snap.farm);
    if (snap.metric === 'ehp' && snap.ehp) return ehpScore(snap, snap.ehp);
    if (snap.edps) return edpsScore(snap, snap.edps);
    return getEDPS(snap);
}

// ============================================================
//  BUILD CANDIDATES
//  Returns all possible next upgrades scored by eDPS/stone.
// ============================================================
export function buildCandidates(
    snap: OptimizerSnapshot,
    cat: OptCategory,
): OptCandidate[] {
    const candidates: OptCandidate[] = [];
    const basEDPS = getScore(snap);
    const isEdps = (snap.metric ?? 'edps') === 'edps';
    const excluded = new Set(snap.excludedUWs ?? []);

    // ── UW Stone Upgrades ──────────────────────────────────────
    if (cat === 'uw') {
        // CF Duration is wasted once effective duration ≥ effective cooldown
        // (CF is already permanently active, uptime = 100%). Stop recommending
        // CF Duration upgrades at that point.
        const cfAtFullUptime = calcCFUptime(
            snap.modBonuses, snap.uwData, snap.wsData, snap.labData, snap.cardData,
        ) >= 1;

        for (const uw of UWS) {
            const ud = snap.uwData.data[uw.a];
            if (!ud?.own) continue;
            if (excluded.has(uw.a)) continue;

            uw.s.forEach(([statName, maxLv], statIdx) => {
                const curLv = ud.sv[statIdx] ?? 0;
                if (curLv >= maxLv) return;

                // Don't push CF Duration (statIdx 0) past 100% uptime.
                if (uw.a === 'CF' && statIdx === 0 && cfAtFullUptime) return;

                // Level 1 is free (comes with the UW); the cost array holds the
                // paid upgrades starting at Lv1→Lv2. Reaching level curLv+1 costs
                // costs[curLv-1].
                const costs = UW_STONE_COSTS[uw.a]?.[statIdx];
                if (!costs) return;
                const cost = costs[curLv - 1];
                if (cost == null) return;

                // All UW stats (incl. CF slow/duration/cooldown) — simulate.
                // CF doesn't contribute eDPS directly, but bumping its level
                // flows through calcTTT (slow → longer TTT → more UW acts),
                // so getEDPS captures its real, cap-aware value.
                const after = cloneSnapshot(snap);
                after.uwData.data[uw.a]!.sv[statIdx] = curLv + 1;
                const afterEDPS = getScore(after);
                const delta = edpsDeltaPct(basEDPS, afterEDPS);

                candidates.push({
                    category: 'uw',
                    label: `${uw.n} — ${statName}`,
                    subLabel: `Lv ${curLv} → ${curLv + 1}`,
                    fromLv: curLv,
                    toLv: curLv + 1,
                    cost,
                    costType: 'stones',
                    scorePct: delta,
                    scorePerCost: cost > 0 ? delta / cost : 0,
                });
            });
        }
    }

    // ── UW+ Upgrades ──────────────────────────────────────────
    // UW+ only unlocks once all 9 UWs are owned — matches the gate
    // already enforced in the UW tab UI.
    if (cat === 'uwp' && UWS.every(u => snap.uwData.data[u.a]?.own)) {
        // UW_PLUS_UNLOCK_COSTS is a single global sequence — the cost of
        // your *next* UW+ unlock depends on how many you've already
        // unlocked in total, not which UW it is.
        const unlockedPlusCount = UWS.filter(u => snap.uwData.data[u.a]?.upOwn).length;

        for (const uw of UWS) {
            const ud = snap.uwData.data[uw.a];
            if (!ud?.own) continue;
            if (excluded.has(uw.a)) continue;
            const plusDef = UW_PLUS_DATA[uw.a];
            if (!plusDef) continue;

            // Unlock UW+
            if (!ud.upOwn) {
                const unlockCost = UW_PLUS_UNLOCK_COSTS[unlockedPlusCount];
                if (unlockCost == null) continue;

                const after = cloneSnapshot(snap);
                after.uwData.data[uw.a]!.upOwn = true;
                after.uwData.data[uw.a]!.upLvl = 0;
                // CL+ Smite is %wave-HP (not tower eDPS); score by the gain in
                // wave-HP% dealt per enemy instead of the eDPS delta.
                const delta = uw.a === 'CL' && isEdps && !snap.edps
                    ? (calcSmiteWaveHPFraction(after.uwData) - calcSmiteWaveHPFraction(snap.uwData)) * 100
                    : edpsDeltaPct(basEDPS, getScore(after));

                candidates.push({
                    category: 'uwp',
                    label: `${uw.n} — Unlock ${plusDef.name}`,
                    subLabel: `Unlock → Lv 1 (${plusDef.vals[0]} ${plusDef.unit})`,
                    fromLv: -1,
                    toLv: 0,
                    cost: unlockCost,
                    costType: 'stones',
                    scorePct: delta,
                    scorePerCost: unlockCost > 0 ? delta / unlockCost : 0,
                });
                continue;
            }

            // Upgrade UW+
            const curLv = ud.upLvl ?? 0;
            if (curLv >= uw.upMax) continue;

            const costs = plusDef.costs;
            const cost = costs[curLv];
            if (cost == null) continue;

            // CF+ is path length — use marginal TTT delta
            if (uw.a === 'CF' && isEdps) {
                const tttData = calcTTT(snap.presetIdx, snap.wsData, snap.labData, snap.cardData, snap.uwData, snap.modBonuses);
                const deltaTTT = calcCFPlusMarginalTTT(
                    curLv, curLv + 1,
                    tttData.range,
                    0,
                    tttData.cappedSlow,
                    0,
                );
                const newTTT = tttData.ttt + deltaTTT;
                const afterEDPS = snap.edps
                    ? edpsScore(snap, snap.edps, newTTT)
                    : calcTowerEDPS(
                        snap.uwData, snap.modBonuses, newTTT,
                        snap.presetIdx, snap.wsData, snap.labData,
                        snap.cardData, snap.moduleState,
                        snap.relicData, snap.enhData,
                        snap.botData,
                    );
                const delta = edpsDeltaPct(basEDPS, afterEDPS);
                candidates.push({
                    category: 'uwp',
                    label: `${uw.n} — ${plusDef.name} Lv ${curLv + 2}`,
                    subLabel: `${plusDef.vals[curLv + 1]} ${plusDef.unit}`,
                    fromLv: curLv,
                    toLv: curLv + 1,
                    cost,
                    costType: 'stones',
                    scorePct: delta,
                    scorePerCost: cost > 0 ? delta / cost : 0,
                });
                continue;
            }

            const after = cloneSnapshot(snap);
            after.uwData.data[uw.a]!.upLvl = curLv + 1;
            // CL+ Smite is %wave-HP, not tower eDPS — score by the wave-HP% gain.
            const delta = uw.a === 'CL' && isEdps && !snap.edps
                ? (calcSmiteWaveHPFraction(after.uwData) - calcSmiteWaveHPFraction(snap.uwData)) * 100
                : edpsDeltaPct(basEDPS, getScore(after));

            candidates.push({
                category: 'uwp',
                label: `${uw.n} — ${plusDef.name} Lv ${curLv + 2}`,
                subLabel: `${plusDef.vals[curLv + 1]} ${plusDef.unit}`,
                fromLv: curLv,
                toLv: curLv + 1,
                cost,
                costType: 'stones',
                scorePct: delta,
                scorePerCost: cost > 0 ? delta / cost : 0,
            });
        }
    }

    // ── Card Mastery Unlocks ───────────────────────────────────
    // Stones only UNLOCK a mastery, at its first value (level 0). Levels 1–9
    // come from that card's mastery lab afterwards (coins and weeks of lab
    // time), so an unlocked mastery has nothing left to buy with stones.
    // fromLv −1 = locked; toLv = the lab level it unlocks at (0 until labbed).
    if (cat === 'mast') {
        const activeNames = new Set(snap.cardData.presets[snap.presetIdx] ?? []);

        for (const [cardName] of CARDS) {
            const entry = snap.cardData.data[cardName];
            if (!entry || entry.s < 7) continue;       // must be 7★
            if (!activeNames.has(cardName)) continue;   // must be active in preset
            if (entry.mu) continue;                     // already unlocked

            const cost = CARD_MASTERY_STONE_COSTS[cardName];
            if (!cost) continue;

            const labLv = entry.m ?? 0;
            const after = cloneSnapshot(snap);
            after.cardData.data[cardName]!.mu = true;
            const delta = edpsDeltaPct(basEDPS, getScore(after));

            candidates.push({
                category: 'mast',
                label: `${cardName} Mastery`,
                subLabel: `Unlock (Lv ${labLv}) — more levels come from labs`,
                fromLv: -1,
                toLv: labLv,
                cost,
                costType: 'stones',
                scorePct: delta,
                scorePerCost: cost > 0 ? delta / cost : 0,
            });
        }
    }

    // ── Assist Module Stones ───────────────────────────────────
    // Efficiency % = 1% base + stone levels + Assist lab levels (labs add up
    // to 30%). The k-th stone level costs 15 + 3k — with the base, 12 + 3 ×
    // (base + stone %). Substat Efficiency stones stop at 70% (the wiki's
    // per-slot total matches: unlock + rarities 4,600 + 2 × 8,073 = 20,746,
    // i.e. 69 stone levels each). Main Effect Efficiency caps at 130% since
    // v27.1, so its stones go to 100% — not yet checked in game.
    // Every assist slot is scored in the build's metric: main effects (cannon
    // damage, armor health, generator coins, core UW damage), sub-effects and
    // unique effects all flow into eDPS, coins and survival.
    if (cat === 'assist') {
        const ASSIST_TYPES = ['cannon', 'armor', 'generator', 'core'];
        const ASSIST_STONE_MAX = { multEff: 100, subEff: 70 };   // base 1% + stone levels

        for (const type of ASSIST_TYPES) {
            const ad = snap.moduleState.assistData[type] ?? { rarity: 'locked', multEff: 0, subEff: 0 };
            const labMultName = `Assist-${type.charAt(0).toUpperCase() + type.slice(1)} Mult`;
            const labSubName = `Assist-${type.charAt(0).toUpperCase() + type.slice(1)} Substat`;
            const labMultLv = snap.labData?.[labMultName] ?? 0;
            const labSubLv = snap.labData?.[labSubName] ?? 0;

            // Mult Eff upgrade — only while unlocked and stones haven't hit 70%
            const multEffStone = (ad.multEff ?? 0) - labMultLv;   // base 1% + stone levels
            if (ad.rarity !== 'locked' && multEffStone < ASSIST_STONE_MAX.multEff) {
                const totalPct = ad.multEff ?? 0;
                const stoneLv = multEffStone;
                const cost = 12 + Math.max(1, stoneLv) * 3;
                const after = cloneSnapshot(snap);
                after.moduleState.assistData[type] = { ...ad, multEff: totalPct + 1 };
                // Recalculate modBonuses since assist multEff changed
                after.modBonuses = readActiveModuleBonuses(
                    after.moduleState, after.perkData, after.labData, after.cardData, after.modBonuses.run,
                );
                const afterEDPS = getScore(after);
                const delta = edpsDeltaPct(basEDPS, afterEDPS);

                candidates.push({
                    category: 'assist',
                    label: `${type.charAt(0).toUpperCase() + type.slice(1)} Assist — Mult Eff`,
                    subLabel: `${totalPct}% → ${totalPct + 1}% (stones ${Math.max(0, stoneLv - 1)}/99, lab ${labMultLv})`,
                    fromLv: totalPct,
                    toLv: totalPct + 1,
                    cost,
                    costType: 'stones',
                    scorePct: delta,
                    scorePerCost: delta / Math.max(1, cost),
                });
            }

            // Substat Eff upgrade — only while unlocked and stones haven't hit 70%
            const subEffStone = (ad.subEff ?? 0) - labSubLv;   // base 1% + stone levels
            if (ad.rarity !== 'locked' && subEffStone < ASSIST_STONE_MAX.subEff) {
                const totalPct = ad.subEff ?? 0;
                const stoneLv = subEffStone;
                const cost = 12 + Math.max(1, stoneLv) * 3;
                const after = cloneSnapshot(snap);
                after.moduleState.assistData[type] = { ...ad, subEff: totalPct + 1 };
                // Recalculate modBonuses since assist subEff changed
                after.modBonuses = readActiveModuleBonuses(
                    after.moduleState, after.perkData, after.labData, after.cardData, after.modBonuses.run,
                );
                const afterEDPS = getScore(after);
                const delta = edpsDeltaPct(basEDPS, afterEDPS);

                candidates.push({
                    category: 'assist',
                    label: `${type.charAt(0).toUpperCase() + type.slice(1)} Assist — Substat Eff`,
                    subLabel: `${totalPct}% → ${totalPct + 1}% (stones ${Math.max(0, stoneLv - 1)}/69, lab ${labSubLv})`,
                    fromLv: totalPct,
                    toLv: totalPct + 1,
                    cost,
                    costType: 'stones',
                    scorePct: delta,
                    scorePerCost: delta / Math.max(1, cost),
                });
            }

            // Rarity upgrades (Epic → Legendary → Mythic → Ancestral)
            const currentRarity = ad?.rarity ?? 'locked';
            const rarityProgression: ('locked' | 'Epic' | 'Legendary' | 'Mythic' | 'Ancestral')[] = ['locked', 'Epic', 'Legendary', 'Mythic', 'Ancestral'];
            const rarityIndex = rarityProgression.indexOf(currentRarity);
            const rarityToUnlock = currentRarity === 'locked' ? 'Epic' : null;
            const rarityToUpgrade = rarityIndex >= 0 && rarityIndex < rarityProgression.length - 1
                ? rarityProgression[rarityIndex + 1]
                : null;

            // Rarity unlock (locked → Epic)
            if (rarityToUnlock) {
                const unlockCost = 1000;
                const after = cloneSnapshot(snap);
                after.moduleState.assistData[type] = { ...ad, rarity: 'Epic' };
                // Recalculate modBonuses since assist rarity changed
                after.modBonuses = readActiveModuleBonuses(
                    after.moduleState, after.perkData, after.labData, after.cardData, after.modBonuses.run,
                );
                const afterEDPS = getScore(after);
                const delta = edpsDeltaPct(basEDPS, afterEDPS);

                candidates.push({
                    category: 'assist',
                    label: `${type.charAt(0).toUpperCase() + type.slice(1)} Assist — Unlock`,
                    subLabel: `Locked → Epic`,
                    fromLv: 0,
                    toLv: 1,
                    cost: unlockCost,
                    costType: 'stones',
                    scorePct: delta,
                    scorePerCost: delta / Math.max(1, unlockCost),
                });
            }

            // Rarity upgrades (Epic → Legendary, etc.)
            if (rarityToUpgrade) {
                const rarityCosts: Record<string, number> = {
                    Epic: 1000,
                    Legendary: 1000,
                    Mythic: 1200,
                    Ancestral: 1400,
                };
                const upgradeCost = rarityCosts[rarityToUpgrade] ?? 1000;
                const after = cloneSnapshot(snap);
                after.moduleState.assistData[type] = { ...ad, rarity: rarityToUpgrade };
                // Recalculate modBonuses since assist rarity changed
                after.modBonuses = readActiveModuleBonuses(
                    after.moduleState, after.perkData, after.labData, after.cardData, after.modBonuses.run,
                );
                const afterEDPS = getScore(after);
                const delta = edpsDeltaPct(basEDPS, afterEDPS);

                candidates.push({
                    category: 'assist',
                    label: `${type.charAt(0).toUpperCase() + type.slice(1)} Assist — Rarity`,
                    subLabel: `${currentRarity} → ${rarityToUpgrade}`,
                    fromLv: rarityIndex,
                    toLv: rarityIndex + 1,
                    cost: upgradeCost,
                    costType: 'stones',
                    scorePct: delta,
                    scorePerCost: delta / Math.max(1, upgradeCost),
                });
            }
        }
    }

    // ── Workshop ───────────────────────────────────────────────
    if (cat === 'workshop') {
        const cats = ['attack', 'defense', 'utility'] as const;
        for (const wsCat of cats) {
            const stats = WS_STATS[wsCat] ?? [];
            stats.forEach(([statName, maxLv], idx) => {
                const curLv = snap.wsData[snap.presetIdx]?.[wsCat]?.[idx] ?? 0;
                if (curLv >= maxLv) return;

                // Simulate the +1 and score the gain in the build's metric.
                const after = cloneSnapshot(snap);
                after.wsData[after.presetIdx][wsCat][idx] = curLv + 1;
                const delta = edpsDeltaPct(basEDPS, getScore(after));

                // Real coin costs are known for some stats; others show a level proxy.
                const coinCurve = WS_COST_CURVES[statName] ?? null;
                const cost = coinCurve ? Math.round(coinCurve.costAt(curLv + 1)) : curLv + 1;

                candidates.push({
                    category: 'workshop',
                    label: `WS ${wsCat.charAt(0).toUpperCase() + wsCat.slice(1)} — ${statName}`,
                    subLabel: `Lv ${curLv} → ${curLv + 1}`,
                    fromLv: curLv,
                    toLv: curLv + 1,
                    cost,
                    costKnown: coinCurve !== null,
                    costType: 'coins',
                    scorePct: delta,
                    // Farming/eHP: rank by gain per coin (every stat those models score
                    // has a known cost). GC keeps raw gain (attack stat costs aren't modeled).
                    scorePerCost: isEdps ? delta : coinCurve ? delta / Math.max(1, cost) : 0,
                });
            });
        }
    }

    // ── Labs ───────────────────────────────────────────────────
    if (cat === 'labs') {
        for (const group of LABS) {
            for (const [labName, maxLv] of group.l) {
                const curLv = snap.labData[labName] ?? 0;
                if (curLv >= maxLv) continue;

                const after = cloneSnapshot(snap);
                after.labData[labName] = curLv + 1;
                const afterEDPS = getScore(after);
                const delta = edpsDeltaPct(basEDPS, afterEDPS);

                candidates.push({
                    category: 'labs',
                    label: labName,
                    subLabel: `Lv ${curLv} → ${curLv + 1}`,
                    fromLv: curLv,
                    toLv: curLv + 1,
                    cost: curLv + 1,
                    costType: 'research',
                    scorePct: delta,
                    scorePerCost: delta,   // rank by raw eDPS gain
                });
            }
        }
    }

    // ── Cards (star upgrades) ──────────────────────────────────
    // Most card effects only reach eDPS via Mastery (7★, handled by the
    // 'mast' category), so star bumps below 7★ usually score ~0. The
    // exceptions surface naturally through simulation: Critical Chance
    // (per-star bonus) and Berserker (active presence).
    if (cat === 'cards') {
        for (const [cardName] of CARDS) {
            const entry = snap.cardData.data[cardName];
            const curStars = entry?.s ?? 0;
            if (curStars >= 7) continue;

            const after = cloneSnapshot(snap);
            if (!after.cardData.data[cardName]) after.cardData.data[cardName] = { s: 0, m: 0 };
            after.cardData.data[cardName]!.s = curStars + 1;
            const delta = edpsDeltaPct(basEDPS, getScore(after));

            candidates.push({
                category: 'cards',
                label: `${cardName} Card`,
                subLabel: `${curStars}★ → ${curStars + 1}★`,
                fromLv: curStars,
                toLv: curStars + 1,
                cost: curStars + 1,
                costType: 'coins',
                scorePct: delta,
                scorePerCost: delta,   // rank by raw eDPS gain
            });
        }
    }

    // ── Enhancements ───────────────────────────────────────────
    if (cat === 'enhancements') {
        const cats = ['attack', 'defense', 'utility'] as const;
        for (const enhCat of cats) {
            const enhs = WS_ENH[enhCat] ?? [];
            enhs.forEach(([enhName, maxLv], idx) => {
                const owned = snap.enhData?.u?.[enhCat]?.[idx] ?? false;
                if (!owned) return;
                const curLv = snap.enhData?.d?.[enhCat]?.[idx] ?? 0;
                if (curLv >= maxLv) return;

                const after = cloneSnapshot(snap);
                if (!after.enhData.d[enhCat]) after.enhData.d[enhCat] = [];
                after.enhData.d[enhCat][idx] = curLv + 1;
                const delta = edpsDeltaPct(basEDPS, getScore(after));

                candidates.push({
                    category: 'enhancements',
                    label: `Enh ${enhCat.charAt(0).toUpperCase() + enhCat.slice(1)} — ${enhName}`,
                    subLabel: `Lv ${curLv} → ${curLv + 1}`,
                    fromLv: curLv,
                    toLv: curLv + 1,
                    cost: curLv + 1,
                    costType: 'coins',
                    scorePct: delta,
                    scorePerCost: delta,   // rank by raw eDPS gain
                });
            });
        }
    }

    // ── Bots ────────────────────────────────────────────────────
    // Amplify Bot contributes to DPS directly.
    // Echoing Shot (Amplify Bot+) multiplies bullet count.
    if (cat === 'bots') {
        const ampEntry = snap.botData?.['Amplify Bot'];
        if (ampEntry?.owned) {
            const medals = ampEntry.medals ?? [];

            // Amplify Bot Bonus upgrades (medal stat index 2)
            const bonusLv = medals[2] ?? 0;
            const bonusMaxLv = 30;
            if (bonusLv < bonusMaxLv) {
                const after = cloneSnapshot(snap);
                if (!after.botData['Amplify Bot']) {
                    after.botData['Amplify Bot'] = { owned: true, medals: [0, 0, 0, 0, 0], plusLv: 0 };
                }
                after.botData['Amplify Bot'].medals[2] = bonusLv + 1;

                const delta = edpsDeltaPct(basEDPS, getScore(after));

                candidates.push({
                    category: 'bots',
                    label: 'Amplify Bot — Bonus',
                    subLabel: `Lv ${bonusLv} → ${bonusLv + 1}`,
                    fromLv: bonusLv,
                    toLv: bonusLv + 1,
                    cost: 0,
                    costType: 'coins',
                    scorePct: delta,
                    scorePerCost: delta > 0 ? Infinity : 0,
                });
            }

            // Echoing Shot upgrades (Amplify Bot+, medal stat index 4)
            if (ampEntry.plusLv > 0) {
                const echoingLv = medals[4] ?? 0;
                const echoingMaxLv = 9;  // Levels 0-9 → 3-12 projectiles
                if (echoingLv < echoingMaxLv) {
                    const after = cloneSnapshot(snap);
                    if (!after.botData['Amplify Bot']) {
                        after.botData['Amplify Bot'] = { owned: true, medals: [0, 0, 0, 0, 0], plusLv: 1 };
                    }
                    after.botData['Amplify Bot'].medals[4] = echoingLv + 1;

                    const delta = edpsDeltaPct(basEDPS, getScore(after));

                    candidates.push({
                        category: 'bots',
                        label: 'Echoing Shot',
                        subLabel: `Lv ${echoingLv} → ${echoingLv + 1} (${3 + echoingLv} → ${4 + echoingLv} projectiles)`,
                        fromLv: echoingLv,
                        toLv: echoingLv + 1,
                        cost: 0,
                        costType: 'coins',
                        scorePct: delta,
                        scorePerCost: delta > 0 ? Infinity : 0,
                    });
                }
            }
        }
    }

    // Sort by scorePerCost descending
    return candidates.sort((a, b) => b.scorePerCost - a.scorePerCost);
}

// ============================================================
//  APPLY UPGRADE
//  Mutates a snapshot in place with the chosen candidate.
// ============================================================
export function applyUpgrade(
    snap: OptimizerSnapshot,
    c: OptCandidate,
): void {
    switch (c.category) {

        case 'uw': {
            const match = UWS.find(u => c.label.startsWith(u.n));
            if (!match) break;
            const statIdx = match.s.findIndex(([sName]) => c.label.endsWith(sName));
            if (statIdx < 0) break;
            if (snap.uwData.data[match.a]) {
                snap.uwData.data[match.a]!.sv[statIdx] = c.toLv;
            }
            break;
        }

        case 'uwp': {
            const match = UWS.find(u => c.label.startsWith(u.n));
            if (!match) break;
            if (c.fromLv === -1) {
                snap.uwData.data[match.a]!.upOwn = true;
                snap.uwData.data[match.a]!.upLvl = 0;
            } else {
                snap.uwData.data[match.a]!.upLvl = c.toLv;
            }
            break;
        }

        case 'mast': {
            const cardName = c.label.replace(' Mastery', '');
            if (snap.cardData.data[cardName]) snap.cardData.data[cardName]!.mu = true;
            break;
        }

        case 'assist': {
            const parts = c.label.split(' — ');
            // label is "<Type> Assist — Mult Eff" / "... — Substat Eff" / "... — Rarity" / "... — Unlock"
            // strip the " Assist" suffix to get the assistData key (e.g. "cannon").
            const type = parts[0].replace(/ Assist$/i, '').toLowerCase();
            if (!snap.moduleState.assistData[type]) {
                snap.moduleState.assistData[type] = { rarity: 'locked', multEff: 0, subEff: 0 };
            }

            // Handle different assist upgrade types
            if (c.label.includes('Rarity')) {
                // subLabel format: "CurrentRarity → NewRarity" (e.g., "Locked → Epic")
                const rarities = c.subLabel.split(' → ').map(r => r.trim());
                const targetRarity = rarities[1] as 'locked' | 'Epic' | 'Legendary' | 'Mythic' | 'Ancestral';
                snap.moduleState.assistData[type].rarity = targetRarity;
            } else if (c.label.includes('Unlock')) {
                // Unlock: change from locked → Epic
                snap.moduleState.assistData[type].rarity = 'Epic';
            } else if (c.label.includes('Substat')) {
                snap.moduleState.assistData[type].subEff = c.toLv;
            } else {
                // Default to Mult Eff
                snap.moduleState.assistData[type].multEff = c.toLv;
            }
            break;
        }

        case 'labs': {
            snap.labData[c.label] = c.toLv;
            break;
        }

        case 'workshop': {
            const parts = c.label.split(' — ');
            const wsCat = parts[0].replace('WS ', '').toLowerCase() as 'attack' | 'defense' | 'utility';
            const statName = parts[1];
            const idx = (WS_STATS[wsCat] ?? []).findIndex(([n]) => n === statName);
            if (idx >= 0 && snap.wsData[snap.presetIdx]) {
                snap.wsData[snap.presetIdx][wsCat][idx] = c.toLv;
            }
            break;
        }

        case 'cards': {
            const cardName = c.label.replace(' Card', '');
            if (!snap.cardData.data[cardName]) {
                snap.cardData.data[cardName] = { s: 0, m: 0 };
            }
            snap.cardData.data[cardName]!.s = c.toLv;
            break;
        }

        case 'enhancements': {
            const parts = c.label.split(' — ');
            const enhCat = parts[0].replace('Enh ', '').toLowerCase();
            const enhName = parts[1];
            const idx = (WS_ENH[enhCat] ?? []).findIndex(([n]) => n === enhName);
            if (idx >= 0) {
                if (!snap.enhData.d[enhCat]) snap.enhData.d[enhCat] = [];
                snap.enhData.d[enhCat][idx] = c.toLv;
            }
            break;
        }
    }
}

// An upgrade worth recommending: a real gain, not rounding noise.
const worthIt = (c: OptCandidate) => c.scorePct >= GC_SCORING.minGainPct;

// ============================================================
//  SIMULATE CATEGORY PATH
//  Runs the full simulation for one optimizer panel.
//  Returns the ordered list of candidates (upgrade path).
// ============================================================
export function simulateCategoryPath(
    cat: OptCategory,
    steps: number,
    snapshot: OptimizerSnapshot,
): OptCandidate[] {
    const path: OptCandidate[] = [];
    const state = cloneSnapshot(snapshot);

    for (let i = 0; i < steps; i++) {
        // Upgrades worth almost nothing (< minGainPct) aren't recommended.
        const candidates = buildCandidates(state, cat).filter(worthIt);
        if (!candidates.length) break;

        const best = candidates[0];
        if (best.scorePerCost <= 0) break;

        path.push(best);
        applyUpgrade(state, best);
        // CRITICAL: Recalculate modBonuses after upgrade so next iteration has fresh data
        state.modBonuses = readActiveModuleBonuses(
            state.moduleState, state.perkData, state.labData, state.cardData, state.modBonuses.run,
        );
    }

    return path;
}

// ============================================================
//  SIMULATE STONE PATH
//  All stone-spending categories (UW, UW+, Mastery, Assist) ranked
//  together as a single path — at every step, the single best stone
//  purchase across ALL of them is chosen, not the best within one
//  category. This is what "where should my next stones go" actually
//  means, since players draw from one shared stone pool.
// ============================================================
const STONE_CATEGORIES: OptCategory[] = ['uw', 'uwp', 'mast', 'assist'];

export function simulateStonePath(
    steps: number,
    snapshot: OptimizerSnapshot,
): OptCandidate[] {
    const path: OptCandidate[] = [];
    const state = cloneSnapshot(snapshot);

    for (let i = 0; i < steps; i++) {
        const candidates = STONE_CATEGORIES
            .flatMap(cat => buildCandidates(state, cat))
            .filter(worthIt)
            .sort((a, b) => b.scorePerCost - a.scorePerCost);

        if (!candidates.length) break;

        const best = candidates[0];
        if (best.scorePerCost <= 0) break;

        path.push(best);
        applyUpgrade(state, best);
        // CRITICAL: Recalculate modBonuses after upgrade so next iteration has fresh data
        // Without this, snap.modBonuses becomes stale, causing incorrect eDPS deltas
        state.modBonuses = readActiveModuleBonuses(
            state.moduleState, state.perkData, state.labData, state.cardData, state.modBonuses.run,
        );
    }

    return path;
}

// ============================================================
//  OPPORTUNITY COST ALTERNATIVES
//  For each step in the UW / UW+ path, find the top 3
//  alternatives within the same stone budget that score
//  >= 80% of the top pick.
// ============================================================
export function buildStoneAlts(
    budget: number,
    topPick: OptCandidate,
    snapshot: OptimizerSnapshot,
    cat: 'uw' | 'uwp' | 'mast' | 'assist',
): OptAlt[] {
    const candidates = buildCandidates(snapshot, cat);
    const threshold = topPick.scorePerCost * GC_SCORING.altMinScoreRatio;

    const alts = candidates
        .filter(c =>
            c.label !== topPick.label &&
            c.cost <= budget &&
            c.scorePerCost >= threshold,
        )
        .slice(0, GC_SCORING.altMaxCount)
        .map(c => ({
            label: c.label,
            cost: c.cost,
            scorePct: c.scorePct,
        }));

    // Also check 2-upgrade combos from top N singles
    const topN = candidates.slice(0, GC_SCORING.comboBudgetTopN);
    const combos: OptAlt[] = [];

    for (let i = 0; i < topN.length; i++) {
        for (let j = i + 1; j < topN.length; j++) {
            const a = topN[i];
            const b = topN[j];
            if (a.cost + b.cost > budget) continue;
            const combinedScore = (a.scorePct + b.scorePct);
            if (combinedScore / (a.cost + b.cost) >= threshold) {
                combos.push({
                    label: `${a.label} + ${b.label}`,
                    cost: a.cost + b.cost,
                    scorePct: combinedScore,
                });
            }
        }
    }

    return [...alts, ...combos]
        .sort((a, b) => b.scorePct - a.scorePct)
        .slice(0, GC_SCORING.altMaxCount);
}