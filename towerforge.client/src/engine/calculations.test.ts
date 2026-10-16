// Tests for calculation helpers, anchored on numbers read off in-game
// screens (module cards, card values) so a formula change that breaks
// them shows up here.

import { describe, expect, it } from 'vitest';
import { calcModuleDamageMult } from './towerDamage';
import { activeLoadout, enhForPreset, masteredCardMult, uniqueTier } from './statHelpers';
import { DEFAULT_RUN_RATES, runRatesFrom } from './runRates';
import { parseGameExport } from './gameExport';
import { moduleMaxLevel } from '../constants/moduleRarities';
import { UNIQUE_MODULES } from '../constants/moduleData';
import type { Loadout, ModuleEntry, ModuleRarity, ModuleState, ModuleType } from '../types/gameTypes';
import { battle, makeExport } from '../test/makeExport';

const mod = (type: ModuleType, rarity: ModuleRarity, mainMult = 0): ModuleEntry =>
    ({ id: 'm', name: 'Test', type, rarity, subs: [], mainMult });

describe('module main effect (×value on the module card)', () => {
    // Real module cards: rarity + slot level → the ×value the card shows.
    it.each([
        ['cannon', 'A5', 217, 23.37],
        ['armor', 'A', 202, 16.24],
        ['generator', 'A5', 216, 2.476],
        ['core', 'A5', 216, 29.86],
    ] as const)('%s %s at Lv %i shows ×%f', (type, rarity, level, shown) => {
        expect(calcModuleDamageMult(mod(type, rarity), level)).toBeCloseTo(shown, 2);
    });

    it('stops at the rarity level cap', () => {
        const capped = calcModuleDamageMult(mod('cannon', 'A'), moduleMaxLevel('A'));
        expect(calcModuleDamageMult(mod('cannon', 'A'), moduleMaxLevel('A') + 50)).toBe(capped);
    });

    it('uses the ×value typed in from the card when there is one', () => {
        expect(calcModuleDamageMult(mod('cannon', 'L', 12.5), 100)).toBe(12.5);
        expect(calcModuleDamageMult(null, 100)).toBe(1);
    });
});

describe('unique effect tiers', () => {
    it('maps rarities to the tier unique effects scale with', () => {
        expect(uniqueTier('Ep')).toBe('Epic');
        expect(uniqueTier('Lp')).toBe('Legendary');
        expect(uniqueTier('M')).toBe('Mythic');
        expect(uniqueTier('A3')).toBe('Ancestral');
        expect(uniqueTier('R')).toBeNull();
    });

    it('Infinity Threshold goes 1000 / 2000 / 3000 / 4000', () => {
        const it_ = UNIQUE_MODULES.generator.find(([n]) => n === 'Infinity Threshold')!;
        expect(it_[2]).toEqual({ Epic: 1000, Legendary: 2000, Mythic: 3000, Ancestral: 4000 });
    });
});

describe('card mastery', () => {
    it('scales the card bonus, not the whole multiplier', () => {
        // Coins card ×1.45 with mastery ×1.30 → +45% × 1.3 = +58.5%.
        expect(masteredCardMult(1.45, 1.3)).toBeCloseTo(1.585, 10);
        expect(masteredCardMult(1.45, null)).toBe(1.45);
        expect(masteredCardMult(0, 1.3)).toBe(1);
    });
});

describe('presets and loadouts', () => {
    const lo = (id: string): Loadout => ({
        id, name: id,
        slots: { cannon: { main: '', assist: '' }, armor: { main: '', assist: '' }, generator: { main: '', assist: '' }, core: { main: '', assist: '' } },
    });
    const state = (activeLoadoutId?: string): ModuleState =>
        ({ library: [], loadouts: [lo('a'), lo('b')], activeLoadout: activeLoadoutId, assistData: {}, slotLevels: {} as ModuleState['slotLevels'] });

    it('calculates with the equipped loadout, else the first', () => {
        expect(activeLoadout(state('b'))!.id).toBe('b');
        expect(activeLoadout(state())!.id).toBe('a');
        expect(activeLoadout(state('gone'))!.id).toBe('a');
    });

    it("uses a preset's own enhancement levels when it has them", () => {
        const enh = { d: { attack: [1] }, u: {}, p: { 1: { attack: [9] } } };
        expect(enhForPreset(enh, 1).d.attack).toEqual([9]);
        expect(enhForPreset(enh, 0).d.attack).toEqual([1]);
    });
});

describe('run rates from a battle report', () => {
    it('falls back to typical values without a report', () => {
        expect(runRatesFrom(null)).toBe(DEFAULT_RUN_RATES);
    });

    it('turns battle counts into per-second rates and shares', () => {
        const [report] = parseGameExport(makeExport({
            BattleHistory: [battle({
                GameTime: 1000, Wave: 50, TotalEnemies: 8000,
                TotalBoss: 5, TotalCommanders: 3, TotalElites: 70, RecoveryPackages: 30,
                CashEarned: 1e10, EnemiesHitByChainLightningThisRound: 4000,
                EnemiesHitByPoisonSwampThisRound: 20000, DestroyedInBlackhole: 2000, OrbHits: 8000,
            })],
        })).battles;
        const r = runRatesFrom(report);
        expect(r.source).toBe('report');
        expect(r.waveSec).toBe(20);
        expect(r.killsPerSec).toBe(8);
        expect(r.bossFleetPerSec).toBeCloseTo(0.008, 10);
        expect(r.elitePerSec).toBeCloseTo(0.07, 10);
        expect(r.packagesPerSec).toBeCloseTo(0.03, 10);
        expect(r.cashDigits).toBeCloseTo(10, 10);
        expect(r.clHitsPerEnemy).toBe(0.5);
        expect(r.poisonedShare).toBe(1);        // capped at every enemy
        expect(r.bhShare).toBe(0.25);
        expect(r.orbHitsPerEnemy).toBe(1);
    });
});
