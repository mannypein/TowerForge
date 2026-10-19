// ============================================================
//  TowerForge Companion — Battle conditions in the model
//  The tournament battle conditions the simulator counts, as changes to
//  what the model already reads (constants/tournamentData.ts lists them):
//   • Enemy Speed +x%      → enemy speed × (1 + x), so less time in range
//   • UW Durations −x s    → Chrono Field, Golden Tower, Poison Swamp and
//                            Black Hole durations, through the same bonus
//                            their duration substats add to
//   • Skip Reduction ×x    → Enemy Health Level Skip chance × x
//   • Skip Decay           → skip points off, averaged over the run
//   • Boss's Ultimate +x%  → boss health, where bosses end your runs
//  Skip order (TheTowerSDK): sum of sources × enhancement, then × Skip
//  Reduction - Multiply, then − Skip Decay, never below 0.
//  Pure functions — no store imports.
// ============================================================

import type { ModBonuses, UWAbbr } from '../types/gameTypes';

export interface TourneyConditions {
    enemySpeedPct?: number;     // enemies move this % faster
    uwDurationSec?: number;     // seconds off CF, GT, PS and BH
    skipMultiply?: number;      // skip chance × this (0–1)
    skipDecayPoints?: number;   // skip points off, averaged over the run (skipDecayAverage)
    bossHealthPct?: number;     // bosses spawn with this % more health
}

const DURATION_UWS: UWAbbr[] = ['CF', 'GT', 'PS', 'BH'];

// Module and perk bonuses with the conditions in them.
export function withConditions(mb: ModBonuses, c: TourneyConditions | undefined): ModBonuses {
    if (!c) return mb;
    let out = mb;
    if (c.enemySpeedPct) {
        out = { ...out, perks: { ...out.perks, enemySpdMult: (out.perks.enemySpdMult ?? 1) * (1 + c.enemySpeedPct / 100) } };
    }
    if (c.uwDurationSec) {
        const uwBonus = { ...out.uwBonus };
        for (const a of DURATION_UWS) uwBonus[a] = { ...uwBonus[a], dur: (uwBonus[a]?.dur ?? 0) - c.uwDurationSec };
        out = { ...out, uwBonus };
    }
    return out;
}

// A snapshot scored under its conditions.
export function conditioned<T extends { modBonuses: ModBonuses; conditions?: TourneyConditions }>(snap: T): T {
    return snap.conditions ? { ...snap, modBonuses: withConditions(snap.modBonuses, snap.conditions) } : snap;
}

// Enemy Health Level Skip chance (points) under the conditions.
export function conditionedSkip(chance: number, c: TourneyConditions | undefined): number {
    if (!c) return chance;
    return Math.max(0, chance * (c.skipMultiply ?? 1) - (c.skipDecayPoints ?? 0));
}

// Skip Decay takes `pct` points off every `every` waves, so by wave W it's
// pct·⌊W/every⌋ off. Health levels skipped by the end are the sum over the
// run, so the run's average is about half the end value — the code's
// assumption, capped at the chance you have.
export function skipDecayAverage(pct: number, every: number, wave: number, chance: number): number {
    if (pct <= 0 || every <= 0 || wave <= 0) return 0;
    let off = 0;
    for (let w = 1; w <= wave; w++) off += Math.min(chance, pct * Math.floor(w / every));
    return off / wave;
}

// Health multiplier on an enemy type from the conditions.
export function conditionHealth(type: string, c: TourneyConditions | undefined): number {
    return type === 'Boss' && c?.bossHealthPct ? 1 + c.bossHealthPct / 100 : 1;
}
