// What If: changing levels on a copy of a made-up account, what each change
// costs, and what it does to damage, waves and coins.

import { describe, expect, it } from 'vitest';
import { useGameStore } from '../store/useGameStore';
import { readActiveModuleBonuses } from './modBonuses';
import { runRatesFrom } from './runRates';
import { parseGameExport } from './gameExport';
import { applyChange, changeCost, upgradeTargets, whatIf } from './whatIf';
import type { OptimizerSnapshot } from './optimizer';
import { buildRunLengthModel, skipWorth } from './runLength';
import { buildEdpsCalibration, edpsParts, edpsSurvivalScore } from './edps';
import { calcTTT } from './ttt';
import { UWS, UW_STONE_COSTS } from '../constants/gameData';
import { battle, makeExport } from '../test/makeExport';

// Five T18 deaths with damage by source (made up).
const runs = parseGameExport(makeExport({
    BattleHistory: [8100, 8200, 8402, 8500, 8501].map((wave, i) => battle({
        BattleDate: `2026-10-1${i}T12:00:00Z`, Wave: wave, KilledBy: 9,
        HealthLevelSkips: Math.floor(wave * 0.58), AttackLevelSkips: Math.floor(wave * 0.577),
        DamageDealt: 1000, ChainLightningDamage: 300, OrbDamage: 400, BlackHoleDamage: 200, ProjectilesDamage: 100,
        ProjectilesCount: 10000, EnemiesHitByChainLightningThisRound: 500, DestroyedInBlackhole: 900,
    })),
})).battles;

function account(edit?: (s: OptimizerSnapshot) => void): OptimizerSnapshot {
    const st = useGameStore.getState();
    const snap: OptimizerSnapshot = {
        presetIdx: 0,
        wsData: JSON.parse(JSON.stringify(st.wsData)),
        enhData: JSON.parse(JSON.stringify(st.enhData)),
        labData: { 'Damage Lab': 40 },
        cardData: { data: {}, slots: 1, presets: { 0: [] } },
        perkData: { banned: [] },
        uwData: { stones: 0, data: Object.fromEntries(UWS.map(u => [u.a, { own: true, sv: [10, 3, 10], upOwn: false, upLvl: 0 }])) },
        relicData: {},
        modBonuses: readActiveModuleBonuses(st.moduleState, { banned: [] }, {}, { data: {}, slots: 1, presets: {} }, runRatesFrom(runs[0])),
        moduleState: JSON.parse(JSON.stringify(st.moduleState)),
        botData: { 'Golden Bot': { owned: true, medals: [0, 0, 0, 0], plusLv: 0 } },
    };
    edit?.(snap);
    return snap;
}

const target = (snap: OptimizerSnapshot, label: string) => upgradeTargets(snap).find(t => t.label === label)!;

describe('what can change', () => {
    it('lists every upgrade with its level now and its max', () => {
        const snap = account();
        expect(target(snap, 'Chain Lightning — Damage')).toMatchObject({ kind: 'uw', current: 10, max: 32 });
        expect(target(snap, 'Damage Lab')).toMatchObject({ kind: 'lab', current: 40, max: 100 });
        expect(target(snap, 'Golden Bot — Bonus')).toMatchObject({ kind: 'bot', current: 0 });
        expect(target(snap, 'Cannon — Main slot')).toMatchObject({ kind: 'module', max: 300 });
    });

    it('sets a level on the copy', () => {
        const snap = account();
        applyChange(snap, { kind: 'uw', key: 'CL|0', level: 12 });
        applyChange(snap, { kind: 'uwp', key: 'CL', level: 2 });
        expect(snap.uwData.data.CL!.sv[0]).toBe(12);
        expect(snap.uwData.data.CL).toMatchObject({ upOwn: true, upLvl: 1 });
    });
});

describe('what a change costs', () => {
    const snap = account();

    it('prices UW levels in stones (level L costs costs[L − 2])', () => {
        const costs = UW_STONE_COSTS.CL[0];
        expect(changeCost(snap, target(snap, 'Chain Lightning — Damage'), 12)).toEqual({ stones: costs[9] + costs[10] });
    });

    it('prices labs in coins and research time, bots in medals', () => {
        const lab = changeCost(snap, target(snap, 'Damage Lab'), 41);
        expect(lab.coins).toBe(357390);                  // level 41 (wiki: 5d 19h 24m)
        expect(lab.research).toBeCloseTo(139.4, 6);
        expect(changeCost(snap, target(snap, 'Golden Bot — Bonus'), 2)).toEqual({ medals: 100 + 140 });
        expect(changeCost(snap, target(snap, 'Damage Lab'), 30)).toEqual({});   // lowering costs nothing
    });
});

