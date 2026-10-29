// Ask AI test bench: the grader (numbers, routes, headlines, links) and
// the made-up accounts it runs on.

import { describe, expect, it } from 'vitest';
import { parseGameExport } from '../../engine/gameExport';
import { BENCH_ACCOUNTS } from './benchAccounts';
import { BENCH_QUESTIONS } from './benchQuestions';
import { badLinks, gradeHeadline, gradeRoute, wordIssues } from './benchGrade';
import { numbersIn, unverifiedNumbers } from '../aiCheck';
import type { RouteChoice } from '../aiAssistant';

const route = (r: Partial<RouteChoice>): RouteChoice => ({
    tool: 'none', currency: 'any', goal: 'default', changes: [], search: '', runs: 'any', tier: 0, budget: 0, ...r,
});
const question = (id: string) => BENCH_QUESTIONS.find(q => q.id === id)!;

describe('numbers in an answer', () => {
    it('reads game letters (q is less than Q), percentages and waves', () => {
        expect(numbersIn('4.67Q coins, 61.00K, 3q, +5.7 waves to W8,600 (23%)').map(n => n.value))
            .toEqual([4.67e18, 61e3, 3e15, 5.7, 8600, 23]);
    });

    it('skips dates and list markers', () => {
        expect(numbersIn('1. Damage on 2026-10-24T09:00:00Z').map(n => n.value)).toEqual([]);
    });

    it('lists numbers found nowhere in the data, allowing rounding and small counts', () => {
        const data = 'Headline: ... gives about +4.24 waves, for 3,450 stones. Coins per hour: 97.93q.';
        expect(unverifiedNumbers('About +4.2 waves for 3,450 stones (98q coins an hour), top 3 picks.', data, 'q')).toEqual([]);
        expect(unverifiedNumbers('About +42 waves for 1,042 stones.', data, 'q')).toEqual(['42', '1,042']);
        // A number from the question is fine ("I have 500 stones").
        expect(unverifiedNumbers('With your 500 stones…', data, 'I have 500 stones')).toEqual([]);
    });
});

describe('route', () => {
    it('passes the right tool and fields', () => {
        expect(gradeRoute(question('stones-tourney'), 'late', route({ tool: 'upgrades', currency: 'stones', runs: 'tournament', budget: 500 }))).toEqual([]);
    });

    it('says what is wrong', () => {
        expect(gradeRoute(question('stones-tourney'), 'late', route({ tool: 'upgrades', currency: 'stones', runs: 'any', budget: 0 })))
            .toEqual(['runs any, wanted tournament', 'budget 0, wanted 500']);
        expect(gradeRoute(question('runs-damage'), 'mid', route({ tool: 'guide' }))).toEqual(['tool guide, wanted runs']);
    });

    it('checks each named upgrade and the tier for the account', () => {
        expect(gradeRoute(question('whatif-compare'), 'mid', route({ tool: 'what_if', changes: [{ upgrade: 'BH duration', level: 'max' }, { upgrade: 'golden tower multiplier', level: 'max' }] }))).toEqual([]);
        expect(gradeRoute(question('whatif-compare'), 'mid', route({ tool: 'what_if', changes: [{ upgrade: 'black hole duration', level: 'max' }] }))[0])
            .toMatch(/no change names golden tower/);
        expect(gradeRoute(question('tier-next'), 'mid', route({ tool: 'tier', tier: 12 }))).toEqual([]);
        expect(gradeRoute(question('tier-next'), 'late', route({ tool: 'tier', tier: 0 }))).toEqual([]);
        expect(gradeRoute(question('tier-next'), 'late', route({ tool: 'tier', tier: 18 }))).toEqual(['tier 18, wanted 0 or 19 or 20']);
        expect(gradeRoute(question('whatif-cf-follow'), 'late', route({ tool: 'what_if', changes: [{ upgrade: 'Death Wave', level: 'max' }, { upgrade: 'chrono field', level: 'max' }] })))
            .toEqual(['still asks about death wave']);
    });
});

describe('headline', () => {
    it('wants the first pick named', () => {
        const data = 'Headline: the best next stones buy is Chain Lightning Damage 21 → 22 for 400 stones (+3.1 waves).';
        expect(gradeHeadline(data, "Buy Chain Lightning's Damage next.").ok).toBe(true);
        expect(gradeHeadline(data, 'Buy Black Hole Size next.').ok).toBe(false);
    });

    it('wants the gain from What If and the wave from another tier', () => {
        expect(gradeHeadline('Headline: maxing DW gives about +4.2 waves (runs end…', 'About 4.2 more waves.').ok).toBe(true);
        expect(gradeHeadline('Headline: maxing DW gives about +4.2 waves (runs end…', 'About 42 more waves.').ok).toBe(false);
        expect(gradeHeadline('Headline: about W6,400 on T19 (between W6,100 and W6,700), with the damage …', 'Around wave 6,400.').ok).toBe(true);
        expect(gradeHeadline('Headline: about W6,400 on T19 (between W6,100 and W6,700), with the damage …', 'Around wave 6,100.').ok).toBe(false);
    });

    it('wants the Guardian chip to put in', () => {
        const data = 'Headline: for push further, swap Fetch for Scout (+0.97%), so you run Attack, Bounty, Scout.';
        expect(gradeHeadline(data, 'Swap Fetch out for Scout.').ok).toBe(true);
        expect(gradeHeadline(data, 'Keep your current setup (Attack, Bounty, Fetch).').ok).toBe(false);
    });

    it('has nothing to check without a headline', () => {
        expect(gradeHeadline('Saved runs: 8', 'Orbs do most of it.').ok).toBeNull();
    });
});

describe('links and words', () => {
    it('allows only the site\'s own pages', () => {
        const paths = ['/', '/optimizer', '/what-if'];
        expect(badLinks('See https://towerforge.net/optimizer.', paths)).toEqual([]);
        expect(badLinks('See https://towerforge.com/optimizer and towerforge.net/nope', paths)).toEqual(['https://towerforge.com/optimizer']);
        expect(badLinks('Check the wiki at thetower.fandom.com', paths)).toEqual(['thetower.fandom.com']);
    });

    it('catches code words, misreadings and empty answers', () => {
        expect(wordIssues('Your scorePct is high', question('stones'))).toEqual(['code word "scorePct"']);
        expect(wordIssues('Power Stones are…', question('guide-ps'))).toEqual(['says power stone']);
        expect(wordIssues('(No answer — try asking another way.)', question('stones'))).toEqual(['no answer']);
        expect(wordIssues('For the cheapest, see the "Cheapest first" list.', question('stones'))).toEqual(['points at the data ("Cheapest first")']);
    });
});

describe('the made-up accounts', () => {
    it('import like a player\'s file, each at its stage', () => {
        const [early, mid, late] = BENCH_ACCOUNTS.map(a => parseGameExport(a.raw));
        expect([early.highestTier, mid.highestTier, late.highestTier]).toEqual([6, 12, 19]);
        expect(Object.values(early.uws!).filter(u => u.own)).toHaveLength(1);
        expect(Object.values(late.uws!).every(u => u.own && u.upOwn)).toBe(true);
        expect(mid.battles.filter(b => b.tournament)).toHaveLength(2);
        expect(late.modules!.state.library).toHaveLength(8);
        expect(late.tourneyRecords).toHaveLength(12);
    });

    it('never use a real player\'s name', () => {
        expect(BENCH_ACCOUNTS.map(a => a.raw.UserName)).toEqual(['BenchEarly', 'BenchMid', 'BenchLate']);
    });
});
