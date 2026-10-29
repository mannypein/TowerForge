// ============================================================
//  TowerForge Companion — Ask AI Tab (preview)
//  Ask questions about your own account in plain words. The answers come
//  from a small open model that runs in this browser on the graphics card
//  (ai/aiAssistant.ts): downloaded once, nothing sent anywhere. Every
//  number it gives is worked out by the site (ai/aiTools.ts) — the model
//  picks what to look at and explains it.
//  Only accounts given the "ai" preview see this tab (server's
//  features.json); in development it's always shown.
// ============================================================

import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { AI_MODELS, modelByKey } from '../../ai/aiModels';
import { hasWebGpu, useAiStore } from '../../ai/aiAssistant';
import type { AiContext, AiMessage } from '../../ai/aiAssistant';
import { loadTourneySim } from '../common/tourneySim';
import { TAB_PATHS, tabFromPath } from '../../routes';
import { handOffToWhatIf } from '../common/whatIfHandoff';

const SUGGESTIONS = [
    'What should I spend my stones on next?',
    'How many waves would maxing Chain Lightning get me?',
    'Which tier should I farm for coins?',
    'What speed should I boost my labs to?',
    'How should I spend my module shards?',
    'Which guardian chips should I use?',
];

// The account as the tools read it, fresh for each question.
function contextNow(): AiContext {
    let goal: string | undefined;
    try { goal = localStorage.getItem('tc_opt_goal') ?? undefined; } catch { /* default goal */ }
    return { account: useGameStore.getState(), tourney: loadTourneySim(), goal };
}

// A link to one of the site's pages opens that tab here (no reload, so the
// model and the chat stay); links anywhere else show as plain text.
function PageLink({ href, children }: { href: string; children: ReactNode }) {
    const path = href.replace(/^https?:\/\/(www\.)?towerforge\.net/i, '');
    const tab = path.startsWith('/') ? tabFromPath(path) : null;
    if (!tab) return <>{children}</>;
    return (
        <a href={TAB_PATHS[tab]} onClick={e => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            useGameStore.getState().setActiveTab(tab);
        }}>{children}</a>
    );
}

// **bold**, [links](…) and bare addresses inside a line.
function inline(text: string): ReactNode[] {
    return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
        const md = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
        if (md) return <PageLink key={i} href={md[2]}>{md[1]}</PageLink>;
        if (/^https?:\/\//.test(part)) {
            const url = part.replace(/[.,;:]+$/, '');
            return <Fragment key={i}><PageLink href={url}>{url}</PageLink>{part.slice(url.length)}</Fragment>;
        }
        return <Fragment key={i}>{part}</Fragment>;
    });
}

// The model writes a little Markdown: paragraphs, bullet lists, bold, headings.
function Answer({ text }: { text: string }) {
    const blocks: ReactNode[] = [];
    let list: string[] = [];
    const endList = () => {
        if (list.length) blocks.push(<ul key={`l${blocks.length}`}>{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>);
        list = [];
    };
    for (const line of text.split('\n')) {
        const t = line.trim();
        const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(t);
        if (item) { list.push(item[1]); continue; }
        endList();
        if (!t) continue;
        const head = /^#{1,4}\s+(.*)$/.exec(t);
        blocks.push(head ? <p key={blocks.length} className="ai-head">{inline(head[1])}</p> : <p key={blocks.length}>{inline(t)}</p>);
    }
    endList();
    return <>{blocks}</>;
}

// The changes the answer's What If tried (all of them together, the last result).
const whatIfOf = (m: AiMessage) => [...(m.looked ?? [])].reverse().find(l => l.whatIf?.changes.length)?.whatIf;

// Everything about one answer, for a tester's report (pasted into Discord):
// the question, the answer, what it looked at, the model and the GPU.
async function reportText(m: AiMessage, question: string, model: string | null): Promise<string> {
    let gpu = 'unknown';
    try {
        const a = await (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string } } | null> } }).gpu?.requestAdapter();
        gpu = [a?.info?.vendor, a?.info?.architecture].filter(Boolean).join(' ') || gpu;
    } catch { /* not known */ }
    return [
        `TowerForge Ask AI v${__APP_VERSION__} · model ${model ?? '?'} · GPU ${gpu}`,
        `Question: ${question}`, `Asked for: ${m.route ?? '?'}`, '', m.text,
        ...(m.unchecked ? ['', `Not TowerForge's numbers: ${m.unchecked.join(', ')}`] : []),
        '', 'Looked at:', ...(m.looked ?? []).map(l => `[${l.title}]\n${l.text}`),
    ].join('\n');
}

function Message({ m, question, model }: { m: AiMessage; question: string; model: string | null }) {
    const [copied, setCopied] = useState(false);
    if (m.role === 'user') return <div className="ai-msg ai-user">{m.text}</div>;
    return (
        <div className="ai-msg ai-bot">
            {m.text ? <Answer text={m.text} /> : null}
            {m.status && <div className="ai-status">{m.status}</div>}
            {m.unchecked && (
                <div className="ai-check" role="note">
                    ⚠ Not one of TowerForge&apos;s numbers: {m.unchecked.map((n, i) => <Fragment key={n}>{i > 0 && ', '}<strong>{n}</strong></Fragment>)}.
                    The AI may have worked {m.unchecked.length > 1 ? 'these' : 'it'} out itself — check under &quot;Looked at&quot; or on the page.
                </div>
            )}
            {m.done && whatIfOf(m) && (
                <button type="button" className="btn btn-dim ai-open" onClick={() => {
                    handOffToWhatIf(whatIfOf(m)!);
                    useGameStore.getState().setActiveTab('whatif');
                }}>Open in What If →</button>
            )}
            {m.done && (
                <button type="button" className="ai-report" title="Copies the question, the answer and what it looked at, to paste into a bug report"
                    onClick={() => { void reportText(m, question, model).then(t => navigator.clipboard.writeText(t)).then(() => setCopied(true), () => setCopied(false)); }}>
                    {copied ? 'Copied' : 'Copy for a report'}
                </button>
            )}
            {m.route && (
                <details className="ai-looked">
                    <summary>Looked at: {m.looked?.length ? m.looked.map(l => l.title).join(' · ') : 'just your account'}</summary>
                    <div className="ai-route">Asked for: {m.route}</div>
                    {m.looked?.map((l, i) => <pre key={i}>{l.text}</pre>)}
                </details>
            )}
        </div>
    );
}

