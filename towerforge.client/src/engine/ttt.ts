// ============================================================
//  TowerForge Companion — TTT Engine
//  Time-To-Tower, range, slow, and CF calculations.
//
//  All functions are pure — they take state as parameters
//  and return a value. No imports from the store.
//  The optimizer clones state and passes it in directly.
// ============================================================

import {
    CF_PLUS_HIDDEN_SLOW,
    CARDS,
    CARD_MASTERY_VALS,
    UW_STAT_VALUES,
    WS_STATS,
} from '../constants/gameData';
import { WS_PACKAGE_CHANCE, labValue } from '../constants/buildStatCurves';
import { activeCard, cardValue } from './statHelpers';
import { galaxyCompressorCD } from './moduleEffects';

import type {
    WSPreset,
    LabData,
    CardData,
    UWData,
    ModBonuses,
    TTTData,
} from '../types/gameTypes';

// ── Tower Range ───────────────────────────────────────────────
// Base 30m. Workshop adds 0.5m/level (max 79 levels = +39.5m).
// Range Lab multiplies the WS bonus only.
// Range Card multiplies the WS bonus only.
// Range Mastery multiplies the card base value.
export function calcTowerRange(
    presetIdx: number,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
): number {
    const ws = wsData[presetIdx] ?? { attack: [], defense: [], utility: [] };
    const wsRangeLv = ws.attack[4] ?? 0;
    const wsBonus = wsRangeLv * 0.5;

    // Range Lab multiplies the WS bonus only (not the base 30m).
    // Range mastery affects Damage/Meter, NOT tower range — excluded.
    const rangeLabLv = labData['Range Lab'] ?? 0;
    const labMult = 1 + rangeLabLv * 0.01;

    // Range card multiplies total range (base 30m + WS bonus after lab).
    const rangeCard = cardData.data['Range'];
    const rangeDef = CARDS.find(c => c[0] === 'Range');
    const cardMult = (rangeCard?.s ?? 0) > 0
        ? (rangeDef?.[4]?.[rangeCard!.s - 1] ?? 1)
        : 1;

    return (30 + wsBonus * labMult) * cardMult;
}

// ── Recovery Package Chance ───────────────────────────────────
// Per-wave package chance %: Workshop (6% + 0.4%/level), Recovery Pkg
// Chance lab, the Recovery Package Chance card (if equipped) and Package
// Chance module sub-effects. At most one package per wave.
export function packageChancePct(
    presetIdx: number,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    modBonuses: ModBonuses,
): number {
    const ws = wsData[presetIdx] ?? wsData[0];
    const idx = WS_STATS.utility.findIndex(([n]) => n === 'Package Chance');
    const wsLv = ws?.utility[idx] ?? 0;
    const card = activeCard(cardData, presetIdx, 'Recovery Pkg Chance');
    return Math.min(100,
        (wsLv > 0 ? WS_PACKAGE_CHANCE.valueAt(wsLv) : 0)
        + labValue('Recovery Pkg Chance', labData['Recovery Pkg Chance'] ?? 0)
        + (card ? cardValue('Recovery Pkg Chance', card.stars) : 0)
        + (modBonuses.subs?.['Package Chance'] ?? 0));
}

// ── Galaxy Compressor CD Reduction ────────────────────────────
// Seconds Galaxy Compressor takes off a cooldown: each recovery package
// cuts it by the module's value, at the run's package rate (moduleEffects).
export function calcGCompCDReduction(
    rawCD: number,
    modBonuses: ModBonuses,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    presetIdx: number = 0,
): number {
    if (rawCD <= 0) return 0;
    const chance = packageChancePct(presetIdx, wsData, labData, cardData, modBonuses);
    return rawCD - galaxyCompressorCD(rawCD, modBonuses, chance);
}

