// ============================================================
//  TowerForge Companion — Run savers
//  What keeps a run going past a killing hit, and what Death Defy is worth.
//
//  Order (wiki, Death Defy → Activation Priority): a killing hit is first
//  ignored with the Death Defy chance; if not, Energy Shield takes it (one
//  charge), then Second Wind, then automated Demon Mode and Nuke. A run
//  ends on the first killing hit nothing takes.
//
//  So with Death Defy chance p and K other saves in a run, the run survives
//  on average (K + 1) ÷ (1 − p) − 1 killing hits; Death Defy took
//  p × (K + 1) ÷ (1 − p) of them. K comes from the player's own runs (their
//  Energy Shield, Second Wind, Demon Mode and Nuke counts).
//
//  Turning extra hits into waves needs when in a run killing hits come,
//  which battle reports don't give — so What If shows hits. A recording of
//  the end of a T18 push (docs/run-simulation.md) showed the last ones come
//  in bursts once the wall breaks (five within ~10 game seconds), so saves
//  there buy seconds; the waves come from earlier, single leaks.
//  Death Defy chance: workshop 0.4% a level (75 levels, 30%) + module
//  substats. Tiers whose battle conditions include Death Defy Down lower it
//  in the run by an amount not modeled here (the observed procs show it).
//  Pure functions — no store imports.
// ============================================================

import { WS_STATS } from '../constants/gameData';
import type { BattleReport } from './battleReport';
import { runSavers } from './battleReport';
import type { OptimizerSnapshot } from './optimizer';

const DD_IDX = WS_STATS.defense.findIndex(([n]) => n === 'Death Defy');

// Death Defy chance (0–1) before battle conditions.
export function deathDefyChance(snap: OptimizerSnapshot): number {
    const ws = snap.wsData[snap.presetIdx]?.defense[DD_IDX] ?? 0;
    return Math.min(0.99, Math.max(0, (0.4 * ws + (snap.modBonuses.subs?.['Death Defy'] ?? 0)) / 100));
}

// Killing hits a run survives on average, with Death Defy chance p and
// `others` saves behind it.
export const hitsSurvived = (p: number, others: number) => (others + 1) / (1 - Math.min(0.99, p)) - 1;

export interface SaverAverages {
    runs: number;
    deathDefy: number | null;   // procs per run
    others: number;             // Energy Shield + Second Wind + Demon Mode + Nuke per run
}

// Per-run averages over the given runs; null when no run records Death Defy.
export function saverAverages(runs: BattleReport[]): SaverAverages | null {
    const all = runs.map(runSavers);
    const has = all.filter(s => Object.values(s).some(v => v !== null));
    if (!has.length) return null;
    const avg = (pick: (s: ReturnType<typeof runSavers>) => number | null) => {
        const vals = has.map(pick).filter((v): v is number => v !== null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const others = (['energyShield', 'secondWind', 'demonMode', 'nuke'] as const)
        .reduce((sum, k) => sum + (avg(s => s[k]) ?? 0), 0);
    return { runs: has.length, deathDefy: avg(s => s.deathDefy), others };
}
