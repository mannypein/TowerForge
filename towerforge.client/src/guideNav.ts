// ============================================================
//  TowerForge Companion — opening the Import Guide at a section
//  Links from the Link setup and the welcome guide open the Import
//  Guide tab in place and scroll to the part that fits
//  (components/tabs/ImportGuideTab.tsx). A section asked for before the
//  tab has mounted waits here; one asked for while it's open arrives
//  as an event.
// ============================================================

import { useGameStore } from './store/useGameStore';

let pending: string | null = null;
export const GUIDE_EVENT = 'tf-guide-section';

export function openGuide(section: string): void {
    pending = section;
    useGameStore.getState().setActiveTab('importguide');
    window.dispatchEvent(new CustomEvent(GUIDE_EVENT, { detail: section }));
}

// The section asked for before the guide opened (once).
export function takeGuideSection(): string | null {
    const s = pending;
    pending = null;
    return s;
}
