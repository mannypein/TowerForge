// ============================================================
//  TowerForge Companion — Enemy Health Level Skip upgrades
//  The coin upgrades that raise the chance to skip an enemy health
//  level, and how many skip points each one adds — for Glass Cannon,
//  where each point moves the death wave a long way (runLength.ts).
//
//  Skip chance = (workshop + lab + relic + module substats)
//                × the Enemy Level Skips enhancement, capped at 100%;
//  tier battle conditions then subtract a fixed amount, so an upgrade
//  adds to the chance a run actually gets exactly what it adds here.
//    - Workshop: 0.05% a level (699 levels, 35% at max).
//    - Lab: 0.1% a level (20 levels).
//    - Enhancement: ×1 + 0.01 a level (60 levels, ×1.6) — it multiplies
//      everything else, so one level is worth several workshop levels.
//  Costs: the workshop, lab and enhancement tables (engine/upgradeCosts.ts),
//  after the player's discount labs and lab speed.
//  Pure functions — no store imports.
// ============================================================

import type { EnhData, LabData, WSPreset } from '../types/gameTypes';
import { WS_ENH, WS_STATS } from '../constants/gameData';
import {
    enhancementCost, enhancementDiscount, formatLabTime, labLevelCost, workshopCost, workshopDiscount,
} from './upgradeCosts';

const WORKSHOP_STAT = 'Enemy HP Level Skip';
const LAB = 'Enemy HP Lvl Skip Lab';
const WORKSHOP_MAX = 699;
const LAB_MAX = 20;
const ENH = 'Enemy Level Skips';
const ENH_MAX = 60;
const WORKSHOP_STEP = 10;     // offered in steps of 10 levels — one level is 0.05%

export interface SkipSources {
    workshop: number;         // workshop level (0–699)
    lab: number;              // lab level (0–20)
    enhancement: number;      // enhancement level (0–60); 0 also when not unlocked
    enhancementOwned: boolean;
    otherPct: number;         // relic + module substats, in %
    // For the prices: the player's discount labs, lab speed and relics.
    // Omitted = no discounts.
    labs?: LabData;
    relics?: Record<string, number>;
}

const WS_IDX = WS_STATS.utility.findIndex(([n]) => n === WORKSHOP_STAT);
const ENH_IDX = WS_ENH.utility.findIndex(([n]) => n === ENH);

export function healthSkipSources(
    ws: WSPreset | undefined, labs: LabData, enh: EnhData, relics: Record<string, number>,
    subs: Record<string, number>,
): SkipSources {
    return {
        workshop: ws?.utility[WS_IDX] ?? 0,
        lab: labs[LAB] ?? 0,
        enhancement: enh.d.utility?.[ENH_IDX] ?? 0,
        enhancementOwned: enh.u.utility?.[ENH_IDX] ?? false,
        otherPct: (relics['rEHPSkip'] ?? 0) + (subs['Enemy HP Level Skip'] ?? 0),
        labs, relics,
    };
}

// Skip chance before tier battle conditions, in %.
export function healthSkipChance(s: SkipSources): number {
    const base = (s.workshop > 0 ? 0.05 * (s.workshop + 1) : 0) + 0.1 * s.lab + s.otherPct;
    return Math.min(100, base * (s.enhancementOwned ? 1 + 0.01 * s.enhancement : 1));
}

export interface SkipUpgrade {
    source: 'workshop' | 'lab' | 'enhancement';
    from: number;
    to: number;
    points: number;           // skip-chance points added
    cost: number;             // coins
    time?: string;            // lab research time
}

// The next step of each source, from the given levels.
export function nextSkipUpgrades(s: SkipSources): SkipUpgrade[] {
    const now = healthSkipChance(s);
    const labs = s.labs ?? {};
    const out: SkipUpgrade[] = [];
    if (s.workshop < WORKSHOP_MAX) {
        const to = Math.min(WORKSHOP_MAX, s.workshop + WORKSHOP_STEP);
        out.push({
            source: 'workshop', from: s.workshop, to,
            points: healthSkipChance({ ...s, workshop: to }) - now,
            cost: workshopCost(WORKSHOP_STAT, s.workshop, to, workshopDiscount(labs, 'utility')) ?? 0,
        });
    }
    const lab = s.lab < LAB_MAX ? labLevelCost(LAB, s.lab + 1, labs, s.relics ?? {}) : null;
    if (lab) {
        out.push({
            source: 'lab', from: s.lab, to: s.lab + 1,
            points: healthSkipChance({ ...s, lab: s.lab + 1 }) - now,
            cost: lab.coins, time: formatLabTime(lab.hours),
        });
    }
    if (s.enhancementOwned && s.enhancement < ENH_MAX) {
        out.push({
            source: 'enhancement', from: s.enhancement, to: s.enhancement + 1,
            points: healthSkipChance({ ...s, enhancement: s.enhancement + 1 }) - now,
            cost: enhancementCost(ENH, s.enhancement, s.enhancement + 1, enhancementDiscount(labs, 'utility')) ?? 0,
        });
    }
    return out.filter(u => u.points > 0);
}

// A path of the most skip per coin, re-checked after each buy (the
// enhancement grows with every other source, and vice versa).
export function skipUpgradePath(s: SkipSources, steps: number): SkipUpgrade[] {
    const path: SkipUpgrade[] = [];
    let cur = { ...s };
    for (let i = 0; i < steps; i++) {
        const best = nextSkipUpgrades(cur).sort((a, b) => b.points / b.cost - a.points / a.cost)[0];
        if (!best) break;
        path.push(best);
        cur = { ...cur, [best.source]: best.to };
    }
    return path;
}
