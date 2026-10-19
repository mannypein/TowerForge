// Battle conditions in the model, on made-up accounts. Heat values are
// pinned to the crowdsourced "v26 BCs and Heat" sheet (J Plays Discord),
// league conditions to the wiki's Tiers page (Tournament Overheat); the
// skip order (× multiply, then × decay) is TheTowerSDK's.

import { describe, expect, it } from 'vitest';
import { useGameStore } from '../store/useGameStore';
import { readActiveModuleBonuses } from './modBonuses';
import { runRatesFrom } from './runRates';
import { parseGameExport } from './gameExport';
import { buildEdpsCalibration } from './edps';
import {
    bcLabCut, conditionedSkip, conditionHealth, heatConditions, heatStep, heatValue, leagueConditions,
    skipDecayFactor, withConditions,
} from './battleConditions';
import { goalScore, skipChanceOf } from './optimizer';
import type { OptimizerSnapshot } from './optimizer';
import { applyGoal, runModels, snapshotFromState } from './accountModels';
import { buildRunLengthModel, runWavesChange, wavesFromDamage } from './runLength';
import { HEAT_CONDITIONS, LEAGUE_HEAT } from '../constants/tournamentData';
import { UWS } from '../constants/gameData';
import { battle, makeExport } from '../test/makeExport';

const league = (name: string) => LEAGUE_HEAT.find(l => l.league === name)!;
const cond = (key: string) => HEAT_CONDITIONS.find(c => c.key === key)!;

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

describe('heat: conditions step up with the wave', () => {
    it('steps at the sheet’s waves and holds between them', () => {
        expect(heatStep(0)).toBe(0);
        expect(heatStep(99)).toBe(4);       // the W80 step
        expect(heatStep(100)).toBe(5);
        expect(heatStep(135)).toBe(5);
        expect(heatStep(1000)).toBe(18);
        expect(heatStep(5000)).toBe(18);    // full strength from W1000
    });

    it('matches the sheet (Legend and Champion ramp; Platinum’s gentler)', () => {
        expect(heatValue(cond('uwDurations'), 'steep', 135)).toBe(3);          // −3s at W100
        expect(heatValue(cond('uwDurations'), 'steep', 1000)).toBe(10);
        expect(heatValue(cond('bossUltimate'), 'steep', 500)).toBe(70);
        expect(heatValue(cond('enemySpeed'), 'steep', 100)).toBe(90);
        expect(heatValue(cond('enemySpeed'), 'gentle', 100)).toBe(70);
        expect(heatValue(cond('orb'), 'steep', 100)).toBe(20);
        expect(heatValue(cond('orb'), 'gentle', 100)).toBe(30);
        expect(heatValue(cond('armored'), 'gentle', 1000)).toBe(100);
        // Thorns: the same numbers as TheTowerSDK's heat table, both columns.
        expect(cond('thorns').steep[11]).toBe(45);
        expect(cond('thorns').gentle![11]).toBe(50);
    });

    it('fixed league conditions (wiki, Tournament Overheat)', () => {
        expect([league('Gold'), league('Platinum'), league('Champion'), league('Legend')].map(l => [l.skipMultiply, l.skipDecayEvery]))
            .toEqual([[0.9, 80], [0.75, 60], [0.6, 40], [0.45, 20]]);
        expect(league('Copper').ramp).toBeNull();
        expect(league('Mythic').bossEvery).toBe(4);
    });
});

