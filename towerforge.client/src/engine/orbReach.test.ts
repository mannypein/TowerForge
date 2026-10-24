// Orbs and Death Ray against the enemies that end runs (edps.reachLog):
// touches per enemy from the run's kill share, more of them with more time
// in range and more, faster or bigger orbs, and fewer touchable killers
// getting past counted as damage — or, for eHP, as fewer hits on the tower.

import { describe, expect, it } from 'vitest';
import { reachLog, reachShares, touchesOf } from './edps';
import type { EdpsCalibration, EdpsParts } from './edps';
import type { OptimizerSnapshot } from './optimizer';
import { runMix } from './battleConditions';
import { parseGameExport } from './gameExport';
import { battle, makeExport } from '../test/makeExport';
import { orbStats } from './orbs';
import { orbReachRatio } from './ehp';
import type { EhpCalibration, EhpInputs } from './ehp';
import { WS_STATS } from '../constants/gameData';

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

// Orb count, speed and size (engine/orbs.ts): the wiki's Orbs page.
describe('how often orbs pass an enemy', () => {
    const def = (speedLv: number, orbsLv: number) => {
        const d: number[] = [];
        d[WS_STATS.defense.findIndex(([n]) => n === 'Orb Speed')] = speedLv;
        d[WS_STATS.defense.findIndex(([n]) => n === 'Orbs')] = orbsLv;
        return d;
    };
    const orbSnap = (speedLv: number, orbsLv: number, extra: Partial<OptimizerSnapshot> = {}) => ({
        presetIdx: 0, wsData: [{ attack: [], defense: def(speedLv, orbsLv), utility: [] }],
        labData: {}, cardData: { data: {}, slots: 1, presets: { 0: [] } }, relicData: {},
        enhData: { d: {}, u: {} }, modBonuses: { subs: {} }, ...extra,
    }) as unknown as OptimizerSnapshot;

    it('reads orb speed and count from the workshop, lab and relics', () => {
        expect(orbStats(orbSnap(1, 1)).speed).toBeCloseTo(0.55, 10);        // wiki: 0.55 at level 1
        expect(orbStats(orbSnap(38, 4)).speed).toBeCloseTo(6.1, 10);        // 6.10 at 38
        expect(orbStats(orbSnap(38, 4, { labData: { 'Orb Speed Lab': 20 } })).speed).toBeCloseTo(8.1, 10);   // lab +2.0
        expect(orbStats(orbSnap(38, 4, { relicData: { rOrb: 28 } })).speed).toBeCloseTo(6.1 * 1.28, 10);
        expect(orbStats(orbSnap(38, 4)).orbs).toBe(6);                       // 4 workshop + 2 perk
        expect(orbStats(orbSnap(38, 0)).rate).toBe(0);                       // no orbs bought
    });

    it('counts Orb Size and the Extra Orb card', () => {
        const sized = orbSnap(10, 2, { enhData: { d: { defense: [0, 0, 0, 0, 0, 100] }, u: { defense: [true, false, false, false, false, true] } } as never });
        expect(orbStats(sized).size).toBe(2);
        expect(orbStats(sized).rate).toBeCloseTo(2 * 4 * 1.9, 10);
        const card = orbSnap(10, 2, { cardData: { data: { 'Extra Orb': { s: 7 } }, slots: 1, presets: { 0: ['Extra Orb'] } } as never });
        expect(orbStats(card).extraOrbs).toBe(1);
        expect(orbStats(card).extraSpeed).toBeCloseTo(1.9 + 0.9, 10);
    });

    it('more orbs touch run-ending enemies like more time among them', () => {
        const c = { ...calib(), anchor: { ttt: 10, orbRate: 10 } as EdpsParts };
        const twiceOrbs = reachLog(snap({ Tank: 0.5, Ray: 0.5 }), c, { ttt: 10, orbRate: 20 } as EdpsParts);
        const twiceTime = reachLog(snap({ Tank: 0.5, Ray: 0.5 }), c, { ttt: 20, orbRate: 10 } as EdpsParts);
        expect(twiceOrbs).toBeCloseTo(twiceTime, 10);
        expect(twiceOrbs).toBeGreaterThan(0);
    });

    it('lets fewer enemies reach an eHP tower', () => {
        const ehpCal = { orbKills: 0.6, touchable: 0.98, anchor: { orbRate: 10 } } as unknown as EhpCalibration;
        const lam0 = touchesOf(0.6, 0.98);
        const reach = (l: number) => 0.02 + 0.98 * Math.exp(-l);
        expect(orbReachRatio({ orbRate: 20 } as EhpInputs, ehpCal)).toBeCloseTo(reach(2 * lam0) / reach(lam0), 10);
        expect(orbReachRatio({ orbRate: 10 } as EhpInputs, ehpCal)).toBeCloseTo(1, 10);
        expect(orbReachRatio({ orbRate: 20 } as EhpInputs, { ...ehpCal, orbKills: 0 })).toBe(1);   // no orb kills in the run
    });
});
