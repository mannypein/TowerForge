// Tests for the optimizer's stone ranking and the calibrated eDPS score,
// on made-up accounts. Costs and rules pinned here come from the game wiki
// (stone tables, card mastery, assist modules) — see the comments.

import { describe, expect, it } from 'vitest';
import { useGameStore } from '../store/useGameStore';
import { readActiveModuleBonuses } from './modBonuses';
import { runRatesFrom } from './runRates';
import { parseGameExport } from './gameExport';
import { buildCandidates, simulateStonePath } from './optimizer';
import type { OptimizerSnapshot } from './optimizer';
import { buildEdpsCalibration, edpsScore, edpsSurvivalScore } from './edps';
import { UWS, UW_STAT_VALUES, UW_STONE_COSTS } from '../constants/gameData';
import { GC_SCORING } from '../constants/optimizerConfig';
import type { BattleReport } from './battleReport';
import { battle, makeExport } from '../test/makeExport';

// A made-up run: 1000 enemies, total damage 1000 split by source.
function run(fields: Record<string, unknown> = {}): BattleReport {
    return parseGameExport(makeExport({
        BattleHistory: [battle({
            TotalEnemies: 1000, GameTime: 10000, Wave: 500,
            DamageDealt: 1000, ChainLightningDamage: 100, BlackHoleDamage: 50, OrbDamage: 800,
            ProjectilesDamage: 10, SwampDamage: 5, SmartMissileDamage: 5,
            DestroyedInBlackhole: 900, ProjectilesCount: 10000, EnemiesHitByChainLightningThisRound: 500,
            ...fields,
        })],
    })).battles[0];
}

// Every UW owned at Damage 10 / second stat 3 / third stat 10, nothing else.
function snapshot(report: BattleReport | null = null, edit?: (s: OptimizerSnapshot) => void): OptimizerSnapshot {
    const st = useGameStore.getState();
    const snap: OptimizerSnapshot = {
        presetIdx: 0,
        wsData: JSON.parse(JSON.stringify(st.wsData)),
        enhData: JSON.parse(JSON.stringify(st.enhData)),
        labData: {},
        cardData: { data: {}, slots: 1, presets: { 0: [] } },
        perkData: { banned: [] },
        uwData: { stones: 0, data: Object.fromEntries(UWS.map(u => [u.a, { own: true, sv: [10, 3, 10], upOwn: false, upLvl: 0 }])) },
        relicData: {},
        modBonuses: readActiveModuleBonuses(st.moduleState, { banned: [] }, {}, { data: {}, slots: 1, presets: {} }, runRatesFrom(report)),
        moduleState: JSON.parse(JSON.stringify(st.moduleState)),
        botData: {},
        metric: 'edps',
    };
    edit?.(snap);
    return snap;
}

describe('calibrated eDPS', () => {
    it('scores the current setup exactly 1', () => {
        const report = run();
        const snap = snapshot(report);
        const calib = buildEdpsCalibration(snap, report)!;
        expect(edpsScore(snap, calib)).toBeCloseTo(1, 10);
        expect(calib.shares.fixed).toBeCloseTo(0.83, 10);   // orbs 800 + 30 the report doesn't attribute
    });

    it('counts a source by its share of the real damage', () => {
        // Chain Lightning Damage 10 → 11 is 85× → 113×; CL did 10% of the damage.
        const report = run();
        const snap = snapshot(report);
        const calib = buildEdpsCalibration(snap, report)!;
        const after = snapshot(report, s => { s.uwData.data.CL!.sv[0] = 11; });
        expect(UW_STAT_VALUES.CL[0].slice(9, 11)).toEqual(['85x', '113x']);
        expect(edpsScore(after, calib)).toBeCloseTo(1 + 0.1 * (113 / 85 - 1), 6);
    });

    it('adds Consume as a share of the health of kills inside Black Hole', () => {
        const report = run();
        const snap = snapshot(report);
        const calib = buildEdpsCalibration(snap, report)!;
        const after = snapshot(report, s => { s.uwData.data.BH!.upOwn = true; });   // Consume Lv 1 = 5%
        expect(edpsScore(after, calib)).toBeCloseTo(1 + 0.05 * 0.9, 6);
    });

    it("values Smite at the run's proc rate, not the 100-hit cap", () => {
        // CL chance Lv 10 = 18.5%, 3 chains: 10,000 shots × 0.185 × 3 ÷ 500
        // enemies reached = 11.1 hits each → 2.05 smites; CL reached 50%.
        const report = run();
        const snap = snapshot(report);
        const calib = buildEdpsCalibration(snap, report)!;
        expect(calib.smiteProcs).toBeCloseTo(11.1 * 0.185, 6);
        const after = snapshot(report, s => { s.uwData.data.CL!.upOwn = true; });   // Smite Lv 1 = 0.05%
        expect(edpsScore(after, calib)).toBeCloseTo(1 + 0.0005 * 11.1 * 0.185 * 0.5, 8);
    });

    it('counts only flat damage for how far a Glass Cannon run gets', () => {
        // Flat sources in the run: CL 100, SM 5, PS 5, tower shots 10 = 0.12 of the damage.
        const report = run();
        const snap = snapshot(report);
        const calib = buildEdpsCalibration(snap, report)!;
        expect(edpsSurvivalScore(snap, calib)).toBeCloseTo(1, 10);
        const cl = snapshot(report, s => { s.uwData.data.CL!.sv[0] = 11; });
        expect(edpsSurvivalScore(cl, calib)).toBeCloseTo(1 + (0.1 / 0.12) * (113 / 85 - 1), 6);
        // Consume deals a share of enemy health: more eDPS, no extra waves.
        const consume = snapshot(report, s => { s.uwData.data.BH!.upOwn = true; });
        expect(edpsScore(consume, calib)).toBeGreaterThan(1);
        expect(edpsSurvivalScore(consume, calib)).toBeCloseTo(1, 10);
    });

    it('needs damage by source to calibrate', () => {
        const report = run({ DamageDealt: 0 });
        expect(buildEdpsCalibration(snapshot(report), report)).toBeNull();
        expect(buildEdpsCalibration(snapshot(), null)).toBeNull();
    });
});

