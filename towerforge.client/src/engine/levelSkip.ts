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
//  Costs: the wiki's tables (Enemy Level Skip, Lab/Enemy Health Level
//  Skip, Workshop Enhancement/Utility/Enemy Level Skips). The workshop
//  table gives every 10th level; levels between are interpolated on the
//  running total.
//  Pure functions — no store imports.
// ============================================================

import type { EnhData, LabData, WSPreset } from '../types/gameTypes';
import { WS_ENH, WS_STATS } from '../constants/gameData';

// Workshop Enemy Health Level Skip: total coins spent by level (every 10th).
const WORKSHOP_TOTAL: [number, number][] = [
    [0, 0], [1, 300e6], [10, 3.72e9], [20, 9.04e9], [30, 15.96e9], [40, 24.49e9], [50, 44.76e9],
    [60, 68.95e9], [70, 96.49e9], [80, 128.17e9], [90, 200.13e9], [100, 279.24e9], [110, 372.46e9],
    [120, 473.55e9], [130, 704.95e9], [140, 967.24e9], [150, 1.25e12], [160, 1.59e12], [170, 2.33e12],
    [180, 3.2e12], [190, 4.2e12], [200, 5.26e12], [210, 7.48e12], [220, 9.83e12], [230, 12.29e12],
    [240, 14.88e12], [250, 20.3e12], [260, 25.98e12], [270, 31.92e12], [280, 38.12e12], [290, 57.58e12],
    [300, 77.88e12], [310, 99.06e12], [320, 121.14e12], [330, 190.17e12], [340, 262.06e12],
    [350, 336.9e12], [360, 414.78e12], [370, 657.79e12], [380, 910.48e12], [390, 1.17e15], [400, 1.45e15],
    [410, 2.3e15], [420, 3.18e15], [430, 4.1e15], [440, 5.05e15], [450, 8.01e15], [460, 11.09e15],
    [470, 14.28e15], [480, 17.59e15], [490, 31.31e15], [500, 45.54e15], [510, 60.28e15], [520, 75.56e15],
    [530, 138.88e15], [540, 204.48e15], [550, 272.41e15], [560, 342.77e15], [570, 634.11e15],
    [580, 935.7e15], [590, 1.25e18], [600, 1.57e18], [610, 2.91e18], [620, 4.29e18], [630, 5.72e18],
    [640, 7.2e18], [650, 14.84e18], [660, 22.75e18], [670, 30.92e18], [680, 39.36e18], [690, 82.96e18],
    [699, 123.43e18],
];
// Lab Enemy Health Level Skip: coins and time for each level.
const LAB_COST = [0.9e9, 1.01e9, 1.16e9, 1.43e9, 1.94e9, 2.8e9, 4.15e9, 6.14e9, 8.94e9, 12.73e9, 17.71e9,
    24.07e9, 32.03e9, 41.81e9, 53.64e9, 67.76e9, 84.42e9, 103.88e9, 126.42e9, 152.29e9];
const LAB_TIME = ['16h 39m', '1d 1h', '1d 9h', '1d 18h', '2d 3h', '2d 13h', '3d 0h', '3d 12h', '4d 2h',
    '4d 17h', '5d 10h', '6d 6h', '7d 3h', '8d 4h', '9d 7h', '10d 14h', '12d 0h', '13d 14h', '15d 8h', '17d 7h'];
// Enhancement Enemy Level Skips: coins for each level.
const ENH_COST = [5e9, 15.5e9, 202.98e9, 1.13e12, 3.89e12, 10.14e12, 22.19e12, 43.05e12, 76.44e12,
    126.85e12, 199.54e12, 300.61e12, 437.01e12, 616.54e12, 847.92e12, 1.14e15, 1.51e15, 3.91e15, 7.5e15,
    12.61e15, 19.65e15, 29.09e15, 41.45e15, 57.35e15, 77.47e15, 102.6e15, 133.59e15, 171.41e15, 217.13e15,
    271.92e15, 337.06e15, 496.77e15, 705.87e15, 975e15, 1.32e18, 1.74e18, 2.27e18, 2.92e18, 3.71e18,
    4.67e18, 5.81e18, 7.16e18, 8.77e18, 10.65e18, 12.85e18, 15.42e18, 18.39e18, 21.81e18, 25.74e18,
    30.24e18, 35.37e18, 47.38e18, 62.14e18, 80.12e18, 101.84e18, 127.88e18, 158.91e18, 195.63e18,
    238.88e18, 289.53e18];

const WORKSHOP_MAX = 699;
const WORKSHOP_STEP = 10;     // offered in steps of 10 levels — one level is 0.05%

// Total workshop coins at a level: geometric between the table's rows.
function workshopTotal(level: number): number {
    const l = Math.min(WORKSHOP_MAX, Math.max(0, level));
    let i = 1;
    while (i < WORKSHOP_TOTAL.length - 1 && WORKSHOP_TOTAL[i][0] < l) i++;
    const [la, ca] = WORKSHOP_TOTAL[i - 1];
    const [lb, cb] = WORKSHOP_TOTAL[i];
    const t = lb > la ? (l - la) / (lb - la) : 1;
    return ca > 0 ? ca * (cb / ca) ** t : cb * t;
}

export interface SkipSources {
    workshop: number;         // workshop level (0–699)
    lab: number;              // lab level (0–20)
    enhancement: number;      // enhancement level (0–60); 0 also when not unlocked
    enhancementOwned: boolean;
    otherPct: number;         // relic + module substats, in %
}

const WS_IDX = WS_STATS.utility.findIndex(([n]) => n === 'Enemy HP Level Skip');
const ENH_IDX = WS_ENH.utility.findIndex(([n]) => n === 'Enemy Level Skips');

export function healthSkipSources(
    ws: WSPreset | undefined, labs: LabData, enh: EnhData, relics: Record<string, number>,
    subs: Record<string, number>,
): SkipSources {
    return {
        workshop: ws?.utility[WS_IDX] ?? 0,
        lab: labs['Enemy HP Lvl Skip Lab'] ?? 0,
        enhancement: enh.d.utility?.[ENH_IDX] ?? 0,
        enhancementOwned: enh.u.utility?.[ENH_IDX] ?? false,
        otherPct: (relics['rEHPSkip'] ?? 0) + (subs['Enemy HP Level Skip'] ?? 0),
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
    const out: SkipUpgrade[] = [];
    if (s.workshop < WORKSHOP_MAX) {
        const to = Math.min(WORKSHOP_MAX, s.workshop + WORKSHOP_STEP);
        out.push({
            source: 'workshop', from: s.workshop, to,
            points: healthSkipChance({ ...s, workshop: to }) - now,
            cost: workshopTotal(to) - workshopTotal(s.workshop),
        });
    }
    if (s.lab < LAB_COST.length) {
        out.push({
            source: 'lab', from: s.lab, to: s.lab + 1,
            points: healthSkipChance({ ...s, lab: s.lab + 1 }) - now,
            cost: LAB_COST[s.lab], time: LAB_TIME[s.lab],
        });
    }
    if (s.enhancementOwned && s.enhancement < ENH_COST.length) {
        out.push({
            source: 'enhancement', from: s.enhancement, to: s.enhancement + 1,
            points: healthSkipChance({ ...s, enhancement: s.enhancement + 1 }) - now,
            cost: ENH_COST[s.enhancement],
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
