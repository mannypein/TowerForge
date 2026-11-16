// ============================================================
//  TowerForge Companion — Coin income tests
//  Coins a day from made-up runs, and the cap on one Optimizer step.
// ============================================================

import { describe, expect, it } from 'vitest';
import { COIN_CAP_DAYS, coinsADay, stepCoinCap } from './coinIncome';
import type { BattleReport } from './battleReport';

// A made-up run that ended at `end` (hours) after `hours` in it.
const run = (end: number, hours: number, coins: number): BattleReport => ({
    time: end * 3600_000, realTimeSec: hours * 3600, coinsEarned: coins,
} as BattleReport);

describe('coins a day', () => {
    it('counts every coin over the time from the first run to the newest, gaps too', () => {
        // 12 h, a 12 h gap, 24 h: 48 h from the first start to the last end.
        expect(coinsADay([run(12, 12, 1e15), run(48, 24, 3e15)])).toBeCloseTo(2e15, -3);
    });

    it('reads the last 7 days up to the newest run', () => {
        expect(coinsADay([run(10, 10, 9e20), run(500, 24, 1e15)])).toBeCloseTo(1e15, -3);
        expect(coinsADay([])).toBeNull();
    });

    it('caps a step at a month of coins', () => {
        expect(stepCoinCap([run(24, 24, 1e15)])).toBeCloseTo(1e15 * COIN_CAP_DAYS, -3);
        expect(stepCoinCap([])).toBeUndefined();
    });
});
