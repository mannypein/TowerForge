// Bots keep their medal and Bot+ levels per preset, like in game; owning
// a bot is account-wide. Runs the real store (localStorage writes fail
// quietly outside a browser).

import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './useGameStore';
import { botsForPreset, isBotEntryOwned } from '../constants/botData';

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
