// Which build an account is scored as: its own, except Hybrid, which is
// scored as the build its runs behave like — eHP when hits wear the tower
// down, Glass Cannon when single hits far past its healing end the runs.
// Made-up runs.

import { describe, expect, it } from 'vitest';
import { effectiveBuild, runModels } from './accountModels';
import { parseGameExport } from './gameExport';
import { battle, makeExport } from '../test/makeExport';

// Three T10 deaths that took `taken` damage against 2e12 of healing.
const deaths = (taken: number) => parseGameExport(makeExport({
    BattleHistory: [9000, 9100, 8900].map((wave, i) => battle({
        BattleDate: `2026-10-1${i}T12:00:00Z`, Tier: 10, Wave: wave, KilledBy: 4,
        HealthLevelSkips: Math.floor(wave * 0.38), AttackLevelSkips: Math.floor(wave * 0.4),
        DamageTaken: taken, TowerHealthRegen: 1e12, RecoveryPackagesRegen: 1e12,
    })),
})).battles;

describe('the build an account is scored as', () => {
    it('is the profile’s own build, Glass Cannon when none is set', () => {
        expect(effectiveBuild('eHP', [])).toBe('eHP');
        expect(effectiveBuild('Farming', deaths(3e18))).toBe('Farming');
        expect(effectiveBuild('', [])).toBe('Glass Cannon');
    });

    it('reads a Hybrid build from how its runs end', () => {
        expect(effectiveBuild('Hybrid', deaths(2.2e12))).toBe('eHP');            // worn down
        expect(effectiveBuild('Hybrid', deaths(3e18))).toBe('Glass Cannon');     // single huge hits
        expect(effectiveBuild('Hybrid', [])).toBe('Glass Cannon');               // nothing to read
    });

    it('builds the matching Run Length model', () => {
        const base = { cardData: { data: {}, slots: 1, presets: {} }, activePreset: 0, battleReportText: '', battleReportChoice: -1 };
        const worn = runModels({ ...base, importedBattles: deaths(2.2e12), profile: { build: 'Hybrid' } as never });
        const hit = runModels({ ...base, importedBattles: deaths(3e18), profile: { build: 'Hybrid' } as never });
        expect(worn.run!.stat).toBe('attack');
        expect(hit.run!.stat).toBe('health');
    });
});
