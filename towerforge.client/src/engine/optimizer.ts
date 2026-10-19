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
//  • Assist: Main Effect stones reach 100% (+30% labs = 130%); Substat
//    stones stop at 70% (+30% labs = 100%).
//  • UW stat values and stone costs match the wiki for all 27 stats.
//  • Paths skip upgrades worth < GC_SCORING.minGainPct.
//
// 2026-10-18, Glass Cannon workshop and labs:
//  • Workshop steps cost real coins (engine/upgradeCosts.ts — the game's
//    table, less the Workshop Discount labs) and are ranked by gain per
//    coin; stats over 300 levels move 10 levels a step.
//  • Labs are ranked by gain per hour of research (the lab catalog's
//    time ÷ lab speed), since lab slots, not coins, are what runs out.
//  • Waves mode also counts Enemy Health Level Skip, at the flat damage
//    one point of skip is worth in waves (`skipWorth`, engine/runLength.ts),
//    and the enemy health labs of the types that end runs (`killers`).
//  • The path is shown in blocks of 10 steps, one row per stat or lab in
//    each, so one-level steps that take turns don't fill the list.
//
// 2026-10-18, goals and every currency:
//  • Goals (optimizerConfig OptGoal) pick the score for every panel; "coins
//    and push" blends coins/hour with the push score (coins^w × push^(1−w)).
//  • Workshop and labs use the cost tables for every build now.
//  • Enhancements (coins, discount labs), module slot levels (shards),
//    bot stats (medals, 100 + 40 × (L − 1)) and card slots (gems) are
//    priced; medals also weigh Event Shop trades for stones and shards,
//    valued by what those buy on their own paths.
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
//  • Workshop and Labs: ranked by gain per coin / per hour of research
//    since 2026-10-18 (see the note at the top). Cards and Enhancements
//    are still behind the "coming soon" box in OptimizerTab.
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

import { calcTTT, calcCFUptime } from './ttt';
import { calcTowerEDPS, calcSmiteWaveHPFraction } from './uwdps';
import { readActiveModuleBonuses } from './modBonuses';
import { coinRate } from './farming';
import type { FarmCalibration } from './farming';
import { ehpScore } from './ehp';
import type { EhpCalibration } from './ehp';
import { edpsScore, edpsSurvivalScore } from './edps';
import { healthSkipChance, healthSkipSources } from './levelSkip';
import { healthLabCut } from './enemyStats';
import type { EnemyType } from './enemyStats';
import {
    botMedalCost, CARD_SLOT_GEMS, enhancementCost, enhancementDiscount, labLevelCost, MEDAL_TRADE_GIVES,
    MEDAL_TRADE_PRICES, MODULE_SLOT_MAX, moduleSlotCost, workshopCost, workshopDiscount,
} from './upgradeCosts';
import type { EdpsCalibration } from './edps';
import { BOTS_CONFIG } from '../constants/botData';

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
    ModuleType,
} from '../types/gameTypes';
import { conditioned, conditionedSkip, conditionHealth } from './battleConditions';
import type { TourneyConditions } from './battleConditions';

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
    // Glass Cannon, calibrated: rank by all damage, or by the flat damage
    // that decides how far a run gets ('waves', engine/runLength.ts).
    edpsMode?: 'damage' | 'waves';
    // Waves mode: the flat damage one point of Enemy Health Level Skip is
    // worth, as the log of the damage factor that gains the same waves
    // (runLength.skipWorth). Omitted = skip isn't scored.
    skipWorth?: number;
    // Waves: the enemy types that end the runs, as shares (runLength.killerMix).
    // An enemy health lab counts as that much more damage against its type,
    // weighted by how often the type ends a run. Omitted = labs not scored.
    killers?: Partial<Record<EnemyType, number>>;
    // "Coins and push": coins per hour (needs `farm`) blended with the push
    // score — waves (flat damage + skip, needs `edps`) or survival (`ehp`).
    // coinWeight 0–1 is how much coins count.
    blend?: { push: 'waves' | 'ehp'; coinWeight: number };
    // Tournament battle conditions the score is read under
    // (engine/battleConditions.ts); calibrations are built under them too.
    conditions?: TourneyConditions;
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
export function goalScore(snap: OptimizerSnapshot): number {
    return getScore(snap);
}

