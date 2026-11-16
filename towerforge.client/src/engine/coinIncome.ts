// ============================================================
//  TowerForge Companion — Coin income
//  Coins a day from the player's runs, and so the most one Optimizer
//  step may cost: an upgrade that takes more than 3 days of the
//  player's coins isn't recommended (owner, 2026-11-16, from a player
//  report: "if the costs are absurdly expensive then we should not
//  recommend them"). 3 days, owner's call: coins do more spent early
//  than saved for weeks, and labs take coins too. First set at 30.
//  Pure functions — no store imports.
// ============================================================

import type { BattleReport } from './battleReport';

export const COIN_CAP_DAYS = 3;

const WINDOW_MS = 7 * 24 * 3600_000;
const DAY_MS = 24 * 3600_000;

// Coins a day over the runs of the last 7 days up to the newest one:
// everything they earned over the time from the first one's start to the
// newest one's end, so the time between runs counts too (a run's
// BattleDate is when it ended: labBoosts.ts). Tournaments count; they
// pay coins like any run. One run alone reads as if played all day.
export function coinsADay(battles: BattleReport[]): number | null {
    const runs = battles
        .filter(b => typeof b.time === 'number' && b.realTimeSec > 0 && b.coinsEarned > 0)
        .sort((a, b) => a.time! - b.time!);
    if (runs.length === 0) return null;
    const newest = runs[runs.length - 1].time!;
    const recent = runs.filter(b => b.time! >= newest - WINDOW_MS);
    const start = Math.min(...recent.map(b => b.time! - b.realTimeSec * 1000));
    const coins = recent.reduce((sum, b) => sum + b.coinsEarned, 0);
    return coins / (Math.max(1000, newest - start) / DAY_MS);
}

// The most coins one step may cost (undefined: no runs to tell).
export function stepCoinCap(battles: BattleReport[]): number | undefined {
    const perDay = coinsADay(battles);
    return perDay ? perDay * COIN_CAP_DAYS : undefined;
}
