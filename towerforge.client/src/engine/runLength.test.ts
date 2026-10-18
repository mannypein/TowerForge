// Run length for Glass Cannon: what ended each run, the enemy health a
// tower stops coping with, and how many waves damage or level skip buy.
// KilledBy names checked against the owner's in-game battle reports
// (Ray, Tank, Vampire, Overcharge, and blank for a run ended by hand).

import { describe, expect, it } from 'vitest';
import {
    buildRunLengthModel, deathWave, killedBy, killerMix, pathRunGains, pathSkipGains, runEnds, skipWorth,
    wavesFromDamage, wavesFromSkip,
} from './runLength';
import { baseEnemyHealth } from './enemyStats';
import { parseGameExport } from './gameExport';
import { battle, makeExport } from '../test/makeExport';

const runs = (...fields: Record<string, unknown>[]) =>
    parseGameExport(makeExport({ BattleHistory: fields.map(f => battle(f)) })).battles;

// A T18 death at `wave` with 58% of health levels skipped.
const death = (wave: number, day: number, killer = 9) => ({
    BattleDate: `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`, Tier: 18, Wave: wave,
    KilledBy: killer, HealthLevelSkips: Math.floor(wave * 0.58), AttackLevelSkips: Math.floor(wave * 0.577),
});

describe('what ended a run', () => {
    it('reads the KilledBy number as an enemy type', () => {
        const [ray, tank, vamp, oc, quit, none] = runs(
            { KilledBy: 9 }, { KilledBy: 2 }, { KilledBy: 6 }, { KilledBy: 12 }, { KilledBy: 99 }, {},
        );
        expect([killedBy(ray), killedBy(tank), killedBy(vamp), killedBy(oc)]).toEqual(['Ray', 'Tank', 'Vampire', 'Overcharge']);
        expect(killedBy(quit)).toBeNull();          // the player ended it
        expect(killedBy(none)).toBeUndefined();     // not recorded
    });

    it('finds the enemy health at death from the run’s own skips', () => {
        const [end] = runEnds(runs(death(8000, 10)));
        expect(end.healthLevel).toBe(8000 - 4640);
        expect(end.enemyHealth).toBe(baseEnemyHealth(3360, 18));
    });
});

describe('death wave', () => {
    it('lands back on the wave a run died at', () => {
        const limit = baseEnemyHealth(8000 - 4640, 18);
        expect(Math.abs(deathWave(limit, 18, 4640 / 8000) - 8000)).toBeLessThanOrEqual(3);
    });

    it('uses the newest deaths on the usual tier and skips runs ended by hand', () => {
        const model = buildRunLengthModel(runs(
            death(7000, 1), death(8100, 10), death(8200, 11), death(8500, 12), { ...death(5125, 13), KilledBy: 99 },
            death(8300, 14), death(8400, 15), { ...death(3000, 16), Tier: 19 },
        ))!;
        expect(model.tier).toBe(18);
        expect(model.used.map(d => d.run.wave)).toEqual([8400, 8300, 8500, 8200, 8100]);   // not the quit, not 7000
        expect(model.typicalWave).toBe(8300);
        expect(model.skipRate).toBeCloseTo(0.58, 3);
    });

    it('turns more damage and more level skip into waves', () => {
        const model = buildRunLengthModel(runs(death(8000, 10)))!;
        const ten = wavesFromDamage(model, 0.1);
        expect(ten).toBeGreaterThan(15);            // ~0.3% enemy health a wave near W8000
        expect(ten).toBeLessThan(50);
        expect(wavesFromDamage(model, 1)).toBeGreaterThan(ten);
        expect(wavesFromDamage(model, 0)).toBe(0);
        expect(wavesFromSkip(model, 1)).toBeGreaterThan(0);
    });

    it('averages over runs, so a wall in one run doesn’t flatten small gains', () => {
        const model = buildRunLengthModel(runs(death(8100, 10), death(8200, 11), death(8402, 12), death(8500, 13), death(8501, 14)))!;
        const gains = [0.01, 0.05, 0.1, 0.25, 0.5, 1].map(g => wavesFromDamage(model, g));
        expect(gains[0]).toBeGreaterThan(0);
        gains.slice(1).forEach((g, i) => expect(g).toBeGreaterThanOrEqual(gains[i]));
    });
});

