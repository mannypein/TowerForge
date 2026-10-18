// Coins per run: the spawn chart, the tuning run reproduced exactly, and
// the coins-per-kill rule picked from runs that follow one rule or the other.

import { describe, expect, it } from 'vitest';
import { buildRunModel, calibrateRun, projectRun, spawnRate } from './runCoins';
import type { RunModelSettings } from './runCoins';
import { parseGameExport } from './gameExport';
import { battle, makeExport } from '../test/makeExport';

const NO_SPRINT: RunModelSettings = { introSprintWaves: 0, waMastery: null };

// A made-up run whose kills and coins follow the model with known rates.
function run(wave: number, growth: 'flat' | 'wave', tier = 18, extra: Record<string, number> = {}) {
    let rates = 0;
    let weighted = 0;
    for (let w = 1; w <= wave; w++) {
        rates += spawnRate(w, null);
        weighted += spawnRate(w, null) * w;
    }
    const tierMult = tier === 18 ? 1 : 40 / 33;   // T19 vs T18 coin multiplier
    const killCoins = (growth === 'wave' ? 1e9 * weighted : 3e12 * rates) * tierMult;
    const cpw = 2e10 * wave * tierMult;
    return parseGameExport(makeExport({
        BattleHistory: [battle({
            Tier: tier, Wave: wave, RealTime: wave * 28,
            TotalEnemies: Math.round(4 * rates),
            CoinsEarned: killCoins + cpw, CoinsEarnedCPW: cpw,
            CoinsEarnedWaveSkip: 0, CoinsFromGoldenTowerPlus: 0, CoinsFromCritCoin: 0, GuardianCoinsFetched: 0,
            ...extra,
        })],
    })).battles[0];
}

describe('spawn rate (Wave Accelerator chart)', () => {
    it('steps up with the wave, sooner with mastery', () => {
        expect(spawnRate(999, null)).toBe(35);      // climbing toward the first row
        expect(spawnRate(1000, null)).toBe(37);
        expect(spawnRate(6499, null)).toBe(54);
        expect(spawnRate(6500, null)).toBe(56);
        expect(spawnRate(3250, 9)).toBe(56);        // mastery 9: +100%
        expect(spawnRate(6000, 0)).toBe(56);        // the T18 W6000 screenshot shows spawn rate 56
    });
});

describe('tuning on a run', () => {
    it('reproduces that run exactly', () => {
        const r = run(6000, 'flat', 18, {
            CoinsEarnedWaveSkip: 5e15, CoinsFromGoldenTowerPlus: 2e16, CoinsFromCritCoin: 1e14, GuardianCoinsFetched: 3e14,
        });
        const r2 = { ...r, coinsEarned: r.coinsEarned + 5e15 + 2e16 + 1e14 + 3e14 };
        for (const growth of ['flat', 'wave'] as const) {
            const c = calibrateRun(r2, NO_SPRINT, growth)!;
            const p = projectRun(c, NO_SPRINT, 6000, 18);
            expect(p.coins / r2.coinsEarned).toBeCloseTo(1, 9);
            expect(p.kills / r2.totalEnemies).toBeCloseTo(1, 4);
            expect(p.hours).toBeCloseTo(6000 * 28 / 3600, 9);
        }
    });

    it('pays nothing during Intro Sprint', () => {
        const r = run(6000, 'flat');
        const sprint = { introSprintWaves: 1800, waMastery: null };
        const c = calibrateRun(r, sprint, 'flat')!;
        expect(projectRun(c, sprint, 1800, 18).coins).toBe(0);
    });

    it('scales coins by the tier multiplier', () => {
        const c = calibrateRun(run(6000, 'flat'), NO_SPRINT, 'flat')!;
        const t19 = projectRun(c, NO_SPRINT, 6000, 19).coins / projectRun(c, NO_SPRINT, 6000, 18).coins;
        expect(t19).toBeCloseTo(40 / 33, 9);
    });
});

describe('picking the coins-per-kill rule', () => {
    it.each(['flat', 'wave'] as const)('finds the %s rule from runs that follow it', growth => {
        const runs = [run(6000, growth), run(3000, growth), run(8000, growth), run(5000, growth, 19)];
        const model = buildRunModel(runs, 0, NO_SPRINT)!;
        expect(model.calibration.growth).toBe(growth);
        for (const check of model.checks) {
            expect(Math.abs(check.coinError)).toBeLessThan(1e-6);
            expect(Math.abs(check.killError)).toBeLessThan(1e-3);
        }
        expect(model.fit[growth === 'flat' ? 'wave' : 'flat']!).toBeGreaterThan(0.05);
    });

    it('uses the flat rule when there is no other run to compare with', () => {
        const model = buildRunModel([run(6000, 'wave')], 0, NO_SPRINT)!;
        expect(model.calibration.growth).toBe('flat');
        expect(model.fit).toEqual({ flat: null, wave: null });
    });
});
