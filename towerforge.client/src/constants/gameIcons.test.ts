// Every unique module and every bot the site knows has its game icon
// (import-icons.ps1 brings them in from the assets folder by name), and
// so does every card (but Cash, not in the assets yet), released chip,
// UW and every Vault upgrade given a picture.

import { describe, expect, it } from 'vitest';
import { botIcon, cardIcon, chipIcon, moduleIcon, uwIcon, vaultIcon, VAULT_FILES } from './gameIcons';
import { UNIQUE_MODULES } from './moduleData';
import { BOTS_CONFIG } from './botData';
import { CARDS, UWS } from './gameData';
import { RELEASED_CHIPS } from './guardianData';

describe('game icons', () => {
    it('has an icon for every unique module', () => {
        const names = Object.values(UNIQUE_MODULES).flat().map(([name]) => name);
        expect(names.filter(n => !moduleIcon(n))).toEqual([]);
    });

    it('has an icon for every bot', () => {
        expect(BOTS_CONFIG.map(b => b.name).filter(n => !botIcon(n))).toEqual([]);
    });

    it('has an icon for every card but Cash', () => {
        expect(CARDS.map(([n]) => n).filter(n => !cardIcon(n))).toEqual(['Cash']);
    });

    it('has an icon for every released chip and UW', () => {
        expect(RELEASED_CHIPS.filter(c => !chipIcon(c.id)).map(c => c.name)).toEqual([]);
        expect(UWS.filter(u => !uwIcon(u.a)).map(u => u.a)).toEqual([]);
    });

    it('finds the picture for every Vault upgrade mapped to one', () => {
        expect(Object.keys(VAULT_FILES).map(Number).filter(id => !vaultIcon(id))).toEqual([]);
        expect(vaultIcon(1010, 1)).not.toBe(vaultIcon(1010, 4));   // Ad Gem Stack: 2× → 5×
    });
});
