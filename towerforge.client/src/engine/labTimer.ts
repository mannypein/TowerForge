// ============================================================
//  TowerForge Companion — Lab timers
//  When a lab being researched really finishes. The export's
//  ResearchCompleteDate is the finish at normal speed; a speed-up (×k,
//  with s seconds of it left as of ExportedAt) runs the research k times
//  as fast while it lasts, and the in-game timer counts the normal-speed
//  time left, k seconds a second.
//  Checked 2026-10-21 on the owner's account: a Labs screenshot 37m21s
//  after the export (each speed-up timer 37m21s lower) showed the ×6 labs'
//  timers 6 × 37m21s lower and the ×5 lab's 5 × 37m21s, to within 7 s
//  (anchors in labTimer.test.ts).
//  Pure functions — no store imports.
// ============================================================

import type { LabRunning } from '../types/gameTypes';

const sec = (ms: number) => ms / 1000;

// Normal-speed seconds left at `now`, as the game's timer shows it.
export function labTimerLeft(r: LabRunning, now: number): number | null {
    if (r.doneAt === null) return null;
    if (r.exportedAt === null || r.speedUp <= 1 || r.speedUpLeftSec <= 0) return Math.max(0, sec(r.doneAt - now));
    const base = sec(r.doneAt - r.exportedAt);
    const since = Math.max(0, sec(now - r.exportedAt));
    const fast = Math.min(since, r.speedUpLeftSec);
    return Math.max(0, base - r.speedUp * fast - (since - fast));
}

// When it really finishes (ms): the speed-up's share at ×k, the rest at ×1.
export function labFinishAt(r: LabRunning): number | null {
    if (r.doneAt === null) return null;
    if (r.exportedAt === null || r.speedUp <= 1 || r.speedUpLeftSec <= 0) return r.doneAt;
    const base = sec(r.doneAt - r.exportedAt);
    if (base <= 0) return r.doneAt;
    const k = r.speedUp, s = r.speedUpLeftSec;
    const real = base <= k * s ? base / k : s + (base - k * s);
    return r.exportedAt + real * 1000;
}
