// Assist slots: stone costs (confirmed totals in docs/optimizer.md) and the
// stone / lab split of an efficiency.

import { describe, expect, it } from 'vitest';
import { assistLabOf, assistLevelCost, assistPart, assistStonesTo, assistWithLab, nextAssistTier } from './assistModules';

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

    // Each efficiency is a total that holds the Assist lab's levels, so a lab
    // level moves it (2026-11-16: the Optimizer saw no gain from Assist labs).
    it('moves an efficiency with its Assist lab, never past the cap', () => {
        expect(assistLabOf('Assist-Generator Mult')).toEqual({ type: 'generator', kind: 'multEff' });
        expect(assistLabOf('Assist-Core Substat')).toEqual({ type: 'core', kind: 'subEff' });
        expect(assistLabOf('Primary-Generator Mult')).toBeNull();
        const data = { generator: { rarity: 'Epic' as const, multEff: 43, subEff: 20 } };
        expect(assistWithLab(data, 'Assist-Generator Mult', 22, 23).generator.multEff).toBe(44);
        expect(assistWithLab(data, 'Assist-Generator Substat', 5, 3).generator.subEff).toBe(18);
        expect(assistWithLab({ generator: { ...data.generator, multEff: 129 } }, 'Assist-Generator Mult', 0, 5).generator.multEff).toBe(130);
        expect(assistWithLab(data, 'Assist-Cannon Mult', 0, 1)).toBe(data);                     // no cannon slot
        expect(assistWithLab({ generator: { ...data.generator, rarity: 'locked' } }, 'Assist-Generator Mult', 0, 1).generator.multEff).toBe(43);
        expect(assistWithLab(data, 'Damage Lab', 0, 1)).toBe(data);
    });
});