function getScore(raw: OptimizerSnapshot): number {
    const snap = conditioned(raw);
    if (snap.blend && snap.farm) {
        const w = snap.blend.coinWeight;
        return coinRate(snap, snap.farm) ** w * pushScore(snap) ** (1 - w);
    }
    if (snap.metric === 'coins' && snap.farm) return coinRate(snap, snap.farm);
    if (snap.metric === 'ehp' && snap.ehp) return ehpScore(snap, snap.ehp);
    if (snap.edps && snap.edpsMode !== 'waves') return edpsScore(snap, snap.edps);
    return wavesScore(snap);
}

// Flat damage, with the skip chance counted as the damage it's worth; the
// uncalibrated model without a run to calibrate from.
function wavesScore(snap: OptimizerSnapshot): number {
    if (!snap.edps) return getEDPS(snap);
    return edpsSurvivalScore(snap, snap.edps) * Math.exp((snap.skipWorth ?? 0) * scoredSkip(snap))
        * killerHealthFactor(snap);
}

// Less health on the enemies that end runs works like more damage against
// them: Π (1 ÷ health left)^(share of deaths). The code's assumption — each
// type's lab moves the death limit in proportion to how often it kills.
function killerHealthFactor(snap: OptimizerSnapshot): number {
    let log = 0;
    for (const [type, share] of Object.entries(snap.killers ?? {}) as [EnemyType, number][]) {
        log -= share * Math.log(Math.max(0.01, healthLabCut(snap.labData, type) * conditionHealth(type, snap.conditions)));
    }
    return Math.exp(log);
}

// The push half of "coins and push".
function pushScore(snap: OptimizerSnapshot): number {
    if (snap.blend?.push === 'ehp') return snap.ehp ? ehpScore(snap, snap.ehp) : 1;
    return wavesScore(snap);
}

// Coins per hour and push score, each relative, for the rows of "coins and push".
export function scoreParts(raw: OptimizerSnapshot): { coins: number; push: number } {
    const snap = conditioned(raw);
    return { coins: snap.farm ? coinRate(snap, snap.farm) : 1, push: pushScore(snap) };
}

const pushesWaves = (snap: OptimizerSnapshot) =>
    snap.blend ? snap.blend.push === 'waves' : snap.edpsMode === 'waves';

// Enemy Health Level Skip chance, in waves mode once skip is worth something.
function scoredSkip(snap: OptimizerSnapshot): number {
    if (!snap.skipWorth || !snap.edps || !pushesWaves(snap)) return 0;
    return skipChanceOf(snap);
}

// Enemy Health Level Skip chance in points, under the snapshot's conditions.
export function skipChanceOf(snap: OptimizerSnapshot): number {
    return conditionedSkip(healthSkipChance(healthSkipSources(
        snap.wsData[snap.presetIdx], snap.labData, snap.enhData, snap.relicData, snap.modBonuses.subs ?? {},
    )), snap.conditions);
}

// Skip points a step adds (waves mode), so its waves can count them as skip.
const addedSkip = (before: OptimizerSnapshot, after: OptimizerSnapshot) =>
    scoredSkip(after) - scoredSkip(before) || undefined;

