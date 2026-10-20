// Workshop and lab costs: the game's tables (via TheTowerSDK), anchored on
// the wiki's cost pages, and the discount and lab speed labs.

import { describe, expect, it } from 'vitest';
import {
    botMedalCost, botPlusMedalCost, formatLabTime, labLevelCost, labSpeed, workshopCost, workshopDiscount,
} from './upgradeCosts';
import { BOTS_CONFIG } from '../constants/botData';

const near = (value: number | null, expected: number, digits = 3) =>
    expect((value ?? NaN) / expected).toBeCloseTo(1, digits);

describe('workshop costs', () => {
    it('match the wiki’s cost pages', () => {
        near(workshopCost('Super Critical Chance', 0, 1), 50e3);
        near(workshopCost('Super Critical Chance', 99, 100), 355.49e9);
        near(workshopCost('Super Critical Chance', 0, 100), 5.63e12, 2);    // wiki running total
        near(workshopCost('Attack Speed', 0, 99), 3.60e6, 2);
        near(workshopCost('Damage', 0, 5000), 1.34e12, 2);
        near(workshopCost('Damage', 0, 6000), 816.09e12);
        near(workshopCost('Enemy HP Level Skip', 0, 10), 3.72e9);
    });

    it('splits a 10-level entry of the long stats evenly', () => {
        near(workshopCost('Damage', 5000, 5003), 5.2146e9, 2);
        expect(workshopCost('Damage', 6000, 6010)).toBe(0);                  // maxed
    });

    it('takes 0.5% a level of the section’s discount lab off', () => {
        expect(workshopDiscount({ 'WS Atk Discount': 99 }, 'attack')).toBeCloseTo(0.495, 9);
        expect(workshopDiscount({ 'WS Atk Discount': 99 }, 'defense')).toBe(0);
        near(workshopCost('Attack Speed', 0, 99, 0.495), 3.60e6 * 0.505, 2);
    });

    it('knows nothing of a stat that isn’t in the table', () => {
        expect(workshopCost('Not A Stat', 0, 1)).toBeNull();
    });
});

describe('lab costs and times', () => {
    it('match the wiki’s lab tables', () => {
        const skip = labLevelCost('Enemy HP Lvl Skip Lab', 13, {}, {})!;
        expect(skip.coins).toBe(32.03e9);
        expect(formatLabTime(skip.hours)).toBe('7d 3h');
        expect(labLevelCost('Enemy HP Lvl Skip Lab', 21, {}, {})).toBeNull();   // past the max
    });

    it('takes Labs Coin Discount off and speeds up by Labs Speed and the relic', () => {
        const labs = { 'Labs Coin Discount': 99, 'Labs Speed': 99 };
        expect(labSpeed(labs, { rLabSpd: 25 })).toBeCloseTo(2.98 * 1.25, 9);   // the wiki's example
        const skip = labLevelCost('Enemy HP Lvl Skip Lab', 13, labs, {})!;
        expect(skip.coins).toBeCloseTo(32.03e9 * 0.703, 0);
        expect(skip.hours).toBeCloseTo(10313 / 60 / 2.98, 6);
    });

    it('doesn’t let Labs Speed speed up its own research', () => {
        const own = labLevelCost('Labs Speed', 99, { 'Labs Speed': 98 }, { rLabSpd: 25 })!;
        expect(own.hours).toBeCloseTo(labLevelCost('Labs Speed', 99, {}, {})!.hours / 1.25, 6);
    });

    it('shows time the way the game does', () => {
        expect(formatLabTime(999 / 60)).toBe('16h 39m');
        expect(formatLabTime(1501 / 60)).toBe('1d 1h');
        expect(formatLabTime(0.1)).toBe('6m');
    });
});

describe('bot medal costs', () => {
    it('price a bot stat 100 + 40 a level (wiki bot Cost pages)', () => {
        expect(botMedalCost(0, 1)).toBe(100);
        expect(botMedalCost(29, 30)).toBe(1260);
        expect(botMedalCost(0, 30)).toBe(20400);
    });

    // Every Bot+ ladder bought from its unlock (Lv 0) to its max, against the
    // "Total Medal Cost" row of each bot page's Bot+ table (wiki, 2026-10-19).
    it('price Bot+ levels like the wiki’s Bot+ tables', () => {
        const total = (name: string) => {
            const bot = BOTS_CONFIG.find(b => b.name === name)!;
            return botPlusMedalCost(0, bot.plusMax, bot.plus.costStep);
        };
        expect(total('Flame Bot')).toBe(11500);
        expect(total('Thunder Bot')).toBe(11500);
        expect(total('Golden Bot')).toBe(17500);
        expect(total('Amplify Bot')).toBe(8100);
        expect(total('Bot Bot')).toBe(11500);
        expect(botPlusMedalCost(0, 2, 50)).toBe(100 + 150);
        expect(botPlusMedalCost(24, 25, 50)).toBe(1300);       // Golden Bot's last level
        expect(botPlusMedalCost(1, 2, 200)).toBe(300);         // Echoing Shot 4 → 5
        expect(botPlusMedalCost(8, 9, 200)).toBe(1700);
        expect(botPlusMedalCost(5, 5, 50)).toBe(0);
    });
});
