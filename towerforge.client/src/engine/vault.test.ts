// The Vault's key costs. Anchor: the owner's export (2026-10-25) — its
// 20 upgrade levels and 9 unlocked sections cost exactly the file's
// TotalKeysSpent, 810 keys, with 5 keys left of 815 earned.

import { describe, expect, it } from 'vitest';
import { VAULT_SECTIONS } from '../constants/vaultData';
import { sectionUnlocked, vaultCardSlots, vaultKeys } from './vault';

const OWNER_LEVELS = {
    600: 5, 610: 3, 670: 3, 1000: 1, 1010: 1, 1200: 4, 1220: 1, 1230: 1, 1240: 1, 1250: 1,
    1620: 1, 1640: 1, 1800: 3, 1805: 1, 1810: 4, 2000: 3, 2005: 1, 2020: 1, 2200: 3, 2205: 1,
};
const OWNER_GROUPS = [100, 2000, 110, 1030, 120, 130, 140, 150, 160];
const owner = { ...OWNER_LEVELS, ...Object.fromEntries(OWNER_GROUPS.map(g => [`g${g}`, 1])) };

describe('vault keys', () => {
    it('adds up to the owner’s TotalKeysSpent', () => {
        expect(vaultKeys(owner).spent).toBe(810);
        expect(vaultKeys(owner, 'harmony').spent + vaultKeys(owner, 'power').spent + vaultKeys(owner, 'enemy').spent).toBe(810);
    });

    it('counts a section as unlocked when something in it is bought', () => {
        const powerUW = VAULT_SECTIONS.find(s => s.group === 1030)!;
        expect(sectionUnlocked({}, powerUW)).toBe(false);
        expect(sectionUnlocked({ 600: 1 }, powerUW)).toBe(true);
        expect(vaultKeys({ 600: 1 }, 'power').spent).toBe(25 + 5);   // the unlock, then level 1
    });

    it('prices an Enemy section once for its three enemies', () => {
        const all = vaultKeys({}, 'enemy');
        // 50 + 100 + 150 to unlock, then 36 upgrades × 30 levels on one ladder (1,662 keys each, the wiki's total)
        expect(all.spent).toBe(0);
        expect(all.toMax).toBe(300 + 36 * 1662);
    });

    it('takes the card slots bought in the Vault', () => {
        expect(vaultCardSlots(owner)).toBe(4);
        expect(vaultCardSlots({ 1200: 9 })).toBe(6);   // 6 levels at most
        expect(vaultCardSlots(undefined)).toBe(0);
    });
});
