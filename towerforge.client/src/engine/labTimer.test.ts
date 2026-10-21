// Lab timers: a speed-up runs the research k times as fast while it lasts.
// Anchors: the owner's export (2026-10-21 17:54:16.748 UTC) against their
// Labs screen taken 2,241 s later (each speed-up timer 37m21s lower).

import { describe, expect, it } from 'vitest';
import { labFinishAt, labTimerLeft } from './labTimer';
import type { LabRunning } from '../types/gameTypes';

const exportedAt = Date.parse('2026-10-21T17:54:16.748Z');
const lab = (doneAt: string, speedUp: number, speedUpLeftSec: number): LabRunning =>
    ({ lab: null, labIndex: 0, doneAt: Date.parse(doneAt), speedUp, speedUpLeftSec, exportedAt });
const dhms = (d: number, h: number, m: number, s: number) => ((d * 24 + h) * 60 + m) * 60 + s;

describe('lab timers', () => {
    it('match the game’s Labs screen (the timer counts k seconds a second during a speed-up)', () => {
        const shot = exportedAt + 2241 * 1000;
        const screen: [LabRunning, number][] = [
            [lab('2026-11-18T16:25:41.919Z', 5, 48345.79), dhms(27, 19, 24, 46)],     // Assist Module Bonus - Cannon
            [lab('2026-11-25T09:13:44.902Z', 6, 46533.125), dhms(34, 11, 35, 28)],    // … - Core
            [lab('2026-11-01T16:32:54.527Z', 6, 52680.0625), dhms(10, 18, 54, 38)],   // … - Generator
            [lab('2026-11-01T14:40:40.715Z', 6, 45666.7), dhms(10, 17, 2, 24)],       // Enemy Balance Mastery
        ];
        for (const [r, shown] of screen) expect(Math.abs(labTimerLeft(r, shot)! - shown)).toBeLessThan(10);
    });

    it('finishes early by what the speed-up saves', () => {
        // 10 h of research, ×2 for 2 h: 4 h of it in those 2 h, the other 6 h at ×1 → 8 h.
        const r: LabRunning = { lab: null, labIndex: 0, doneAt: exportedAt + 10 * 3600_000, speedUp: 2, speedUpLeftSec: 7200, exportedAt };
        expect(labFinishAt(r)).toBe(exportedAt + 8 * 3600_000);
        // All of it inside the speed-up: 1 h of research at ×2 → 30 min.
        expect(labFinishAt({ ...r, doneAt: exportedAt + 3600_000 })).toBe(exportedAt + 1800_000);
        // No speed-up: the game's date.
        expect(labFinishAt({ ...r, speedUp: 0, speedUpLeftSec: 0 })).toBe(r.doneAt);
        // The Cannon lab above: 25d 16h 48m 22s after the export, not 27d 22h 31m.
        const cannon = lab('2026-11-18T16:25:41.919Z', 5, 48345.79);
        expect(Math.round((labFinishAt(cannon)! - exportedAt) / 1000)).toBe(dhms(25, 16, 48, 22));
    });
});
