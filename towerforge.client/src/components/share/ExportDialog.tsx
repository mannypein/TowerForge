// ============================================================
//  TowerForge Companion — Export Images window
//  Opens at once when Export Image is pressed and shows the images
//  being made (a phone takes a few seconds), then the images. On a
//  computer they download by themselves. A phone can't take a
//  download into Photos, so there Save or share opens the phone's
//  share menu with the images (Save Images puts them in Photos, or
//  straight into the Reddit app) — a fresh tap, since browsers only
//  open it from one — and pressing and holding an image saves it too.
//  Download stays as the fallback (Files on an iPhone).
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { downloadAll, imageFileName, renderPosterPages } from './posterImages';

type Step =
    | { step: 'working'; done: number; total: number }
    | { step: 'ready'; blobs: Blob[] }
    | { step: 'error'; message: string };

export default function ExportDialog({ node, name, label, onClose }: {
    node: HTMLElement;
    name: string;      // file name without .png
    label: string;     // the section, for the title
    onClose: () => void;
}) {
    const [state, setState] = useState<Step>({ step: 'working', done: 0, total: 0 });
    const [attempt, setAttempt] = useState(0);
    const [note, setNote] = useState<string | null>(null);
    const touch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);

    useEffect(() => {
        let cancelled = false;
        renderPosterPages(node, (done, total) => { if (!cancelled) setState({ step: 'working', done, total }); })
            .then(blobs => {
                if (cancelled) return;
                setState({ step: 'ready', blobs });
                if (!touch) void downloadAll(blobs, name);
            })
            .catch((err: unknown) => {
                if (!cancelled) setState({ step: 'error', message: err instanceof Error ? err.message : 'The images could not be made.' });
            });
        return () => { cancelled = true; };
    }, [node, name, touch, attempt]);

    const blobs = state.step === 'ready' ? state.blobs : null;
    const urls = useMemo(() => blobs?.map(b => URL.createObjectURL(b)) ?? [], [blobs]);
    useEffect(() => () => urls.forEach(u => URL.revokeObjectURL(u)), [urls]);
    const files = useMemo(() => blobs?.map((b, i) => new File([b], imageFileName(name, i, blobs.length), { type: 'image/png' })) ?? [], [blobs, name]);
    const canShare = files.length > 0 && typeof navigator.share === 'function'
        && typeof navigator.canShare === 'function' && navigator.canShare({ files });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    async function share() {
        setNote(null);
        try {
            await navigator.share({ files });
        } catch (err) {
            if ((err as DOMException)?.name !== 'AbortError') {
                setNote('Sharing didn’t work here. Press and hold an image to save it, or use Download.');
            }
        }
    }

    const count = blobs?.length ?? 0;
    const many = count > 1;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box modal-box-lg" role="dialog" aria-modal="true" aria-label={`Export ${label}`} onClick={e => e.stopPropagation()}>
                <div className="modal-head">
                    <span className="modal-title">📸 Export {label}</span>
                    <button className="btn btn-dim" onClick={onClose} aria-label="Close">✕</button>
                </div>
                <div className="modal-body expd-body">
                    {state.step === 'working' && (
                        <div className="expd-working" role="status">
                            <div>Making your {state.total > 1 ? `images… ${Math.min(state.done + 1, state.total)} of ${state.total}` : 'image…'}</div>
                            <div className="expd-bar"><span style={{ width: `${state.total ? (state.done / state.total) * 100 : 5}%` }} /></div>
                            <div className="expd-hint">This takes a few seconds, longer on a phone.</div>
                        </div>
                    )}

                    {state.step === 'error' && (
                        <div className="expd-working" role="alert">
                            <div>{state.message}</div>
                            <div className="expd-actions">
                                <button className="btn btn-accent" onClick={() => {
                                    setState({ step: 'working', done: 0, total: 0 });
                                    setAttempt(a => a + 1);
                                }}>Try again</button>
                            </div>
                        </div>
                    )}

                    {blobs && (
                        <>
                            {touch ? (
                                <>
                                    <div className="expd-actions">
                                        {canShare && <button className="btn btn-accent" onClick={share}>📤 Save or share</button>}
                                        <button className={`btn ${canShare ? 'btn-dim' : 'btn-accent'}`} onClick={() => void downloadAll(blobs, name)}>
                                            ⬇ Download
                                        </button>
                                    </div>
                                    <p className="expd-hint">
                                        {canShare
                                            ? <><strong>Save or share</strong> opens your phone’s share menu: <strong>Save {many ? `${count} Images` : 'Image'}</strong> puts {many ? 'them' : 'it'} in Photos, or pick Reddit to post {many ? 'them' : 'it'}. </>
                                            : null}
                                        You can also press and hold an image and choose <strong>Save to Photos</strong> (iPhone) or <strong>Download image</strong> (Android).
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="expd-hint">
                                        {many ? `${count} images went to your Downloads folder, numbered in order.` : 'The image went to your Downloads folder.'}
                                    </p>
                                    <div className="expd-actions">
                                        <button className="btn btn-dim" onClick={() => void downloadAll(blobs, name)}>⬇ Download again</button>
                                    </div>
                                </>
                            )}
                            {many && <p className="expd-hint">On Reddit, make an Images post and add them in order.</p>}
                            {note && <p className="expd-note">{note}</p>}
                            <div className={`expd-grid ${many ? 'many' : ''}`}>
                                {urls.map((url, i) => (
                                    <figure key={url} className="expd-fig">
                                        <img src={url} alt={`${label}${many ? `, image ${i + 1} of ${count}` : ''}`} />
                                        {many && <figcaption>{i + 1} of {count}</figcaption>}
                                    </figure>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
