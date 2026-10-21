// TowerForge Link client: what the page gets back from the helper — the
// export with its time and emulator, the helper's own message, or nothing
// (helper not running). fetch is stubbed; no helper is needed.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportAge, LINK_URL, linkExport } from './linkClient';

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
        expect(r).toEqual({ ok: true, text: '{"VersionNumber":1}', modified: 1792290103, source: 'BlueStacks' });
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
