// ============================================================
//  TowerForge Companion — TowerForge Link client
//  Talks to TowerForge Link, the small Windows helper that reads the
//  game's data export (tool_export.json) off an Android emulator with
//  the emulator's own adb (TowerForge.Link/, docs/towerforge-link.md).
//  The helper only listens on this PC; the file goes from the
//  emulator to this browser and is never uploaded.
// ============================================================

export const LINK_URL = 'http://localhost:47821';
export const LINK_DOWNLOAD = '/downloads/TowerForgeLink.exe';

export type LinkResult =
    | { ok: true; text: string; modified: number | null; source: string }
    | { ok: false; reason: 'unreachable' }                         // helper not running (or blocked)
    | { ok: false; reason: 'unchanged'; modified: number | null }  // not newer than `newerThan` (Link 0.2+)
    | { ok: false; reason: 'problem'; code: string; message: string };

// Chrome and Edge ask once before a site may reach apps on this PC
// (Local Network Access); naming the target lets them ask. Other
// browsers ignore the option.
function linkFetch(path: string, timeoutMs: number): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const init = { signal: ctrl.signal, cache: 'no-store', targetAddressSpace: 'loopback' } as RequestInit;
    return fetch(`${LINK_URL}${path}`, init).finally(() => clearTimeout(timer));
}

// The export, or why not. Reading it can take a few seconds (adb).
// newerThan (the file time of an export already read, unix seconds): Link
// 0.2+ answers 204 without the file when there's nothing newer; older
// versions ignore it and send the file anyway.
export async function linkExport(newerThan?: number): Promise<LinkResult> {
    let res: Response;
    try {
        res = await linkFetch(newerThan ? `/export?newerThan=${Math.floor(newerThan)}` : '/export', 90_000);
    } catch {
        return { ok: false, reason: 'unreachable' };
    }
    const modified = Number(res.headers.get('X-Export-Modified'));
    if (res.status === 204) {
        return { ok: false, reason: 'unchanged', modified: Number.isFinite(modified) && modified > 0 ? modified : null };
    }
    if (res.ok) {
        return {
            ok: true,
            text: await res.text(),
            modified: Number.isFinite(modified) && modified > 0 ? modified : null,
            source: res.headers.get('X-Export-Source') || 'your emulator',
        };
    }
    try {
        const body = await res.json() as { error?: string; message?: string };
        return { ok: false, reason: 'problem', code: body.error ?? 'failed', message: body.message ?? 'TowerForge Link couldn’t get your export.' };
    } catch {
        return { ok: false, reason: 'problem', code: 'failed', message: 'TowerForge Link couldn’t get your export.' };
    }
}

// "2 hours ago", for an export's file time (unix seconds).
export function exportAge(modified: number, now = Date.now()): string {
    const mins = Math.max(0, Math.floor((now / 1000 - modified) / 60));
    const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'} ago`;
    if (mins < 1) return 'just now';
    if (mins < 60) return unit(mins, 'minute');
    if (mins < 60 * 24) return unit(Math.floor(mins / 60), 'hour');
    return unit(Math.floor(mins / (60 * 24)), 'day');
}
