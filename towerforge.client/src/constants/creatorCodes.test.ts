// Checks on the creator list, so a typo when adding a creator or a
// link shows up before it reaches the site.

import { describe, expect, it } from 'vitest';
import { CREATORS, CREATOR_SITES, creatorSlug } from './creatorCodes';
import type { CreatorSite } from './creatorCodes';

// The address each link should point at, per site.
const HOSTS: Record<CreatorSite, RegExp> = {
    youtube: /^(www\.)?youtube\.com$/,
    twitch: /^(www\.)?twitch\.tv$/,
    kick: /^(www\.)?kick\.com$/,
    tiktok: /^(www\.)?tiktok\.com$/,
    discord: /^(discord\.gg|(www\.)?discord\.com)$/,
    reddit: /^(www\.)?reddit\.com$/,
    x: /^(www\.)?(x|twitter)\.com$/,
    website: /./,
};

describe('creator codes', () => {
    it('has every creator once, with a code, name and player ID', () => {
        const codes = CREATORS.map(c => c.code.toLowerCase());
        expect(new Set(codes).size).toBe(codes.length);
        for (const c of CREATORS) {
            expect(c.code.trim()).toBe(c.code);
            expect(c.code).not.toBe('');
            expect(c.player.trim()).not.toBe('');
            expect(c.playerId).toMatch(/^[0-9A-F]{1,16}$/);
        }
    });

    it('links each creator only to https pages on the named site', () => {
        for (const c of CREATORS) {
            for (const [site, url] of Object.entries(c.links)) {
                expect(Object.keys(CREATOR_SITES)).toContain(site);
                const u = new URL(url!);
                expect(u.protocol, `${c.code} ${site}`).toBe('https:');
                expect(u.hostname, `${c.code} ${site}`).toMatch(HOSTS[site as CreatorSite]);
            }
        }
    });

    it('has a profile picture for every YouTube link, and no leftovers', () => {
        // Missing one? Run "npm run creator-avatars".
        const pictures = Object.keys(import.meta.glob('../assets/creators/*.{jpg,png,webp}'))
            .map(path => path.split('/').pop()!.replace(/\.\w+$/, '')).sort();
        const youtube = CREATORS.filter(c => c.links.youtube).map(c => creatorSlug(c.code)).sort();
        expect(pictures).toEqual(youtube);
    });
});
