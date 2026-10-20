// Bots keep their medal and Bot+ levels per preset, like in game; owning
// a bot is account-wide. Runs the real store (localStorage writes fail
// quietly outside a browser).

import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './useGameStore';
import { BOTS_CONFIG, botPlusValue, botsForPreset, isBotEntryOwned, isBotPlusOwned } from '../constants/botData';

const store = () => useGameStore.getState();

describe('bot levels per preset', () => {
    beforeEach(() => {
        useGameStore.setState({
            botData: {
                'Golden Bot': { owned: true, medals: [5, 5, 5, 5], plusLv: 0 },
                'Flame Bot': { medals: [3, 0, 0, 0], plusLv: 0 },    // old save: no owned flag
            },
        });
    });

    it('starts every preset from the shared levels', () => {
        expect(botsForPreset(store().botData, 0)['Golden Bot'].medals).toEqual([5, 5, 5, 5]);
        expect(botsForPreset(store().botData, 3)['Golden Bot'].medals).toEqual([5, 5, 5, 5]);
    });

    it('changing a level in one preset leaves the others alone', () => {
        store().setBotMedal('Golden Bot', 0, 0, 7);
        store().setBotPlusLevel('Golden Bot', 0, 2);
        const p0 = botsForPreset(store().botData, 0)['Golden Bot'];
        const p1 = botsForPreset(store().botData, 1)['Golden Bot'];
        expect(p0).toMatchObject({ medals: [7, 5, 5, 5], plusLv: 2 });
        expect(p1).toMatchObject({ medals: [5, 5, 5, 5], plusLv: 0 });
    });

    it('max one stat in one preset', () => {
        store().setBotMedal('Golden Bot', 1, 3, 20);
        expect(botsForPreset(store().botData, 1)['Golden Bot'].medals).toEqual([5, 5, 5, 20]);
        expect(botsForPreset(store().botData, 0)['Golden Bot'].medals).toEqual([5, 5, 5, 5]);
    });

    it('keeps an old-save bot owned after a preset sets it to Lv 0', () => {
        store().setBotMedal('Flame Bot', 2, 0, 0);
        expect(isBotEntryOwned(store().botData['Flame Bot'])).toBe(true);
        expect(botsForPreset(store().botData, 2)['Flame Bot'].owned).toBe(true);
    });

    it('locking or unlocking a bot resets it in every preset', () => {
        store().setBotMedal('Golden Bot', 0, 0, 7);
        store().setBotOwned('Golden Bot', false);
        expect(isBotEntryOwned(store().botData['Golden Bot'])).toBe(false);
        expect(botsForPreset(store().botData, 0)['Golden Bot'].medals).toEqual([]);
    });

    it("hands the calculators copies, so they can't change the saved levels", () => {
        const view = botsForPreset(store().botData, 0);
        view['Golden Bot'].medals[0] = 99;
        expect(store().botData['Golden Bot'].medals[0]).toBe(5);
    });
});

// Bot+ as of game v29: TheTowerSDK's data/bots plus tier and the wiki's bot
// pages agree (2026-10-19).
describe('Bot+ (v29)', () => {
    const bot = (name: string) => BOTS_CONFIG.find(b => b.name === name)!;

    it('has each ability’s v29 levels and values', () => {
        expect(BOTS_CONFIG.map(b => [b.name, b.plus.label, b.plusMax])).toEqual([
            ['Flame Bot', 'Wild Fire', 20], ['Thunder Bot', 'Titan Shock', 20], ['Golden Bot', 'Bonus Cells', 25],
            ['Amplify Bot', 'Echoing Shot', 9], ['Bot Bot', 'Maximum Power', 20],
        ]);
        const ends = (name: string) => [bot(name).plus.lv0, bot(name).plus.values[0], bot(name).plus.values.at(-1)];
        expect(ends('Flame Bot')).toEqual(['1.5x', '1.6x', '3.5x']);
        expect(ends('Thunder Bot')).toEqual(['5%', '6%', '25%']);
        expect(ends('Golden Bot')).toEqual(['1.25x', '1.30x', '2.50x']);
        expect(ends('Amplify Bot')).toEqual(['3x', '4x', '12x']);
        expect(ends('Bot Bot')).toEqual(['1.25x', '1.30x', '2.25x']);
        expect(botPlusValue('Amplify Bot', 4)).toBe(7);
        expect(botPlusValue('Amplify Bot', 30)).toBe(12);       // past the max
        expect(botPlusValue('Golden Bot', 25)).toBeCloseTo(2.5, 9);
    });

    beforeEach(() => {
        useGameStore.setState({
            botData: {
                'Amplify Bot': { owned: true, medals: [5, 5, 5, 5], plusLv: 0 },
                'Bot Bot': { owned: true, medals: [], plusLv: 3 },     // old save: no Bot+ flag
            },
        });
    });

    it('unlocking Bot+ starts it at Lv 0 in every preset; locking clears it', () => {
        store().setBotPlusOwned('Amplify Bot', true);
        store().setBotPlusLevel('Amplify Bot', 1, 9);
        expect(botsForPreset(store().botData, 1)['Amplify Bot']).toMatchObject({ plusOwned: true, plusLv: 9 });
        expect(botsForPreset(store().botData, 0)['Amplify Bot']).toMatchObject({ plusOwned: true, plusLv: 0 });
        store().setBotPlusOwned('Amplify Bot', false);
        expect(botsForPreset(store().botData, 1)['Amplify Bot']).toMatchObject({ plusOwned: false, plusLv: 0 });
        expect(botsForPreset(store().botData, 1)['Amplify Bot'].medals).toEqual([5, 5, 5, 5]);
    });

    it('keeps an old save’s Bot+ unlocked after a preset sets it to Lv 0', () => {
        expect(isBotPlusOwned(store().botData['Bot Bot'])).toBe(true);
        store().setBotPlusLevel('Bot Bot', 0, 0);
        expect(botsForPreset(store().botData, 0)['Bot Bot']).toMatchObject({ plusOwned: true, plusLv: 0 });
    });

    it('locking a bot locks its Bot+ too', () => {
        store().setBotPlusOwned('Amplify Bot', true);
        store().setBotOwned('Amplify Bot', false);
        expect(isBotPlusOwned(store().botData['Amplify Bot'])).toBe(false);
    });
});
