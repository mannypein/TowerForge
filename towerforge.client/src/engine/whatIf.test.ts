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
import { runModels } from './accountModels';
import { buildEdpsCalibration, edpsParts, edpsSurvivalScore } from './edps';
import { calcCFPlusHiddenSlow, calcTTT } from './ttt';
import { UWS, UW_PLUS_DATA, UW_STONE_COSTS } from '../constants/gameData';
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

describe('the runs waves are measured against', () => {
    // Campaign deaths near W8300 plus tournament deaths near W135.
    const mixed = [...runs, ...parseGameExport(makeExport({
        BattleHistory: [130, 135, 140].map((wave, i) => battle({
            BattleDate: `2026-10-2${i}T12:00:00Z`, Wave: wave, KilledBy: 9, IsTournament: true,
            HealthLevelSkips: Math.floor(wave * 0.2), AttackLevelSkips: 0,
        })),
    })).battles];
    const pick = (choice: number) => runModels({
        importedBattles: mixed, cardData: { data: {}, slots: 1, presets: {} }, activePreset: 0,
        battleReportText: '', battleReportChoice: choice,
    });

    it('follow the chosen run: a tournament run uses tournament deaths, with no coins per run', () => {
        const t = pick(mixed.length - 1);
        expect(t.run!.tournament).toBe(true);
        expect(t.run!.typicalWave).toBe(135);
        expect(t.coinsAt).toBeUndefined();
        const c = pick(4);
        expect(c.run!.tournament).toBe(false);
        expect(c.run!.typicalWave).toBeGreaterThan(8000);
    });
});