// Workshop and enhancement steps: one level, or 10 on the 400–6000-level
// stats (one Damage level is a few hundredths of a percent).
const LONG_STAT = 300;
const wsStep = (maxLv: number) => (maxLv > LONG_STAT ? 10 : 1);
const MODULE_STEP = 5;     // module slot levels per step
const MODULE_TYPES: ModuleType[] = ['cannon', 'armor', 'generator', 'core'];
const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

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
    // Coins, gems, medals and shards: rank by gain per unit; free steps first.
    const perCost = (delta: number, cost: number) => (cost > 0 ? delta / cost : delta > 0 ? Infinity : 0);

    // ── UW Stone Upgrades ──────────────────────────────────────
    if (cat === 'uw') {
        // CF Duration is wasted once effective duration ≥ effective cooldown
        // (CF is already permanently active, uptime = 100%). Stop recommending
        // CF Duration upgrades at that point.
        const cfAtFullUptime = calcCFUptime(
            snap.modBonuses, snap.uwData, snap.wsData, snap.labData, snap.cardData, snap.presetIdx,
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
    // Efficiency % = 1% base + stone levels + Assist lab levels; the k-th
    // stone level costs 15 + 3k (with the base, 12 + 3 × (base + stone %)).
    // Main Effect: stones take it to 100%, the Assist Mult lab adds up to 30%
    // (130% max — confirmed by the player). Substats: stones stop at 70% and
    // the Substat lab adds 30% (100% max). The wiki's 20,746-stone per-slot
    // total only fits 70% stones on both, so it predates the 100% Main Effect.
    // (Primary modules are always at 100%; their newer +30% labs need no stones.)
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
                const toLv = Math.min(maxLv, curLv + wsStep(maxLv));

                // Simulate the step and score the gain in the goal's score.
                const after = cloneSnapshot(snap);
                after.wsData[after.presetIdx][wsCat][idx] = toLv;
                const delta = edpsDeltaPct(basEDPS, getScore(after));

                // The game's cost table, after the section's discount lab.
                const known = workshopCost(statName, curLv, toLv, workshopDiscount(snap.labData, wsCat));
                const cost = known ?? curLv + 1;
                const costKnown = known !== null;

                candidates.push({
                    category: 'workshop',
                    label: `WS ${wsCat.charAt(0).toUpperCase() + wsCat.slice(1)} — ${statName}`,
                    subLabel: `Lv ${curLv} → ${toLv}`,
                    fromLv: curLv,
                    toLv,
                    cost,
                    costKnown,
                    costType: 'coins',
                    scorePct: delta,
                    skipPoints: addedSkip(snap, after),
                    // Rank by gain per coin; a stat without a known cost isn't recommended.
                    scorePerCost: costKnown ? delta / Math.max(1, cost) : 0,
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
                const research = labLevelCost(labName, curLv + 1, snap.labData, snap.relicData);

                candidates.push({
                    category: 'labs',
                    label: labName,
                    subLabel: `Lv ${curLv} → ${curLv + 1}`,
                    fromLv: curLv,
                    toLv: curLv + 1,
                    cost: curLv + 1,
                    costType: 'research',
                    ...(research ?? {}),
                    scorePct: delta,
                    skipPoints: addedSkip(snap, after),
                    // Gain per hour of research (at least a minute, for the first
                    // few levels that take seconds); a level with no known time
                    // isn't recommended.
                    scorePerCost: research ? delta / Math.max(1 / 60, research.hours) : 0,
                });
            }
        }
    }

    // ── Cards: slots (gems) ────────────────────────────────────
    // Card pulls are random, so stars aren't ranked. A slot is: put the best
    // card you own that isn't in this preset into an empty slot (free), or
    // into the next slot you buy (wiki Cards: 50 → 10,000 gems, 22 slots).
    if (cat === 'cards') {
        const inPreset = new Set(snap.cardData.presets[snap.presetIdx] ?? []);
        const slots = Math.max(1, snap.cardData.slots ?? 1);
        const free = inPreset.size < slots;
        if (free || slots < CARD_SLOT_GEMS.length) {
            const cost = free ? 0 : CARD_SLOT_GEMS[slots];
            for (const [cardName] of CARDS) {
                if (inPreset.has(cardName) || !(snap.cardData.data[cardName]?.s)) continue;
                const after = cloneSnapshot(snap);
                after.cardData.presets[after.presetIdx] = [...inPreset, cardName];
                if (!free) after.cardData.slots = slots + 1;
                const delta = edpsDeltaPct(basEDPS, getScore(after));
                candidates.push({
                    category: 'cards',
                    label: `${cardName} Card`,
                    subLabel: free ? 'Into an empty card slot' : `In card slot ${slots + 1}`,
                    fromLv: free ? slots : slots,
                    toLv: free ? slots : slots + 1,
                    cost,
                    costType: 'gems',
                    costKnown: true,
                    scorePct: delta,
                    scorePerCost: perCost(delta, cost),
                    ref: [cardName],
                });
            }
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
                const toLv = Math.min(maxLv, curLv + wsStep(maxLv));

                const after = cloneSnapshot(snap);
                if (!after.enhData.d[enhCat]) after.enhData.d[enhCat] = [];
                after.enhData.d[enhCat][idx] = toLv;
                const delta = edpsDeltaPct(basEDPS, getScore(after));
                const known = enhancementCost(enhName, curLv, toLv, enhancementDiscount(snap.labData, enhCat));

                candidates.push({
                    category: 'enhancements',
                    label: `Enh ${cap(enhCat)} — ${enhName}`,
                    subLabel: `Lv ${curLv} → ${toLv}`,
                    fromLv: curLv,
                    toLv,
                    cost: known ?? curLv + 1,
                    costKnown: known !== null,
                    costType: 'coins',
                    scorePct: delta,
                    skipPoints: addedSkip(snap, after),
                    scorePerCost: known !== null ? perCost(delta, known) : 0,
                });
            });
        }
    }

    // ── Bots (medals) ──────────────────────────────────────────
    // Every stat of every owned bot, one level a step. Only the stats a
    // model reads score (Amplify Bot and Bot Bot bonus for damage, Golden
    // Bot for coins); the rest show no gain and drop out.
    if (cat === 'bots') {
        for (const bot of BOTS_CONFIG) {
            const entry = snap.botData?.[bot.name];
            if (!entry?.owned) continue;
            bot.stats.forEach((stat, i) => {
                const curLv = entry.medals?.[i] ?? 0;
                if (curLv >= stat.values.length) return;
                const after = cloneSnapshot(snap);
                const medals = [...(after.botData[bot.name].medals ?? [])];
                medals[i] = curLv + 1;
                after.botData[bot.name] = { ...after.botData[bot.name], medals };
                const delta = edpsDeltaPct(basEDPS, getScore(after));
                const cost = botMedalCost(curLv, curLv + 1);
                candidates.push({
                    category: 'bots',
                    label: `${bot.name} — ${stat.label}`,
                    subLabel: `Lv ${curLv} → ${curLv + 1}`,
                    fromLv: curLv,
                    toLv: curLv + 1,
                    cost,
                    costType: 'medals',
                    costKnown: true,
                    scorePct: delta,
                    scorePerCost: perCost(delta, cost),
                    ref: [bot.name, String(i)],
                });
            });
        }
    }

    // ── Module slot levels (shards) ────────────────────────────
    // Main and assist slot of each type, 5 levels a step; a module can't
    // pass its rarity's cap, so steps past it show no gain.
    if (cat === 'modules') {
        for (const type of MODULE_TYPES) {
            for (const pos of ['main', 'assist'] as const) {
                if (pos === 'assist' && (snap.moduleState.assistData[type]?.rarity ?? 'locked') === 'locked') continue;
                const curLv = snap.moduleState.slotLevels?.[type]?.[pos] ?? 0;
                if (curLv >= MODULE_SLOT_MAX) continue;
                const toLv = Math.min(MODULE_SLOT_MAX, curLv + MODULE_STEP);
                const after = cloneSnapshot(snap);
                const levels = after.moduleState.slotLevels ?? ({} as NonNullable<typeof after.moduleState.slotLevels>);
                levels[type] = { ...(levels[type] ?? { main: 0, assist: 0 }), [pos]: toLv };
                after.moduleState.slotLevels = levels;
                after.modBonuses = readActiveModuleBonuses(
                    after.moduleState, after.perkData, after.labData, after.cardData, after.modBonuses.run,
                );
                const delta = edpsDeltaPct(basEDPS, getScore(after));
                const { shards, coins } = moduleSlotCost(curLv, toLv, snap.labData);
                candidates.push({
                    category: 'modules',
                    label: `${cap(type)} — ${pos === 'main' ? 'Main' : 'Assist'} slot`,
                    subLabel: `Lv ${curLv} → ${toLv}`,
                    fromLv: curLv,
                    toLv,
                    cost: shards,
                    costType: 'shards',
                    costKnown: true,
                    coins,
                    scorePct: delta,
                    scorePerCost: perCost(delta, shards),
                    ref: [type, pos],
                });
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
            const cardName = c.ref?.[0] ?? c.label.replace(' Card', '');
            const preset = snap.cardData.presets[snap.presetIdx] ?? [];
            if (!preset.includes(cardName)) snap.cardData.presets[snap.presetIdx] = [...preset, cardName];
            snap.cardData.slots = Math.max(snap.cardData.slots ?? 1, c.toLv);
            break;
        }

        case 'bots': {
            const [name, stat] = c.ref ?? [];
            const entry = name !== undefined ? snap.botData[name] : undefined;
            if (!entry || stat === undefined || name === 'trade') break;
            const medals = [...(entry.medals ?? [])];
            medals[Number(stat)] = c.toLv;
            snap.botData[name] = { ...entry, medals };
            break;
        }

        case 'modules': {
            const [type, pos] = (c.ref ?? []) as [ModuleType, 'main' | 'assist'];
            if (!type || !pos) break;
            const levels = snap.moduleState.slotLevels ?? ({} as NonNullable<typeof snap.moduleState.slotLevels>);
            levels[type] = { ...(levels[type] ?? { main: 0, assist: 0 }), [pos]: c.toLv };
            snap.moduleState.slotLevels = levels;
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

// Steps on one stat or lab as one row: levels, cost and research add up
// and the gains compound.
const continues = (row: OptCandidate, c: OptCandidate) =>
    row.category === c.category && row.label === c.label && row.toLv === c.fromLv;

function mergeInto(row: OptCandidate, c: OptCandidate) {
    row.toLv = c.toLv;
    row.subLabel = row.ref?.[0] === 'trade'
        ? `Trades ${row.fromLv + 1}–${c.toLv} this event`
        : `Lv ${row.fromLv} → ${c.toLv}`;
    row.cost += c.cost;
    row.scorePct = ((1 + row.scorePct / 100) * (1 + c.scorePct / 100) - 1) * 100;
    if (row.hours !== undefined && c.hours !== undefined) row.hours += c.hours;
    if (row.coins !== undefined && c.coins !== undefined) row.coins += c.coins;
    if (c.skipPoints) row.skipPoints = (row.skipPoints ?? 0) + c.skipPoints;
}

// Back-to-back steps on the same stat or lab, as one row.
export function mergeRepeats(path: OptCandidate[]): OptCandidate[] {
    const out: OptCandidate[] = [];
    for (const c of path) {
        const last = out[out.length - 1];
        if (last && continues(last, c)) mergeInto(last, c);
        else out.push({ ...c });
    }
    return out;
}

// A coin/research path read in blocks of `block` steps, one row per stat or
// lab in each (in the order it first comes up): one-level steps that take
// turns (Crit Chance, Crit Factor, Crit Chance…) read as "Crit Chance
// 40 → 45, Crit Factor 40 → 44" instead of dozens of rows.
const PATH_BLOCK = 10;

export function groupPath(path: OptCandidate[], block = PATH_BLOCK): OptCandidate[] {
    const out: OptCandidate[] = [];
    for (let i = 0; i < path.length; i += block) {
        const rows: OptCandidate[] = [];
        for (const c of path.slice(i, i + block)) {
            const row = rows.find(r => continues(r, c));
            if (row) mergeInto(row, c);
            else rows.push({ ...c });
        }
        out.push(...rows);
    }
    return mergeRepeats(out);
}

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

    return cat === 'stones' ? path : groupPath(path);
}

// What spending `amount` more of a currency along its ranked path is
// worth, after `spent` already went into it: the % gain of those steps,
// with a step only partly paid for counting in proportion.
export function pathGain(path: OptCandidate[], spent: number, amount: number): number {
    const logUpTo = (budget: number) => {
        let left = budget;
        let log = 0;
        for (const c of path) {
            if (left <= 0) break;
            const step = Math.log(1 + Math.max(0, c.scorePct) / 100);
            log += c.cost > 0 ? step * Math.min(1, left / c.cost) : step;
            left -= c.cost;
        }
        return log;
    };
    return (Math.exp(logUpTo(spent + amount) - logUpTo(spent)) - 1) * 100;
}

// ============================================================
//  SIMULATE MEDAL PATH
//  Medals buy bot levels, or Event Shop trades: 15 Power Stones or 250
//  Module Shards each, dearer with every trade of a kind in one event
//  (40, 65, 90, 130, 175, 230, then 380). A trade is worth what those
//  stones or shards buy next on their own ranked paths (`stonesHeld`
//  are spent first). Each step takes the most gain per medal.
// ============================================================
export function simulateMedalPath(
    steps: number,
    snapshot: OptimizerSnapshot,
    stonePath: OptCandidate[],
    stonesHeld: number,
    shardPath: OptCandidate[],
): OptCandidate[] {
    const path: OptCandidate[] = [];
    const state = cloneSnapshot(snapshot);
    const trades = { stones: 0, shards: 0 };
    const tradeRow = (kind: 'stones' | 'shards'): OptCandidate | null => {
        const k = trades[kind];
        const price = MEDAL_TRADE_PRICES[Math.min(k, MEDAL_TRADE_PRICES.length - 1)];
        const amount = MEDAL_TRADE_GIVES[kind];
        const gain = kind === 'stones'
            ? pathGain(stonePath, stonesHeld + k * amount, amount)
            : pathGain(shardPath, k * amount, amount);
        if (!(gain >= GC_SCORING.minGainPct)) return null;
        return {
            category: 'bots',
            label: kind === 'stones' ? `Event Shop — ${amount} Power Stones` : `Event Shop — ${amount} Module Shards`,
            subLabel: `Trade ${k + 1} this event`,
            fromLv: k,
            toLv: k + 1,
            cost: price,
            costType: 'medals',
            costKnown: true,
            scorePct: gain,
            scorePerCost: gain / price,
            ref: ['trade', kind],
        };
    };
    for (let i = 0; i < steps; i++) {
        const options = [
            ...buildCandidates(state, 'bots').filter(worthIt).slice(0, 1),
            tradeRow('stones'),
            tradeRow('shards'),
        ].filter((c): c is OptCandidate => c !== null && c.scorePerCost > 0);
        const best = options.sort((a, b) => b.scorePerCost - a.scorePerCost)[0];
        if (!best) break;
        path.push(best);
        if (best.ref?.[0] === 'trade') {
            trades[best.ref[1] as 'stones' | 'shards']++;
        } else {
            applyUpgrade(state, best);
        }
    }
    return groupPath(path);
}

// "Coins and push": each step's own gain in coins per hour and in the push
// score, replayed along the path (rows show both). Trades keep neither.
export function attachParts(snapshot: OptimizerSnapshot, path: OptCandidate[]): OptCandidate[] {
    const state = cloneSnapshot(snapshot);
    let before = scoreParts(state);
    return path.map(c => {
        if (c.ref?.[0] === 'trade') return c;
        applyUpgrade(state, c);
        state.modBonuses = readActiveModuleBonuses(
            state.moduleState, state.perkData, state.labData, state.cardData, state.modBonuses.run,
        );
        const after = scoreParts(state);
        const row = {
            ...c,
            coinsPct: edpsDeltaPct(before.coins, after.coins),
            pushPct: edpsDeltaPct(before.push, after.push),
        };
        before = after;
        return row;
    });
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