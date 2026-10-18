// Tests for the Ultimate Weapon damage model (engine/uwdps.ts) against the
// game wiki's rules — see docs/ultimate-weapons.md for the sources.

import { describe, expect, it } from 'vitest';
import { useGameStore } from '../store/useGameStore';
import { readActiveModuleBonuses } from './modBonuses';
import { calcBlackHoleReach, calcSpotlightMissilesDPS, calcUWDPS } from './uwdps';
import type { DamageContext } from './uwdps';
import type { CardData, LabData, PerkData, UWAbbr, UWData } from '../types/gameTypes';

const ctx: DamageContext = {
    towerDamage: 1, critMult: 1, attackSpeed: 1, projectiles: { multishot: 1, bounce: 1, rapid: 1 }, hitRate: 1,
};
const noCards: CardData = { data: {}, slots: 1, presets: { 0: [] } };

function uw(abbr: UWAbbr, sv: [number, number, number], plus = -1): UWData {
    return { stones: 0, data: { [abbr]: { own: true, sv, upOwn: plus >= 0, upLvl: Math.max(0, plus) } } };
}

function bonuses(perks: PerkData = { banned: [] }, labs: LabData = {}, cards: CardData = noCards) {
    return readActiveModuleBonuses(useGameStore.getState().moduleState, perks, labs, cards);
}

const dps = (abbr: UWAbbr, data: UWData, labs: LabData = {}, perks?: PerkData, cards: CardData = noCards, ttt = 10) =>
    calcUWDPS(abbr, data, bonuses(perks, labs, cards), ttt, 0, useGameStore.getState().wsData, labs, cards, ctx);

describe('Inner Land Mines', () => {
    it('counts the +6 mines perk', () => {
        const data = uw('ILM', [10, 1, 10]);   // 3 mines
        const withPerk = dps('ILM', data);
        const banned = dps('ILM', data, {}, { banned: ['ilm_extra'] });
        expect(withPerk / banned).toBeCloseTo((3 + 6) / 3, 10);
    });

    it('never fires faster than its 37s cooldown cap', () => {
        // A −20s cooldown substat: Lv 16 (50s) would reach 30s but stops at 37s;
        // Lv 1 (200s) goes to 180s.
        const mb = bonuses({ banned: ['ilm_extra'] });
        mb.uwBonus = { ...mb.uwBonus, ILM: { cd: -20 } };
        const at = (cdLv: number) => calcUWDPS('ILM', uw('ILM', [10, 1, cdLv]), mb, 10, 0,
            useGameStore.getState().wsData, {}, noCards, ctx);
        expect(at(16) / at(1)).toBeCloseTo(180 / 37, 10);
    });
});

describe('Poison Swamp', () => {
    // Wiki: ticks ramp by 50% without PS+ (1×, 1.5×, 3×, 4.5×…), by Death
    // Creep's value with it; the average over d ticks is (1 + (1+r)·d(d−1)/2)/d.
    const avg = (r: number, d: number) => (1 + (1 + r) * d * (d - 1) / 2) / d;

    it('ramps 50% a tick without Death Creep, and by Death Creep with it', () => {
        const d = 30;   // Duration Lv 1
        const base = dps('PS', uw('PS', [10, 1, 1]));
        const creep = dps('PS', uw('PS', [10, 1, 1], 0));   // Death Creep Lv 1 = 120%
        expect(creep / base).toBeCloseTo(avg(1.2, d) / avg(0.5, d), 10);
    });
});

describe('Death Wave', () => {
    it("counts each effect wave's Damage Amplifier (5× base, 50× with the lab)", () => {
        const data = uw('DW', [10, 3, 10]);   // 3 effect waves (+1 perk) every 210s
        const noLab = dps('DW', data);
        const maxLab = dps('DW', data, { 'DW-Dmg Amplifier': 30 });
        expect(maxLab / noLab).toBeCloseTo((1 + 4 * 50) / (1 + 4 * 5), 10);
    });
});

describe('Chain Lightning', () => {
    it("isn't changed by the Critical Chance card mastery (that's tower crit)", () => {
        const cards: CardData = { data: { 'Critical Chance': { s: 7, m: 9, mu: true } }, slots: 1, presets: { 0: ['Critical Chance'] } };
        const data = uw('CL', [10, 3, 10]);
        expect(dps('CL', data, {}, undefined, cards)).toBe(dps('CL', data));
    });
});

describe('Spotlight Missiles', () => {
    // One missile every (20 − lab) s, each at Smart Missiles' damage (14× without SM).
    const missiles = (data: UWData, lab: number, ttt = 100) =>
        calcSpotlightMissilesDPS(data, bonuses(), ttt, 0, [], { 'SL-Missiles': lab }, noCards,
            useGameStore.getState().moduleState, {}, { d: {}, u: {} }, ctx);

    it('fires Smart Missiles damage on the lab timer', () => {
        const both: UWData = { stones: 0, data: { ...uw('SL', [1, 1, 1]).data, ...uw('SM', [10, 1, 1]).data } };
        expect(missiles(both, 18)).toBeCloseTo(69 * 100 / 2, 8);       // SM Damage Lv 10 = 69×, every 2s
        expect(missiles(uw('SL', [1, 1, 1]), 1)).toBeCloseTo(14 * 100 / 19, 8);
        expect(missiles(uw('SL', [1, 1, 1]), 0)).toBe(0);
    });
});

describe('Black Hole', () => {
    it('only damages with the BH Damage lab (% of enemy health per second)', () => {
        const reach = (labs: LabData) => calcBlackHoleReach(uw('BH', [1, 1, 1]), bonuses(undefined, labs), 0, [], labs, noCards);
        expect(reach({})).toBe(0);
        expect(reach({ 'BH-Damage': 10 }) / reach({ 'BH-Damage': 5 })).toBeCloseTo(2, 10);
    });
});
