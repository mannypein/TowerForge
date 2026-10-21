// Tournament history: records kept across imports, leagues, moves between
// them and the numbers per league (made-up records).

import { describe, expect, it } from 'vitest';
import { leagueMoves, leagueStats, leagueStretches, leaguesPlayed, mergeTourneyRecords } from './tourneyHistory';
import type { League, TourneyRecord } from '../types/gameTypes';

const rec = (number: number, league: League, wave: number, rank: number): TourneyRecord =>
    ({ number, date: Date.UTC(2026, 0, 1) + number * 3.5 * 86400_000, league, wave, rank });

const history = [
    rec(1, 'Legend', 400, 8), rec(2, 'Legend', 420, 3), rec(3, 'Mythic', 120, 25),
    rec(4, 'Legend', 450, 2), rec(5, 'Mythic', 130, 20), rec(6, 'Mythic', 150, 12), rec(7, 'Mythic', 1, 0),
];

describe('tournament history', () => {
    it('keeps one record per tournament, the newest import winning', () => {
        const merged = mergeTourneyRecords([rec(1, 'Legend', 400, 8), rec(2, 'Legend', 1, 0)], [rec(2, 'Legend', 420, 3), rec(3, 'Mythic', 120, 25)]);
        expect(merged.map(r => [r.number, r.wave])).toEqual([[1, 400], [2, 420], [3, 120]]);
    });

    it('lists leagues lowest first and the moves between them', () => {
        expect(leaguesPlayed(history)).toEqual(['Legend', 'Mythic']);
        expect(leagueMoves(history).map(m => [m.number, m.to, m.up])).toEqual([[3, 'Mythic', true], [4, 'Legend', false], [5, 'Mythic', true]]);
        expect(leagueStretches(history).map(s => [s.league, s.recs.length])).toEqual([['Legend', 2], ['Mythic', 1], ['Legend', 1], ['Mythic', 3]]);
    });

    it('sums up each league (ranks only where placed)', () => {
        const [legend, mythic] = leagueStats(history);
        expect(legend).toMatchObject({ league: 'Legend', count: 3, bestWave: 450, bestRank: 2 });
        expect(legend.avgRank).toBeCloseTo(13 / 3);
        expect(mythic).toMatchObject({ league: 'Mythic', count: 4, bestWave: 150, bestRank: 12 });
        expect(mythic.avgRank).toBeCloseTo(19);
    });
});
