// ============================================================
//  TowerForge Companion — Lab boosts (Elite Cells)
//  How fast each lab slot can run on the cells a player earns. A boost
//  is bought per lab slot for 1, 8 or 24 hours at a flat cells-an-hour
//  rate — ×1.5 15, ×2 100, ×3 840, ×4 3,360, ×5 11,900, ×6 60,000,
//  ×7 250,000, ×8 1,000,000 (wiki Lab Upgrades and Currencies,
//  CELL_BOOSTS) — and only ticks while the slot is researching. Each step
//  up costs more per unit of speed than the one below it (×1 → ×1.5:
//  30 cells an hour a unit; ×7 → ×8: 750,000), so the most research for
//  the cells is every slot raised evenly, the lowest one step at a time:
//  the wiki's "Most Efficient Speed Across 5 Labs" table, row for row.
//
//  Cells an hour come from the player's runs (the game's battle history,
//  CellsEarned): cells over the real time spent in runs, and the share of
//  the day spent in a run from the gaps between runs. A run's BattleDate
//  is when it ended — each run's date is the one before's plus its own
//  RealTime, give or take a few minutes (owner's export, 2026-10-28).
//  Pure functions — no store imports.
// ============================================================

import { CELL_BOOSTS, labLevelCost } from './upgradeCosts';
import type { BattleReport } from './battleReport';
import type { LabData, LabProgress, Profile, RelicData } from '../types/gameTypes';
import { LABS } from '../constants/gameData';

const SPEEDS = [1, ...CELL_BOOSTS.map(([speed]) => speed)];
const COST = [0, ...CELL_BOOSTS.map(([, perHour]) => perHour)];
export const MAX_LAB_SLOTS = 5;

export interface BoostStep {
    speeds: number[];      // per lab slot, fastest first (1 = no boost)
    cellsPerHour: number;  // what they cost together
}

const step = (tiers: number[]): BoostStep => ({
    speeds: tiers.map(t => SPEEDS[t]),
    cellsPerHour: tiers.reduce((sum, t) => sum + COST[t], 0),
});

// Every even step from no boosts to ×8 on every slot: the lowest slot up
// one speed each time.
export function boostLadder(slots: number): BoostStep[] {
    const n = Math.max(1, Math.min(MAX_LAB_SLOTS, Math.round(slots)));
    const tiers: number[] = Array(n).fill(0);
    const out = [step(tiers)];
    for (;;) {
        const low = Math.min(...tiers);
        if (low >= SPEEDS.length - 1) break;
        tiers[tiers.indexOf(low)]++;
        out.push(step(tiers));
    }
    return out;
}

export interface LabBoostPlan {
    best: BoostStep;       // the fastest even boosts the cells keep up
    spare: number;         // cells an hour left over
    higher: BoostStep[];   // the next steps up, cheapest first
    // What the spare cells do: the next step's faster slot for part of each day.
    part: { speed: number; hoursPerDay: number } | null;
}

export function planLabBoosts(cellsPerHour: number, slots: number, show = 3): LabBoostPlan {
    const ladder = boostLadder(slots);
    const budget = Math.max(0, cellsPerHour);
    let i = 0;
    while (i + 1 < ladder.length && ladder[i + 1].cellsPerHour <= budget + 1e-9) i++;
    const best = ladder[i];
    const spare = budget - best.cellsPerHour;
    const next = ladder[i + 1];
    let part: LabBoostPlan['part'] = null;
    if (next) {
        // The slot the next step raises, and to what.
        const k = next.speeds.findIndex((s, j) => s !== best.speeds[j]);
        const hoursPerDay = 24 * spare / (next.cellsPerHour - best.cellsPerHour);
        if (hoursPerDay >= 1) part = { speed: next.speeds[k], hoursPerDay };
    }
    return { best, spare, higher: ladder.slice(i + 1, i + 1 + show), part };
}

