// ============================================================
//  TowerForge Companion — Run Rates
//  How often things happen in the player's runs, read from a
//  Battle Report: boss / elite / fleet kills, recovery packages,
//  cash, and the share of enemies each UW touches. Several unique
//  module effects depend on these (Amplifying Strike, Magnetic
//  Hook, Restorative Bonus, Project Funding, Dimension Core …).
//
//  Pure functions — no store imports.
// ============================================================

import type { BattleReport } from './battleReport';
import type { RunRates } from '../types/gameTypes';

// Stand-ins without a report: a typical long late-game farming run.
export const DEFAULT_RUN_RATES: RunRates = {
    source: 'default',
    waveSec: 20,
    killsPerSec: 8,
    bossFleetPerSec: 0.008,   // ~one boss every 2 minutes
    elitePerSec: 0.07,        // ~one elite every 15 seconds
    packagesPerSec: 0.03,
    pkgChanceAtRun: 0,
    cashDigits: 10,
    clHitsPerEnemy: 0.5,
    poisonedShare: 0.2,
    bhShare: 0.3,
    orbHitsPerEnemy: 1,
};

export function runRatesFrom(report: BattleReport | null): RunRates {
    const t = report?.gameTimeSec ?? 0;
    if (!report || t <= 0) return DEFAULT_RUN_RATES;
    const d = DEFAULT_RUN_RATES;
    const enemies = report.totalEnemies;
    const perSec = (n: number | undefined, fallback: number) => (n != null ? n / t : fallback);
    const share = (n: number | undefined, fallback: number) =>
        (n != null && enemies > 0 ? Math.min(1, n / enemies) : fallback);
    return {
        source: 'report',
        waveSec: report.wave > 0 ? t / report.wave : d.waveSec,
        killsPerSec: enemies > 0 ? enemies / t : d.killsPerSec,
        bossFleetPerSec: perSec(report.bossKills != null ? report.bossKills + (report.fleetKills ?? 0) : undefined, d.bossFleetPerSec),
        elitePerSec: perSec(report.eliteKills, d.elitePerSec),
        packagesPerSec: report.recoveryPackages > 0 ? report.recoveryPackages / t : d.packagesPerSec,
        pkgChanceAtRun: 0,
        cashDigits: report.cashEarned && report.cashEarned > 1 ? Math.log10(report.cashEarned) : d.cashDigits,
        clHitsPerEnemy: report.clHits != null && enemies > 0 ? report.clHits / enemies : d.clHitsPerEnemy,
        poisonedShare: share(report.psHits, d.poisonedShare),
        bhShare: report.killedWithEffect.blackHole ?? d.bhShare,
        orbHitsPerEnemy: report.orbHits != null && enemies > 0 ? report.orbHits / enemies : d.orbHitsPerEnemy,
    };
}
