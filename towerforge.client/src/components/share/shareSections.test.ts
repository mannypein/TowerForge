// The share sections drawn as tiles: what's above zero, in the game's
// words, maxed in gold; the shown preset's workshop and Guardian. Made-up data.

import { describe, expect, it } from 'vitest';
import { guardianGroups, labsGroups, profileGroups, relicsGroups, workshopGroups } from './shareSections';
import { defaultGuardianData } from '../../engine/guardian';
import { CHIPS, chipById } from '../../constants/guardianData';
import type { SharedWorkshop } from '../../engine/shareApi';

const tile = (groups: ReturnType<typeof profileGroups>, label: string, name: string) =>
    groups.find(g => g.label === label)?.tiles.find(t => t.name === name);

describe('share sections', () => {
    it('Profile: build, leagues, tiers and the best wave on each tier', () => {
        const g = profileGroups({ build: 'eHP', league: 'Champion', currentLeague: 'Gold', highestTier: 12, completedTier: 11, tierWaves: { 10: 8100, 1: 6000, 12: 0 } });
        expect(tile(g, 'Account', 'League now')!.value).toBe('Gold');
        expect(g.find(x => x.label === 'Best wave by tier')!.tiles.map(t => t.name)).toEqual(['Tier 1', 'Tier 10']);   // in order, no zeros
        expect(tile(g, 'Best wave by tier', 'Tier 10')!.value).toBe('W8,100');
    });

    it('Workshop: the shown preset’s levels above zero, maxed in gold, and its enhancements', () => {
        const ws: SharedWorkshop = {
            presets: [{ attack: [3000, 99], defense: [], utility: [] }, { attack: [10], defense: [], utility: [] }],
            enh: { d: { attack: [50] }, u: { attack: [true] }, p: { 1: { attack: [5] } } },
            presetCount: 2,
        };
        const p0 = workshopGroups(ws, 0);
        expect(tile(p0, 'Attack', 'Damage')!.value).toBe('Lv 3,000');
        expect(tile(p0, 'Attack', 'Attack Speed')!.maxed).toBe(true);            // 99 of 99
        expect(tile(p0, 'Enhancements', 'Damage (Attack)')!.value).toBe('×1.50');
        const p1 = workshopGroups(ws, 1);
        expect(tile(p1, 'Attack', 'Damage')!.value).toBe('Lv 10');
        expect(tile(p1, 'Enhancements', 'Damage (Attack)')!.value).toBe('×1.05');   // the preset's own enhancement levels
    });

    it('Labs and Relics: only what’s there', () => {
        const labs = labsGroups({ levels: { 'Game Speed': 7, 'Labs Speed': 40 } });
        const main = labs.find(g => g.label === 'Main Research')!;
        expect(main.tiles.map(t => t.name)).toEqual(['Game Speed', 'Labs Speed']);
        expect(main.tiles[0].maxed).toBe(true);
        expect(main.note).toBe('2 researched · 1 maxed');
        expect(tile(relicsGroups({ totals: { rDmg: 50 } }), 'Attack', 'Damage')!.value).toBe('+50%');
    });

    it('Guardian: the equipped chips with their stats, then what’s owned', () => {
        const g = defaultGuardianData();
        const attack = chipById('attack');
        const levels = Array(CHIPS.length * 3).fill(0);
        levels[attack.index * 3] = 3;
        const guardian = { ...g, unlocked: true, presets: [{ name: 'P', extraSlots: 0, chips: [attack.index, -1, -1], levels }] };
        const groups = guardianGroups({ guardian, presetCount: 2 }, 0);
        expect(groups[0].label).toBe('Attack');
        expect(groups[0].tiles[0].note).toBe(`Lv 3 / ${attack.stats[0].max}`);
        expect(tile(groups, 'Guardian', 'Chip slots')!.value).toBe('1');
        expect(guardianGroups({ guardian: g, presetCount: 2 }, 0)).toEqual([]);   // not unlocked
    });
});
