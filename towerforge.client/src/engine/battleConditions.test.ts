// Battle conditions in the model, on made-up accounts: what each counted
// condition changes, and that a tournament run loses waves under them.
// The skip order (× multiply, then − decay, floored at 0) is TheTowerSDK's.

import { describe, expect, it } from 'vitest';
import { useGameStore } from '../store/useGameStore';
import { readActiveModuleBonuses } from './modBonuses';
import { runRatesFrom } from './runRates';
import { parseGameExport } from './gameExport';
import { buildEdpsCalibration } from './edps';
import { conditionedSkip, conditionHealth, skipDecayAverage, withConditions } from './battleConditions';
import { goalScore } from './optimizer';
import type { OptimizerSnapshot } from './optimizer';
import { calcTTT } from './ttt';
import { buildRunLengthModel, runWavesChange, wavesFromDamage } from './runLength';
import { UWS } from '../constants/gameData';
import { battle, makeExport } from '../test/makeExport';

const report = parseGameExport(makeExport({
    BattleHistory: [battle({
        TotalEnemies: 1000, GameTime: 10000, Wave: 500,
        DamageDealt: 1000, ChainLightningDamage: 300, SwampDamage: 200, ProjectilesDamage: 500,
        ProjectilesCount: 10000, EnemiesHitByChainLightningThisRound: 500,
    })],
})).battles[0];

function snapshot(): OptimizerSnapshot {
    const st = useGameStore.getState();
    const cardData = { data: {}, slots: 1, presets: { 0: [] } };
    const snap: OptimizerSnapshot = {
        presetIdx: 0,
        wsData: JSON.parse(JSON.stringify(st.wsData)),
        enhData: JSON.parse(JSON.stringify(st.enhData)),
        labData: {},
        cardData,
        perkData: { banned: [] },
        uwData: { stones: 0, data: Object.fromEntries(UWS.map(u => [u.a, { own: true, sv: [10, 3, 10], upOwn: false, upLvl: 0 }])) },
        relicData: {},
        modBonuses: readActiveModuleBonuses(st.moduleState, { banned: [] }, {}, cardData, runRatesFrom(report)),
        moduleState: JSON.parse(JSON.stringify(st.moduleState)),
        botData: {},
        metric: 'edps',
    };
    snap.edps = buildEdpsCalibration(snap, report) ?? undefined;
    snap.edpsMode = 'waves';
    return snap;
}

describe('battle conditions', () => {
    it('Enemy Speed shortens the time enemies spend in range', () => {
        const s = snapshot();
        const ttt = (mb = s.modBonuses) => calcTTT(0, s.wsData, s.labData, s.cardData, s.uwData, mb).ttt;
        expect(ttt(withConditions(s.modBonuses, { enemySpeedPct: 25 }))).toBeCloseTo(ttt() / 1.25, 9);
    });

    it('UW Durations cut the four duration UWs and nothing else', () => {
        const mb = withConditions(snapshot().modBonuses, { uwDurationSec: 5 });
        for (const a of ['CF', 'GT', 'PS', 'BH'] as const) expect(mb.uwBonus[a]?.dur).toBe(-5);
        expect(mb.uwBonus.SM?.dur).toBeUndefined();
    });

    it('skip: × Skip Reduction, then − Skip Decay, never below 0', () => {
        expect(conditionedSkip(20, { skipMultiply: 0.8, skipDecayPoints: 2 })).toBeCloseTo(14, 10);
        expect(conditionedSkip(5, { skipDecayPoints: 9 })).toBe(0);
        expect(conditionedSkip(20, undefined)).toBe(20);
    });

    it('Skip Decay builds up over the run, capped at the chance you have', () => {
        // 1 point every 10 waves: Σ⌊w/10⌋ over 100 waves = 460.
        expect(skipDecayAverage(1, 10, 100, 50)).toBeCloseTo(4.6, 10);
        // Capped at 3: 10×1 + 10×2 + 71×3 = 243.
        expect(skipDecayAverage(1, 10, 100, 3)).toBeCloseTo(2.43, 10);
    });

    it("Boss's Ultimate counts where bosses end the runs", () => {
        expect(conditionHealth('Boss', { bossHealthPct: 100 })).toBe(2);
        expect(conditionHealth('Ray', { bossHealthPct: 100 })).toBe(1);
        const s = snapshot();
        s.killers = { Boss: 0.5, Ray: 0.5 };
        const base = goalScore(s);
        expect(goalScore({ ...s, conditions: { bossHealthPct: 300 } }) / base).toBeCloseTo(0.5, 9);   // (1/4)^0.5
    });

    it('lower the push score, and Poison Swamp loses to shorter durations', () => {
        const s = snapshot();
        const base = goalScore(s);
        expect(base).toBeCloseTo(1, 6);
        expect(goalScore({ ...s, conditions: { enemySpeedPct: 50 } })).toBeLessThan(base);
        expect(goalScore({ ...s, conditions: { uwDurationSec: 10 } })).toBeLessThan(base);
    });
});

describe('waves under battle conditions', () => {
    const runs = parseGameExport(makeExport({
        BattleHistory: [130, 135, 140].map((wave, i) => battle({
            BattleDate: `2026-10-1${i}T12:00:00Z`, Tier: 18, Wave: wave, KilledBy: 9, IsTournament: true,
            HealthLevelSkips: Math.floor(wave * 0.2), AttackLevelSkips: 0,
        })),
    })).battles;
    const m = buildRunLengthModel(runs, { tournament: true })!;

    it('lose waves to less damage or less skip, and gain them back the same way', () => {
        expect(runWavesChange(m, Math.log(0.8), 0)).toBeLessThan(0);
        expect(runWavesChange(m, 0, -5)).toBeLessThan(0);
        expect(runWavesChange(m, 0, 0)).toBe(0);
        expect(runWavesChange(m, Math.log(1.1), 0)).toBeGreaterThan(0);
        expect(Math.abs(runWavesChange(m, Math.log(1.5), 0) - wavesFromDamage(m, 0.5))).toBeLessThan(3);
    });

    it('never skip less than nothing', () => {
        expect(runWavesChange(m, 0, -100)).toBeCloseTo(runWavesChange(m, 0, -20), 9);
    });
});