// ── CF Uptime ─────────────────────────────────────────────────
// Returns CF uptime fraction 0–1.
// Permanent CF = effective duration >= effective cooldown.
export function calcCFUptime(
    modBonuses: ModBonuses,
    uwData: UWData,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
): number {
    const cfData = uwData.data['CF'];
    if (!cfData?.own) return 0;

    const b = modBonuses.uwBonus['CF'] ?? {};
    const cfExtraDur = modBonuses.perks.cfExtraDur ?? 0;

    // sv[0]/sv[2] are 1-based LEVELS — convert to real values (Duration
    // 5s…40s, Cooldown 180s…60s) via the display table.
    const durLv = cfData.sv[0] ?? 0;
    const durVals = UW_STAT_VALUES['CF']?.[0] ?? [];
    const durBase = durLv > 0 ? (parseFloat(durVals[durLv - 1] ?? '0') || 0) : 0;
    // CF-Duration lab adds +1s per level (on top of stat, module sub, perk).
    const cfDurLab = labData['CF-Duration'] ?? 0;
    const dur = durBase + (b.dur ?? 0) + cfExtraDur + cfDurLab;

    const cdLv = cfData.sv[2] ?? 0;
    const cdVals = UW_STAT_VALUES['CF']?.[2] ?? [];
    const cdBase = cdLv > 0 ? (parseFloat(cdVals[cdLv - 1] ?? '999') || 999) : 999;
    const rawCD = Math.max(5, cdBase + (b.cd ?? 0));
    const gcReduction = calcGCompCDReduction(rawCD, modBonuses, wsData, labData, cardData);
    const effectiveCD = Math.max(1, rawCD - gcReduction);

    return Math.min(1.0, dur / effectiveCD);
}

// ── CF Slow ───────────────────────────────────────────────────
// Returns the time-averaged CF slow fraction (0–0.90).
// Hard capped at 90% before uptime scaling.
export function calcCFSlow(
    modBonuses: ModBonuses,
    uwData: UWData,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
): number {
    const cfData = uwData.data['CF'];
    if (!cfData?.own) return 0;

    const b = modBonuses.uwBonus['CF'] ?? {};

    // sv[1] is 1-based level. UW_STAT_VALUES.CF[1] gives display
    // strings like '20%','25%'... Parse the actual % value.
    const slowLv = cfData.sv[1] ?? 0;
    const slowVals = UW_STAT_VALUES['CF']?.[1] ?? [];
    const slowDisplay = slowLv > 0 ? slowVals[slowLv - 1] ?? '0%' : '0%';
    const slowPct = parseFloat(slowDisplay.replace('%', '')) / 100;

    // Module sub-effect 'Chrono Field - Speed Red.' adds directly (already as fraction)
    const modSlow = b.slow ?? 0;
    const rawSlow = slowPct + modSlow;
    const cappedSlow = Math.min(0.90, rawSlow);

    const uptime = calcCFUptime(modBonuses, uwData, wsData, labData, cardData);
    return cappedSlow * uptime;
}

// ── CF+ Hidden Slow ───────────────────────────────────────────
// Returns the CF+ path-length hidden slow at the current UW+ level.
// This is NOT a speed slow — it bypasses the 90% cap entirely.
// Source: Priesten / yournicknm / Tremnen research.
export function calcCFPlusHiddenSlow(uwData: UWData): number {
    const cfData = uwData.data['CF'];
    if (!cfData?.own || !cfData?.upOwn) return 0;
    const lv = Math.min(cfData.upLvl ?? 0, CF_PLUS_HIDDEN_SLOW.length - 1);
    return CF_PLUS_HIDDEN_SLOW[lv];
}

// ── Slow Aura Card ────────────────────────────────────────────
// Returns the slow aura fraction from the Slow Aura card + mastery.
export function calcSlowAura(cardData: CardData): number {
    const card = cardData.data['Slow Aura'];
    if (!card?.s || card.s === 0) return 0;
    const def = CARDS.find(c => c[0] === 'Slow Aura');
    const baseVal = (def?.[4]?.[card.s - 1] ?? 0) / 100;
    const mastMult = card.m > 0
        ? (CARD_MASTERY_VALS['Slow Aura']?.[card.m - 1] ?? 1)
        : 1;
    return baseVal * mastMult;
}

