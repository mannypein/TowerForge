// Assist slots: stone costs (confirmed totals in docs/optimizer.md) and the
// stone / lab split of an efficiency.

import { describe, expect, it } from 'vitest';
import { assistLevelCost, assistPart, assistStonesTo, nextAssistTier } from './assistModules';

describe('assist module slots', () => {
    it('costs 15 + 3k stones a level: 16,038 to a 100% Main effect, 8,073 to 70% Substats', () => {
        expect(assistLevelCost(0)).toBe(15);
        expect(assistStonesTo(0, 99)).toBe(16038);
        expect(assistStonesTo(0, 69)).toBe(8073);
    });

    // A real account's generator assist: Main 43% = 1% + 20 stone levels + 22 lab
    // (the Optimizer showed the next level at 75 stones).
    it('splits an efficiency into its stones and lab', () => {
        const p = assistPart('generator', 'multEff', 43, { 'Assist-Generator Mult': 22 });
        expect(p).toMatchObject({ stones: 20, maxStones: 99, lab: 22, next: 75 });
        expect(p.toMax).toBe(assistStonesTo(20, 99));
        expect(assistPart('core', 'subEff', 100, { 'Assist-Core Substat': 30 })).toMatchObject({ stones: 69, next: null, toMax: 0 });
    });

    it('names the next unique-effect tier and its stones', () => {
        expect(nextAssistTier('locked')).toEqual({ tier: 'Epic', cost: 1000 });
        expect(nextAssistTier('Mythic')).toEqual({ tier: 'Ancestral', cost: 1400 });
        expect(nextAssistTier('Ancestral')).toBeNull();
    });
});
