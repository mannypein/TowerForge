// Enemy Health Level Skip upgrades: the chance from each source, what the
// next step of each adds, and the coins it costs (wiki tables).

import { describe, expect, it } from 'vitest';
import { healthSkipChance, nextSkipUpgrades, skipUpgradePath } from './levelSkip';
import type { SkipSources } from './levelSkip';

const maxed: SkipSources = { workshop: 699, lab: 20, enhancement: 60, enhancementOwned: true, otherPct: 2 };

describe('Enemy Health Level Skip chance', () => {
    it('adds the sources, then multiplies by the enhancement', () => {
        expect(healthSkipChance({ ...maxed, lab: 0, otherPct: 0, enhancementOwned: false })).toBeCloseTo(35, 9);
        expect(healthSkipChance(maxed)).toBeCloseTo((35 + 2 + 2) * 1.6, 9);
        expect(healthSkipChance({ ...maxed, otherPct: 40 })).toBe(100);   // capped
    });
});

describe('the next upgrade of each source', () => {
    const mid: SkipSources = { workshop: 450, lab: 12, enhancement: 30, enhancementOwned: true, otherPct: 2 };

    it('values each step by the skip it adds', () => {
        const base = 0.05 * 451 + 1.2 + 2;
        const ups = Object.fromEntries(nextSkipUpgrades(mid).map(u => [u.source, u]));
        expect(ups.workshop.points).toBeCloseTo(0.5 * 1.3, 9);          // +10 levels × the enhancement
        expect(ups.lab.points).toBeCloseTo(0.1 * 1.3, 9);
        expect(ups.enhancement.points).toBeCloseTo(base * 0.01, 9);     // one level multiplies everything
    });

    it('prices each step from the cost tables', () => {
        const ups = Object.fromEntries(nextSkipUpgrades(mid).map(u => [u.source, u]));
        // Levels 450 → 460: the wiki's running totals 8.01q → 11.09q, exactly 3.0755q.
        expect(ups.workshop.cost / 3.0755e15).toBeCloseTo(1, 3);
        expect(ups.lab.cost).toBe(32.03e9);                               // lab level 13
        expect(ups.lab.time).toBe('7d 3h');
        expect(ups.enhancement.cost).toBe(337.06e15);                    // enhancement level 31
    });

    it('takes the discount labs and lab speed off', () => {
        const labs = { 'WS Util Discount': 99, 'Labs Coin Discount': 99, 'Labs Speed': 99, 'Enh Util Discount': 100 };
        const ups = Object.fromEntries(nextSkipUpgrades({ ...mid, labs, relics: { rLabSpd: 25 } }).map(u => [u.source, u]));
        expect(ups.workshop.cost / (3.0755e15 * 0.505)).toBeCloseTo(1, 3);
        expect(ups.lab.cost).toBeCloseTo(32.03e9 * (1 - 0.297), 0);
        expect(ups.lab.time).toBe('1d 22h');      // 171h 53m ÷ (2.98 × 1.25)
        expect(ups.enhancement.cost).toBeCloseTo(337.06e15 * 0.7, -10);
    });

    it('offers nothing past the max, and no enhancement until it’s unlocked', () => {
        expect(nextSkipUpgrades(maxed)).toEqual([]);
        expect(nextSkipUpgrades({ ...mid, enhancementOwned: false }).map(u => u.source)).toEqual(['workshop', 'lab']);
    });
});

describe('a path of the most skip per coin', () => {
    it('buys the cheapest skip first and re-checks after each buy', () => {
        const path = skipUpgradePath({ workshop: 450, lab: 12, enhancement: 30, enhancementOwned: true, otherPct: 2 }, 12);
        expect(path[0].source).toBe('lab');                      // billions of coins against quadrillions
        expect(path.filter(u => u.source === 'lab').map(u => u.to)).toEqual([13, 14, 15, 16, 17, 18, 19, 20]);
        for (const u of path) expect(u.points).toBeGreaterThan(0);
    });
});
