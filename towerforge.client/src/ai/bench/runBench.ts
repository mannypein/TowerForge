// ============================================================
//  TowerForge Companion — Ask AI test bench: the runner
//  Asks every bench question (benchQuestions.ts) of the model loaded on
//  the Ask AI page, on each made-up account (benchAccounts.ts), and
//  grades the answers (benchGrade.ts). Development only, from the
//  browser's console on the dev server (it starts the model chosen on the
//  Ask AI page, downloading it the first time):
//
//    const b = await import('/src/ai/bench/runBench.ts');
//    b.runBench({ accounts: ['late'] });      // runs in the background
//    b.benchSummary();                        // progress and the scores so far
//
//  Each account replaces this browser's TowerForge data (Import Game Data),
//  so use a browser without data you want to keep — or export it first.
//  Results stay in `window.__bench` and this tab's session storage, so a
//  reload (a hot update to a bench file) loses nothing: run it again with
//  `resume: true` to ask only what's left.
// ============================================================

import { useAiStore } from '../aiAssistant';
import { accountSummary } from '../aiTools';
import { useGameStore } from '../../store/useGameStore';
import { parseGameExport } from '../../engine/gameExport';
import { loadTourneySim } from '../../components/common/tourneySim';
import { TAB_PATHS } from '../../routes';
import { BENCH_ACCOUNTS } from './benchAccounts';
import { BENCH_QUESTIONS } from './benchQuestions';
import type { BenchAccountKey } from './benchQuestions';
import { grade } from './benchGrade';
import type { BenchGrade, BenchRecord } from './benchGrade';

export type BenchResult = BenchRecord & { grade: BenchGrade };

interface BenchState {
    running: boolean;
    total: number;
    results: BenchResult[];
    started: number;
    think: boolean;
    model: string | null;
}

declare global { interface Window { __bench?: BenchState } }

const PAGE_PATHS = Object.values(TAB_PATHS).map(p => p.replace(/\/$/, '') || '/');
const SAVED = 'tf-bench';

function saved(): BenchState | null {
    try { return JSON.parse(sessionStorage.getItem(SAVED) ?? 'null'); } catch { return null; }
}
function save(state: BenchState) {
    try { sessionStorage.setItem(SAVED, JSON.stringify(state)); } catch { /* kept in window only */ }
}

function loadAccount(key: BenchAccountKey) {
    const a = BENCH_ACCOUNTS.find(x => x.key === key)!;
    useGameStore.getState().resetAll();
    useGameStore.getState().applyGameImport(parseGameExport(a.raw));
    if (a.build) useGameStore.getState().updateProfile({ build: a.build });
}

export async function runBench(opts: { accounts?: BenchAccountKey[]; ids?: string[]; think?: boolean; resume?: boolean } = {}): Promise<BenchResult[]> {
    // Started here when needed: the console's copy of the assistant can be
    // another module instance than the page's after a hot update.
    if (useAiStore.getState().status !== 'ready') await useAiStore.getState().start();
    const ai = useAiStore.getState();
    if (ai.status !== 'ready') throw new Error(`The model didn't start: ${ai.error ?? ai.status}`);
    const accounts = opts.accounts ?? BENCH_ACCOUNTS.map(a => a.key);
    const plan = accounts.flatMap(acc => BENCH_QUESTIONS
        .filter(q => (!q.accounts || q.accounts.includes(acc)) && (!opts.ids || opts.ids.includes(q.id)))
        .map(q => ({ acc, q })));
    const before = opts.resume ? saved() : null;
    const done = new Set((before?.results ?? []).map(r => `${r.account}/${r.id}`));
    const state: BenchState = {
        running: true, total: plan.length, results: before?.results ?? [],
        started: before?.started ?? Date.now(), think: !!opts.think, model: ai.loadedId,
    };
    window.__bench = state;
    save(state);
    ai.setThink(!!opts.think);

    let loaded: BenchAccountKey | null = null;
    let lastQ: string | null = null;
    for (const { acc, q } of plan) {
        if (!state.running) break;
        const prev = lastQ;
        lastQ = q.q;
        if (done.has(`${acc}/${q.id}`)) continue;
        if (loaded !== acc) { loadAccount(acc); loaded = acc; }
        if (!q.followUp) useAiStore.getState().clearChat();
        const account = useGameStore.getState();
        // A follow-up resumed in a fresh chat: its question before goes first.
        if (q.followUp && prev && useAiStore.getState().messages.length === 0) {
            await useAiStore.getState().ask(prev, { account, tourney: loadTourneySim() });
        }
        const t0 = performance.now();
        await useAiStore.getState().ask(q.q, { account, tourney: loadTourneySim() });
        const msgs = useAiStore.getState().messages;
        const reply = msgs[msgs.length - 1];
        const rec: BenchRecord = {
            account: acc, id: q.id, q: q.q,
            routed: reply?.routed ?? null,
            route: reply?.route ?? '',
            data: [accountSummary(account), ...(reply?.looked ?? []).map(r => `[${r.title}]\n${r.text}`)].join('\n\n'),
            answer: reply?.text ?? '',
            ms: Math.round(performance.now() - t0),
        };
        state.results.push({ ...rec, grade: grade(q, rec, PAGE_PATHS) });
        save(state);
    }
    state.running = false;
    save(state);
    return state.results;
}

export function stopBench() {
    if (window.__bench) window.__bench.running = false;
    useAiStore.getState().interrupt();
}

// Progress and scores: overall, by account and the failures.
export function benchSummary() {
    const s = window.__bench ?? saved();
    if (!s) return 'No bench run yet.';
    const r = s.results;
    const pct = (n: number, d: number) => (d ? `${Math.round(n / d * 100)}%` : '—');
    const by = (acc: BenchAccountKey) => r.filter(x => x.account === acc);
    const avg = r.length ? Math.round(r.reduce((a, x) => a + x.ms, 0) / r.length / 1000) : 0;
    const lines = [
        `${s.model}${s.think ? ' (thinking)' : ''}: ${r.length}/${s.total} asked${s.running ? ' (running)' : ''}, ${Math.round((Date.now() - s.started) / 60000)} min, ${avg}s an answer.`,
        `Pass ${pct(r.filter(x => x.grade.pass).length, r.length)} · route ${pct(r.filter(x => x.grade.routeOk).length, r.length)}`
        + ` · headline ${pct(r.filter(x => x.grade.headlineOk === true).length, r.filter(x => x.grade.headlineOk !== null).length)}`
        + ` · answers with unverified numbers ${r.filter(x => x.grade.unverified.length).length}`,
        ...(['early', 'mid', 'late'] as const).filter(a => by(a).length).map(a => `  ${a}: pass ${pct(by(a).filter(x => x.grade.pass).length, by(a).length)} of ${by(a).length}`),
        ...r.filter(x => !x.grade.pass).map(x => `✗ ${x.account}/${x.id}: ${[...x.grade.routeWhy, x.grade.headlineWhy, ...x.grade.badLinks.map(l => `link ${l}`), ...x.grade.wordIssues].filter(Boolean).join('; ')}`),
    ];
    return lines.join('\n');
}
