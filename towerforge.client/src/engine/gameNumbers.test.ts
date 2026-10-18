// The game's number suffixes, anchored on values read off the in-game
// Wave Info panel (Tier 18, wave 6000) and the wiki's notation table.

import { describe, expect, it } from 'vitest';
import { formatGameNumber, parseGameNumber } from './gameNumbers';

describe('game numbers', () => {
    it('reads the suffixes the game writes', () => {
        expect(parseGameNumber('3.31T')).toBe(3.31e12);
        expect(parseGameNumber('484.82Q')).toBeCloseTo(4.8482e20, -8);
        expect(parseGameNumber('1.45s')).toBeCloseTo(1.45e21, -8);
        expect(parseGameNumber('2.5S')).toBeCloseTo(2.5e24, -10);
        expect(parseGameNumber('1O')).toBe(1e27);
        expect(parseGameNumber('1N')).toBe(1e30);
        expect(parseGameNumber('1D')).toBe(1e33);
        expect(parseGameNumber('4.02aa')).toBeCloseTo(4.02e36, -24);    // basic enemy health, T18 W6000
        expect(parseGameNumber('80.48aa')).toBeCloseTo(8.048e37, -24);  // Saboteur
        expect(parseGameNumber('1ab')).toBe(1e39);
        expect(parseGameNumber('$791.44B')).toBeCloseTo(7.9144e11, -2);
        expect(parseGameNumber('1,234')).toBe(1234);
        expect(parseGameNumber('5 apples')).toBeNaN();
    });

    it('writes them back the same way', () => {
        expect(formatGameNumber(4.0244e36)).toBe('4.02aa');
        expect(formatGameNumber(1e33)).toBe('1.00D');
        expect(formatGameNumber(2.7e27)).toBe('2.70O');
        expect(formatGameNumber(3.05e18)).toBe('3.05Q');
        expect(formatGameNumber(12.5)).toBe('12.5');
    });

    it('cuts off at 2 decimals like the game, instead of rounding', () => {
        expect(formatGameNumber(3.8151e36)).toBe('3.81aa');     // Fast health, T18 W6000
        expect(formatGameNumber(1.94096e37)).toBe('19.40aa');   // Boss
        expect(formatGameNumber(4.848275e20)).toBe('484.82Q');  // attack
        expect(formatGameNumber(1.999999e12)).toBe('1.99T');
        expect(formatGameNumber(-2.5e15)).toBe('-2.50q');
    });
});
