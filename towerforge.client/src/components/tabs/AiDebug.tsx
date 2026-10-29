// ============================================================
//  TowerForge Companion — Ask AI: debugging
//  Under the chat on the Ask AI page:
//   • Debug log — every question asked on this device with its whole
//     trace (ai/aiLog.ts): what might be wrong (numbers not TowerForge's,
//     a route from keywords, no answer, slow, 👎), the route, the data,
//     the time each step took. Ask it again; copy it as a test bench
//     question. Nothing here leaves the device.
//   • AI reports — the answers players chose to send (👎 → Send), for the
//     owner (the "ai-admin" preview on the server): mark fixed, delete,
//     copy as a bench question.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { FLAG_TEXT, benchSnippet, clearLog, flagsOf, loadLog } from '../../ai/aiLog';
import type { AiLogEntry, AiReport, LogFlag } from '../../ai/aiLog';
import { deleteAiReport, listAiReports, setAiReportStatus } from '../../ai/aiReports';
import type { ServerAiReport } from '../../ai/aiReports';

const secs = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);
const when = (t: number | string) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// One answer's trace, the same for the log and a report.
function Trace({ r }: { r: Pick<AiReport, 'answer' | 'route' | 'looked' | 'unchecked' | 'timings' | 'model'> & { note?: string; gpu?: string; version?: string } }) {
    return (
        <div className="ai-dbg-trace">
            <div><span>Route</span> {r.route || '—'}</div>
            <div><span>Time</span> route {secs(r.timings.routeMs)} · first words {secs(r.timings.firstMs)} · all {secs(r.timings.totalMs)}</div>
            <div><span>Model</span> {r.model ?? '?'}{r.gpu ? ` · GPU ${r.gpu}` : ''}{r.version ? ` · v${r.version}` : ''}</div>
            {r.unchecked.length > 0 && <div><span>Not TowerForge&apos;s</span> {r.unchecked.join(', ')}</div>}
            {r.note && <div><span>Note</span> {r.note}</div>}
            <div className="ai-dbg-answer">{r.answer}</div>
            {r.looked.map((l, i) => (
                <details key={i}><summary>{l.title}</summary><pre>{l.text}</pre></details>
            ))}
        </div>
    );
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const [done, setDone] = useState(false);
    return (
        <button type="button" className="btn btn-dim" onClick={() => {
            navigator.clipboard.writeText(text).then(() => setDone(true), () => setDone(false));
        }}>{done ? 'Copied' : label}</button>
    );
}