describe('what can change', () => {
    it('lists every upgrade with its level now and its max', () => {
        const snap = account();
        expect(target(snap, 'Chain Lightning — Damage')).toMatchObject({ kind: 'uw', current: 10, max: 32 });
        expect(target(snap, 'Damage Lab')).toMatchObject({ kind: 'lab', current: 40, max: 100 });
        expect(target(snap, 'Golden Bot — Bonus')).toMatchObject({ kind: 'bot', current: 0 });
        expect(target(snap, 'Cannon — Main slot')).toMatchObject({ kind: 'module', max: 300 });
    });

    it('lists Bot+ levels up to the v29 max once Bot+ is unlocked, priced in medals', () => {
        const snap = account(s => {
            s.botData['Amplify Bot'] = { owned: true, plusOwned: true, medals: [0, 0, 0, 0], plusLv: 0 };
            s.botData['Golden Bot'] = { ...s.botData['Golden Bot'], plusOwned: true, plusLv: 10 };
        });
        const echo = target(snap, 'Amplify Bot+ — Echoing Shot');
        expect(echo).toMatchObject({ kind: 'bot', current: 0, max: 9 });
        expect(changeCost(snap, echo, 9)).toEqual({ medals: 8100 });                     // wiki total
        expect(target(snap, 'Golden Bot+ — Bonus Cells')).toMatchObject({ current: 10, max: 25 });
        expect(upgradeTargets(account()).some(t => t.label.startsWith('Golden Bot+'))).toBe(false);
        const after = account(s => { s.botData['Amplify Bot'] = { ...snap.botData['Amplify Bot'] }; });
        applyChange(after, { kind: 'bot', key: echo.key, level: 9 });
        expect(after.botData['Amplify Bot'].plusLv).toBe(9);
        expect(edpsParts(after).tower / edpsParts(snap).tower).toBeCloseTo(12 / 3, 9);   // 3 → 12 bullets
        expect(edpsParts(after).cl).toBeCloseTo(edpsParts(snap).cl, 9);                  // UWs: not modeled
    });

    it('sets a level on the copy', () => {
        const snap = account();
        applyChange(snap, { kind: 'uw', key: 'CL|0', level: 12 });
        applyChange(snap, { kind: 'uwp', key: 'CL', level: 2 });
        expect(snap.uwData.data.CL!.sv[0]).toBe(12);
        expect(snap.uwData.data.CL).toMatchObject({ upOwn: true, upLvl: 1 });
    });

    it('goes up to a UW+’s top level, as the UW tab does', () => {
        // Chrono Loop: 14 levels, 0.10 → 0.75 rotation; the top one is upLvl 13 (0.65 hidden slow).
        const snap = account(s => { s.uwData.data.CF = { ...s.uwData.data.CF!, upOwn: true, upLvl: 4 }; });
        const t = target(snap, 'Chrono Field+ — Chrono Loop');
        expect([t.current, t.max]).toEqual([5, 14]);
        applyChange(snap, { kind: 'uwp', key: 'CF', level: t.max });
        expect(snap.uwData.data.CF!.upLvl).toBe(13);
        expect(calcCFPlusHiddenSlow(snap.uwData)).toBeCloseTo(0.65, 10);
        // Lv 5 → 14 costs levels 6 … 14 (costs[4] … costs[12]).
        expect(changeCost(account(s => { s.uwData.data.CF = { ...s.uwData.data.CF!, upOwn: true, upLvl: 4 }; }), t, 14))
            .toEqual({ stones: UW_PLUS_DATA.CF.costs.slice(4, 13).reduce((a, b) => a + b, 0) });
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

    it('in a tournament: starts where this week ends, and a run that goes further meets stronger conditions', () => {
        const snap = account();
        const change = [{ kind: 'uw' as const, key: 'CL|0', level: 20 }];
        const plain = whatIf(snap, change, upgradeTargets(snap), 'Glass Cannon', runs[4], models);
        // Armored Enemies that grow 1 hit every 10 waves past where runs end now.
        const at = (w: number) => ({ armoredHits: Math.max(0, (w - run.typicalWave) / 10) });
        const t = whatIf(snap, change, upgradeTargets(snap), 'Glass Cannon', runs[4], {
            ...models, calibConditions: {}, conditions: at(run.typicalWave), startWave: run.typicalWave - 50, conditionsAt: at,
        });
        expect(t.waves!.from).toBe(run.typicalWave - 50);
        const gain = (r: typeof t) => r.waves!.to - r.waves!.from;
        expect(gain(t)).toBeGreaterThan(0);
        expect(gain(t)).toBeLessThan(gain(plain));
        // The headline is the unrounded gain — the change's own waves — and the
        // chain splits it: the changed source, plus the stronger conditions
        // further in as a link of their own (untouched sources don't move).
        expect(t.waves!.gained).toBeCloseTo(t.perChange[0].waves, 9);
        expect(t.waves!.to).toBe(Math.round(t.waves!.from + t.waves!.gained));
        const stronger = t.chain.find(l => l.label === 'Stronger battle conditions where the run now ends')!;
        expect(stronger.after).toBeLessThan(1);
        expect(stronger.waves!).toBeLessThan(0);
        expect(t.chain.find(l => l.label === 'Poison Swamp')).toBeUndefined();
        const chainWaves = t.chain.reduce((sum, l) => sum + (l.waves ?? 0), 0);
        expect(chainWaves).toBeCloseTo(t.waves!.gained, 6);
        expect(plain.chain.some(l => l.label.startsWith('Stronger battle conditions'))).toBe(false);
        // A run one wave short of a step in the conditions gets to the step — not a loss.
        const from = run.typicalWave;
        const step = (w: number) => (w >= from + 1 ? { armoredHits: 1e6 } : {});
        const small = whatIf(snap, [{ kind: 'uw' as const, key: 'CL|0', level: 11 }], upgradeTargets(snap), 'Glass Cannon', runs[4], {
            ...models, calibConditions: {}, conditions: {}, startWave: from, conditionsAt: step,
        });
        expect(small.pushPct).toBeGreaterThan(0);
        expect(small.waves!.gained).toBeGreaterThan(0.85);
        expect(small.waves!.gained).toBeLessThanOrEqual(1);
        // No conditions: the same as campaign mode.
        const same = whatIf(snap, change, upgradeTargets(snap), 'Glass Cannon', runs[4], {
            ...models, calibConditions: {}, conditions: {}, conditionsAt: () => ({}),
        });
        expect(gain(same)).toBe(gain(plain));
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

    it('gives each change its own waves, and splits the waves between the links', () => {
        const snap = account();
        const changes = [{ kind: 'uw' as const, key: 'CL|0', level: 12 }, { kind: 'lab' as const, key: 'Enemy HP Lvl Skip Lab', level: 3 }];
        const r = whatIf(snap, changes, upgradeTargets(snap), 'Glass Cannon', runs[4], models);
        expect(r.perChange.map(c => c.key)).toEqual(['CL|0', 'Enemy HP Lvl Skip Lab']);
        for (const c of r.perChange) expect(c.waves).toBeGreaterThan(0);
        // The links' waves add up to the whole gain (before rounding to whole waves).
        const linked = r.chain.reduce((sum, l) => sum + (l.waves ?? 0), 0);
        const whole = r.waves!.to - r.waves!.from;
        expect(Math.abs(linked - whole)).toBeLessThan(0.51);
        expect(r.chain.find(l => l.label === 'Enemy Health Level Skip')!.waves).toBeGreaterThan(0);
        expect(r.spread!.runs).toBe(5);
        expect(r.spread!.max).toBeGreaterThanOrEqual(r.spread!.min);
    });

    it('gives Chain Lightning more hits from Multishot', () => {
        const snap = account(s => { s.wsData[0].attack[6] = 50; });
        const r = whatIf(snap, [{ kind: 'workshop', key: 'attack|6', level: 99 }], upgradeTargets(snap),
            'Glass Cannon', runs[4], models);
        const hits = r.chain.find(l => l.label === 'Projectiles per attack (Multishot)')!;
        expect(hits.before).toBeCloseTo(1 + 0.25 * 1, 9);                     // 25% for 2 targets
        expect(hits.after).toBeCloseTo(1 + 0.495 * 1, 9);
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
