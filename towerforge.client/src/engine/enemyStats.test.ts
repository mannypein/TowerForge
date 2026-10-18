// Enemy stats anchored on the in-game Wave Info panel: a Tier 18 wave 6000
// screenshot and a recording of waves 6196–6206 on the same account, with
// the trade-off perks that run had (docs/run-simulation.md). The panel shows
// 2 decimals (rounded or cut off), so values must agree to within 0.01 of
// the number before the suffix.

import { describe, expect, it } from 'vitest';
import { baseEnemyDamage, baseEnemyHealth, bossWaveInterval, eliteSpawn, enemyPanel, isFleetWave, NO_ENEMY_PERKS } from './enemyStats';
import type { EnemyType } from './enemyStats';
import { parseGameNumber } from './gameNumbers';

const near = (actual: number, shown: string) => {
    const digits = parseFloat(shown);
    const unit = parseGameNumber(shown) / digits;     // the suffix's size
    expect(Math.abs(actual / unit - digits)).toBeLessThanOrEqual(0.0105);
};

describe('enemy health and attack per level', () => {
    it('follows the game at T18 (levels after skips)', () => {
        // ×0.45 = the Enemy HP −50% perk at −55%; ×2.5 = the enemy speed perk's damage.
        near(baseEnemyHealth(2526, 18) * 0.45, '4.02aa');
        near(baseEnemyDamage(2535, 18) * 2.5, '484.82Q');
        near(baseEnemyDamage(1, 18) * 2.5, '3.31T');     // Overcharge, pinned to wave 1
    });

    it('steps at the same levels as the game, wave by wave', () => {
        // Recording, waves 6196 → 6206: health level 2608 → 2612, attack 2618 → 2622.
        near(baseEnemyHealth(2608, 18) * 0.45, '6.39aa');
        near(baseEnemyHealth(2611, 18) * 0.45, '6.64aa');
        near(baseEnemyHealth(2612, 18) * 0.45, '6.65aa');
        near(baseEnemyDamage(2618, 18) * 2.5, '590.90Q');
        near(baseEnemyDamage(2620, 18) * 2.5, '593.12Q');
        near(baseEnemyDamage(2621, 18) * 2.5, '593.60Q');
        expect(baseEnemyHealth(2610, 18) / baseEnemyHealth(2609, 18)).toBeGreaterThan(1.03);   // band step
    });
});

describe('the Wave Info panel', () => {
    // The account's labs: Fast Health 13, Tank Health 24, Boss Health 30, Fast Speed 30,
    // Overcharge Health 4; Improve Trade-Off Perks 10.
    const panel = enemyPanel({
        tier: 18, wave: 6000, healthSkips: 3474, attackSkips: 3465,
        perks: { ...NO_ENEMY_PERKS, enemyHealth: true, enemySpeed: true, rangedDamage: true, bossHealthDown: true },
        improveTradeOff: 10,
        labs: {
            'Fast Enemy Health': 13, 'Tank Enemy Health': 24, 'Boss Health': 30,
            'Fast Enemy Speed': 30, 'Overcharge Enemy Health': 4,
        },
    });
    const row = (t: EnemyType) => panel.rows.find(r => r.type === t)!;

    it('looks enemies up at wave − levels skipped', () => {
        expect(panel.healthLevel).toBe(2526);
        expect(panel.attackLevel).toBe(2535);
    });

    it.each([
        ['Basic', '4.02aa', '484.82Q', '6.72'],
        ['Fast', '3.81aa', '484.82Q', '23.05'],
        ['Tank', '18.19aa', '484.82Q', '4.03'],
        ['Ranged', '4.02aa', '1.45s', '8.06'],
        ['Boss', '19.40aa', '484.82Q', '4.03'],
        ['Protector', '2.41aa', '484.82Q', '2.69'],
        ['Vampire', '8.04aa', '484.82Q', '2.69'],
        ['Scatter', '8.04aa', '242.41Q', '4.03'],
        ['Ray', '4.02aa', '484.82Q', '2.69'],
        ['Saboteur', '80.48aa', '0', '14.11'],
        ['Commander', '80.48aa', '0', '1.34'],
        ['Overcharge', '79.19aa', '3.31T', '1.34'],
    ] as const)('%s: %s health, %s attack, %s speed', (type, hp, atk, spd) => {
        const r = row(type);
        near(r.health, hp);
        if (atk === '0') expect(r.attack).toBe(0); else near(r.attack, atk);
        // Fast's ×3.9 is the wiki's rounded figure: 23.06 vs the game's 23.05.
        expect(Math.abs(r.speed - parseFloat(spd))).toBeLessThanOrEqual(type === 'Fast' ? 0.02 : 0.0105);
    });

    it('shows bosses on boss waves, no fleet, and both elites certain', () => {
        expect(row('Boss').spawn).toBe(100);
        expect(row('Saboteur').spawn).toBe(0);
        expect(row('Vampire').spawn).toBe(100);
        expect(row('Basic').spawn).toBeNull();   // normal mix not confirmed yet
    });
});

describe('spawn schedules', () => {
    it('bosses every 10 waves to T13, then faster down to every 5', () => {
        expect([1, 13, 14, 15, 16, 17, 18, 24].map(bossWaveInterval)).toEqual([10, 10, 9, 8, 7, 6, 5, 5]);
    });

    it('fleets on their tier schedule and at very high waves everywhere', () => {
        expect(isFleetWave(18, 95)).toBe(true);
        expect(isFleetWave(18, 6095)).toBe(true);
        expect(isFleetWave(18, 6000)).toBe(false);
        expect(isFleetWave(1, 15000)).toBe(true);
        expect(isFleetWave(1, 14999)).toBe(false);
        expect(isFleetWave(13, 12100)).toBe(true);
    });

    it('elites by the wiki tables', () => {
        expect(eliteSpawn(1, 499)).toEqual({ shown: 0, second: 0 });
        expect(eliteSpawn(1, 500)).toEqual({ shown: 0.33, second: 0 });
        expect(eliteSpawn(1, 8000)).toEqual({ shown: 33, second: 0.33 });
        expect(eliteSpawn(18, 6000)).toEqual({ shown: 100, second: 33 });
    });
});
