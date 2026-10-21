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

const SUGGESTIONS = [
    'What should I spend my Power Stones on next?',
    'How many waves would maxing Chain Lightning get me?',
    'What are my best lab upgrades right now?',
    'How does Fast’s Ultimate affect my tournament runs?',
];

// The account as the tools read it, fresh for each question.
function contextNow(): AiContext {
    let goal: string | undefined;
    try { goal = localStorage.getItem('tc_opt_goal') ?? undefined; } catch { /* default goal */ }
    return { account: useGameStore.getState(), tourney: loadTourneySim(), goal };
}

// **bold** inside a line.
function inline(text: string): ReactNode[] {
    return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4
            ? <strong key={i}>{part.slice(2, -2)}</strong>
            : <Fragment key={i}>{part}</Fragment>);
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

function Message({ m }: { m: AiMessage }) {
    if (m.role === 'user') return <div className="ai-msg ai-user">{m.text}</div>;
    return (
        <div className="ai-msg ai-bot">
            {m.text ? <Answer text={m.text} /> : null}
            {m.status && <div className="ai-status">{m.status}</div>}
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
                            {s.messages.map((m, i) => <Message key={i} m={m} />)}
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
