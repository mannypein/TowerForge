// ============================================================
//  TowerForge Companion — Tournament settings (per viewer)
//  What the Tournament page and What If's tournament mode share: the
//  league, this week's battle conditions, and the build used for
//  tournaments (site preset and module loadout). A convenience for this
//  browser only (localStorage); each tournament run's own conditions are
//  account data (store: tourneyLog).
// ============================================================

import type { League } from '../../types/gameTypes';
import type { HeatKey } from '../../constants/tournamentData';
import type { Ticks } from '../../engine/tournamentModel';

export type { Ticks };

export interface TourneySim {
    league: League;
    week: Ticks;        // in this week's tournament
    recent: Ticks;      // the last tournament's, before runs had their own (fallback)
    preset?: number;    // site preset used for tournaments
    loadout?: string;   // module loadout used for tournaments
}

const SIM_KEY = 'tc_tourney_sim';
const EMPTY: TourneySim = { league: '', week: {}, recent: {} };

export function loadTourneySim(): TourneySim {
    try {
        const raw = localStorage.getItem(SIM_KEY);
        const s = raw ? JSON.parse(raw) : null;
        return s ? { ...EMPTY, ...s, week: s.week ?? {}, recent: s.recent ?? {} } : EMPTY;
    } catch {
        return EMPTY;
    }
}

export function saveTourneySim(s: TourneySim): void {
    try { localStorage.setItem(SIM_KEY, JSON.stringify(s)); } catch { /* private window: not remembered */ }
}

export const ticksOf = (keys: string[] | undefined): Ticks =>
    Object.fromEntries((keys ?? []).map(k => [k, true])) as Ticks;

export const keysOf = (t: Ticks): HeatKey[] =>
    (Object.entries(t) as [HeatKey, boolean][]).filter(([, on]) => on).map(([k]) => k);
