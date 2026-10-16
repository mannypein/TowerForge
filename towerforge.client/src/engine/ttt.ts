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

    // Range card multiplies total range (base 30m + WS bonus after lab),
    // when it's in this preset.
    const rangeCard = activeCard(cardData, presetIdx, 'Range');
    const cardMult = rangeCard ? (cardValue('Range', rangeCard.stars) || 1) : 1;

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
// Returns CF uptime fraction 0–1: effective duration ÷ effective cooldown.
// A new field doesn't stack on one that's still up (the leftover time is
// wasted), so it's capped at 1 — permanent Chrono Field.
export function calcCFUptime(
    modBonuses: ModBonuses,
    uwData: UWData,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    presetIdx: number = 0,
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
    const gcReduction = calcGCompCDReduction(rawCD, modBonuses, wsData, labData, cardData, presetIdx);
    const effectiveCD = Math.max(1, rawCD - gcReduction);

    return Math.min(1.0, dur / effectiveCD);
}

// ── CF Speed Reduction ────────────────────────────────────────
// Chrono Field's Speed Reduction while the field is up: the stat plus the
// 'Chrono Field - Speed Red.' module sub-effect, capped at 90% (wiki).
export function calcCFSpeedReduction(modBonuses: ModBonuses, uwData: UWData): number {
    const cfData = uwData.data['CF'];
    if (!cfData?.own) return 0;
    const slowLv = cfData.sv[1] ?? 0;
    const slowVals = UW_STAT_VALUES['CF']?.[1] ?? [];
    const slowPct = slowLv > 0 ? (parseFloat(slowVals[slowLv - 1] ?? '0') || 0) / 100 : 0;
    return Math.min(0.90, slowPct + (modBonuses.uwBonus['CF']?.slow ?? 0));
}

// ── CF Slow ───────────────────────────────────────────────────
// Chrono Field's slow averaged over time: Speed Reduction × uptime.
export function calcCFSlow(
    modBonuses: ModBonuses,
    uwData: UWData,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    presetIdx: number = 0,
): number {
    return calcCFSpeedReduction(modBonuses, uwData)
        * calcCFUptime(modBonuses, uwData, wsData, labData, cardData, presetIdx);
}

// ── CF+ Hidden Slow ───────────────────────────────────────────
// Chrono Loop (CF+) makes enemies in the field spiral around the tower,
// cutting how fast they close in by this fraction (wiki research by
// Priesten / yournicknm / Tremnen: 2.5% at the unlock level … 65% at max).
// It isn't a Speed Reduction stat, so the 90% cap doesn't apply, but it
// only works on enemies inside an active Chrono Field.
export function calcCFPlusHiddenSlow(uwData: UWData): number {
    const cfData = uwData.data['CF'];
    if (!cfData?.own || !cfData?.upOwn) return 0;
    const lv = Math.min(cfData.upLvl ?? 0, CF_PLUS_HIDDEN_SLOW.length - 1);
    return CF_PLUS_HIDDEN_SLOW[lv];
}

// ── Slow Aura Card ────────────────────────────────────────────
// Slow Aura card's speed reduction in tower range, when it's in the preset.
// Its mastery reduces enemy ATTACK speed, not movement (wiki), so it isn't
// counted here.
export function calcSlowAura(cardData: CardData, presetIdx: number = 0): number {
    const card = activeCard(cardData, presetIdx, 'Slow Aura');
    return card ? cardValue('Slow Aura', card.stars) / 100 : 0;
}

// ── Fast Enemy Speed Reduction ────────────────────────────────
// Returns the flat speed reduction fraction for fast enemies from labs.
// Max 12% (lab max 30 × 0.004 = 0.12).
export function calcFastSpeedReduction(labData: LabData): number {
    return (labData['Fast Enemy Speed'] ?? 0) * 0.004;
}

