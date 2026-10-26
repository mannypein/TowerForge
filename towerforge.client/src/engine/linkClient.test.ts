// TowerForge Link client: what the page gets back from the helper — the
// export with its time and emulator, the helper's own message, or nothing
// (helper not running). fetch is stubbed; no helper is needed.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSource, exportAge, LINK_URL, linkExport, linkSources } from './linkClient';
import type { LinkSource } from './linkClient';

afterEach(() => vi.unstubAllGlobals());

describe('TowerForge Link client', () => {
    it('returns the export with its time and source', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"VersionNumber":1}', {
            status: 200,
            headers: { 'X-Export-Modified': '1792290103', 'X-Export-Source': 'BlueStacks' },
        }));
        vi.stubGlobal('fetch', fetchMock);
        const r = await linkExport();
        expect(fetchMock.mock.calls[0][0]).toBe(`${LINK_URL}/export`);
        expect(r).toEqual({ ok: true, text: '{"VersionNumber":1}', modified: 1792290103, source: 'BlueStacks', sourceId: null });
    });

    // Link 0.4: more than one emulator or phone — the player picks one.
    it('asks for the picked source and lists where exports are', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {
            status: 200, headers: { 'X-Export-Source': 'MuMu Player', 'X-Export-Source-Id': 'mumuplayer:16384' },
        }));
        vi.stubGlobal('fetch', fetchMock);
        const r = await linkExport(1792290103, 'mumuplayer:16384');
        expect(fetchMock.mock.calls[0][0]).toBe(`${LINK_URL}/export?newerThan=1792290103&source=mumuplayer%3A16384`);
        expect(r.ok && r.sourceId).toBe('mumuplayer:16384');

        const sources: LinkSource[] = [
            { id: 'bluestacks:5555', name: 'BlueStacks', kind: 'emulator', state: 'ready', modified: 200 },
            { id: 'mumuplayer:16384', name: 'MuMu Player', kind: 'emulator', state: 'offline', message: 'MuMu Player is running but…' },
        ];
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ sources }), { status: 200 })));
        expect(await linkSources()).toEqual(sources);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"not_found"}', { status: 404 })));
        expect(await linkSources()).toBeNull();   // Link 0.3: no list
    });

    it('offers the remembered source, else the newest export', () => {
        const s = (id: string, state: LinkSource['state'], modified?: number): LinkSource => ({ id, name: id, kind: 'emulator', state, modified });
        const list = [s('a:1', 'ready', 100), s('b:2', 'ready', 300), s('c:3', 'offline')];
        expect(defaultSource(list, null)).toBe('b:2');
        expect(defaultSource(list, 'a:1')).toBe('a:1');
        expect(defaultSource(list, 'c:3')).toBe('b:2');   // remembered but not ready
        expect(defaultSource([s('c:3', 'offline')], null)).toBeNull();
    });

    it('passes on the helper’s own message', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
            JSON.stringify({ error: 'no_export', message: 'The Tower on BlueStacks has no data export yet.' }),
            { status: 409 },
        )));
        expect(await linkExport()).toEqual({
            ok: false, reason: 'problem', code: 'no_export', message: 'The Tower on BlueStacks has no data export yet.',
        });
    });

    it('asks only for a newer export, and says when there isn’t one', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { 'X-Export-Modified': '1792290103' } }));
        vi.stubGlobal('fetch', fetchMock);
        expect(await linkExport(1792290103)).toEqual({ ok: false, reason: 'unchanged', modified: 1792290103 });
        expect(fetchMock.mock.calls[0][0]).toBe(`${LINK_URL}/export?newerThan=1792290103`);
    });

    it('says when the helper isn’t running', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        expect(await linkExport()).toEqual({ ok: false, reason: 'unreachable' });
    });

    it('describes how old an export is', () => {
        const now = 1_800_000_000_000;
        expect(exportAge(now / 1000 - 30, now)).toBe('just now');
        expect(exportAge(now / 1000 - 60, now)).toBe('1 minute ago');
        expect(exportAge(now / 1000 - 3 * 3600, now)).toBe('3 hours ago');
        expect(exportAge(now / 1000 - 86400, now)).toBe('1 day ago');
    });
});
