// Every unique module and every bot the site knows has its game icon
// (import-icons.ps1 brings them in from the assets folder by name).

import { describe, expect, it } from 'vitest';
import { botIcon, moduleIcon } from './gameIcons';
import { UNIQUE_MODULES } from './moduleData';
import { BOTS_CONFIG } from './botData';

describe('game icons', () => {
    it('has an icon for every unique module', () => {
        const names = Object.values(UNIQUE_MODULES).flat().map(([name]) => name);
        expect(names.filter(n => !moduleIcon(n))).toEqual([]);
    });

    it('has an icon for every bot', () => {
        expect(BOTS_CONFIG.map(b => b.name).filter(n => !botIcon(n))).toEqual([]);
    });
});