describe('card mastery', () => {
    // Stones unlock a mastery at its first value; levels 1–9 come from labs.
    const withDamageCard = (mu: boolean) => snapshot(null, s => {
        s.cardData = { data: { Damage: { s: 7, m: 0, mu } }, slots: 1, presets: { 0: ['Damage'] } };
    });

    it('offers to unlock a locked mastery, at its lab level', () => {
        const [c] = buildCandidates(withDamageCard(false), 'mast');
        expect(c).toMatchObject({ label: 'Damage Mastery', fromLv: -1, toLv: 0, cost: 750 });
    });

    it('never offers to buy an unlocked mastery again', () => {
        expect(buildCandidates(withDamageCard(true), 'mast')).toHaveLength(0);
    });
});

describe('assist modules', () => {
    const assist = (multEff: number, subEff: number, labs: Record<string, number> = {}) => snapshot(null, s => {
        s.moduleState.assistData.cannon = { rarity: 'Epic', multEff, subEff };
        s.labData = labs;
    });
    const find = (snap: OptimizerSnapshot, what: string) =>
        buildCandidates(snap, 'assist').find(c => c.label === `Cannon Assist — ${what}`);

    it('costs 15 + 3 per stone level already bought', () => {
        // 48% = 1% base + 29 stone levels + 18 lab levels → the 30th costs 15 + 3 × 29.
        const snap = assist(48, 23, { 'Assist-Cannon Mult': 18, 'Assist-Cannon Substat': 9 });
        expect(find(snap, 'Mult Eff')!.cost).toBe(102);
        expect(find(snap, 'Substat Eff')!.cost).toBe(54);
    });

    it('stops Substat stones at 70% (labs add the last 30%)', () => {
        expect(find(assist(1, 70), 'Substat Eff')).toBeUndefined();
        expect(find(assist(1, 99, { 'Assist-Cannon Substat': 30 }), 'Substat Eff')).toBeDefined();
        expect(find(assist(1, 100, { 'Assist-Cannon Substat': 30 }), 'Substat Eff')).toBeUndefined();
    });

    it('lets Main Effect stones reach 100% (130% with the Assist Mult lab)', () => {
        expect(find(assist(99, 1), 'Mult Eff')).toBeDefined();
        expect(find(assist(100, 1), 'Mult Eff')).toBeUndefined();
        expect(find(assist(129, 1, { 'Assist-Cannon Mult': 30 }), 'Mult Eff')).toBeDefined();
        expect(find(assist(130, 1, { 'Assist-Cannon Mult': 30 }), 'Mult Eff')).toBeUndefined();
    });
});

describe('UW stone tables', () => {
    // From the wiki: Damage for SM / ILM / PS goes to Lv 36, Spotlight Bonus to
    // Lv 31 and Angle to Lv 61 (90°).
    const max = (a: string, stat: string) => UWS.find(u => u.a === a)!.s.find(([n]) => n === stat)![1];

    it('has every level the game has', () => {
        expect(max('SM', 'Damage')).toBe(36);
        expect(max('ILM', 'Damage')).toBe(36);
        expect(max('PS', 'Damage')).toBe(36);
        expect(max('SL', 'Bonus')).toBe(31);
        expect(max('SL', 'Angle')).toBe(61);
        expect(UW_STAT_VALUES.SM[0][35]).toBe('9219x');
        expect(UW_STONE_COSTS.SM[0].at(-1)).toBe(3166);
        expect(UW_STONE_COSTS.ILM[0].at(-1)).toBe(2228);
        expect(UW_STONE_COSTS.PS[0].at(-1)).toBe(3418);
        expect(UW_STONE_COSTS.SL[0].at(-1)).toBe(2900);
    });

    it('has one cost per level after the first, and one value per level', () => {
        for (const uw of UWS) {
            uw.s.forEach(([, maxLv], i) => {
                expect(UW_STAT_VALUES[uw.a][i].length, `${uw.a} ${i} values`).toBeGreaterThanOrEqual(maxLv);
                expect(UW_STONE_COSTS[uw.a][i].length, `${uw.a} ${i} costs`).toBeGreaterThanOrEqual(maxLv - 1);
            });
        }
    });
});

describe('stone path', () => {
    it('only recommends upgrades worth at least the minimum gain', () => {
        const report = run();
        const snap = snapshot(report);
        snap.edps = buildEdpsCalibration(snap, report)!;
        const path = simulateStonePath(60, snap);
        expect(path.length).toBeGreaterThan(0);
        for (const c of path) expect(c.scorePct).toBeGreaterThanOrEqual(GC_SCORING.minGainPct);
    });
});
