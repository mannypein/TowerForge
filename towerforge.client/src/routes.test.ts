// Tab addresses: every tab has its own path, every path opens its tab,
// no tab takes a path the server uses itself, and the sitemap lists them.

import { describe, expect, it } from 'vitest';
import { RESERVED_PATHS, TAB_PATHS, tabFromPath } from './routes';
import type { TabName } from './types/gameTypes';
import sitemap from '../public/sitemap.xml?raw';

describe('tab addresses', () => {
    const entries = Object.entries(TAB_PATHS) as [TabName, string][];

    it('give every tab its own one-level path, Profile the home page', () => {
        const paths = entries.map(([, p]) => p);
        expect(new Set(paths).size).toBe(paths.length);
        expect(TAB_PATHS.profile).toBe('/');
        for (const p of paths) expect(p).toMatch(/^\/[a-z-]*$/);
    });

    it('open the tab they name, in any case and with a trailing slash', () => {
        for (const [tab, path] of entries) expect(tabFromPath(path)).toBe(tab);
        expect(tabFromPath('/Creators/')).toBe('creators');
        expect(tabFromPath('')).toBe('profile');
    });

    it('take the old tab ids and long names too, and nothing else', () => {
        expect(tabFromPath('/whatif')).toBe('whatif');
        expect(tabFromPath('/runcoins')).toBe('runcoins');
        expect(tabFromPath('/creator-codes')).toBe('creators');
        expect(tabFromPath('/import')).toBe('importguide');
        expect(tabFromPath('/nope')).toBeNull();
        expect(tabFromPath('/creators/extra')).toBeNull();
    });

    it('never take a path the server uses', () => {
        for (const [, path] of entries) {
            expect(RESERVED_PATHS.some(r => path === r || path.startsWith(`${r}/`))).toBe(false);
        }
    });

    // Search engines get every tab but the personal ones.
    it('are all in the sitemap, except Share and Account', () => {
        const listed = [...sitemap.matchAll(/<loc>https:\/\/towerforge\.net(\/[^<]*)<\/loc>/g)].map(m => m[1]);
        const wanted = entries.filter(([tab]) => !['share', 'account'].includes(tab)).map(([, p]) => p);
        expect(listed).toEqual(wanted);
    });
});
