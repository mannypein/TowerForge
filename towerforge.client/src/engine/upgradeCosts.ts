// ============================================================
//  TowerForge Companion — Workshop and lab upgrade costs
//  What the next workshop and lab levels cost the player, after their
//  discount labs, and how long a lab takes.
//
//  - Workshop: the game's cost table (constants/workshopCosts.ts), less
//    0.5% a level of that section's Workshop Discount lab (49.5% at 99).
//  - Labs: coins (constants/labCosts.ts) less 0.3% a level of Labs Coin
//    Discount; time ÷ (1 + 2% a level of Labs Speed) ÷ (1 + the Lab
//    Speed relic). Labs Speed doesn't speed up its own research (wiki,
//    Labs Speed); gem speed-ups aren't counted.
//  - Enhancements: 0.3% a level of that section's Enhancement Coin
//    Discount lab (30% at 100).
//  Pure functions — no store imports.
// ============================================================

import { WS_STATS } from '../constants/gameData';
import { WS_COIN_COSTS } from '../constants/workshopCosts';
import { LAB_LEVEL_COSTS } from '../constants/labCosts';
import type { LabData } from '../types/gameTypes';

export type WorkshopSection = 'attack' | 'defense' | 'utility';

const WS_DISCOUNT_LAB: Record<WorkshopSection, string> = {
    attack: 'WS Atk Discount', defense: 'WS Def Discount', utility: 'WS Util Discount',
};
const ENH_DISCOUNT_LAB: Record<WorkshopSection, string> = {
    attack: 'Enh Atk Discount', defense: 'Enh Def Discount', utility: 'Enh Util Discount',
};

// Share of workshop coin costs the section's discount lab takes off (0–0.495).
export function workshopDiscount(labs: LabData, section: WorkshopSection): number {
    return Math.min(99, labs[WS_DISCOUNT_LAB[section]] ?? 0) * 0.005;
}

// Share of enhancement coin costs the section's discount lab takes off (0–0.3).
export function enhancementDiscount(labs: LabData, section: WorkshopSection): number {
    return Math.min(100, labs[ENH_DISCOUNT_LAB[section]] ?? 0) * 0.003;
}

const WS_MAX: Record<string, number> = Object.fromEntries(Object.values(WS_STATS).flat());
const runningTotals = new Map<string, number[]>();

// Coins spent on a stat to reach `level`, before discounts. Long stats list
// one total per 10 levels; inside one the levels are taken as equal.
function workshopTotal(stat: string, level: number): number | null {
    const table = WS_COIN_COSTS[stat];
    const max = WS_MAX[stat];
    if (!table || max === undefined) return null;
    const [step, costs] = table;
    let sums = runningTotals.get(stat);
    if (!sums) {
        sums = [0];
        for (const c of costs) sums.push(sums[sums.length - 1] + c);
        runningTotals.set(stat, sums);
    }
    const l = Math.min(max, Math.max(0, level));
    const k = Math.min(costs.length - 1, Math.floor(l / step));
    const span = Math.min(step, max - k * step);
    return sums[k] + costs[k] * Math.min(1, (l - k * step) / span);
}

// Coins to take a workshop stat from one level to another, after `discount`.
export function workshopCost(stat: string, from: number, to: number, discount = 0): number | null {
    const a = workshopTotal(stat, from);
    const b = workshopTotal(stat, to);
    return a === null || b === null ? null : Math.max(0, b - a) * (1 - discount);
}

export interface LabLevelCost {
    coins: number;
    hours: number;
}

// Total research speed: the Labs Speed lab × the Lab Speed relic.
export function labSpeed(labs: LabData, relics: Record<string, number>, lab?: string): number {
    const fromLab = lab === 'Labs Speed' ? 1 : 1 + 0.02 * (labs['Labs Speed'] ?? 0);
    return fromLab * (1 + (relics['rLabSpd'] ?? 0) / 100);
}

// Coins and research time for `level` (1 = the first level) of a lab; null
// when the catalog doesn't have that level.
export function labLevelCost(
    lab: string, level: number, labs: LabData, relics: Record<string, number>,
): LabLevelCost | null {
    const row = LAB_LEVEL_COSTS[lab];
    const i = level - 1;
    if (!row || i < 0 || i >= row[0].length) return null;
    return {
        coins: row[1][i] * (1 - 0.003 * Math.min(99, labs['Labs Coin Discount'] ?? 0)),
        hours: row[0][i] / 60 / labSpeed(labs, relics, lab),
    };
}

// Research time the way the game shows it: "7d 3h", "16h 39m", "6m".
export function formatLabTime(hours: number): string {
    const mins = Math.round(hours * 60);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d > 0) return `${d}d ${h}h`;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
