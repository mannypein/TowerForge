// Lab boosts: the even ladder is the wiki's "Most Efficient Speed Across
// 5 Labs" table (Lab Upgrades), and the owner's boosts (×6 ×6 ×6 ×5 ×5,
// 203,800 cells an hour, export 2026-10-28) are the plan for what their
// runs earn (about 220K an hour).

import { describe, expect, it } from 'vitest';
import { boostLadder, boostSettings, boostsForLabs, cellIncome, hoursOnHand, planLabBoosts } from './labBoosts';
import type { BattleReport } from './battleReport';
import type { Profile } from '../types/gameTypes';

// The wiki table's Cost/Hour column, every row.
const WIKI_COSTS = [
    0, 15, 30, 45, 60, 75, 160, 245, 330, 415, 500, 1240, 1980, 2720, 3460, 4200, 6720, 9240, 11760, 14280,
    16800, 25340, 33880, 42420, 50960, 59500, 107600, 155700, 203800, 251900, 300000, 490000, 680000, 870000,
    1060000, 1250000, 2000000, 2750000, 3500000, 4250000, 5000000,
];

describe('lab boost plan', () => {
    it('raises 5 labs evenly, like the wiki table', () => {
        const ladder = boostLadder(5);
        expect(ladder.map(s => s.cellsPerHour)).toEqual(WIKI_COSTS);
        expect(ladder[12].speeds).toEqual([3, 3, 2, 2, 2]);       // 1,980 an hour
        expect(ladder[ladder.length - 1].speeds).toEqual([8, 8, 8, 8, 8]);
    });

    it('picks the owner’s boosts for what their runs earn', () => {
        const plan = planLabBoosts(219_000, 5);
        expect(plan.best).toEqual({ speeds: [6, 6, 6, 5, 5], cellsPerHour: 203_800 });
        expect(plan.spare).toBe(15_200);
        expect(plan.higher.map(s => s.cellsPerHour)).toEqual([251_900, 300_000, 490_000]);
    });

    it('runs spare cells on the next slot for part of the day', () => {
        const plan = planLabBoosts(1_000, 5);
        expect(plan.best.speeds).toEqual([2, 2, 2, 2, 2]);
        // 500 spare of the 740 an hour a slot at ×3 adds.
        expect(plan.part?.speed).toBe(3);
        expect(plan.part!.hoursPerDay).toBeCloseTo(24 * 500 / 740, 9);
    });

    it('works for fewer slots and no cells', () => {
        expect(planLabBoosts(150, 2).best.speeds).toEqual([2, 1.5]);
        expect(planLabBoosts(0, 3)).toMatchObject({ best: { speeds: [1, 1, 1], cellsPerHour: 0 }, part: null });
        expect(planLabBoosts(1e12, 5).higher).toEqual([]);
    });

    it('says how long the cells held last at a dearer step', () => {
        expect(hoursOnHand(251_900, 219_000, 32_900_000)).toBeCloseTo(1000, 9);
        expect(hoursOnHand(203_800, 219_000, 0)).toBe(Infinity);
    });

    it('puts the fastest boosts on the labs with the most time left', () => {
        expect(boostsForLabs([3600, 90_000, 7200, 50_000, 1000], [6, 6, 6, 5, 5])).toEqual([5, 6, 6, 6, 5]);
        expect(boostsForLabs([100, 200, 300], [3, 2])).toEqual([1, 2, 3]);
    });
});

// A made-up run that ended at `end` (hours) after `hours` in it.
const run = (end: number, hours: number, cells: number | undefined): BattleReport => ({
    time: end * 3600_000, realTimeSec: hours * 3600, raw: cells === undefined ? {} : { CellsEarned: cells },
} as BattleReport);

describe('cells an hour from runs', () => {
    it('counts cells over time in runs, and the gaps between them', () => {
        // 10 h in a run, 2 h off, 6 h in a run: 16 h of 18.
        const income = cellIncome([run(18, 6, 60_000), run(10, 10, 100_000)])!;
        expect(income.runs).toBe(2);
        expect(income.perRunHour).toBeCloseTo(10_000, 9);
        expect(income.share).toBeCloseTo(16 / 18, 9);
        expect(income.perHour).toBeCloseTo(160_000 / 18, 9);
    });

    it('reads the last 7 days of runs, and only runs that record cells', () => {
        const income = cellIncome([run(10, 10, 1_000), run(200, 10, 50_000), run(210, 10, 50_000), run(215, 5, undefined)])!;
        expect(income.runs).toBe(2);
        expect(income.perRunHour).toBeCloseTo(5_000, 9);
        expect(income.share).toBe(1);
        expect(cellIncome([run(5, 5, undefined)])).toBeNull();
    });

    it('uses what the player typed over their runs', () => {
        const income = { runs: 3, perRunHour: 10_000, share: 0.75, perHour: 7_500 };
        const p = (extra: Partial<Profile>) => ({ ...extra }) as Profile;
        expect(boostSettings(p({}), income, 4)).toEqual({ perRunHour: 10_000, hoursPerDay: 18, slots: 4, budget: 7_500 });
        expect(boostSettings(p({ cellsPerHour: 20_000, runHoursPerDay: 12, labSlots: 5 }), income, 4))
            .toEqual({ perRunHour: 20_000, hoursPerDay: 12, slots: 5, budget: 10_000 });
        expect(boostSettings(p({}), null, 0)).toEqual({ perRunHour: 0, hoursPerDay: 24, slots: 5, budget: 0 });
    });
});
