// ============================================================
//  TowerForge Companion — Tournament history
//  Every tournament the player has played, from the export's
//  TournamentRecords (29.1.3+): number, day, league, wave and rank.
//  Kept across imports (each import adds the newest and updates any
//  that changed), and read for the Tournaments → History page: each
//  league's tournaments, the moves between leagues, and the numbers per
//  league. Waves are only compared within a league — each league's
//  enemies are a different strength.
//  Rank 0 = not placed yet (the tournament still running when the game
//  exported — the code's reading, docs/game-export-format.md).
//  Pure functions — no store imports.
// ============================================================

import type { League, TourneyRecord } from '../types/gameTypes';
import { GAME_LEAGUES } from '../constants/gameExportMaps';

export const LEAGUE_ORDER: readonly League[] = GAME_LEAGUES;
const leagueRank = (l: League) => LEAGUE_ORDER.indexOf(l);

export const placed = (r: TourneyRecord) => r.rank > 0;

// Kept records plus a fresh import's: one per tournament, the fresh one
// winning; oldest first.
export function mergeTourneyRecords(kept: TourneyRecord[], fresh: TourneyRecord[]): TourneyRecord[] {
    const byNumber = new Map<number, TourneyRecord>();
    for (const r of kept) byNumber.set(r.number, r);
    for (const r of fresh) byNumber.set(r.number, r);
    return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

// The leagues played, lowest first (each keeps its color: entity, not rank).
export function leaguesPlayed(recs: TourneyRecord[]): League[] {
    return [...new Set(recs.map(r => r.league))].filter(Boolean).sort((a, b) => leagueRank(a) - leagueRank(b));
}

// Runs of consecutive tournaments in one league (a line breaks where the
// player was in another league in between).
export function leagueStretches(recs: TourneyRecord[]): { league: League; recs: TourneyRecord[] }[] {
    const out: { league: League; recs: TourneyRecord[] }[] = [];
    for (const r of recs) {
        const last = out[out.length - 1];
        if (last && last.league === r.league) last.recs.push(r);
        else out.push({ league: r.league, recs: [r] });
    }
    return out;
}

export interface LeagueMove {
    number: number;
    date: number;
    from: League;
    to: League;
    up: boolean;
}

export function leagueMoves(recs: TourneyRecord[]): LeagueMove[] {
    const out: LeagueMove[] = [];
    for (let i = 1; i < recs.length; i++) {
        const a = recs[i - 1], b = recs[i];
        if (a.league !== b.league) out.push({ number: b.number, date: b.date, from: a.league, to: b.league, up: leagueRank(b.league) > leagueRank(a.league) });
    }
    return out;
}

export interface LeagueStats {
    league: League;
    count: number;
    first: number;
    last: number;
    bestWave: number;
    recentWave: number | null;   // average of the last 10 (placed or not)
    bestRank: number | null;     // placed only
    avgRank: number | null;
    recentRank: number | null;   // average of the last 10 placed
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function leagueStats(recs: TourneyRecord[]): LeagueStats[] {
    return leaguesPlayed(recs).map(league => {
        const own = recs.filter(r => r.league === league);
        const ranked = own.filter(placed);
        return {
            league,
            count: own.length,
            first: own[0].date,
            last: own[own.length - 1].date,
            bestWave: Math.max(...own.map(r => r.wave)),
            recentWave: avg(own.slice(-10).map(r => r.wave)),
            bestRank: ranked.length ? Math.min(...ranked.map(r => r.rank)) : null,
            avgRank: avg(ranked.map(r => r.rank)),
            recentRank: avg(ranked.slice(-10).map(r => r.rank)),
        };
    });
}