// ── Fast Enemy Speed Reduction ────────────────────────────────
// Returns the flat speed reduction fraction for fast enemies from labs.
// Max 12% (lab max 30 × 0.004 = 0.12).
export function calcFastSpeedReduction(labData: LabData): number {
    return (labData['Fast Enemy Speed'] ?? 0) * 0.004;
}

// ── Total Slow (multiplicative stacking) ─────────────────────
// Combines all slow sources multiplicatively.
// Hard cap 90% for speed slows. CF+ hidden slow is NOT included
// here — it is applied separately as a path length multiplier.
export function calcTotalSlow(
    cfSlow: number,
    slowAura: number,
    cfPlusHidden: number,
): number {
    return Math.min(
        0.90,
        1 - (1 - cfSlow) * (1 - slowAura) * (1 - (cfPlusHidden ?? 0)),
    );
}

// ── CF Path Multiplier ────────────────────────────────────────
// CF+ makes enemies spiral along a longer path.
// This multiplies the effective range seen by acts()-based UWs.
// Uncapped — bypasses the 90% slow cap.
export function calcCFPathMult(cfPlusHidden: number): number {
    if (cfPlusHidden <= 0) return 1;
    return 1 / (1 - cfPlusHidden);
}

// ── UW Activations (acts) ─────────────────────────────────────
// How many times a UW fires during one TTT pass.
// Used by SM, DW, ILM, PS, BH, GT.
// CL and SL do NOT use acts() — they have their own activation models.
export function calcUWActivations(ttt: number, effectiveCD: number): number {
    if (effectiveCD <= 0) return 0;
    return ttt / effectiveCD;
}

// ── TTT (Time-To-Tower) ───────────────────────────────────────
// Returns the full TTT data object for the current state.
// TTT = (range × cfPathMult) / (enemySpeed × (1 - cappedSlow))
// Uses Fast enemy as the reference enemy for GC build.
export function calcTTT(
    presetIdx: number,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    uwData: UWData,
    modBonuses: ModBonuses,
): TTTData {
    const range = calcTowerRange(presetIdx, wsData, labData, cardData);
    const cfSlow = calcCFSlow(modBonuses, uwData, wsData, labData, cardData);
    const slowAura = calcSlowAura(cardData);
    const cfPlusHidden = calcCFPlusHiddenSlow(uwData);
    const cappedSlow = calcTotalSlow(cfSlow, slowAura, 0); // speed slow cap applied here
    const cfPathMult = calcCFPathMult(cfPlusHidden);       // path length applied separately

    // Enemy speed — Fast enemy is the reference for GC
    const fastReduction = calcFastSpeedReduction(labData);
    const baseEnemySpeed = 56.0; // Fast enemy base speed
    const enemySpdPerk = modBonuses.perks.enemySpdMult ?? 1.0;
    const enemySpeed = baseEnemySpeed * enemySpdPerk * (1 - fastReduction);

    const effectiveSpeed = enemySpeed * (1 - cappedSlow);
    const ttt = (range * cfPathMult) / Math.max(0.1, effectiveSpeed);

    const cfUptime = calcCFUptime(modBonuses, uwData, wsData, labData, cardData);

    return { ttt, range, cappedSlow, cfPathMult, cfUptime };
}

