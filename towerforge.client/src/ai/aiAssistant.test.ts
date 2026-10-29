// Ask AI: what the question itself settles over the model's route (the
// test bench's misses), and the answer's tidy-up.

import { describe, expect, it } from 'vitest';
import { readRoute, tidy } from './aiAssistant';

const json = (r: Record<string, unknown>) => JSON.stringify({
    tool: 'none', currency: 'any', goal: 'default', changes: [], search: '', runs: 'any', tier: 0, budget: 0, ...r,
});

describe('the route, checked against the question', () => {
    it('takes a tier only from the question (none named = the next tier)', () => {
        expect(readRoute(json({ tool: 'tier', tier: 1 }), 'How far would I get on the next tier up?').tier).toBe(0);
        expect(readRoute(json({ tool: 'tier', tier: 18 }), 'how far could i farm T17').tier).toBe(17);
        expect(readRoute(json({ tool: 'tier', tier: 0 }), 'how far would I get on tier 12?').tier).toBe(12);
    });

    it('drops the earlier upgrade on "… instead?"', () => {
        const r = readRoute(json({ tool: 'what_if', changes: [{ upgrade: 'Death Wave', level: 'max' }, { upgrade: 'CF', level: 'max' }] }),
            'and what about chrono field instead?');
        expect(r.changes.map(c => c.upgrade)).toEqual(['CF']);
    });

    it('sends "what is X" about the game to the notes, not "what tier am I on"', () => {
        const r = readRoute(json({ tool: 'none' }), 'What is enemy level skip?');
        expect([r.tool, r.search]).toEqual(['guide', 'What is enemy level skip?']);
        expect(readRoute(json({ tool: 'none' }), 'What tier am I on?').tool).toBe('none');
    });

    it('sends module shards alone to the shard plan, and lab boosts to their own', () => {
        expect(readRoute(json({ tool: 'upgrades', currency: 'shards' }), 'best use of my module shards').tool).toBe('shard_plan');
        expect(readRoute(json({ tool: 'upgrades', currency: 'research' }), 'what boost should my labs run at').tool).toBe('lab_boosts');
        expect(readRoute('not json', 'how do I spend my armor shards').tool).toBe('shard_plan');
        expect(readRoute('not json', 'how fast can I boost my labs').tool).toBe('lab_boosts');
    });

    it('keeps lab boosts and the shard plan to their questions, and a named currency to its picks', () => {
        expect(readRoute(json({ tool: 'lab_boosts' }), 'What should I research next in the labs?'))
            .toMatchObject({ tool: 'upgrades', currency: 'research' });
        expect(readRoute(json({ tool: 'lab_boosts' }), 'How long until my damage lab is maxed?').tool).toBe('lab_boosts');
        expect(readRoute(json({ tool: 'shard_plan' }), 'Should I buy card slots with my gems?'))
            .toMatchObject({ tool: 'upgrades', currency: 'gems' });
        expect(readRoute(json({ tool: 'none' }), 'where should my medals go')).toMatchObject({ tool: 'upgrades', currency: 'medals' });
        expect(readRoute(json({ tool: 'upgrades', currency: 'any' }), 'What should I research next in the labs?').currency).toBe('research');
        // A currency picked already, or a goal question, stays.
        expect(readRoute(json({ tool: 'upgrades', currency: 'coins', goal: 'coins' }), 'how do I get more coins').currency).toBe('coins');
        expect(readRoute(json({ tool: 'what_if', changes: [{ upgrade: 'CL', level: 'max' }] }), 'is maxing CL worth my stones').tool).toBe('what_if');
    });

    it('falls back to keywords when the JSON can\'t be read', () => {
        expect(readRoute('not json', 'How do I get more coins?')).toMatchObject({ tool: 'upgrades', goal: 'coins', guessed: true });
    });
});

describe('the answer', () => {
    it('drops "based on the data" (the player never sees it)', () => {
        expect(tidy('Based on the data provided, you would reach W2,366 on T11.')).toBe('You would reach W2,366 on T11.');
        expect(tidy('Yes, it is worth it based on the data. It costs 49.80K coins.')).toBe('Yes, it is worth it. It costs 49.80K coins.');
        expect(tidy('Runs end at W409.\nAccording to your data, Orbs do 18%.')).toBe('Runs end at W409.\nOrbs do 18%.');
        expect(tidy('Chain Lightning does 14%.')).toBe('Chain Lightning does 14%.');
        expect(tidy('Based on your current progress and the data provided, you would reach W363 on T6.')).toBe('You would reach W363 on T6.');
        expect(tidy('However, the data shows that maxing both does nothing.')).toBe('However, maxing both does nothing.');
    });

    it('reads "my runs" as the runs', () => {
        expect(readRoute(json({ tool: 'guide' }), 'Which UW does the most damage in my runs?')).toMatchObject({ tool: 'runs', runs: 'any' });
        expect(readRoute(json({ tool: 'none' }), 'What keeps killing me in tournaments?')).toMatchObject({ tool: 'runs', runs: 'tournament' });
        expect(readRoute(json({ tool: 'upgrades' }), 'what should I buy to improve my runs').tool).toBe('upgrades');
    });
});
