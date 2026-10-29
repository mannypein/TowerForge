// ============================================================
//  TowerForge Companion — What If handoff
//  Another page (Ask AI's "Open in What If") hands What If a set of changes
//  and a mode; What If takes them once, when it opens. Kept in session
//  storage so the hand-off survives the tab switch and nothing else.
// ============================================================

import type { Change } from '../../engine/whatIf';

const KEY = 'tc_whatif_handoff';

export interface WhatIfHandoff {
    changes: Change[];
    tournament: boolean;
}

export function handOffToWhatIf(h: WhatIfHandoff): void {
    try { sessionStorage.setItem(KEY, JSON.stringify(h)); } catch { /* opens empty */ }
}

// The changes handed over, once (then cleared); null when there are none.
export function takeWhatIfHandoff(): WhatIfHandoff | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        const h = raw ? JSON.parse(raw) as WhatIfHandoff : null;
        return h && Array.isArray(h.changes) && h.changes.length ? h : null;
    } catch {
        return null;
    }
}