// ── CF Slow Marginal TTT ──────────────────────────────────────
// Returns the TTT delta from upgrading CF slow % by one step.
export function calcCFSlowMarginalTTT(
    curPct: number,
    nextPct: number,
    range: number,
    fastR: number,
    slowAura: number,
    cfPlus: number,
): number {
    const baseSpeed = 56.0 * (1 - fastR);
    const curSlow = calcTotalSlow(curPct / 100, slowAura, 0);
    const nextSlow = calcTotalSlow(nextPct / 100, slowAura, 0);
    const curTTT = (range * (1 / (1 - cfPlus))) / Math.max(0.1, baseSpeed * (1 - curSlow));
    const nextTTT = (range * (1 / (1 - cfPlus))) / Math.max(0.1, baseSpeed * (1 - nextSlow));
    return nextTTT - curTTT;
}

// ── CF+ Marginal TTT ──────────────────────────────────────────
// Returns the TTT delta from upgrading CF+ by one level.
// CF+ changes path length, not speed — uncapped.
export function calcCFPlusMarginalTTT(
    curLv: number,
    nextLv: number,
    range: number,
    fastR: number,
    cfSlow: number,
    slowAura: number,
): number {
    const baseSpeed = 56.0 * (1 - fastR);
    const cappedSlow = calcTotalSlow(cfSlow, slowAura, 0);
    const effectiveSpeed = Math.max(0.1, baseSpeed * (1 - cappedSlow));

    const curH = curLv < 0
        ? 0
        : (CF_PLUS_HIDDEN_SLOW[Math.min(curLv, CF_PLUS_HIDDEN_SLOW.length - 1)] ?? 0);
    const nextH = CF_PLUS_HIDDEN_SLOW[Math.min(nextLv, CF_PLUS_HIDDEN_SLOW.length - 1)] ?? 0;

    const curTTT = (range * calcCFPathMult(curH)) / effectiveSpeed;
    const nextTTT = (range * calcCFPathMult(nextH)) / effectiveSpeed;
    return nextTTT - curTTT;
}

// ── Display Stats Bundle ──────────────────────────────────────
// Returns a human-readable breakdown of all TTT-related values
// for the optimizer stats panel.
export interface TTTDisplayStats {
    range: number;  // effective tower range (m)
    cfSlowPct: number;  // CF slow contribution (%)
    slowAuraPct: number;  // Slow Aura card contribution (%)
    cappedSlowPct: number;  // total capped slow (%, max 90)
    cfPlusHidden: number;  // CF+ hidden slow (path length, 0-1)
    cfPathMult: number;  // CF+ path length multiplier
    cfUptime: number;  // CF uptime (0-1)
    enemySpeed: number;  // effective enemy speed after slow (m/s)
    ttt: number;  // time-to-tower (s)
}

export function calcTTTDisplayStats(
    presetIdx: number,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    uwData: UWData,
    modBonuses: ModBonuses,
): TTTDisplayStats {
    const range = calcTowerRange(presetIdx, wsData, labData, cardData);
    const cfSlow = calcCFSlow(modBonuses, uwData, wsData, labData, cardData);
    const slowAura = calcSlowAura(cardData);
    const cfPlusHidden = calcCFPlusHiddenSlow(uwData);
    const cappedSlow = calcTotalSlow(cfSlow, slowAura, 0);
    const cfPathMult = calcCFPathMult(cfPlusHidden);
    const cfUptime = calcCFUptime(modBonuses, uwData, wsData, labData, cardData);

    const fastReduction = calcFastSpeedReduction(labData);
    const baseEnemySpeed = 56.0;
    const enemySpdPerk = modBonuses.perks.enemySpdMult ?? 1.0;
    const enemySpeed = baseEnemySpeed * enemySpdPerk * (1 - fastReduction) * (1 - cappedSlow);

    const ttt = (range * cfPathMult) / Math.max(0.1, enemySpeed);

    return {
        range,
        cfSlowPct: cfSlow * 100,
        slowAuraPct: slowAura * 100,
        cappedSlowPct: cappedSlow * 100,
        cfPlusHidden,
        cfPathMult,
        cfUptime,
        enemySpeed,
        ttt,
    };
}