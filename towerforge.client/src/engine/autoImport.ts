// ============================================================
//  TowerForge Companion — Auto import (decisions)
//  The game (29.1.3+) can write its data export every time it saves
//  (Settings → External Tools Export → Auto). With Auto import on, the
//  site asks TowerForge Link every 30 seconds while it's open and reads
//  the newest export. The game saves often during a run, so an export is
//  imported:
//   • right away when it has a run the site doesn't have yet (a run
//     ended — new deaths, coins per run, damage by source);
//   • otherwise at most every 10 minutes (currencies, levels), so a
//     signed-in account isn't re-saved after every game save.
//  An export that was skipped is read again once the 10 minutes are up.
//  Pure functions — no store imports.
// ============================================================

export const AUTO_POLL_MS = 30_000;
export const AUTO_REFRESH_MS = 10 * 60_000;

// Remembered per browser (localStorage tc_link_auto).
export interface AutoImportState {
    on: boolean;
    seen: number;        // file time (unix s) of the newest export read
    imported: number;    // file time of the newest export imported
    importedAt: number;  // when that was (ms)
}

export const AUTO_OFF: AutoImportState = { on: false, seen: 0, imported: 0, importedAt: 0 };

// The newest run in an export (ms; 0 when it has none).
export function newestRunInExport(raw: Record<string, unknown>): number {
    const runs = Array.isArray(raw.BattleHistory) ? raw.BattleHistory as Record<string, unknown>[] : [];
    return runs.reduce((t, r) => Math.max(t, typeof r?.BattleDate === 'string' ? Date.parse(r.BattleDate) || 0 : 0), 0);
}

// What to ask Link for: only a newer export (its file time), or the
// newest one again when a skipped export is due (undefined).
export function askNewerThan(s: AutoImportState, now: number): number | undefined {
    const pending = s.seen > s.imported;
    const due = now - s.importedAt >= AUTO_REFRESH_MS;
    return pending && due ? undefined : s.seen || undefined;
}

// Whether to import an export just read: the first one, one with a run
// the site doesn't have yet, or once the refresh time is up.
export function shouldImport(s: AutoImportState, fileNewestRun: number, siteNewestRun: number, now: number): boolean {
    return s.imported === 0 || fileNewestRun > siteNewestRun || now - s.importedAt >= AUTO_REFRESH_MS;
}