// Hours the cells on hand keep a step going that costs more than comes in;
// Infinity when income covers it.
export function hoursOnHand(stepCost: number, cellsPerHour: number, cellsHeld: number): number {
    const drain = stepCost - cellsPerHour;
    return drain <= 0 ? Infinity : Math.max(0, cellsHeld) / drain;
}

// The plan's speeds on the labs being researched: the fastest on the ones
// with the most time left (they use the boost the longest). Returns a speed
// per lab, in the order given.
export function boostsForLabs(secondsLeft: number[], speeds: number[]): number[] {
    const order = secondsLeft.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
    const sorted = [...speeds].sort((a, b) => b - a);
    const out = secondsLeft.map(() => 1);
    order.forEach(([, i], rank) => { out[i] = sorted[rank] ?? 1; });
    return out;
}

const LAB_MAX = new Map(LABS.flatMap(g => g.l.map(([name, max]) => [name, max] as const)));

// Research hours left for a lab's next level and for the rest of it, at ×1
// (after lab speed and relics: upgradeCosts.labLevelCost), with how much of
// the next level is done already; null when maxed.
export function labHours(lab: string, labData: LabData, relics: RelicData, progress?: LabProgress):
    { cur: number; max: number; next: number | null; toMax: number | null; done: number } | null {
    const cur = labData[lab] ?? 0;
    const max = LAB_MAX.get(lab) ?? cur;
    if (cur >= max) return null;
    const next = labLevelCost(lab, cur + 1, labData, relics, progress);
    let toMax: number | null = 0;
    for (let lv = cur + 1; lv <= max; lv++) {
        const c = labLevelCost(lab, lv, labData, relics, progress);
        if (!c) { toMax = null; break; }
        toMax += c.hours;
    }
    const under = progress?.[lab];
    return { cur, max, next: next?.hours ?? null, toMax, done: under?.toLevel === cur + 1 ? under.done : 0 };
}

export interface CellIncome {
    runs: number;          // runs read (the last 7 days of them)
    perRunHour: number;    // cells an hour while in a run
    share: number;         // share of the time spent in a run (0–1)
    perHour: number;       // cells an hour over the whole day
}

const WINDOW_MS = 7 * 24 * 3600_000;

// Cells an hour from the imported runs that record their cells, over the
// last 7 days of them (an account's rate grows as it progresses).
export function cellIncome(battles: BattleReport[]): CellIncome | null {
    const runs = battles
        .filter(b => typeof b.time === 'number' && b.realTimeSec > 0 && typeof b.raw?.CellsEarned === 'number')
        .sort((a, b) => a.time! - b.time!);
    if (runs.length === 0) return null;
    const newest = runs[runs.length - 1].time!;
    const recent = runs.filter(b => b.time! >= newest - WINDOW_MS);
    let cells = 0, inRun = 0, gaps = 0;
    recent.forEach((b, i) => {
        cells += b.raw!.CellsEarned as number;
        inRun += b.realTimeSec;
        if (i > 0) gaps += Math.max(0, (b.time! - b.realTimeSec * 1000 - recent[i - 1].time!) / 1000);
    });
    const perRunHour = cells / (inRun / 3600);
    const share = inRun / (inRun + gaps);
    return { runs: recent.length, perRunHour, share, perHour: perRunHour * share };
}

export interface BoostSettings {
    perRunHour: number;      // cells an hour while in a run
    hoursPerDay: number;     // hours a day in a run
    slots: number;
    budget: number;          // cells an hour over the whole day
}

// What the plan runs on: the player's typed values, else their runs, else
// a full day in a run; slots from the import, else the labs running.
export function boostSettings(profile: Profile, income: CellIncome | null, running: number): BoostSettings {
    const perRunHour = profile.cellsPerHour ?? income?.perRunHour ?? 0;
    const hoursPerDay = profile.runHoursPerDay ?? (income ? 24 * income.share : 24);
    const slots = profile.labSlots ?? (running > 0 ? running : MAX_LAB_SLOTS);
    return { perRunHour, hoursPerDay, slots, budget: (perRunHour * hoursPerDay) / 24 };
}