// ── Enemy Speed Factor ────────────────────────────────────────
// How fast enemies close in on the tower, averaged over time (1 = full
// speed). While Chrono Field is up: its Speed Reduction × Slow Aura ×
// Chrono Loop's spiral, all multiplicative (wiki: Slow Aura multiplies
// with Chrono Field); the rest of the time only Slow Aura. Averaging the
// speed over time gives the distance covered, so TTT = range ÷ (speed ×
// factor). Only Chrono Field's own stat is capped (90%).
export function calcEnemySpeedFactor(
    cfSpeedReduction: number,
    cfUptime: number,
    slowAura: number,
    cfPlusHidden: number,
): number {
    const inField = (1 - cfSpeedReduction) * (1 - slowAura) * (1 - cfPlusHidden);
    const outside = 1 - slowAura;
    return cfUptime * inField + (1 - cfUptime) * outside;
}

// ── UW Activations (acts) ─────────────────────────────────────
// How many times a UW fires during one TTT pass.
// Used by SM, DW, ILM, PS, BH, GT.
// CL and SL do NOT use acts() — they have their own activation models.
export function calcUWActivations(ttt: number, effectiveCD: number): number {
    if (effectiveCD <= 0) return 0;
    return ttt / effectiveCD;
}

// Slow pieces shared by calcTTT and the display bundle.
function slowParts(
    presetIdx: number,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    uwData: UWData,
    modBonuses: ModBonuses,
) {
    const cfReduction = calcCFSpeedReduction(modBonuses, uwData);
    const cfUptime = calcCFUptime(modBonuses, uwData, wsData, labData, cardData, presetIdx);
    const slowAura = calcSlowAura(cardData, presetIdx);
    const cfPlusHidden = calcCFPlusHiddenSlow(uwData);
    const speedOnly = calcEnemySpeedFactor(cfReduction, cfUptime, slowAura, 0);
    const factor = calcEnemySpeedFactor(cfReduction, cfUptime, slowAura, cfPlusHidden);

    // Enemy speed — Fast enemy is the reference for GC
    const fastReduction = calcFastSpeedReduction(labData);
    const baseEnemySpeed = 56.0; // Fast enemy base speed
    const enemySpdPerk = modBonuses.perks.enemySpdMult ?? 1.0;
    const enemySpeed = baseEnemySpeed * enemySpdPerk * (1 - fastReduction);

    return {
        cfSlow: cfReduction * cfUptime,
        cfUptime,
        slowAura,
        cfPlusHidden,
        totalSlow: 1 - speedOnly,                     // speed slows only (no CF+)
        cfPathMult: factor > 0 ? speedOnly / factor : 1,   // extra TTT from Chrono Loop
        enemySpeed,
        factor,
    };
}

// ── TTT (Time-To-Tower) ───────────────────────────────────────
// Returns the full TTT data object for the current state.
// TTT = range / (enemySpeed × speed factor), with Chrono Loop inside the factor.
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
    const s = slowParts(presetIdx, wsData, labData, cardData, uwData, modBonuses);
    const ttt = range / Math.max(0.1, s.enemySpeed * s.factor);
    return { ttt, range, cappedSlow: s.totalSlow, cfPathMult: s.cfPathMult, cfUptime: s.cfUptime };
}

// ── Display Stats Bundle ──────────────────────────────────────
// Returns a human-readable breakdown of all TTT-related values
// for the optimizer stats panel.
export interface TTTDisplayStats {
    range: number;  // effective tower range (m)
    cfSlowPct: number;  // CF slow, averaged over its uptime (%)
    slowAuraPct: number;  // Slow Aura card contribution (%)
    cappedSlowPct: number;  // total speed slow, averaged over time (%)
    cfPlusHidden: number;  // CF+ hidden slow inside the field (0-1)
    cfPathMult: number;  // extra time-to-tower from Chrono Loop
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
    const s = slowParts(presetIdx, wsData, labData, cardData, uwData, modBonuses);
    return {
        range,
        cfSlowPct: s.cfSlow * 100,
        slowAuraPct: s.slowAura * 100,
        cappedSlowPct: s.totalSlow * 100,
        cfPlusHidden: s.cfPlusHidden,
        cfPathMult: s.cfPathMult,
        cfUptime: s.cfUptime,
        enemySpeed: s.enemySpeed * (1 - s.totalSlow),
        ttt: range / Math.max(0.1, s.enemySpeed * s.factor),
    };
}
