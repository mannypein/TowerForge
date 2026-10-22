// Orbs and Death Ray against the enemies that end runs (edps.reachLog):
// touches per enemy from the run's kill share, more of them with more time
// in range, and fewer touchable killers getting past counted as damage.

import { describe, expect, it } from 'vitest';
import { reachLog, reachShares, touchesOf } from './edps';
import type { EdpsCalibration, EdpsParts } from './edps';
import type { OptimizerSnapshot } from './optimizer';
import { runMix } from './battleConditions';
import { parseGameExport } from './gameExport';
import { battle, makeExport } from '../test/makeExport';

// A run where orbs destroyed 70% of the enemies, 1% bosses and elites.
const calib = (orbKills = 0.7, deathRayKills = 0, touchable = 0.99) => ({
    anchor: { ttt: 10 } as EdpsParts,
    mix: { orbKills, deathRayKills, touchable, basic: 0.2, tank: 0.25, avgHealth: 2 },
    fastUltimate: 0, orbTouch: 1, deathRayTouch: 1,
}) as unknown as EdpsCalibration;
const snap = (killers: OptimizerSnapshot['killers'], conditions?: OptimizerSnapshot['conditions']) =>
    ({ killers, conditions }) as OptimizerSnapshot;
const time = (ttt: number) => ({ ttt }) as EdpsParts;

describe('orbs and Death Ray against the enemies that end runs', () => {
    it('reads touches per enemy from the share the run’s orbs destroyed', () => {
        expect(touchesOf(0.7, 0.99)).toBeCloseTo(-Math.log(1 - 0.7 / 0.99), 10);
        expect(touchesOf(0, 0.99)).toBe(0);
        expect(touchesOf(0.99, 0.99)).toBeCloseTo(-Math.log(0.05), 10);   // capped at 95% stopped
    });

    it('counts the bosses, elites and fleets of a run as untouchable', () => {
        const r = parseGameExport(makeExport({ BattleHistory: [battle({
            TotalEnemies: 1000, DestroyedByOrbs: 600, TotalBasic: 500, TotalTank: 480, TotalBoss: 5, TotalRays: 10, TotalOvercharges: 5,
        })] })).battles[0];
        expect(runMix(r).touchable).toBeCloseTo(0.98, 10);
        expect(runMix(null).touchable).toBe(1);
    });

    it('does nothing for runs that end to enemies orbs can’t touch', () => {
        expect(reachLog(snap({ Ray: 0.6, Overcharge: 0.4 }), calib(), time(20))).toBe(0);
    });

    it('stops more touchable killers the longer enemies are in range', () => {
        const c = calib();
        const lam0 = touchesOf(0.7, 0.99);
        // Twice the time: twice the touches; tanks end half the runs, so
        // 1 ÷ (½ + ½ × the share that still gets past against the run's).
        expect(reachLog(snap({ Tank: 0.5, Ray: 0.5 }), c, time(20))).toBeCloseTo(-Math.log(0.5 + 0.5 * Math.exp(-lam0)), 10);
        expect(reachLog(snap({ Tank: 0.5, Ray: 0.5 }), c, time(10))).toBeCloseTo(0, 10);
        expect(reachLog(snap({ Tank: 0.5, Ray: 0.5 }), c, time(8))).toBeLessThan(0);    // less time, more get past
        const shares = reachShares(snap({ Tank: 0.5, Ray: 0.5 }), c, time(20));
        expect(shares.run).toBeCloseTo(0.7 / 0.99, 10);
        expect(shares.now).toBeCloseTo(1 - Math.exp(-2 * lam0), 10);
    });

    it('never counts more than runs no longer ending to those enemies', () => {
        // Half the deaths to tanks: at most ×2, however few get past.
        expect(reachLog(snap({ Tank: 0.5, Ray: 0.5 }), calib(), time(1e6))).toBeCloseTo(Math.log(2), 6);
    });

    it('Tank’s Ultimate makes tanks immune; resistance weakens each touch', () => {
        expect(reachLog(snap({ Tank: 1 }, { tankUltimate: true }), calib(), time(20))).toBe(0);
        const full = reachLog(snap({ Ranged: 1 }), calib(), time(20));
        const resisted = reachLog(snap({ Ranged: 1 }, { orbLeftPct: 50 }), calib(), time(20));
        // Orbs take half of an enemy's health per touch: twice the time in
        // range and half of each touch comes out the same as the run.
        expect(resisted).toBeLessThan(full);
        expect(resisted).toBeCloseTo(0, 10);
    });

    it('adds Death Ray’s touches to the orbs’', () => {
        const orbsOnly = reachLog(snap({ Ranged: 1 }), calib(0.5, 0), time(15));
        const both = reachLog(snap({ Ranged: 1 }), calib(0.5, 0.2), time(15));
        expect(both).toBeGreaterThan(orbsOnly);
    });
});
