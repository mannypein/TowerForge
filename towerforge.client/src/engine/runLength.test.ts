// Run length for Glass Cannon: what ended each run, the enemy health a
// tower stops coping with, and how many waves damage or level skip buy.
// KilledBy names checked against the owner's in-game battle reports
// (Ray, Tank, Vampire, Overcharge, and blank for a run ended by hand).

import { describe, expect, it } from 'vitest';
import { buildRunLengthModel, deathWave, killedBy, pathRunGains, runEnds, wavesFromDamage, wavesFromSkip } from './runLength';
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

describe('waves along an upgrade path', () => {
    it('adds up to the waves of the whole path, and turns waves into coins', () => {
        const model = buildRunLengthModel(runs(death(8100, 10), death(8200, 11), death(8402, 12), death(8500, 13), death(8501, 14)))!;
        const steps = pathRunGains(model, [2, 3, 5], w => w * 1e15);
        const total = steps.reduce((s, x) => s + x.waves, 0);
        expect(total).toBeCloseTo(wavesFromDamage(model, 1.02 * 1.03 * 1.05 - 1), 9);
        steps.forEach(s => expect(s.coins).toBeGreaterThanOrEqual(0));
        expect(pathRunGains(model, [1])[0].coins).toBeNull();
    });
});
