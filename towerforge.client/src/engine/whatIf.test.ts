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
    const models = { run, worth: skipWorth(run), coinsAt: (w: number) => w * 1e12 };

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
