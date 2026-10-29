// ============================================================
//  TowerForge Companion — Ask AI: the debug log
//  Every question asked on this device, with its whole trace — the
//  route (and whether the wording or the model picked it), the data it
//  looked at, the answer, the numbers that aren't TowerForge's, the
//  time each step took, the model — kept in this browser only (the
//  last 200), for the Debug view on the Ask AI page. A 👍/👎 is kept
//  with the entry; 👎 can be sent as a report (aiReports.ts), only when
//  the player chooses to. Also the report's own shape, and an entry as
//  a test bench question to paste into bench/benchQuestions.ts.
// ============================================================

import type { RouteChoice } from './aiAssistant';
import type { ToolResult } from './aiTools';

export interface AiTimings {
    routeMs: number;       // step 1: the model's route (0 when the wording settled it)
    firstMs: number | null; // to the first words of the answer
    totalMs: number;
}

export interface AiLogEntry {
    id: string;
    time: number;
    question: string;
    routed: RouteChoice | null;
    route: string;          // as shown under the answer
    looked: ToolResult[];
    answer: string;
    unchecked: string[];
    timings: AiTimings;
    model: string | null;
    think: boolean;
    error?: string;
    rating?: 'up' | 'down';
    reported?: boolean;
}

const KEY = 'tc_ai_log';
const KEEP = 200;
const DATA_CHARS = 4000;    // per tool result kept (the rest is long and repeats)

export function loadLog(): AiLogEntry[] {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as AiLogEntry[]; } catch { return []; }
}

function saveLog(log: AiLogEntry[]): void {
    // Storage full: keep fewer rather than none.
    for (let n = log.length; n > 0; n = Math.floor(n / 2)) {
        try { localStorage.setItem(KEY, JSON.stringify(log.slice(-n))); return; } catch { /* try fewer */ }
    }
}

export function addToLog(entry: AiLogEntry): void {
    const trimmed = { ...entry, looked: entry.looked.map(l => ({ ...l, text: l.text.slice(0, DATA_CHARS) })) };
    saveLog([...loadLog(), trimmed].slice(-KEEP));
}

export function updateLog(id: string, patch: Partial<AiLogEntry>): void {
    saveLog(loadLog().map(e => (e.id === id ? { ...e, ...patch } : e)));
}

export function clearLog(): void {
    try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
}

// ── What might be wrong with an answer ──────────────────────────
export type LogFlag = 'unchecked' | 'keywords' | 'empty' | 'error' | 'slow' | 'down';
export const FLAG_TEXT: Record<LogFlag, string> = {
    unchecked: 'numbers not TowerForge\'s', keywords: 'route from keywords', empty: 'no answer',
    error: 'error', slow: 'slow', down: '👎',
};
const SLOW_MS = 45_000;

export function flagsOf(e: AiLogEntry): LogFlag[] {
    const f: LogFlag[] = [];
    if (e.error) f.push('error');
    if (!e.error && (!e.answer.trim() || e.answer.startsWith('(No answer'))) f.push('empty');
    if (e.unchecked.length) f.push('unchecked');
    if (e.routed?.guessed) f.push('keywords');
    if (e.timings.totalMs > SLOW_MS) f.push('slow');
    if (e.rating === 'down') f.push('down');
    return f;
}

// ── A report (what 👎 → Send sends; what the owner reads) ───────
export interface AiReport {
    question: string;
    answer: string;
    route: string;
    routed: RouteChoice | null;
    looked: ToolResult[];
    unchecked: string[];
    timings: AiTimings;
    model: string | null;
    gpu: string;
    version: string;
    note: string;
}

export const reportOf = (e: AiLogEntry, gpu: string, version: string, note: string): AiReport => ({
    question: e.question, answer: e.answer, route: e.route, routed: e.routed,
    looked: e.looked.map(l => ({ title: l.title, text: l.text })), unchecked: e.unchecked,
    timings: e.timings, model: e.model, gpu, version, note: note.trim().slice(0, 2000),
});

// ── As a test bench question ────────────────────────────────────
// The route it got is only a starting point: fix `expect` to the data it
// should have looked at before adding it.
export function benchSnippet(question: string, routed: RouteChoice | null): string {
    const id = question.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'question';
    const tool = routed?.tool ?? 'none';
    const extra = [
        routed && routed.currency !== 'any' ? `currency: '${routed.currency}'` : '',
        routed && routed.goal !== 'default' ? `goal: '${routed.goal}'` : '',
        routed && routed.runs !== 'any' ? `runs: '${routed.runs}'` : '',
    ].filter(Boolean);
    return `{ id: '${id}', q: ${JSON.stringify(question)}, expect: { tool: '${tool}'${extra.length ? `, ${extra.join(', ')}` : ''} } },`;
}
