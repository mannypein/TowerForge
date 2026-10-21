// Auto import: when an export read through TowerForge Link is imported,
// and what Link is asked for.

import { describe, expect, it } from 'vitest';
import { askNewerThan, AUTO_OFF, AUTO_REFRESH_MS, newestRunInExport, shouldImport } from './autoImport';
import { battle, makeExport } from '../test/makeExport';

const now = 1_800_000_000_000;
const at = (s: Partial<typeof AUTO_OFF>) => ({ ...AUTO_OFF, on: true, ...s });

describe('auto import', () => {
    it('finds the newest run in an export', () => {
        const raw = makeExport({ BattleHistory: [battle({ BattleDate: '2026-10-20T12:00:00.000Z' }), battle({ BattleDate: '2026-10-21T08:30:00.000Z' })] });
        expect(newestRunInExport(raw)).toBe(Date.parse('2026-10-21T08:30:00.000Z'));
        expect(newestRunInExport(makeExport())).toBe(0);
    });

    it('imports the first export, a new run right away, the rest every 10 minutes', () => {
        const run = Date.parse('2026-10-21T08:30:00.000Z');
        expect(shouldImport(at({}), run, run, now)).toBe(true);                                       // first one
        const recent = at({ seen: 100, imported: 100, importedAt: now - 60_000 });
        expect(shouldImport(recent, run + 1, run, now)).toBe(true);                                   // a run ended
        expect(shouldImport(recent, run, run, now)).toBe(false);                                      // mid-run save
        expect(shouldImport({ ...recent, importedAt: now - AUTO_REFRESH_MS }, run, run, now)).toBe(true);
    });

    it('asks Link only for newer exports, until a skipped one is due', () => {
        expect(askNewerThan(at({}), now)).toBeUndefined();                                           // nothing read yet
        expect(askNewerThan(at({ seen: 200, imported: 200, importedAt: now - 1000 }), now)).toBe(200);
        expect(askNewerThan(at({ seen: 300, imported: 200, importedAt: now - 1000 }), now)).toBe(300); // skipped, not due
        expect(askNewerThan(at({ seen: 300, imported: 200, importedAt: now - AUTO_REFRESH_MS }), now)).toBeUndefined();
    });
});