describe('what happens', () => {
    const run = buildRunLengthModel(runs)!;
    // Made-up projection: later waves pay more per hour.
    const projectAt = (wave: number) => ({ wave, tier: 18, kills: 0, coins: wave * wave * 1e9, hours: wave / 1000,
        coinsPerHour: wave * 1e12 });
    const models = { run, worth: skipWorth(run), coinsAt: (w: number) => projectAt(w).coins, projectAt };

    it('turns more Chain Lightning damage into damage, push and waves', () => {
        const snap = account();
        const r = whatIf(snap, [{ kind: 'uw', key: 'CL|0', level: 12 }], upgradeTargets(snap), 'Glass Cannon', runs[4], models);
        expect(r.damagePct).toBeGreaterThan(0);
        expect(r.pushPct).toBeGreaterThan(r.damagePct);   // CL is a bigger share of the flat damage
        expect(r.waves!.to).toBeGreaterThan(r.waves!.from);
        expect(r.coinsRun!.to).toBeGreaterThan(r.coinsRun!.from);
        expect(r.survivalPct).toBeNull();                 // Glass Cannon: one hit ends a run
        expect(r.costs.stones).toBeGreaterThan(0);
    });

    it('follows the longer run into coins per run and per hour', () => {
        const snap = account();
        const r = whatIf(snap, [{ kind: 'uw', key: 'CL|0', level: 12 }], upgradeTargets(snap), 'Glass Cannon', runs[4], models);
        const { from, to } = r.waves!;
        expect(r.coinsRun).toEqual({ from: from * from * 1e9, to: to * to * 1e9 * (1 + r.coinsHourPct / 100) });
        expect(r.coinsHour!.to / r.coinsHour!.from).toBeCloseTo((to / from) * (1 + r.coinsHourPct / 100), 9);
    });

    it('shows how slowing enemies works through every source', () => {
        // Slow Aura deals nothing itself: enemies stay in range longer, so
        // Chain Lightning and tower shots land more on each one.
        const snap = account(s => { s.cardData = { data: { 'Slow Aura': { s: 7, m: 0 } }, slots: 2, presets: { 0: [] } }; });
        const after = account(s => { s.cardData = { data: { 'Slow Aura': { s: 7, m: 0 } }, slots: 2, presets: { 0: ['Slow Aura'] } }; });
        const t = (x: OptimizerSnapshot) => calcTTT(0, x.wsData, x.labData, x.cardData, x.uwData, x.modBonuses).ttt;
        const time = t(after) / t(snap);
        expect(time).toBeCloseTo(1 / (1 - 0.31), 6);                       // Slow Aura 7★: 31% slower
        const calib = buildEdpsCalibration(snap, runs[4])!;
        expect(edpsSurvivalScore(after, calib)).toBeGreaterThan(1.2);
        const [p0, p1] = [edpsParts(snap), edpsParts(after)];
        expect(p1.cl / p0.cl).toBeCloseTo(1, 9);                           // CL's own rate doesn't change…
        expect(p1.ttt / p0.ttt).toBeCloseTo(time, 9);                      // …it gets more time on each enemy
    });

    it('lists the links that moved', () => {
        const snap = account(s => { s.uwData.data.CF = { own: true, sv: [10, 10, 10], upOwn: true, upLvl: 2 }; });
        const r = whatIf(snap, [{ kind: 'uwp', key: 'CF', level: 6 }], upgradeTargets(snap), 'Glass Cannon', runs[4], models);
        const labels = r.chain.map(l => l.label);
        expect(labels).toContain('Chrono Loop (CF+) extra path');
        expect(labels).toContain('Time each enemy is in range');
        expect(labels).toContain('Chain Lightning');
        expect(labels).not.toContain('Tower range');                        // didn't move
        const cl = r.chain.find(l => l.label === 'Chain Lightning')!;
        const time = r.chain.find(l => l.label === 'Time each enemy is in range')!;
        expect(cl.after).toBeCloseTo(time.after / time.before, 9);
        expect(cl.share).toBeCloseTo(0.3, 9);
        expect(r.pushPct).toBeGreaterThan(0);
    });

    it('counts the health lab of the enemy that ends the runs as push', () => {
        const snap = account();
        const r = whatIf(snap, [{ kind: 'lab', key: 'Ray Health', level: 10 }], upgradeTargets(snap),
            'Glass Cannon', runs[4], models);
        expect(r.damagePct).toBeCloseTo(0, 9);
        expect(r.pushPct).toBeCloseTo((1 / 0.96 - 1) * 100, 6);          // every death here is a Ray
        expect(r.waves!.to).toBeGreaterThan(r.waves!.from);
    });

    it('moves the death wave by level skip without any damage', () => {
        const snap = account();
        const r = whatIf(snap, [{ kind: 'lab', key: 'Enemy HP Lvl Skip Lab', level: 5 }], upgradeTargets(snap),
            'Glass Cannon', runs[4], models);
        expect(r.damagePct).toBeCloseTo(0, 9);
        expect(r.skipPoints).toBeCloseTo(0.5, 9);
        expect(r.waves!.to - r.waves!.from).toBeGreaterThan(50);    // ~200 waves a point near W8300
    });
});
