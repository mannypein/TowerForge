// Ask AI's debug log: kept on the device (the last 200), what's flagged,
// a report's shape, and an entry as a test bench question.

import { beforeEach, describe, expect, it } from 'vitest';
import { addToLog, benchSnippet, clearLog, flagsOf, loadLog, reportOf, updateLog } from './aiLog';
import type { AiLogEntry } from './aiLog';

// The tests run in Node: a stand-in for the browser's localStorage.
const store = new Map<string, string>();
Object.assign(globalThis, {
    localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
    },
});

const entry = (over: Partial<AiLogEntry> = {}): AiLogEntry => ({
    id: 'a', time: 0, question: 'What should I spend my stones on?',
    routed: { tool: 'upgrades', currency: 'stones', goal: 'default', changes: [], search: '', runs: 'any', tier: 0, budget: 0, quick: true },
    route: 'upgrades · stones', looked: [{ title: 'Optimizer — stones', text: 'Headline: …' }], answer: 'Buy Chrono Field.',
    unchecked: [], timings: { routeMs: 0, firstMs: 3000, totalMs: 9000 }, model: 'Qwen3-4B-q4f16_1-MLC', think: false,
    ...over,
});

beforeEach(() => store.clear());

describe('the debug log', () => {
    it('keeps the last 200 on this device, the data cut short', () => {
        for (let i = 0; i < 205; i++) addToLog(entry({ id: String(i), looked: [{ title: 't', text: 'x'.repeat(5000) }] }));
        const log = loadLog();
        expect(log).toHaveLength(200);
        expect(log[0].id).toBe('5');
        expect(log[0].looked[0].text).toHaveLength(4000);
        clearLog();
        expect(loadLog()).toEqual([]);
    });

    it('keeps a 👍/👎 and a report sent with the entry', () => {
        addToLog(entry());
        updateLog('a', { rating: 'down', reported: true });
        expect(loadLog()[0]).toMatchObject({ rating: 'down', reported: true });
    });

    it('flags what may be wrong', () => {
        expect(flagsOf(entry())).toEqual([]);
        expect(flagsOf(entry({ unchecked: ['9.8M'], rating: 'down', timings: { routeMs: 6000, firstMs: 9000, totalMs: 50_000 } })))
            .toEqual(['unchecked', 'slow', 'down']);
        expect(flagsOf(entry({ answer: '(No answer — try asking another way.)' }))).toEqual(['empty']);
        expect(flagsOf(entry({ error: 'GPU lost', answer: 'Something went wrong: GPU lost' }))).toEqual(['error']);
        expect(flagsOf(entry({ routed: { ...entry().routed!, quick: false, guessed: true } }))).toEqual(['keywords']);
    });
});

describe('a report', () => {
    it('sends what the page says it sends, and the note cut to 2,000 characters', () => {
        const r = reportOf(entry({ rating: 'down' }), 'amd rdna-3', '1.35.0', `  ${'n'.repeat(3000)}  `);
        expect(Object.keys(r).sort()).toEqual(['answer', 'gpu', 'looked', 'model', 'note', 'question', 'route', 'routed', 'timings', 'unchecked', 'version']);
        expect(r.note).toHaveLength(2000);
    });
});

describe('as a test bench question', () => {
    it('writes the question with the route it got, to correct before adding', () => {
        expect(benchSnippet('What should I spend my stones on?', entry().routed))
            .toBe(`{ id: 'what-should-i-spend-my-stones-on', q: "What should I spend my stones on?", expect: { tool: 'upgrades', currency: 'stones' } },`);
        expect(benchSnippet('hi', null)).toBe(`{ id: 'hi', q: "hi", expect: { tool: 'none' } },`);
    });
});
