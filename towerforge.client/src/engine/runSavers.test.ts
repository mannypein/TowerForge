// Run savers, run drops and the damage sources a battle report records
// beyond the parsed breakdown — all read from a made-up battle's fields.

import { describe, expect, it } from 'vitest';
import { parseGameExport } from './gameExport';
import { extraDamage, runDrops, runSavers } from './battleReport';
import { deathDefyChance, hitsSurvived, saverAverages } from './runSavers';
import type { OptimizerSnapshot } from './optimizer';
import { battle, makeExport } from '../test/makeExport';

const runOf = (fields: Record<string, unknown>) => parseGameExport(makeExport({ BattleHistory: [battle(fields)] })).battles[0];

describe('fields found by the words in their names', () => {
    const run = runOf({
        FlameBotDamage: 50, DeathRayDamage: 20, GuardianDamage: 5, FlameBotDamageReduction: 99,
        CellsEarned: 1200, GemsFetched: 3, MedalsFetched: 2, CannonShardsFetched: 40, RerollShardsEarned: 900,
        TotalCellsEarned: 1e9, MostCellsFromWaveSkip: 7, CellsPerHour: 100,
        DeathDefy: 2, HitsAbsorbedByEnergyShield: 1, SecondWindCount: 1, NukeCount: 0,
    });

    it('reads damage the breakdown doesn’t name', () => {
        expect(extraDamage(run)).toMatchObject({ flameBot: 50, deathRay: 20, guardian: 5, spotlight: 0 });
    });

    it('reads what saved the run', () => {
        expect(runSavers(run)).toEqual({ deathDefy: 2, energyShield: 1, secondWind: 1, nuke: 0, demonMode: null });
    });

    it('lists the drops, leaving out lifetime totals, records and rates', () => {
        const keys = runDrops(run).map(([k]) => k);
        expect(keys).toEqual(expect.arrayContaining(['CellsEarned', 'GemsFetched', 'MedalsFetched', 'CannonShardsFetched', 'RerollShardsEarned']));
        expect(keys).not.toContain('TotalCellsEarned');
        expect(keys).not.toContain('MostCellsFromWaveSkip');
        expect(keys).not.toContain('CellsPerHour');
    });
});

describe('Death Defy', () => {
    const snap = (level: number, sub = 0) => ({
        presetIdx: 0,
        wsData: [{ attack: [], defense: Array.from({ length: 18 }, (_, i) => (i === 15 ? level : 0)), utility: [] }],
        modBonuses: { subs: { 'Death Defy': sub } },
    }) as unknown as OptimizerSnapshot;

    it('is 0.4% a workshop level plus module substats', () => {
        expect(deathDefyChance(snap(75))).toBeCloseTo(0.3, 9);           // wiki: 30% at 75
        expect(deathDefyChance(snap(75, 5))).toBeCloseTo(0.35, 9);
    });

    it('lets a run survive (K + 1) ÷ (1 − p) − 1 killing hits', () => {
        expect(hitsSurvived(0, 2)).toBeCloseTo(2, 9);                    // only the other saves
        expect(hitsSurvived(0.3, 2)).toBeCloseTo(3 / 0.7 - 1, 9);
        // Every save behind Death Defy makes it worth more.
        expect(hitsSurvived(0.35, 3) - hitsSurvived(0.3, 3)).toBeGreaterThan(hitsSurvived(0.35, 0) - hitsSurvived(0.3, 0));
    });

    it('averages what saved your runs', () => {
        const runs = [
            runOf({ DeathDefy: 2, HitsAbsorbedByEnergyShield: 1, SecondWindCount: 1 }),
            runOf({ DeathDefy: 0, HitsAbsorbedByEnergyShield: 1, SecondWindCount: 1 }),
        ];
        expect(saverAverages(runs)).toEqual({ runs: 2, deathDefy: 1, others: 2 });
        expect(saverAverages([runOf({})])).toBeNull();
    });
});