describe('which enemies end the runs', () => {
    it('shares out the recorded killers, leaving out runs without one', () => {
        const model = buildRunLengthModel(runs(death(8100, 10, 9), death(8200, 11, 2), death(8402, 12, 9), death(8500, 13, 6)))!;
        expect(killerMix(model)).toEqual({ Ray: 0.5, Tank: 0.25, Vampire: 0.25 });
    });
});

describe('what a point of level skip is worth in damage', () => {
    it('matches the waves of the damage it stands for', () => {
        const model = buildRunLengthModel(runs(death(8100, 10), death(8200, 11), death(8402, 12), death(8500, 13), death(8501, 14)))!;
        const worth = skipWorth(model);
        // Near W8300 at 58% skip a point of skip is ~205 waves and +100% damage
        // ~225, so one point is worth about +90% damage. (The first +10% buys
        // more than its share, 53 waves: these runs died just short of a wall.)
        expect(Math.exp(worth) - 1).toBeGreaterThan(0.7);
        expect(Math.exp(worth) - 1).toBeLessThan(1.1);
        const asDamage = wavesFromDamage(model, Math.exp(2 * worth) - 1);
        expect(asDamage / wavesFromSkip(model, 2)).toBeCloseTo(1, 1);
    });
});

describe('waves along an upgrade path', () => {
    it('adds up to the waves of the whole path, and turns waves into coins', () => {
        const model = buildRunLengthModel(runs(death(8100, 10), death(8200, 11), death(8402, 12), death(8500, 13), death(8501, 14)))!;
        const steps = pathRunGains(model, [2, 3, 5], w => w * 1e15);
        const total = steps.reduce((s, x) => s + x.waves, 0);
        const whole = (1.02 * 1.03 * 1.05 - 1) * 100;
        expect(total).toBeCloseTo(pathRunGains(model, [whole])[0].waves, 9);
        steps.forEach(s => expect(s.coins).toBeGreaterThanOrEqual(0));
        expect(pathRunGains(model, [1])[0].coins).toBeNull();
    });

    it('averages over run-to-run luck, so small steps aren’t 0 or a whole wall', () => {
        const model = buildRunLengthModel(runs(death(8100, 10), death(8200, 11), death(8402, 12), death(8500, 13), death(8501, 14)))!;
        const steps = pathRunGains(model, Array(20).fill(1)).map(s => s.waves);
        for (const w of steps) expect(w).toBeGreaterThan(0);
        expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(3);
        // A big gain lands about where it does without the averaging.
        const big = pathRunGains(model, [100])[0].waves;
        expect(big / wavesFromDamage(model, 1)).toBeCloseTo(1, 1);
    });

    it('moves a step’s level skip as skip, not as the damage it was ranked at', () => {
        const model = buildRunLengthModel(runs(death(8100, 10), death(8200, 11), death(8402, 12), death(8500, 13), death(8501, 14)))!;
        const worth = skipWorth(model);
        const asSkip = (Math.exp(worth * 0.1) - 1) * 100;          // 0.1 points, ranked as damage
        const [skip, dmg] = pathRunGains(model, [asSkip, 2], undefined, [0.1, 0], worth);
        expect(Math.abs(skip.waves - wavesFromSkip(model, 0.1))).toBeLessThan(1);
        expect(dmg.waves).toBeGreaterThan(0);
    });
});

describe('waves along a level skip path', () => {
    it('adds the skip points up and turns them into waves', () => {
        const model = buildRunLengthModel(runs(death(8100, 10), death(8200, 11), death(8402, 12)))!;
        const steps = pathSkipGains(model, [0.13, 0.13, 0.4]);
        expect(steps.reduce((s, x) => s + x.waves, 0)).toBeCloseTo(wavesFromSkip(model, 0.66), 9);
        expect(steps[2].waves).toBeGreaterThan(steps[0].waves);   // a bigger step buys more
    });
});