export function DebugLog({ version, onAsk, canAsk }: { version: number; onAsk: (q: string) => void; canAsk: boolean }) {
    const [filter, setFilter] = useState<LogFlag | 'all' | 'flagged'>('flagged');
    const [open, setOpen] = useState<string | null>(null);
    const [sure, setSure] = useState(false);
    const [reads, setReads] = useState(0);
    // Read again after each answer (`version` changes with the chat), on
    // opening (a 👍/👎 since) and after a clear.
    const log: AiLogEntry[] = useMemo(() => { void version; void reads; return loadLog(); }, [version, reads]);

    const flagged = log.filter(e => flagsOf(e).length);
    const shown = [...log].reverse().filter(e => (filter === 'all' ? true : filter === 'flagged' ? flagsOf(e).length > 0 : flagsOf(e).includes(filter)));
    const counts = (Object.keys(FLAG_TEXT) as LogFlag[]).map(f => [f, log.filter(e => flagsOf(e).includes(f)).length] as const).filter(([, n]) => n > 0);
    return (
        <details className="section ai-dbg" onToggle={e => { if ((e.target as HTMLDetailsElement).open) setReads(r => r + 1); }}>
            <summary className="section-head"><h3>Debug log</h3><span className="s-badge">{log.length} on this device · {flagged.length} flagged</span></summary>
            <div className="section-body">
                <p className="ai-fine">
                    Every question asked here, kept in this browser only (the last 200): what it looked at, the time each
                    step took, and anything that looks wrong. Nothing here is sent anywhere.
                </p>
                <div className="ai-dbg-filters">
                    {(['flagged', 'all'] as const).map(f => (
                        <button key={f} type="button" className={`ai-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                            {f === 'flagged' ? `Flagged (${flagged.length})` : `All (${log.length})`}
                        </button>
                    ))}
                    {counts.map(([f, n]) => (
                        <button key={f} type="button" className={`ai-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                            {FLAG_TEXT[f]} ({n})
                        </button>
                    ))}
                </div>
                {shown.length === 0 && <p className="ai-fine">Nothing here yet.</p>}
                <div className="ai-dbg-list">
                    {shown.slice(0, 100).map(e => (
                        <div key={e.id} className="ai-dbg-row">
                            <button type="button" className="ai-dbg-head" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                                <span className="ai-dbg-when">{when(e.time)}</span>
                                <span className="ai-dbg-q">{e.question}</span>
                                <span className="ai-dbg-tool">{e.routed?.tool ?? '—'}{e.routed?.quick ? ' ·w' : ''}</span>
                                <span className="ai-dbg-ms">{secs(e.timings.totalMs)}</span>
                                {flagsOf(e).map(f => <span key={f} className={`ai-dbg-flag ${f}`}>{FLAG_TEXT[f]}</span>)}
                            </button>
                            {open === e.id && (
                                <>
                                    <Trace r={e} />
                                    <div className="ai-dbg-actions">
                                        <button type="button" className="btn btn-dim" disabled={!canAsk} onClick={() => onAsk(e.question)}>Ask again</button>
                                        <CopyButton text={benchSnippet(e.question, e.routed)} label="Copy as bench question" />
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
                {log.length > 0 && (
                    <button type="button" className="btn btn-danger ai-dbg-clear" onClick={() => {
                        if (!sure) { setSure(true); return; }
                        clearLog();
                        setReads(r => r + 1);
                        setSure(false);
                    }}>{sure ? 'Sure? Clear the log' : 'Clear the log'}</button>
                )}
            </div>
        </details>
    );
}

export function AiReportsPanel() {
    const [status, setStatus] = useState<'open' | 'fixed' | 'all'>('open');
    const [reports, setReports] = useState<ServerAiReport[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState<number | null>(null);
    const [sure, setSure] = useState<number | null>(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        if (!shown) return;
        let gone = false;
        listAiReports(status === 'all' ? undefined : status)
            .then(r => { if (!gone) { setReports(r); setError(null); } })
            .catch(e => { if (!gone) setError(e instanceof Error ? e.message : String(e)); });
        return () => { gone = true; };
    }, [status, shown]);

    const update = (id: number, s: 'open' | 'fixed') => setAiReportStatus(id, s)
        .then(() => setReports(rs => (rs ?? []).map(r => (r.id === id ? { ...r, status: s } : r)).filter(r => status === 'all' || r.status === status)))
        .catch(e => setError(e instanceof Error ? e.message : String(e)));
    const remove = (id: number) => deleteAiReport(id)
        .then(() => setReports(rs => (rs ?? []).filter(r => r.id !== id)))
        .catch(e => setError(e instanceof Error ? e.message : String(e)));

    return (
        <details className="section ai-dbg" onToggle={e => setShown((e.target as HTMLDetailsElement).open)}>
            <summary className="section-head"><h3>AI reports</h3><span className="s-badge">sent by players · owner only</span></summary>
            <div className="section-body">
                <div className="ai-dbg-filters">
                    {(['open', 'fixed', 'all'] as const).map(s => (
                        <button key={s} type="button" className={`ai-chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
                            {s === 'open' ? 'Open' : s === 'fixed' ? 'Fixed' : 'All'}
                        </button>
                    ))}
                </div>
                {error && <div className="grd-warn">{error}</div>}
                {reports?.length === 0 && <p className="ai-fine">No reports here.</p>}
                <div className="ai-dbg-list">
                    {(reports ?? []).map(r => (
                        <div key={r.id} className="ai-dbg-row">
                            <button type="button" className="ai-dbg-head" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                                <span className="ai-dbg-when">{when(r.createdAt)}</span>
                                <span className="ai-dbg-q">{r.data.question}</span>
                                <span className="ai-dbg-tool">{r.username ?? 'unknown'}</span>
                                {r.status === 'fixed' && <span className="ai-dbg-flag fixed">fixed</span>}
                                {r.data.unchecked?.length > 0 && <span className="ai-dbg-flag unchecked">{FLAG_TEXT.unchecked}</span>}
                            </button>
                            {open === r.id && (
                                <>
                                    <Trace r={r.data} />
                                    <div className="ai-dbg-actions">
                                        <button type="button" className="btn btn-dim" onClick={() => void update(r.id, r.status === 'open' ? 'fixed' : 'open')}>
                                            {r.status === 'open' ? 'Mark fixed' : 'Reopen'}
                                        </button>
                                        <CopyButton text={benchSnippet(r.data.question, r.data.routed)} label="Copy as bench question" />
                                        <button type="button" className="btn btn-danger" onClick={() => {
                                            if (sure !== r.id) { setSure(r.id); return; }
                                            void remove(r.id);
                                        }}>{sure === r.id ? 'Sure? Delete' : 'Delete'}</button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </details>
    );
}