export default function AiTab() {
    const s = useAiStore();
    const [draft, setDraft] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const gpu = hasWebGpu();
    const model = modelByKey(s.modelKey);
    const ready = s.status === 'ready';
    const loading = s.status === 'loading';
    const downloaded = !!s.cached[model.key];
    const running = ready && (s.loadedId === model.f16 || s.loadedId === model.f32);

    const { checkCache } = s;
    useEffect(() => { if (gpu) void checkCache(); }, [gpu, checkCache]);
    const last = s.messages[s.messages.length - 1];
    useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [s.messages.length, last?.text]);

    const send = (q: string) => {
        if (!q.trim() || !ready || s.busy) return;
        setDraft('');
        void s.ask(q, contextNow());
    };

    return (
        <div className="ai-tab">
            <div className="relics-note">
                <strong>Ask AI (preview)</strong> — ask about your account in your own words. It runs on this
                computer: the model downloads once into your browser, then works offline, and your questions and
                account never leave this device. It reads the same numbers as the Optimizer, What If and
                Tournament pages, but it&apos;s a small model and can still get things wrong — check anything
                important on those pages.
            </div>

            {!gpu && (
                <div className="grd-warn">
                    This browser can&apos;t run it: it needs WebGPU (Chrome or Edge on a computer, version 113 or newer).
                </div>
            )}

            <div className="section">
                <div className="section-head"><h3>Model</h3></div>
                <div className="section-body">
                    <div className="ai-models" role="radiogroup" aria-label="Model">
                        {AI_MODELS.map(m => (
                            <label key={m.key} className={`ai-model ${m.key === model.key ? 'active' : ''}`}>
                                <input
                                    type="radio" name="ai-model" checked={m.key === model.key}
                                    disabled={loading} onChange={() => s.chooseModel(m.key)}
                                />
                                <span className="ai-model-name">{m.label}</span>
                                <span className="ai-model-size">{s.cached[m.key] ? 'Downloaded' : m.download}</span>
                                <span className="ai-model-note">{m.note}</span>
                            </label>
                        ))}
                    </div>

                    <div className="ai-actions">
                        {!running && (
                            <button className="btn btn-primary" disabled={!gpu || loading} onClick={() => void s.start()}>
                                {loading ? 'Loading…' : downloaded ? 'Start' : `Download (${model.download}) and start`}
                            </button>
                        )}
                        {ready && (
                            <button className="btn btn-dim" onClick={() => void s.stopModel()}
                                title="Frees the graphics card; the download stays">
                                Stop model
                            </button>
                        )}
                        {downloaded && !loading && (
                            <button className="btn btn-danger" onClick={() => void s.removeModel(model.key)}
                                title="Deletes this model from your browser's storage">
                                Remove download
                            </button>
                        )}
                    </div>
                    {!downloaded && !running && gpu && (
                        <div className="ai-fine">
                            The download comes from Hugging Face (the model&apos;s home) and is kept in this
                            browser&apos;s storage; Remove download deletes it.
                        </div>
                    )}
                    {loading && s.progress && (
                        <div className="ai-progress">
                            <div className="ai-bar"><div style={{ width: `${Math.round(s.progress.pct * 100)}%` }} /></div>
                            <div className="ai-fine">{s.progress.text}</div>
                        </div>
                    )}
                    {s.status === 'error' && <div className="grd-warn ai-error">Couldn&apos;t start the model: {s.error}</div>}
                </div>
            </div>

            <div className="section">
                <div className="section-head">
                    <h3>Chat</h3>
                    {s.messages.length > 0 && (
                        <button className="btn btn-dim" disabled={s.busy} onClick={s.clearChat}>Clear</button>
                    )}
                </div>
                <div className="section-body">
                    {s.messages.length === 0 ? (
                        <div className="ai-suggest">
                            {SUGGESTIONS.map(q => (
                                <button key={q} className="ai-chip" disabled={!ready} onClick={() => send(q)}>{q}</button>
                            ))}
                        </div>
                    ) : (
                        <div className="ai-log" aria-live="polite">
                            {s.messages.map((m, i) => <Message key={i} m={m} question={s.messages[i - 1]?.text ?? ''} model={s.loadedId} />)}
                            <div ref={endRef} />
                        </div>
                    )}

                    <form className="ai-input" onSubmit={e => { e.preventDefault(); send(draft); }}>
                        <textarea
                            value={draft}
                            rows={2}
                            placeholder={ready ? 'Ask about your account…' : 'Start the model to ask questions'}
                            disabled={!ready}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); }
                            }}
                        />
                        {s.busy
                            ? <button type="button" className="btn btn-danger" onClick={s.interrupt}>Stop</button>
                            : <button type="submit" className="btn btn-primary" disabled={!ready || !draft.trim()}>Ask</button>}
                    </form>
                    <label className="ai-think">
                        <input type="checkbox" checked={s.think} onChange={e => s.setThink(e.target.checked)} />
                        Think before answering (slower, often better)
                    </label>
                </div>
            </div>
        </div>
    );
}
