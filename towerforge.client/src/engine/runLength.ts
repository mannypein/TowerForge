// ============================================================
//  TowerForge Companion — Run length (run simulator, step 2)
//  How far a Glass Cannon run gets, and how many waves more damage or
//  more Enemy Health Level Skip would buy.
//
//  A GC tower dies to the first enemy that reaches it (one hit takes
//  all its health; Death Defy, Energy Shield and the wall only absorb a
//  few). So a run ends at the wave where enemies are too tough to kill
//  before they arrive: enemy health ÷ the tower's damage crosses a fixed
//  point. Enemy speed is capped by then, so that point doesn't move —
//  more damage moves the death wave to where enemy health has grown by
//  the same factor.
//
//  - Enemy health at death: the basic enemy at the run's own stat level
//    (wave − health levels skipped), by the formula checked against the
//    game (engine/enemyStats.ts). Only ratios matter, so perks and labs
//    that scale every enemy the same cancel out.
//  - Your limit: the geometric mean of that health over your latest
//    deaths on one tier (each run is a little luckier or unluckier).
//  - Level skips are deterministic, so health level = wave × (1 − rate).
//  Attack levels don't matter here: any hit is lethal either way.
//  Pure functions — no store imports.
// ============================================================

import type { BattleReport } from './battleReport';
import { baseEnemyHealth } from './enemyStats';

// What ended a run (the game's KilledBy number): its enemy-type order.
// −1, 99 and 255 mean nothing killed the tower — the player ended the run.
const KILLED_BY = ['Basic', 'Fast', 'Tank', 'Boss', 'Ranged', 'Protector', 'Vampire',
    'Scatter', 'Scatter', 'Ray', 'Saboteur', 'Commander', 'Overcharge'];

export function killedBy(run: BattleReport): string | null | undefined {
    const raw = run.raw?.KilledBy;
    if (typeof raw !== 'number') return undefined;         // not stored for this run
    return KILLED_BY[raw] ?? null;                          // null = quit
}

// Enemy levels skipped in a run, by whatever the game named the field
// (HealthLevelSkips / AttackLevelSkips in current exports).
export function runLevelSkips(run: BattleReport): { health: number; attack: number } | null {
    const raw = run.raw ?? {};
    const find = (stat: 'health' | 'attack') => {
        const key = Object.keys(raw).find(k => {
            const l = k.toLowerCase();
            return l.includes(stat) && l.includes('level') && l.includes('skip') && typeof raw[k] === 'number';
        });
        return key ? (raw[key] as number) : null;
    };
    const health = find('health');
    const attack = find('attack');
    return health !== null && attack !== null ? { health, attack } : null;
}

export interface RunEnd {
    index: number;            // into the runs passed in
    run: BattleReport;
    killer: string | null | undefined;   // enemy type; null = quit; undefined = not recorded
    healthLevel: number | null;
    enemyHealth: number | null;          // basic enemy at death (base formula)
}

export function runEnds(runs: BattleReport[]): RunEnd[] {
    return runs.map((run, index) => {
        const skips = runLevelSkips(run);
        const healthLevel = skips ? Math.max(1, run.wave - skips.health) : null;
        return {
            index, run,
            killer: killedBy(run),
            healthLevel,
            enemyHealth: healthLevel !== null ? baseEnemyHealth(healthLevel, run.tier) : null,
        };
    });
}

// Waves until the basic enemy's health reaches `limit`, skipping `skipRate`
// of health levels (enemy health only rises with the wave, so a halving search works).
export function deathWave(limit: number, tier: number, skipRate: number): number {
    const healthAt = (w: number) => baseEnemyHealth(Math.max(1, w - Math.floor(w * skipRate)), tier);
    let lo = 1;
    let hi = 1;
    while (healthAt(hi) < limit && hi < 1e6) hi *= 2;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (healthAt(mid) >= limit) hi = mid; else lo = mid + 1;
    }
    return lo;
}

export interface RunLengthModel {
    tier: number;
    used: RunEnd[];           // the deaths the model works from (newest first)
    limit: number;            // their typical basic-enemy health at death (geometric mean)
    skipRate: number;         // health levels skipped per wave (newest of those runs)
    typicalWave: number;      // the average wave they ended on
}

const RECENT_DEATHS = 5;

// The newest deaths on the tier the player dies on most.
export function buildRunLengthModel(runs: BattleReport[]): RunLengthModel | null {
    const deaths = runEnds(runs).filter(e =>
        e.killer !== null && e.enemyHealth !== null && !e.run.tournament && e.run.wave > 1);
    if (deaths.length === 0) return null;
    const byTier = new Map<number, number>();
    for (const d of deaths) byTier.set(d.run.tier, (byTier.get(d.run.tier) ?? 0) + 1);
    const tier = [...byTier.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    const used = deaths.filter(d => d.run.tier === tier)
        .sort((a, b) => (b.run.time ?? b.index) - (a.run.time ?? a.index))
        .slice(0, RECENT_DEATHS);
    const limit = Math.exp(used.reduce((s, d) => s + Math.log(d.enemyHealth!), 0) / used.length);
    return {
        tier, used, limit,
        skipRate: 1 - used[0].healthLevel! / used[0].run.wave,
        typicalWave: Math.round(used.reduce((s, d) => s + d.run.wave, 0) / used.length),
    };
}

// Enemy health doesn't rise smoothly: at some levels several of the
// formula's steps land together and it jumps 30–40% in one wave (a wall).
// So each death is moved from where it really was, at that run's own skip
// rate, and the moves are averaged — rather than from one averaged limit,
// which could sit right on a wall.
function averageMove(m: RunLengthModel, healthFactor: number, extraSkip: number): number {
    const moves = m.used.map(d => {
        const rate = 1 - d.healthLevel! / d.run.wave;
        const from = deathWave(d.enemyHealth!, m.tier, rate);
        return deathWave(d.enemyHealth! * healthFactor, m.tier, Math.min(0.99, rate + extraSkip)) - from;
    });
    return moves.reduce((a, b) => a + b, 0) / moves.length;
}

// Waves gained if the tower's damage rose by `gain` (0.1 = +10%).
export function wavesFromDamage(m: RunLengthModel, gain: number): number {
    return averageMove(m, 1 + gain, 0);
}

// Waves gained if `points` more percent of health levels were skipped.
export function wavesFromSkip(m: RunLengthModel, points: number): number {
    return averageMove(m, 1, points / 100);
}
