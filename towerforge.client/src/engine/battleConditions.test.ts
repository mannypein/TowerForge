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
    armorKeep, bcLabCut, conditionedSkip, conditionHealth, crowdFactor, fastBuffShare, fastUltimateTime, heatAfterLabs,
    heatConditions, heatStep, heatValue, leagueConditions, runMix, skipDecayFactor, withConditions,
} from './battleConditions';
import { calcTTT } from './ttt';
import { conditionRatios, edpsParts, killerHits } from './edps';
import { saverAverages, savedHits } from './runSavers';
import { buildTournamentModel, settleGain } from './tournamentModel';
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
        // In-game card (owner, 2026-10-21): Fast's Ultimate Level 5 — "Fasts buff up to
        // 1 nearby enemies to match their speed" — the sheet's value at the start of a run.
        expect(heatValue(cond('fastUltimate'), 'steep', 0)).toBe(1);
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
    });

    it('reads every condition the model counts at its strength (Legend, W135)', () => {
        const c = heatConditions(league('Legend'), {
            enemySpeed: true, armored: true, moreEnemies: true, orb: true, deathRay: true,
            tankUltimate: true, basicUltimate: true, fastUltimate: true, deathDefyDown: true, energyShieldsDown: true,
            thorns: true, knockback: true,   // no effect on a Glass Cannon run: not read
        }, 135, {});
        expect(c).toEqual({
            enemySpeedPct: 90, armoredHits: 15, moreEnemiesPct: 25, orbLeftPct: 20, deathRayLeftPct: 55,
            tankUltimate: true, basicUltimatePct: 3, fastUltimate: 3, deathDefyDownPct: 6, shieldsDownPct: 25,
        });
    });

    it('labs weaken a resistance by what it takes away', () => {
        // Orb Resistance leaves 20% at W100; BC Reduction 5 (−10%) → 100 − 80 × 0.9.
        expect(heatAfterLabs(cond('orb'), 'steep', 135, { 'BC Reduction': 5 })).toBeCloseTo(28, 10);
        expect(heatAfterLabs(cond('enemySpeed'), 'steep', 135, { 'BC Reduction': 5 })).toBeCloseTo(81, 10);
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

    it('Enemy Speed cuts the time enemies spend in range', () => {
        const s = snapshot();
        const t = (mb: OptimizerSnapshot['modBonuses']) => calcTTT(0, s.wsData, s.labData, s.cardData, s.uwData, mb).ttt;
        expect(t(withConditions(s.modBonuses, { enemySpeedPct: 100 })) / t(s.modBonuses)).toBeCloseTo(0.5, 9);
        expect(goalScore({ ...s, conditions: { enemySpeedPct: 100 } })).toBeLessThan(goalScore(s));
    });

    it('more enemies share single-target fire; resistances leave the enemies orbs and Death Ray destroyed', () => {
        const mix = { orbKills: 0.5, deathRayKills: 0.2, touchable: 1, basic: 0.2, tank: 0.25, avgHealth: 2 };
        expect(crowdFactor({ moreEnemiesPct: 25 }, mix)).toBeCloseTo(1.25, 10);
        expect(crowdFactor({ orbLeftPct: 20 }, mix)).toBeCloseTo(1 + 0.5 * 0.8, 10);
        expect(crowdFactor({ deathRayLeftPct: 55 }, mix)).toBeCloseTo(1 + 0.2 * 0.45, 10);
        // Tanks turn orb and Death Ray immune: their share of what those still destroy.
        expect(crowdFactor({ tankUltimate: true }, mix)).toBeCloseTo(1 + 0.25 * (0.5 + 0.2), 10);
        // Basics turn into each other type at 5%: +4, +19, −0.4 basic-health (tank, boss, protector).
        expect(crowdFactor({ basicUltimatePct: 5 }, mix)).toBeCloseTo(1 + (0.2 * 0.05 * 22.6) / 2, 10);
        expect(crowdFactor(undefined, mix)).toBe(1);
    });

    it('reads a run’s kills and enemy mix from its fields', () => {
        const r = parseGameExport(makeExport({ BattleHistory: [battle({
            TotalEnemies: 1000, DestroyedByOrbs: 500, DestroyedByDeathRay: 100,
            TotalBasic: 400, TotalFast: 300, TotalTank: 200, TotalRanged: 100,
        })] })).battles[0];
        const mix = runMix(r);
        expect([mix.orbKills, mix.deathRayKills, mix.basic, mix.tank]).toEqual([0.5, 0.1, 0.4, 0.2]);
        expect(mix.avgHealth).toBeCloseTo(0.4 + 0.3 + 0.2 * 5 + 0.1, 10);
        expect(runMix(null).basic).toBeCloseTo(0.199, 10);   // TheTowerSDK's measured mix stands in
    });

    it('armor blocks an enemy’s first hits out of the hits it takes', () => {
        expect(armorKeep(15, 100)).toBeCloseTo(0.85, 10);
        expect(armorKeep(100, 10)).toBe(0.05);
        expect(armorKeep(undefined, 10)).toBe(1);
        // The run: 10 shots an enemy, × bounces, × (1 + CL chance × chains).
        const s = snapshot();
        const calib = s.edps!;
        const a = calib.anchor;
        expect(calib.hitsPerEnemy).toBeCloseTo(10 * a.hitsPerShot * (1 + a.clChance * a.clQty), 9);
        const k = conditionRatios({ ...s, conditions: { armoredHits: 5 } }, calib, edpsParts(s));
        expect(k.flat).toBeCloseTo(1 - 5 / calib.hitsPerEnemy, 9);
        expect(k.targeted).toBe(1);
        const crowded = conditionRatios({ ...s, conditions: { moreEnemiesPct: 100 } }, calib, edpsParts(s));
        expect(crowded.targeted).toBeCloseTo(0.5, 10);
        expect(goalScore({ ...s, conditions: { armoredHits: 5 } })).toBeLessThan(goalScore(s));
        // Tougher enemies that end runs take more hits, so armor costs them less.
        expect(killerHits({ Tank: 1 }, { ...calib.mix, avgHealth: 2 })).toBeCloseTo(2.5, 10);
        expect(killerHits(undefined, calib.mix)).toBe(1);
        const tanks = conditionRatios({ ...s, killers: { Tank: 1 }, conditions: { armoredHits: 5 } }, calib, edpsParts(s));
        expect(tanks.flat).toBeGreaterThan(k.flat);
    });

    it('Fast’s Ultimate brings slow enemies that end runs in at Fast speed, most of the time', () => {
        // The owner sees it "most of the time": 1 − 0.4^x of them.
        expect(fastBuffShare(1)).toBeCloseTo(0.6, 10);
        expect(fastBuffShare(3)).toBeCloseTo(1 - 0.064, 10);
        expect(fastBuffShare(undefined)).toBe(0);
        // Overcharge (×0.2 speed) buffed to Fast (×2.1): 0.2/2.1 of its time in range.
        expect(fastUltimateTime(1, { Overcharge: 1 })).toBeCloseTo(0.4 + 0.6 * (0.2 / 2.1), 10);
        expect(fastUltimateTime(3, { Fast: 1, Saboteur: 1 })).toBe(1);          // already that fast
        // Half Overcharge, half Ranged: geometric, like the killers' health labs.
        const half = fastUltimateTime(2, { Overcharge: 0.5, Ranged: 0.5 });
        const p = fastBuffShare(2);
        expect(half).toBeCloseTo(Math.sqrt((1 - p + p * (0.2 / 2.1)) * (1 - p + p * (1.2 / 2.1))), 10);
        // In the push score: slow killers lose damage, fast ones don't.
        const s = snapshot();
        const slow = { ...s, killers: { Overcharge: 1 } };
        expect(goalScore({ ...slow, conditions: { fastUltimate: 3 } }) / goalScore(slow)).toBeLessThan(0.5);
        const fast = { ...s, killers: { Fast: 1 } };
        expect(goalScore({ ...fast, conditions: { fastUltimate: 3 } })).toBeCloseTo(goalScore(fast), 10);
    });

    it('Death Defy Down takes points off the chance; Energy Shields Down slows the shield', () => {
        const savers = { runs: 3, deathDefy: 1, others: 3, energyShield: 2 };
        const hits = (p: number, others: number) => (others + 1) / (1 - p) - 1;
        expect(savedHits(0.3, savers)).toBeCloseTo(hits(0.3, 3), 10);
        expect(savedHits(0.3, savers, { deathDefyDownPct: 10 })).toBeCloseTo(hits(0.2, 3), 10);
        expect(savedHits(0.3, savers, { shieldsDownPct: 100 })).toBeCloseTo(hits(0.3, 1 + 2 / 2), 10);
        // Against runs that already had it, the same strength changes nothing.
        expect(savedHits(0.3, savers, { shieldsDownPct: 50 }, { shieldsDownPct: 50 })).toBeCloseTo(hits(0.3, 3), 10);
        expect(saverAverages([])).toBeNull();
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

    it('the tournament model calibrates under the last tournament’s conditions and reads this week’s', () => {
        const fought = (wave: number, day: number) => ({ ...tDeath(wave, day),
            DamageDealt: 1000, ChainLightningDamage: 300, SwampDamage: 200, ProjectilesDamage: 500,
            ProjectilesCount: 10000, TotalEnemies: 1000, GameTime: 10000 });
        const runs = parseGameExport(makeExport({ BattleHistory: [fought(130, 0), fought(135, 1), fought(140, 2)] })).battles;
        const acc = { ...account('Legend'), importedBattles: runs, battleReportChoice: -1, uwData: snapshot().uwData };
        const none = buildTournamentModel(acc, { league: 'Legend', week: {}, last: {} }, 'Glass Cannon')!;
        expect(none.calibIdx).toBe(2);
        expect(none.settle!({})).toBeCloseTo(0, 9);
        // The same conditions as last time don't move it; new ones cost waves; dropping them gains.
        const had = buildTournamentModel(acc, { league: 'Legend', week: {}, last: { enemySpeed: true } }, 'Glass Cannon')!;
        expect(had.settle!({ enemySpeed: true })).toBeCloseTo(0, 9);
        expect(none.settle!({ enemySpeed: true })).toBeLessThan(0);
        expect(had.settle!({})).toBeGreaterThan(0);
        // The build: another preset is used; the account isn't changed.
        const other = buildTournamentModel(acc, { league: 'Legend', week: {}, last: {}, preset: 1 }, 'Glass Cannon')!;
        expect(other.account.activePreset).toBe(1);
        expect(acc.activePreset).toBe(st.activePreset);
    });

    it('settles where a run ends even when conditions climb steeply', () => {
        // Gains 100 waves read where it starts, 2 fewer for every wave further: ends at 33⅓.
        const w = settleGain(w => 100 - 2 * w);
        expect(w).toBeGreaterThan(32.5);
        expect(w).toBeLessThanOrEqual(100 / 3);
        expect(settleGain(w => -60 - w)).toBeCloseTo(-30, 0);
        expect(settleGain(() => 0)).toBe(0);
        // One wave short of a step where the conditions jump: it stops at the step,
        // and is never read past it (where it would look like a loss).
        const atStep = settleGain(w => (w < 1 ? 1.4 : -5));
        expect(atStep).toBeGreaterThan(0.85);
        expect(atStep).toBeLessThan(1);
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