describe('battle conditions in the model', () => {
    it('labs weaken them: BC Reduction 2% a level, the own lab 1%', () => {
        expect(bcLabCut({ 'BC Reduction': 5, 'UW Durations BC': 10 }, 'UW Durations BC')).toBeCloseTo(0.2, 10);
        const c = heatConditions(league('Legend'), { uwDurations: true, bossUltimate: true }, 135, { 'BC Reduction': 5 });
        expect(c.uwDurationSec).toBeCloseTo(3 * 0.9, 10);
        expect(c.bossHealthPct).toBeCloseTo(30 * 0.9, 10);
        expect(heatConditions(league('Legend'), { enemySpeed: true }, 135, {})).toEqual({});   // not counted
    });

    it('UW Durations cut the four duration UWs and nothing else', () => {
        const mb = withConditions(snapshot().modBonuses, { uwDurationSec: 5 });
        for (const a of ['CF', 'GT', 'PS', 'BH'] as const) expect(mb.uwBonus[a]?.dur).toBe(-5);
        expect(mb.uwBonus.SM?.dur).toBeUndefined();
    });

    it('Skip Decay builds up over the run', () => {
        // 1% every 10 waves, over 100 waves: Σ(1 − 0.01·⌊w/10⌋) = 100 − 4.6.
        expect(skipDecayFactor(1, 10, 100)).toBeCloseTo(0.954, 10);
        expect(skipDecayFactor(1, 20, 0)).toBe(1);
    });

    it('skip: × Skip Reduction, then × Skip Decay', () => {
        expect(conditionedSkip(20, { skipMultiply: 0.45, skipDecayFactor: 0.9 })).toBeCloseTo(8.1, 10);
        expect(conditionedSkip(20, undefined)).toBe(20);
        const legend = leagueConditions(league('Legend'), 135, {});
        expect(legend.skipMultiply).toBe(0.45);
        expect(legend.skipDecayFactor).toBeLessThan(1);
        // BC Reduction weakens the multiply too: 55% less skip × 0.8.
        expect(leagueConditions(league('Legend'), 135, { 'BC Reduction': 10 }).skipMultiply).toBeCloseTo(0.56, 10);
    });

    it("Boss's Ultimate counts where bosses end the runs", () => {
        expect(conditionHealth('Boss', { bossHealthPct: 100 })).toBe(2);
        expect(conditionHealth('Ray', { bossHealthPct: 100 })).toBe(1);
        const s = snapshot();
        s.killers = { Boss: 0.5, Ray: 0.5 };
        const base = goalScore(s);
        expect(goalScore({ ...s, conditions: { bossHealthPct: 300 } }) / base).toBeCloseTo(0.5, 9);   // (1/4)^0.5
    });

    it('shorter UWs lower the push score', () => {
        const s = snapshot();
        const base = goalScore(s);
        expect(base).toBeCloseTo(1, 6);
        expect(goalScore({ ...s, conditions: { uwDurationSec: 10 } })).toBeLessThan(base);
    });

    it('a skip point counts for less in a tournament', () => {
        const s = snapshot();
        const raw = skipChanceOf(s);
        expect(skipChanceOf({ ...s, conditions: { skipMultiply: 0.45 } })).toBeCloseTo(raw * 0.45, 10);
    });
});

describe('tournament runs in the Optimizer and What If', () => {
    const tDeath = (wave: number, day: number) => battle({
        BattleDate: `2026-10-1${day}T12:00:00Z`, Tier: 18, Wave: wave, KilledBy: 9, IsTournament: true,
        HealthLevelSkips: Math.floor(wave * 0.2), AttackLevelSkips: 0,
    });
    const battles = parseGameExport(makeExport({ BattleHistory: [tDeath(130, 0), tDeath(135, 1), tDeath(140, 2)] })).battles;
    const st = useGameStore.getState();
    const account = (leagueName: League) => ({
        ...st, profile: { ...st.profile, league: leagueName }, importedBattles: battles,
        battleReportText: '', battleReportChoice: battles.length - 1,
    });

    it('get the league’s skip conditions', () => {
        const m = runModels(account('Legend'));
        expect(m.run?.tournament).toBe(true);
        expect(m.conditions?.skipMultiply).toBe(0.45);
        expect(runModels(account('')).conditions).toBeUndefined();
        const snap = snapshotFromState(account('Legend'));
        applyGoal(snap, 'waves', 'Glass Cannon', battles[2], m);
        expect(snap.conditions?.skipMultiply).toBe(0.45);
    });

    const m = buildRunLengthModel(battles, { tournament: true })!;
    it('lose waves to less damage or less skip, and gain them back the same way', () => {
        expect(runWavesChange(m, Math.log(0.8), 0)).toBeLessThan(0);
        expect(runWavesChange(m, 0, -5)).toBeLessThan(0);
        expect(runWavesChange(m, 0, 0)).toBe(0);
        expect(Math.abs(runWavesChange(m, Math.log(1.5), 0) - wavesFromDamage(m, 0.5))).toBeLessThan(3);
        expect(runWavesChange(m, 0, -100)).toBeCloseTo(runWavesChange(m, 0, -20), 9);   // never below no skip
    });
});

type League = 'Legend' | '';
